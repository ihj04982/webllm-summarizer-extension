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
  if (engine && typeof (engine as any).dispose === "function") {
    try {
      (engine as any).dispose();
    } catch (e) {
      console.warn("Engine dispose failed", e);
    }
  }
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
    // const selectedModel = "gemma-2-2b-it-q4f16_1-MLC";
    // const selectedModel = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
    // const selectedModel = "Qwen3-4B-q4f16_1-MLC";
    const selectedModel = "Qwen2.5-7B-Instruct-q4f16_1-MLC";
    if (worker) {
      try {
        worker.terminate();
      } catch (e) {}
      worker = null;
    }
    const newWorker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
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

const CONSISTENT_SUMMARY_PROMPT = `당신은 전문 한국어 요약 전문가입니다.

규칙:
1. 정확히 3-4문장으로 작성
2. 핵심 사실과 중요한 정보만 포함
3. 객관적이고 간결한 문체 사용
4. 원문의 주요 결론이나 결과 포함

형식: 각 문장은 완전한 한국어 문장으로 끝나야 하며, 불완전한 문장은 작성하지 마세요.`;

export async function generateSummaryWithEngine(content: string, callbacks: GenerateSummaryCallbacks = {}) {
  if (!engine) throw new Error("Engine not connected");
  const MAX_CONTENT_LENGTH = 3000;
  const truncatedContent =
    content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;
  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: CONSISTENT_SUMMARY_PROMPT,
      },
      {
        role: "user",
        content: `다음 텍스트를 요약해주세요:\n\n${truncatedContent}`,
      },
    ];
    // ====== [테스트용] 성능 측정 코드 시작 ======
    const startTime = performance.now();
    // ====== [테스트용] 성능 측정 코드 끝 ======
    const completion = await engine.chat.completions.create({
      stream: true,
      messages,
      extra_body: { enable_thinking: false },
    });
    let result = "";
    let lastUsage: any = undefined;
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta?.content;
      if (curDelta) {
        result += curDelta;
        if (callbacks.onPartial) callbacks.onPartial(result);
      }
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
    }
    // ====== [테스트용] 성능 측정 코드 시작 ======
    const endTime = performance.now();
    if (lastUsage) {
      const usage = lastUsage;
      console.log(`🚀 성능 리포트:`);
      console.log(`📝 요약 길이: ${result.length}자`);
      console.log(`🔢 효율성: ${((usage.completion_tokens / usage.prompt_tokens) * 100).toFixed(1)}% 압축률`);
      console.log(`⚡ 체감 속도: ${((endTime - startTime) / 1000).toFixed(2)}초 (브라우저 측정)`);
      if (usage.extra?.decode_tokens_per_s)
        console.log(`⚡ 실제 속도: ${usage.extra.decode_tokens_per_s.toFixed(2)} 토큰/초`);
    }
    // ====== [테스트용] 성능 측정 코드 끝 ======
    if (callbacks.onDone) callbacks.onDone(result);
    return result;
  } catch (error) {
    if (callbacks.onError) callbacks.onError(error);
    throw error;
  }
}

// ====== [테스트용] 성능 모니터링 함수: generateWithMetrics ======
// 이 함수는 테스트 후 삭제하세요.
async function generateWithMetrics(content: string) {
  if (!engine) throw new Error("Engine not connected");
  const startTime = performance.now();
  const completion = await engine.chat.completions.create({
    messages: [{ role: "user", content }],
    stream: false,
  });
  const endTime = performance.now();
  const usage = completion.usage!;
  console.log(`🚀 성능 리포트:`);
  console.log(`📝 요약 길이: ${completion.choices[0].message.content?.length}자`);
  console.log(`🔢 효율성: ${((usage.completion_tokens / usage.prompt_tokens) * 100).toFixed(1)}% 압축률`);
  console.log(`⚡ 체감 속도: ${((endTime - startTime) / 1000).toFixed(2)}초 (브라우저 측정)`);
  console.log(`⚡ 실제 속도: ${usage.extra.decode_tokens_per_s.toFixed(2)} 토큰/초`);
  return completion;
}
// ====== [테스트용 끝] ======
