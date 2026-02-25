import type { MLCEngineInterface, ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

let engine: MLCEngineInterface | null = null;
let webgpuResources: { destroy?: () => void; release?: () => void }[] = [];

function isEngineAlive(): boolean {
  return !!engine;
}

export function trackWebGPUResource(resource: { destroy?: () => void; release?: () => void }) {
  webgpuResources.push(resource);
}

export function cleanupWebGPUResources() {
  for (let i = webgpuResources.length - 1; i >= 0; --i) {
    const res = webgpuResources[i];
    if (res && typeof res.destroy === "function") {
      try {
        res.destroy();
      } catch {}
    } else if (res && typeof res.release === "function") {
      try {
        res.release();
      } catch {}
    }
  }
  webgpuResources = [];
}

export async function unloadEngine(): Promise<void> {
  if (engine) {
    if (typeof engine.unload === "function") {
      try {
        await engine.unload();
      } catch (e) {
        console.warn("엔진 unload 중 에러", e);
      }
    }
    if (typeof (engine as any).dispose === "function") {
      try {
        await (engine as any).dispose();
      } catch (e) {
        console.warn("엔진 dispose 중 에러", e);
      }
    }
    if (typeof (engine as any).cleanup === "function") {
      try {
        await (engine as any).cleanup();
      } catch (e) {
        console.warn("엔진 cleanup 중 에러", e);
      }
    }
  }
  cleanupWebGPUResources();
  engine = null;
}

export const DEFAULT_MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

async function getSelectedModelId(): Promise<string> {
  const stored = await chrome.storage.local.get("selectedModelId");
  const id = typeof stored.selectedModelId === "string" ? stored.selectedModelId.trim() : "";
  return id || DEFAULT_MODEL_ID;
}

export async function initializeMLCEngine(modelId?: string): Promise<void> {
  if (isEngineAlive()) {
    return;
  }

  const selectedModel = modelId !== undefined && modelId !== null && String(modelId).trim()
    ? String(modelId).trim()
    : await getSelectedModelId();
  engine = await CreateExtensionServiceWorkerMLCEngine(selectedModel, {
    initProgressCallback: (report: { progress: number }) => {
      chrome.runtime.sendMessage({ type: "MODEL_LOAD_PROGRESS", progress: report.progress });
    },
  });
}

export function getEngine(): MLCEngineInterface | null {
  return engine;
}

const CHUNK_MAX_LENGTH = 3000;

/**
 * Splits content into chunks of at most CHUNK_MAX_LENGTH, preferring paragraph
 * and sentence boundaries to avoid cutting mid-sentence.
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
    if (lastPara >= minSplit) {
      const chunk = block.substring(0, lastPara + 1).trim();
      rest = rest.substring(lastPara + 1).trim();
      if (chunk.length > 0) chunks.push(chunk);
      continue;
    }
    const lastDot = block.lastIndexOf(". ");
    const lastQuestion = block.lastIndexOf("? ");
    const lastExclaim = block.lastIndexOf("! ");
    const candidates = [lastDot, lastQuestion, lastExclaim].filter((i) => i >= minSplit);
    const splitAt = candidates.length > 0 ? Math.max(...candidates) + 1 : CHUNK_MAX_LENGTH;
    const chunk = block.substring(0, splitAt).trim();
    rest = rest.substring(splitAt).trim();
    if (chunk.length > 0) chunks.push(chunk);
  }

  return chunks;
}

async function summarizeChunk(
  engine: MLCEngineInterface,
  chunk: string,
  systemPrompt: string
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `다음 텍스트를 요약해주세요:\n\n${chunk}` },
  ];
  const completion = await engine.chat.completions.create({
    stream: true,
    messages,
    extra_body: { enable_thinking: false },
  });
  let result = "";
  for await (const c of completion) {
    const choice = c.choices[0];
    if (choice?.finish_reason === "abort") break;
    const delta = choice?.delta?.content;
    if (delta) result += delta;
  }
  return result.trim();
}

async function mergeSummaries(
  engine: MLCEngineInterface,
  partialSummaries: string[],
  callbacks: { onPartial?: (partial: string) => void; signal?: AbortSignal }
): Promise<string> {
  const mergedInput = partialSummaries.map((s, i) => `[구간 ${i + 1}]\n${s}`).join("\n\n");
  const systemPrompt = `당신은 전문 한국어 요약 전문가입니다.
긴 글을 구간별로 요약한 결과가 주어집니다. 이를 하나로 통합하여 정확히 3-4문장의 일관된 요약으로 만들어주세요.
규칙: 핵심 사실과 중요한 정보만 포함하고, 객관적·간결한 문체를 유지하세요. 중복을 제거하고 흐름이 자연스럽게 이어지도록 하세요.`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `다음 구간별 요약을 하나의 요약으로 통합해주세요:\n\n${mergedInput}` },
  ];
  const completion = await engine.chat.completions.create({
    stream: true,
    messages,
    extra_body: { enable_thinking: false },
  });
  let result = "";
  for await (const c of completion) {
    if (callbacks.signal?.aborted) break;
    const choice = c.choices[0];
    if (choice?.finish_reason === "abort") break;
    const delta = choice?.delta?.content;
    if (delta) {
      result += delta;
      if (callbacks.onPartial) callbacks.onPartial(result);
    }
  }
  return result.trim();
}

type GenerateSummaryCallbacks = {
  onPartial?: (partial: string) => void;
  onDone?: (final: string) => void;
  onError?: (error: unknown) => void;
  /** 단계별 진행 메시지 (Operational transparency) */
  onProgressStep?: (message: string) => void;
  /** When aborted (e.g. user clicked Stop), chunk loop and merge exit early; onDone(partial) is called. */
  signal?: AbortSignal;
};

