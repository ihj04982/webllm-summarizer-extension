import { CreateMLCEngine, MLCEngineInterface } from "@mlc-ai/web-llm";

let engine: MLCEngineInterface | null = null;
let isInitializing = false;

// 서비스워커로부터 메시지 수신
self.onmessage = async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case "INIT_ENGINE":
        await initializeEngine();
        break;

      case "GENERATE_SUMMARY":
        await generateSummary(data);
        break;

      case "GET_STATUS":
        postMessage({
          type: "STATUS_RESPONSE",
          data: {
            isInitialized: !!engine,
            isInitializing,
          },
        });
        break;

      default:
        console.warn("Unknown message type:", type);
    }
  } catch (error) {
    console.error("Worker error:", error);
    postMessage({
      type: "WORKER_ERROR",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
  }
};

async function initializeEngine() {
  if (engine || isInitializing) {
    postMessage({
      type: "ENGINE_INIT_COMPLETE",
      data: { alreadyInitialized: true },
    });
    return;
  }

  isInitializing = true;

  try {
    console.log("Initializing WebLLM engine in worker...");

    postMessage({
      type: "ENGINE_INIT_START",
      data: {},
    });

    engine = await CreateMLCEngine("Qwen3-1.7B-q4f16_1-MLC", {
      initProgressCallback: (report) => {
        console.log(`Engine loading: ${(report.progress * 100).toFixed(1)}%`);

        postMessage({
          type: "ENGINE_INIT_PROGRESS",
          data: { progress: report.progress },
        });
      },
    });

    console.log("WebLLM engine initialized successfully in worker");
    isInitializing = false;

    postMessage({
      type: "ENGINE_INIT_COMPLETE",
      data: { success: true },
    });
  } catch (error) {
    console.error("Failed to initialize engine in worker:", error);
    isInitializing = false;

    postMessage({
      type: "ENGINE_INIT_ERROR",
      data: { error: error instanceof Error ? error.message : "Unknown error" },
    });
  }
}

async function generateSummary(data: any) {
  const { content, requestId, itemId } = data;

  if (!engine) {
    throw new Error("Engine not initialized");
  }

  const MAX_CONTENT_LENGTH = 3000;
  const truncatedContent =
    content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;

  try {
    postMessage({
      type: "SUMMARY_START",
      data: { requestId, itemId },
    });

    const completion = await engine.chat.completions.create({
      stream: true,
      messages: [
        {
          role: "system",
          content: `당신은 전문적인 한국어 요약 전문가입니다. 주어진 텍스트를 다음 규칙에 따라 요약해주세요:

1. **언어**: 반드시 한국어로 작성
2. **길이**: 3-4문장으로 간결하게 작성
3. **구조**: 
   - 첫 문장: 주제/핵심 내용 소개
   - 중간 문장들: 중요한 세부사항 2-3개
   - 마지막 문장: 결론 또는 의미/영향
4. **톤**: 객관적이고 정보 전달 중심
5. **포함 요소**: 
   - 핵심 사실과 데이터
   - 중요한 인물/기관명
   - 주요 결과나 영향
6. **제외 요소**: 
   - 불필요한 세부사항
   - 반복적인 내용
   - 개인적 의견이나 추측

텍스트의 언어가 한국어가 아니더라도 반드시 한국어로 요약해야 합니다.`,
        },
        {
          role: "user",
          content: `다음 텍스트를 위의 규칙에 따라 한국어로 요약해주세요:\n\n${truncatedContent}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    let summary = "";

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        summary += delta;

        // 실시간 업데이트
        postMessage({
          type: "SUMMARY_PROGRESS",
          data: { requestId, itemId, partialSummary: summary },
        });
      }
    }

    const cleanedSummary = summary.trim();

    postMessage({
      type: "SUMMARY_COMPLETE",
      data: { requestId, itemId, summary: cleanedSummary },
    });
  } catch (error) {
    console.error("Summary generation failed:", error);

    postMessage({
      type: "SUMMARY_ERROR",
      data: {
        requestId,
        itemId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

// 워커 준비 완료 신호
postMessage({
  type: "WORKER_READY",
  data: {},
});
