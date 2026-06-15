import type { MLCEngineInterface, ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

export const DEFAULT_MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

const CHUNK_MAX_LENGTH = 3000;

const SINGLE_PROMPT = `당신은 전문 한국어 요약 전문가입니다.
규칙: 정확히 3-4문장으로 작성하고, 핵심 사실과 중요한 정보만 포함하며, 객관적·간결한 문체를 사용하세요. 원문의 주요 결론이나 결과를 포함하세요.`;

const CHUNK_PROMPT = `당신은 전문 한국어 요약 전문가입니다.
규칙: 주어진 텍스트 구간만 2-3문장으로 요약하세요. 핵심 사실과 중요한 정보만 포함하고, 객관적·간결한 문체를 사용하세요.`;

const MERGE_PROMPT = `당신은 전문 한국어 요약 전문가입니다.
긴 글을 구간별로 요약한 결과가 주어집니다. 이를 하나로 통합하여 정확히 3-4문장의 일관된 요약으로 만들어주세요.
규칙: 핵심 사실과 중요한 정보만 포함하고, 객관적·간결한 문체를 유지하세요. 중복을 제거하고 흐름이 자연스럽게 이어지도록 하세요.`;

let engine: MLCEngineInterface | null = null;

export function getEngine(): MLCEngineInterface | null {
  return engine;
}

export async function unloadEngine(): Promise<void> {
  if (!engine) return;
  try {
    await engine.unload();
  } catch (e) {
    console.warn("엔진 unload 중 에러", e);
  }
  engine = null;
}

async function getSelectedModelId(): Promise<string> {
  const stored = await chrome.storage.local.get("selectedModelId");
  const id = typeof stored.selectedModelId === "string" ? stored.selectedModelId.trim() : "";
  return id || DEFAULT_MODEL_ID;
}

/**
 * 서비스워커의 핸들러에 연결되는 MLCEngine 클라이언트를 생성한다.
 * 모델 가중치는 WebLLM이 Cache API(디스크)에 저장하므로, 이미 받은 모델은
 * 재다운로드 없이 디스크에서 로드된다 (onProgress로 진행률 전달).
 */
export async function initializeMLCEngine(
  modelId?: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (engine) return;
  const selected = modelId?.trim() || (await getSelectedModelId());
  engine = await CreateExtensionServiceWorkerMLCEngine(selected, {
    initProgressCallback: (report) => onProgress?.(report.progress),
  });
}

/**
 * 내용을 CHUNK_MAX_LENGTH 이하 조각으로 분할. 문단/문장 경계를 우선해
 * 문장 중간에서 잘리지 않도록 한다.
 */
function splitContentIntoChunks(content: string): string[] {
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.length <= CHUNK_MAX_LENGTH) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > 0) {
    if (rest.length <= CHUNK_MAX_LENGTH) {
      chunks.push(rest.trim());
      break;
    }
    const block = rest.substring(0, CHUNK_MAX_LENGTH);
    const minSplit = Math.floor(CHUNK_MAX_LENGTH * 0.5);

    const lastPara = block.lastIndexOf("\n\n");
    let splitAt: number;
    if (lastPara >= minSplit) {
      splitAt = lastPara + 1;
    } else {
      const sentenceEnds = [block.lastIndexOf(". "), block.lastIndexOf("? "), block.lastIndexOf("! ")].filter(
        (i) => i >= minSplit
      );
      splitAt = sentenceEnds.length > 0 ? Math.max(...sentenceEnds) + 1 : CHUNK_MAX_LENGTH;
    }
    const chunk = block.substring(0, splitAt).trim();
    rest = rest.substring(splitAt).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

type StreamCallbacks = {
  onPartial?: (text: string) => void;
  signal?: AbortSignal;
};

/** 스트리밍 completion 한 번을 실행하고 전체 텍스트를 반환 */
async function streamCompletion(
  eng: MLCEngineInterface,
  systemPrompt: string,
  userContent: string,
  { onPartial, signal }: StreamCallbacks = {}
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
  const completion = await eng.chat.completions.create({
    stream: true,
    messages,
    extra_body: { enable_thinking: false },
  });
  let result = "";
  for await (const chunk of completion) {
    if (signal?.aborted) break;
    const choice = chunk.choices[0];
    if (choice?.finish_reason === "abort") break;
    const delta = choice?.delta?.content;
    if (delta) {
      result += delta;
      onPartial?.(result);
    }
  }
  return result.trim();
}

export type GenerateSummaryCallbacks = {
  onPartial?: (partial: string) => void;
  onDone?: (final: string) => void;
  onError?: (error: unknown) => void;
  /** 단계별 진행 메시지 */
  onProgressStep?: (message: string) => void;
  /** 중단 시 청크 루프/통합이 조기 종료되고 onDone(부분 결과)이 호출됨 */
  signal?: AbortSignal;
};

export async function generateSummaryWithEngine(
  content: string,
  callbacks: GenerateSummaryCallbacks = {}
): Promise<string> {
  const { onPartial, onDone, onError, onProgressStep, signal } = callbacks;

  // GPU/메모리 에러 시 엔진을 내리고 1회 재시도
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!engine) await initializeMLCEngine();
    if (!engine) {
      const err = new Error("Engine not connected");
      onError?.(err);
      throw err;
    }

    try {
      const chunks = splitContentIntoChunks(content);
      let result: string;

      if (chunks.length <= 1) {
        result = await streamCompletion(engine, SINGLE_PROMPT, `다음 텍스트를 요약해주세요:\n\n${chunks[0] ?? content}`, {
          onPartial,
          signal,
        });
      } else {
        const partials: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          if (signal?.aborted) break;
          onProgressStep?.(`구간 ${i + 1}/${chunks.length} 요약 중…`);
          partials.push(await streamCompletion(engine, CHUNK_PROMPT, `다음 텍스트를 요약해주세요:\n\n${chunks[i]}`));
          onPartial?.(partials.join("\n\n"));
        }

        if (signal?.aborted) {
          const partialText = partials.join("\n\n");
          if (partialText) onDone?.(partialText);
          else onError?.(new Error("사용자가 요약을 중단했습니다"));
          return partialText;
        }

        onProgressStep?.("요약 통합 중…");
        const mergedInput = partials.map((s, i) => `[구간 ${i + 1}]\n${s}`).join("\n\n");
        result = await streamCompletion(
          engine,
          MERGE_PROMPT,
          `다음 구간별 요약을 하나의 요약으로 통합해주세요:\n\n${mergedInput}`,
          { onPartial, signal }
        );
      }

      onDone?.(result);
      return result;
    } catch (error) {
      await unloadEngine();
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt === 0 && /gpu|webgpu|memory|device lost|out of memory/i.test(msg)) {
        continue; // 엔진 재초기화 후 재시도
      }
      console.error("[engineManager] 요약 에러", error);
      onError?.(error);
      throw error;
    }
  }
  throw new Error("Engine failed after retry");
}
