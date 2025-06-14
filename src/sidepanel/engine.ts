import type { MLCEngineInterface, ChatCompletionMessageParam } from "@mlc-ai/web-llm";

let engine: MLCEngineInterface | null = null;
let worker: Worker | null = null;
let isEngineReady = false;
let isInitializingMLCEngine = false;

export function getEngine() {
  return engine;
}
export function getWorker() {
  return worker;
}
export function getIsEngineReady() {
  return isEngineReady;
}
export function getIsInitializingMLCEngine() {
  return isInitializingMLCEngine;
}

export function setEngineAndWorker(newEngine: MLCEngineInterface | null, newWorker: Worker | null) {
  engine = newEngine;
  worker = newWorker;
  isEngineReady = !!engine;
  // 동기화: 엔진이 없으면 워커도 없고, 워커가 없으면 엔진도 없음
  if (!engine && worker) {
    try {
      worker.terminate();
    } catch (e) {}
    worker = null;
  }
  if (!worker && engine) {
    engine = null;
    isEngineReady = false;
  }
}

export function cleanupMLCEngine() {
  if (worker) {
    try {
      worker.terminate();
    } catch (e) {}
  }
  setEngineAndWorker(null, null);
}

type EngineInitCallbacks = {
  onProgress?: (progress: number) => void;
  onReady?: () => void;
  onError?: (error: unknown) => void;
};

export async function initializeMLCEngine(callbacks: EngineInitCallbacks = {}): Promise<void> {
  if (engine || isInitializingMLCEngine) return;
  isInitializingMLCEngine = true;
  let readyCalled = false;
  try {
    const selectedModel = "Qwen3-1.7B-q4f16_1-MLC";
    if (worker) {
      try {
        worker.terminate();
      } catch (e) {}
      worker = null;
    }
    const newWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    const newEngine = await CreateWebWorkerMLCEngine(newWorker, selectedModel, {
      initProgressCallback: (report: { progress: number }) => {
        if (callbacks.onProgress) callbacks.onProgress(report.progress);
        if (report.progress === 1.0 && !readyCalled) {
          readyCalled = true;
          if (callbacks.onReady) callbacks.onReady();
        }
      },
    });
    setEngineAndWorker(newEngine, newWorker);
    isEngineReady = true;
    // onReady는 progress 1.0에서만 호출
  } catch (error) {
    setEngineAndWorker(null, null);
    isEngineReady = false;
    if (callbacks.onError) callbacks.onError(error);
    throw error;
  } finally {
    isInitializingMLCEngine = false;
  }
}

type GenerateSummaryCallbacks = {
  onPartial?: (partial: string) => void;
  onDone?: (final: string) => void;
  onError?: (error: unknown) => void;
};

export async function generateSummaryWithEngine(content: string, callbacks: GenerateSummaryCallbacks = {}) {
  if (!engine) throw new Error("Engine not connected");
  const MAX_CONTENT_LENGTH = 3000;
  const truncatedContent =
    content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;
  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `당신은 전문적인 한국어 요약 전문가입니다. 주어진 텍스트를 다음 규칙에 따라 요약해주세요:\n\n1. **언어**: 반드시 한국어로 작성\n2. **길이**: 3-4문장으로 간결하게 작성\n3. **구조**: \n   - 첫 문장: 주제/핵심 내용 소개\n   - 중간 문장들: 중요한 세부사항 2-3개\n   - 마지막 문장: 결론 또는 의미/영향\n4. **톤**: 객관적이고 정보 전달 중심\n5. **포함 요소**: \n   - 핵심 사실과 데이터\n   - 중요한 인물/기관명\n   - 주요 결과나 영향\n6. **제외 요소**: \n   - 불필요한 세부사항\n   - 반복적인 내용\n   - 개인적 의견이나 추측\n\n텍스트의 언어가 한국어가 아니더라도 반드시 한국어로 요약해야 합니다.`,
      },
      {
        role: "user",
        content: `다음 텍스트를 위의 규칙에 따라 한국어로 요약해주세요:\n\n${truncatedContent}`,
      },
    ];
    const completion = await engine.chat.completions.create({
      stream: true,
      messages,
      extra_body: { enable_thinking: false },
    });
    let result = "";
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta?.content;
      if (curDelta) {
        result += curDelta;
        if (callbacks.onPartial) callbacks.onPartial(result);
      }
    }
    if (callbacks.onDone) callbacks.onDone(result);
    return result;
  } catch (error) {
    if (callbacks.onError) callbacks.onError(error);
    throw error;
  }
}
