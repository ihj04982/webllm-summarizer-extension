import * as ProgressBar from "progressbar.js";
import "./styles";
import {
  CreateExtensionServiceWorkerMLCEngine,
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";
// import * as webllm from "@mlc-ai/web-llm"; // Chrome Extension에서는 포트 통신 사용

const extractButton = document.getElementById("extract-button")!;
const historyWrapper = document.getElementById("historyWrapper")!;
const loadingContainerWrapper = document.getElementById("loadingContainerWrapper")!;

// 서비스워커와 통신하는 인터페이스
interface SummaryItem {
  content: string;
  summary: string;
  timestamp: string;
  title: string;
  url: string;
  id: string;
}

// 로딩 바 설정
const progressBar = new ProgressBar.Line("#loadingContainer", {
  strokeWidth: 4,
  easing: "easeInOut",
  duration: 1400,
  color: "#ffd166",
  trailColor: "#eee",
  trailWidth: 1,
  svgStyle: { width: "100%", height: "100%" },
});

// Chrome Extension에서는 manifest.json에서 서비스워커가 자동으로 등록됨

// WebLLM Engine 관리
let engine: MLCEngineInterface | null = null;
let isEngineReady = false;
let currentRequestId = 0;

// 로컬 상태 (UI용)
let localHistory: SummaryItem[] = [];
let activeSummaryRequests = new Map<string, SummaryItem>();

// 해시 생성 함수
function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// 서비스워커에서 오는 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "HISTORY_UPDATED":
      localHistory.unshift(message.item);
      renderHistory();
      break;

    case "SUMMARY_UPDATED":
      const item = localHistory.find((item) => item.id === message.id);
      if (item) {
        item.summary = message.summary;
        renderHistory();
      }
      break;
  }
});

// UI 업데이트 통합 함수
function updateUI(type: "button" | "loading", data?: any) {
  switch (type) {
    case "button":
      const btn = extractButton as HTMLButtonElement;
      btn.disabled = data.loading;
      btn.innerText = data.loading ? "요약 중..." : "본문 추출 및 요약";
      break;
    case "loading":
      document.getElementById("loading-indicator")!.style.display = data.show ? "block" : "none";
      break;
  }
}

// 실시간 요약 업데이트
function updateSummaryInPlace(itemId: string, partialSummary: string) {
  const item = localHistory.find((item) => item.id === itemId);
  if (item) {
    item.summary = partialSummary;
    // DOM에서 해당 요소만 업데이트
    const card = document.querySelector(`[data-id="${itemId}"]`);
    if (card) {
      const summaryDiv = card.querySelector(".summary-text") as HTMLElement;
      if (summaryDiv) {
        summaryDiv.innerHTML = partialSummary.replace(/\n/g, "<br>");
      }
    }
  }
}

// 요약 완료 처리
async function finalizeSummary(itemId: string, finalSummary: string) {
  const item = localHistory.find((item) => item.id === itemId);
  if (item) {
    // 서비스워커에 최종 요약 저장
    await ServiceWorkerAPI.updateSummary(item.id, finalSummary);

    // 로컬 상태 업데이트
    item.summary = finalSummary;

    // 캐시에도 저장
    const contentHash = generateHash(item.content);
    await ServiceWorkerAPI.setCachedSummary(contentHash, finalSummary);

    renderHistory();
  }
}

// 요약 에러 처리
function handleSummaryError(itemId: string, error: string) {
  const item = localHistory.find((item) => item.id === itemId);
  if (item) {
    item.summary = `요약 중 오류가 발생했습니다: ${error}`;
    renderHistory();
  }
}

