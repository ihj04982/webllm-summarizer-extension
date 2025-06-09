import * as ProgressBar from "progressbar.js";
import "./styles";

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

// 웹워커 관리 (사이드패널에서)
let mlcWorker: Worker | null = null;
let isEngineReady = false;
let currentRequestId = 0;

// 웹워커 초기화
function initializeMLCWorker() {
  if (mlcWorker) {
    mlcWorker.terminate();
  }

  mlcWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

  mlcWorker.onmessage = (event) => {
    const { type, data } = event.data;

    switch (type) {
      case "WORKER_READY":
        console.log("MLC Worker ready");
        // 웹워커 준비 완료 후 엔진 초기화 시작
        setTimeout(() => {
          sendToWorker("INIT_ENGINE");
        }, 100);
        break;

      case "ENGINE_INIT_START":
        console.log("Engine initialization started");
        loadingContainerWrapper.style.display = "flex";
        break;

      case "ENGINE_INIT_PROGRESS":
        progressBar.animate(data.progress, { duration: 50 });
        console.log(`Engine loading: ${(data.progress * 100).toFixed(1)}%`);
        break;

      case "ENGINE_INIT_COMPLETE":
        console.log("Engine initialization complete");
        isEngineReady = true;
        loadingContainerWrapper.style.display = "none";
        const loadingBarContainer = document.getElementById("loadingContainer");
        if (loadingBarContainer) {
          loadingBarContainer.remove();
        }
        break;

      case "ENGINE_INIT_ERROR":
        console.error("Engine initialization failed:", data.error);
        isEngineReady = false;
        loadingContainerWrapper.style.display = "none";
        alert(`엔진 초기화 실패: ${data.error}`);
        break;

      case "SUMMARY_START":
        console.log(`Summary generation started for request ${data.requestId}`);
        break;

      case "SUMMARY_PROGRESS":
        // 실시간 요약 업데이트
        updateSummaryInPlace(data.itemId, data.partialSummary);
        break;

      case "SUMMARY_COMPLETE":
        console.log(`Summary generation complete for request ${data.requestId}`);
        finalizeSummary(data.itemId, data.summary);
        break;

      case "SUMMARY_ERROR":
        console.error(`Summary generation failed for request ${data.requestId}:`, data.error);
        handleSummaryError(data.itemId, data.error);
        break;

      case "WORKER_ERROR":
        console.error("Worker error:", data.error);
        break;

      default:
        console.log("Unknown worker message:", type);
    }
  };

  mlcWorker.onerror = (error) => {
    console.error("Worker error:", error);
  };

  return mlcWorker;
}

// 웹워커에 메시지 전송
function sendToWorker(type: string, data?: any) {
  if (!mlcWorker) {
    console.error("Worker not initialized");
    return;
  }

  mlcWorker.postMessage({ type, data });
}

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
    initializeMLCWorker();

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
      // 웹워커에 요약 요청
      const requestId = ++currentRequestId;

      sendToWorker("GENERATE_SUMMARY", {
        content,
        requestId,
        itemId: newItem.id,
      });
    }
  } catch (error) {
    console.error("Error:", error);
    alert(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
  } finally {
    updateUI("button", { loading: false });
    updateUI("loading", { show: false });
  }
});

// 페이지 언로드 시 웹워커 정리
window.addEventListener("beforeunload", () => {
  if (mlcWorker) {
    mlcWorker.terminate();
  }
});

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  initializeUI();
});
