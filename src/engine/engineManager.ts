import type { MLCEngineInterface, ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { CreateExtensionServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

// Extension Service Worker 기반 엔진 관리
let engine: MLCEngineInterface | null = null;

function isEngineAlive(): boolean {
  // 엔진이 null이 아니고, 내부적으로 dispose 상태가 아니라고 가정 (MLCEngineInterface에 isConnected/isAlive가 있으면 사용)
  // 실제로는 엔진 객체에 연결 상태 확인 메서드가 있으면 활용
  // 없으면 try-catch로 에러 발생 시 dispose
  return !!engine;
}

export async function unloadEngine(): Promise<void> {
  if (engine && typeof (engine as any).unload === "function") {
    try {
      await (engine as any).unload();
    } catch (e) {
      console.warn("엔진 unload 중 에러", e);
    }
  }
  engine = null;
}

export async function initializeMLCEngine(): Promise<void> {
  if (isEngineAlive()) {
    console.log("[engineManager] 엔진 이미 초기화됨");
    return;
  }
  const selectedModel = "Qwen3-1.7B-q4f16_1-MLC";
  console.log("[engineManager] 엔진 생성 시작");
  engine = await CreateExtensionServiceWorkerMLCEngine(selectedModel, {
    initProgressCallback: (report: { progress: number }) => {
      console.log("[engineManager] 모델 로드 진행률", report);
      chrome.runtime.sendMessage({ type: "MODEL_LOAD_PROGRESS", progress: report.progress });
    },
  });
  console.log("[engineManager] 엔진 생성 완료", engine);
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
      console.log("[engineManager] 요약 생성 시작", { messages });
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
          console.log("[engineManager] 요약 중간 결과", result);
        }
      }
      if (callbacks.onDone) callbacks.onDone(result);
      console.log("[engineManager] 요약 최종 결과", result);
      return result;
    } catch (error: any) {
      // GPU 에러 또는 치명적 에러 발생 시 unload
      await unloadEngine();
      // GPU 관련 에러 메시지 예시: "GPU", "WebGPU", "out of memory", "device lost" 등 포함 시
      const errMsg = (error?.message || "") as string;
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