function renderHistory() {
  historyWrapper.innerHTML = "";
  localHistory.forEach((item) => {
    const card = document.createElement("div");
    card.className = "history-card";
    card.setAttribute("data-id", item.id);
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
        <button class="delete-button" title="Delete this summary" data-id="${item.id}">
          <i class="fa-solid fa-trash fa-sm"></i>
        </button>
      </div>
    `;

    // 이벤트 리스너 추가
    setupCardEventListeners(card, item);
    historyWrapper.appendChild(card);
  });
}

function setupCardEventListeners(card: Element, item: SummaryItem) {
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
}

// 서비스워커 준비 상태 확인
async function waitForServiceWorker(): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 15;

    const checkServiceWorker = () => {
      attempts++;
      console.log(`Service worker ping attempt ${attempts}/${maxAttempts}`);

      chrome.runtime.sendMessage({ type: "PING" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`Ping attempt ${attempts} failed:`, chrome.runtime.lastError.message);

          if (attempts < maxAttempts) {
            setTimeout(checkServiceWorker, 1000);
          } else {
            console.error("Service worker not responding after", maxAttempts, "attempts");
            alert("서비스워커 연결 실패. 확장 프로그램을 다시 로드해주세요.");
            resolve(false);
          }
        } else {
          console.log(`Service worker responded successfully on attempt ${attempts}`);
          resolve(true);
        }
      });
    };

    setTimeout(checkServiceWorker, 100);
  });
}

// 초기화 함수
async function initializeUI() {
  try {
    // 로딩 상태 표시
    showLoadingState();

    // 서비스워커 준비 대기
    const isReady = await waitForServiceWorker();
    if (!isReady) {
      console.warn("Service worker not ready");
      hideLoadingState();
      return;
    }

    // 웹워커 초기화 (사이드패널에서)
    initializeMLCEngine();

    // 히스토리 로드
    localHistory = await ServiceWorkerAPI.getHistory(20);
    renderHistory();

    hideLoadingState();
    console.log("UI initialized successfully");

    // 웹워커가 준비되면 자동으로 엔진 초기화됨
  } catch (error) {
    console.error("Failed to initialize UI:", error);
    hideLoadingState();
  }
}

// 로딩 상태 함수
function showLoadingState() {
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "initial-loading";
  loadingDiv.innerHTML = `
    <div style="text-align: center; padding: 20px; color: #666;">
      <div>시스템 초기화 중...</div>
      <div style="margin-top: 10px; font-size: 0.9em;">
        WebLLM 엔진을 로드하고 있습니다
      </div>
    </div>
  `;
  historyWrapper.appendChild(loadingDiv);
}

function hideLoadingState() {
  const loadingDiv = document.getElementById("initial-loading");
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

// 메인 요약 버튼 이벤트
extractButton.addEventListener("click", async () => {
  updateUI("button", { loading: true });
  updateUI("loading", { show: true });

  try {
    // 엔진 준비 확인
    if (!isEngineReady) {
      alert("엔진이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    // 현재 탭 정보 가져오기
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error("활성 탭을 찾을 수 없습니다.");
    }

    // 본문 추출
    const response: any = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabs[0].id!, { type: "EXTRACT_MAIN_CONTENT" }, resolve);
    });

    if (!response?.content) {
      throw new Error("본문 추출에 실패했습니다.");
    }

    const { content, title } = response;
    const currentUrl = tabs[0].url || "";

    // 캐시 확인
    const contentHash = generateHash(content);
    const cachedSummary = await ServiceWorkerAPI.getCachedSummary(contentHash);

    const timestamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // 서비스워커에 새 항목 추가
    const newItem = await ServiceWorkerAPI.addSummaryItem({
      content: content.length > 3000 ? content.substring(0, 3000) + "..." : content,
      summary: cachedSummary || "요약 중...",
      timestamp,
      title,
      url: currentUrl,
    });

    // 로컬 히스토리에 추가 및 UI 업데이트
    localHistory.unshift(newItem);
    renderHistory();

    if (cachedSummary) {
      console.log("Summary loaded from cache");
      await ServiceWorkerAPI.updateSummary(newItem.id, cachedSummary);
    } else {
      // WebLLM 엔진으로 직접 요약 요청
      const requestId = ++currentRequestId;
      await generateSummaryWithEngine(newItem.id, content, requestId);
    }
  } catch (error) {
    console.error("Error:", error);
    alert(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
  } finally {
    updateUI("button", { loading: false });
    updateUI("loading", { show: false });
  }
});

// 페이지 언로드 시 엔진 정리 (WebLLM 엔진은 자동으로 정리됨)
window.addEventListener("beforeunload", () => {
  if (engine) {
    console.log("Cleaning up WebLLM engine...");
    // WebLLM 엔진은 자동으로 정리되므로 별도 terminate가 필요하지 않음
  }
});

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  initializeUI();
});

// 서비스워커와 통신하는 헬퍼 함수들
class ServiceWorkerAPI {
  private static async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Chrome runtime error:", chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            console.warn("No response from service worker for:", message.type);
            resolve({});
            return;
          }

          resolve(response);
        });
      } catch (error) {
        console.error("Error sending message to service worker:", error);
        reject(error);
      }
    });
  }

  static async getHistory(limit?: number): Promise<SummaryItem[]> {
    try {
      const response = await this.sendMessage({ type: "GET_HISTORY", limit });
      return response.history || [];
    } catch (error) {
      console.error("Failed to get history:", error);
      return [];
    }
  }

  static async addSummaryItem(item: Omit<SummaryItem, "id">): Promise<SummaryItem> {
    try {
      const response = await this.sendMessage({ type: "ADD_SUMMARY_ITEM", item });
      if (!response.item) {
        throw new Error("Failed to add summary item - no item in response");
      }
      return response.item;
    } catch (error) {
      console.error("Failed to add summary item:", error);
      return {
        ...item,
        id: "temp_" + Date.now().toString(),
      };
    }
  }

  static async updateSummary(id: string, summary: string): Promise<void> {
    try {
      await this.sendMessage({ type: "UPDATE_SUMMARY", id, summary });
    } catch (error) {
      console.error("Failed to update summary:", error);
    }
  }

  static async getCachedSummary(contentHash: string): Promise<string | null> {
    try {
      const response = await this.sendMessage({ type: "GET_CACHED_SUMMARY", contentHash });
      return response.cached || null;
    } catch (error) {
      console.error("Failed to get cached summary:", error);
      return null;
    }
  }

  static async setCachedSummary(contentHash: string, summary: string): Promise<void> {
    try {
      await this.sendMessage({ type: "SET_CACHED_SUMMARY", contentHash, summary });
    } catch (error) {
      console.error("Failed to set cached summary:", error);
    }
  }
}

// WebLLM 엔진으로 직접 요약 생성
async function generateSummaryWithEngine(itemId: string, content: string, requestId: number) {
  if (!engine) {
    throw new Error("Engine not connected");
  }

  const MAX_CONTENT_LENGTH = 3000;
  const truncatedContent =
    content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;

  try {
    // WebLLM 엔진으로 스트리밍 요약 요청 전송 (예제 방식)
    const messages: ChatCompletionMessageParam[] = [
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
    ];

    const completion = await engine.chat.completions.create({
      stream: true,
      messages: messages,
      max_tokens: 800,
      temperature: 0.3,
      extra_body: {
        enable_thinking: false,
      },
    });

    let summary = "";
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta?.content;
      if (curDelta) {
        summary += curDelta;
        // 실시간 업데이트
        updateSummaryInPlace(itemId, summary);
      }
    }

    const finalSummary = await engine.getMessage();
    await finalizeSummary(itemId, finalSummary);
  } catch (error) {
    console.error("Summary generation failed:", error);
    handleSummaryError(itemId, error instanceof Error ? error.message : "Unknown error");
  }
}

// WebLLM 엔진 초기화 (예제 방식)
async function initializeMLCEngine() {
  if (engine) {
    console.log("Engine already initialized");
    return;
  }

  try {
    console.log("Initializing WebLLM Extension Service Worker Engine...");
    loadingContainerWrapper.style.display = "flex";

    const initProgressCallback = (report: InitProgressReport) => {
      progressBar.animate(report.progress, { duration: 50 });
      console.log(`Model loading: ${(report.progress * 100).toFixed(1)}%`);

      if (report.progress === 1.0) {
        console.log("WebLLM engine initialized successfully");
        isEngineReady = true;
        loadingContainerWrapper.style.display = "none";

        const loadingBarContainer = document.getElementById("loadingContainer");
        if (loadingBarContainer) {
          loadingBarContainer.remove();
        }
      }
    };

    const selectedModel = "Qwen3-1.7B-q4f16_1-MLC";

    // CreateExtensionServiceWorkerMLCEngine 사용 (예제 방식)
    engine = await CreateExtensionServiceWorkerMLCEngine(selectedModel, {
      initProgressCallback: initProgressCallback,
    });

    console.log("WebLLM Extension Service Worker Engine created successfully");
  } catch (error) {
    console.error("Failed to initialize WebLLM Extension Service Worker Engine:", error);
    isEngineReady = false;
    loadingContainerWrapper.style.display = "none";
    alert(`WebLLM 초기화 실패: ${error}`);
  }
}
