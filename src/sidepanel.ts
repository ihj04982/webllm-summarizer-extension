import { CreateWebWorkerMLCEngine, MLCEngineInterface, InitProgressReport } from "@mlc-ai/web-llm";
import * as ProgressBar from "progressbar.js";
import "./styles";

const extractButton = document.getElementById("extract-button")!;
const historyWrapper = document.getElementById("historyWrapper")!;
const loadingContainerWrapper = document.getElementById("loadingContainerWrapper")!;

// 성능 최적화를 위한 상수
const MAX_HISTORY_ITEMS = 20; // 최대 히스토리 개수 제한
const MAX_CONTENT_LENGTH = 10000; // 콘텐츠 최대 길이 제한

const progressBar = new ProgressBar.Line("#loadingContainer", {
  strokeWidth: 4,
  easing: "easeInOut",
  duration: 1400,
  color: "#ffd166",
  trailColor: "#eee",
  trailWidth: 1,
  svgStyle: { width: "100%", height: "100%" },
});

const initProgressCallback = (report: InitProgressReport) => {
  progressBar.animate(report.progress, { duration: 50 });
  if (report.progress == 1.0) {
    loadingContainerWrapper.style.display = "none";
    const loadingBarContainer = document.getElementById("loadingContainer");
    if (loadingBarContainer) {
      loadingBarContainer.remove();
    }
  }
};

// 웹워커 엔진 초기화
const engine = await CreateWebWorkerMLCEngine(
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  "Qwen3-1.7B-q4f16_1-MLC",
  {
    initProgressCallback: initProgressCallback,
  }
);

let summaryHistory: { content: string; summary: string; timestamp: string; title: string }[] = [];

// 캐싱 시스템
const summaryCache = new Map<string, string>();
const MAX_CACHE_SIZE = 50;

// 캐시 키 생성 함수
function generateCacheKey(content: string): string {
  // 간단한 해시 함수 (실제 프로덕션에서는 더 강력한 해시 함수 사용)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32비트 정수로 변환
  }
  return hash.toString();
}

// 캐시 정리 함수
function cleanupCache() {
  if (summaryCache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(summaryCache.keys()).slice(0, summaryCache.size - MAX_CACHE_SIZE);
    keysToDelete.forEach((key) => summaryCache.delete(key));
  }
}

// 메모리 정리 함수
function cleanupMemory() {
  // 히스토리 제한
  if (summaryHistory.length > MAX_HISTORY_ITEMS) {
    summaryHistory = summaryHistory.slice(-MAX_HISTORY_ITEMS);
  }

  // 가비지 컬렉션 힌트 (브라우저가 지원하는 경우)
  if ((window as any).gc) {
    (window as any).gc();
  }
}

// 페이지 언로드 시 자원 정리
window.addEventListener("beforeunload", () => {
  summaryHistory = [];
});

// UI 업데이트 통합 함수
function updateUI(type: "button" | "loading" | "summary", data?: any) {
  switch (type) {
    case "button":
      const btn = extractButton as HTMLButtonElement;
      btn.disabled = data.loading;
      btn.innerText = data.loading ? "요약 중..." : "본문 추출 및 요약";
      break;
    case "loading":
      document.getElementById("loading-indicator")!.style.display = data.show ? "block" : "none";
      break;
    case "summary":
      if (data.summaryDiv && data.content) {
        data.summaryDiv.innerHTML = data.content.replace(/\n/g, "<br>");
      }
      break;
  }
}