const CHUNK_SUMMARY_PROMPT = `당신은 전문 한국어 요약 전문가입니다.
규칙: 주어진 텍스트 구간만 2-3문장으로 요약하세요. 핵심 사실과 중요한 정보만 포함하고, 객관적·간결한 문체를 사용하세요.`;

export async function generateSummaryWithEngine(
  content: string,
  callbacks: GenerateSummaryCallbacks = {}
): Promise<string> {
  let retry = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!isEngineAlive()) {
      await initializeMLCEngine();
    }
    if (!engine) {
      if (callbacks.onError) callbacks.onError(new Error("Engine not connected"));
      throw new Error("Engine not connected");
    }
    const chunks = splitContentIntoChunks(content);
    const singlePrompt = `당신은 전문 한국어 요약 전문가입니다.
규칙: 정확히 3-4문장으로 작성하고, 핵심 사실과 중요한 정보만 포함하며, 객관적·간결한 문체를 사용하세요. 원문의 주요 결론이나 결과를 포함하세요.`;

    try {
      if (chunks.length <= 1) {
        const text = chunks[0] ?? content;
        const messages: ChatCompletionMessageParam[] = [
          { role: "system", content: singlePrompt },
          { role: "user", content: `다음 텍스트를 요약해주세요:\n\n${text}` },
        ];
        let result = "";
        const completion = await engine.chat.completions.create({
          stream: true,
          messages,
          extra_body: { enable_thinking: false },
        });
        for await (const chunk of completion) {
          const choice = chunk.choices[0];
          if (choice?.finish_reason === "abort") break;
          const curDelta = choice?.delta?.content;
          if (curDelta) {
            result += curDelta;
            if (callbacks.onPartial) callbacks.onPartial(result);
          }
        }
        if (callbacks.onDone) callbacks.onDone(result);
        return result;
      }

      const partialSummaries: string[] = [];
      const { signal } = callbacks;
      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) break;
        if (callbacks.onProgressStep) {
          callbacks.onProgressStep(`구간 ${i + 1}/${chunks.length} 요약 중…`);
        }
        const partial = await summarizeChunk(engine, chunks[i], CHUNK_SUMMARY_PROMPT);
        partialSummaries.push(partial);
        if (callbacks.onPartial) {
          callbacks.onPartial(partialSummaries.join("\n\n"));
        }
      }
      if (signal?.aborted) {
        const partialText = partialSummaries.length > 0
          ? partialSummaries.join("\n\n")
          : "";
        if (partialText && callbacks.onDone) callbacks.onDone(partialText);
        else if (!partialText && callbacks.onError) {
          callbacks.onError(new Error("사용자가 요약을 중단했습니다"));
        }
        return partialText;
      }
      if (callbacks.onProgressStep) callbacks.onProgressStep("요약 통합 중…");
      const merged = await mergeSummaries(engine, partialSummaries, {
        onPartial: callbacks.onPartial,
        signal,
      });
      if (callbacks.onDone) callbacks.onDone(merged);
      return merged;
    } catch (error: unknown) {
      await unloadEngine();
      const errMsg =
        error && typeof error === "object" && "message" in error ? (error as { message?: string }).message || "" : "";
      if (!retry && /gpu|webgpu|memory|device lost|out of memory/i.test(errMsg)) {
        retry = true;
        continue;
      }
      if (callbacks.onError) callbacks.onError(error);
      console.error("[engineManager] 요약 에러", error);
      throw error;
    }
  }
  throw new Error("Engine failed after retry");
}
