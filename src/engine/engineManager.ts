import type { MLCEngineInterface, ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

let engine: MLCEngineInterface | null = null;

function isEngineAlive(): boolean {
  return !!engine;
}

export async function unloadEngine(): Promise<void> {
  if (engine && typeof engine.unload === "function") {
    try {
      await engine.unload();
    } catch (e) {
      console.warn("엔진 unload 중 에러", e);
    }
  }
  engine = null;
}

export async function initializeMLCEngine(): Promise<void> {
  if (isEngineAlive()) {
    return;
  }

  const selectedModel = "Qwen3-4B-q4f16_1-MLC";
  engine = await CreateExtensionServiceWorkerMLCEngine(selectedModel, {
    initProgressCallback: (report: { progress: number }) => {
      chrome.runtime.sendMessage({ type: "MODEL_LOAD_PROGRESS", progress: report.progress });
    },
  });
}

export function getEngine(): MLCEngineInterface | null {
  return engine;
}

type GenerateSummaryCallbacks = {
  onPartial?: (partial: string) => void;
  onDone?: (final: string) => void;
  onError?: (error: unknown) => void;
};

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
    const MAX_CONTENT_LENGTH = 3000;
    const truncatedContent =
      content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;
    const CONSISTENT_SUMMARY_PROMPT = `당신은 전문 한국어 요약 전문가입니다.\n\n규칙:\n1. 정확히 3-4문장으로 작성\n2. 핵심 사실과 중요한 정보만 포함\n3. 객관적이고 간결한 문체 사용\n4. 원문의 주요 결론이나 결과 포함\n\n형식: 각 문장은 완전한 한국어 문장으로 끝나야 하며, 불완전한 문장은 작성하지 마세요.`;
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: CONSISTENT_SUMMARY_PROMPT },
      { role: "user", content: `다음 텍스트를 요약해주세요:\n\n${truncatedContent}` },
    ];
    let result = "";
    try {
      const completion = await engine.chat.completions.create({
        stream: true,
        messages,
        extra_body: { enable_thinking: false },
      });
      for await (const chunk of completion) {
        const curDelta = chunk.choices[0]?.delta?.content;
        if (curDelta) {
          result += curDelta;
          if (callbacks.onPartial) callbacks.onPartial(result);
        }
      }
      if (callbacks.onDone) callbacks.onDone(result);
      return result;
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