function renderHistory() {
  historyWrapper.innerHTML = "";
  summaryHistory
    .slice()
    .reverse()
    .forEach((item) => {
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
      <div class="section-container">
        <div class="content-text">
          <div class="content-title">
            ${item.title}
            <button class="toggle-button">더보기</button>
          </div>
          <div class="content-body" style="display: none;">${item.content.replace(/\n/g, "<br>")}</div>
        </div>
      </div>
      <div class="section-container">
        <div class="summary-text">${item.summary.replace(/\n/g, "<br>")}</div>
        <button class="toggle-button" style="display: none;">접기</button>
      </div>
      <div class="meta-container">
        <span class="history-timestamp">${item.timestamp}</span>
        <button class="copy-button" title="Copy the Summary to the Clipboard">
          <i class="fa-solid fa-copy fa-lg"></i>
        </button>
      </div>
    `;

      // 본문 더보기/접기
      const contentBody = card.querySelector(".content-body") as HTMLElement;
      const toggleBtn = card.querySelector(".content-title .toggle-button")!;
      const contentDiv = card.querySelector(".content-text")!;

      toggleBtn.addEventListener("click", () => {
        const isHidden = contentBody.style.display === "none";
        contentBody.style.display = isHidden ? "block" : "none";
        contentDiv.classList.toggle("expanded", isHidden);
        toggleBtn.textContent = isHidden ? "접기" : "더보기";
      });

      // 요약 더보기/접기
      const summaryDiv = card.querySelector(".summary-text")!;
      const summaryToggleBtn = card.querySelectorAll(".toggle-button")[1] as HTMLButtonElement;

      // 요약 길이에 따른 토글 버튼 표시 여부 결정
      const lineHeight = parseFloat(getComputedStyle(summaryDiv).lineHeight) || 16;
      const maxHeight = lineHeight * 4;

      if (item.summary && item.summary !== "요약 중..." && summaryDiv.scrollHeight > maxHeight + 2) {
        summaryToggleBtn.style.display = "inline-block";
        summaryToggleBtn.textContent = "접기";
        summaryDiv.classList.add("expanded");

        summaryToggleBtn.addEventListener("click", () => {
          const isExpanded = summaryDiv.classList.contains("expanded");
          summaryDiv.classList.toggle("expanded", !isExpanded);
          summaryToggleBtn.textContent = isExpanded ? "더보기" : "접기";
        });
      } else {
        summaryToggleBtn.style.display = "none";
        summaryDiv.classList.add("expanded");
      }

      // 복사 기능
      card.querySelector(".copy-button")!.addEventListener("click", () => {
        navigator.clipboard.writeText(item.summary).catch((err) => console.error("Could not copy text: ", err));
      });

      historyWrapper.appendChild(card);
    });
}

// 스트림 처리 및 요약 함수 통합 - 디바운싱 적용
let summaryTimeout: NodeJS.Timeout | null = null;
async function streamSummary(content: string, summaryDiv: HTMLElement): Promise<string> {
  let summary = "";

  try {
    // 콘텐츠 길이 제한
    const truncatedContent =
      content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;

    // 캐시 확인
    const cacheKey = generateCacheKey(truncatedContent);
    if (summaryCache.has(cacheKey)) {
      const cachedSummary = summaryCache.get(cacheKey)!;
      updateUI("summary", { summaryDiv, content: cachedSummary });
      return cachedSummary;
    }

    const completion = await engine.chat.completions.create({
      stream: true,
      messages: [{ role: "user", content: `다음 본문을 한국어로 간결하게 요약해줘.\n\n${truncatedContent}` }],
      extra_body: {
        enable_thinking: false,
      },
    });

    // 스트림 처리 최적화 - 100ms 간격으로 UI 업데이트
    for await (const chunk of completion) {
      const delta = chunk.choices[0].delta.content;
      if (delta) {
        summary += delta;

        // 디바운싱으로 UI 업데이트 최적화
        if (summaryTimeout) {
          clearTimeout(summaryTimeout);
        }
        summaryTimeout = setTimeout(() => {
          updateUI("summary", { summaryDiv, content: summary });
        }, 100);
      }
    }

    // 최종 업데이트
    if (summaryTimeout) {
      clearTimeout(summaryTimeout);
    }
    updateUI("summary", { summaryDiv, content: summary });

    // 최종 메시지 정리
    const finalMessage = await engine.getMessage();
    const cleanedMessage = finalMessage.replace(/^\s+|\s+$/g, "");

    // 캐시에 저장
    summaryCache.set(cacheKey, cleanedMessage);
    cleanupCache();

    return cleanedMessage;
  } catch (error) {
    console.error("Error during summarization:", error);
    throw error;
  }
}

extractButton.addEventListener("click", () => {
  updateUI("button", { loading: true });
  updateUI("loading", { show: true });

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs[0]?.id) {
      updateUI("button", { loading: false });
      updateUI("loading", { show: false });
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_MAIN_CONTENT" }, async (response) => {
      try {
        if (!response?.content) {
          throw new Error("본문 추출에 실패했습니다.");
        }

        const { content, title } = response;

        // 콘텐츠 길이 제한 적용
        const truncatedContent =
          content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;

        const timestamp = new Date().toLocaleString("en-US", {
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        // 히스토리에 빈 항목 추가하고 렌더링
        summaryHistory.push({ content: truncatedContent, summary: "요약 중...", timestamp, title });

        // 메모리 정리
        cleanupMemory();

        renderHistory();

        // 마지막 카드의 summary DOM 참조
        const lastCard = historyWrapper.querySelector(".history-card");
        const summaryDiv = lastCard?.querySelector(".summary-text") as HTMLElement;

        if (summaryDiv) {
          // 스트림 처리로 요약 생성
          const finalSummary = await streamSummary(content, summaryDiv);

          // 히스토리 업데이트
          summaryHistory[summaryHistory.length - 1].summary = finalSummary || "요약 실패";

          // 최종 렌더링
          renderHistory();
        }
      } catch (error) {
        console.error("Error:", error);
        if (summaryHistory.length > 0) {
          summaryHistory[summaryHistory.length - 1].summary = "요약 중 오류가 발생했습니다.";
          renderHistory();
        } else {
          alert(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
        }
      } finally {
        updateUI("button", { loading: false });
        updateUI("loading", { show: false });
      }
    });
  });
});
