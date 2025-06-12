import "./styles";
import {
  CreateExtensionServiceWorkerMLCEngine,
  MLCEngineInterface,
  InitProgressReport,
  ChatCompletionMessageParam,
} from "@mlc-ai/web-llm";
import { Line } from "progressbar.js";

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
  status: string;
  error?: string;
}

let progressBar: InstanceType<typeof Line> | null = null;

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
    case "SUMMARY_PROGRESS": {
      const item = localHistory.find((item) => item.id === message.id);
      if (item) {
        item.summary = message.summary;
        item.status = "in-progress";
        renderHistory();
      }
      break;
    }
    case "SUMMARY_UPDATED": {
      const item = localHistory.find((item) => item.id === message.id);
      if (item) {
        item.summary = message.summary;
        item.status = "done";
        item.error = undefined;
        renderHistory();
      }
      break;
    }
    case "SUMMARY_ERROR": {
      const item = localHistory.find((item) => item.id === message.id);
      if (item) {
        item.status = "error";
        item.error = message.error;
        item.summary = `요약 중 오류가 발생했습니다: ${message.error}`;
        renderHistory();
      }
      break;
    }
    case "SUMMARY_DELETED":
      const index = localHistory.findIndex((item) => item.id === message.id);
      if (index !== -1) {
        localHistory.splice(index, 1);
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
      btn.innerText = "본문 추출 및 요약";
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
    await ServiceWorkerAPI.updateSummary(item.id, finalSummary, "done", undefined);
    // 로컬 상태 업데이트
    item.summary = finalSummary;
    item.status = "done";
    item.error = undefined;
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
    card.className = `history-card status-${item.status}`;
    card.setAttribute("data-id", item.id);

    // Status badge/icon
    let statusBadge = "";
    if (item.status === "pending") {
      statusBadge = '<span class="status-badge badge-pending"><i class="fa fa-clock"></i> 대기 중</span>';
    } else if (item.status === "in-progress") {
      statusBadge = '<span class="status-badge badge-inprogress"><i class="fa fa-spinner fa-spin"></i> 진행 중</span>';
    } else if (item.status === "done") {
      statusBadge = '<span class="status-badge badge-done"><i class="fa fa-check-circle"></i> 완료</span>';
    } else if (item.status === "error") {
      statusBadge = '<span class="status-badge badge-error"><i class="fa fa-exclamation-circle"></i> 오류</span>';
    }

    // Summary area
    let summaryHtml = "";
    if (item.status === "error") {
      summaryHtml = `<div class="summary-error">${item.error || "오류"}</div>`;
    } else if (item.status === "done") {
      summaryHtml = item.summary.replace(/\n/g, "<br>");
    } else {
      summaryHtml = item.summary.replace(/\n/g, "<br>");
    }

    // Always show retry button, disable if in-progress
    let retryDisabled = item.status === "in-progress" ? "disabled" : "";
    let actionBtnHtml = `<button class="retry-button" ${retryDisabled}><i class="fa-solid fa-rotate-right"></i></button>`;

    card.innerHTML = `
      <div class="section-container">
        <div class="content-text">
        ${statusBadge}
          <div class="content-title">
          ${item.title}
          <a href="${item.url}" target="_blank">
            <i class="fa-solid fa-external-link-alt"></i>
          </a>
          <button class="toggle-button">더보기</button>
          </div>
          <div class="content-body" style="display: none;">${item.content.replace(/\n/g, "<br>")}</div>
          </div>
      </div>
      <div class="section-container">
        <div class="summary-text">${summaryHtml}</div>
      </div>
      <div class="meta-container">
        <span class="history-timestamp">${item.timestamp}</span>
        <div class="meta-actions">
          <button class="copy-button" title="Copy the Summary to the Clipboard">
            <i class="fa-solid fa-copy fa-lg"></i>
          </button>
          ${actionBtnHtml}
          <button class="delete-button" title="Delete this summary" data-id="${item.id}">
            <i class="fa-solid fa-trash fa-sm"></i>
          </button>
        </div>
      </div>
    `;
    setupCardEventListeners(card, item);
    historyWrapper.appendChild(card);
  });
}

// 본문 더보기/접기
function setupCardEventListeners(card: Element, item: SummaryItem) {
  const contentBody = card.querySelector(".content-body") as HTMLElement;
  const toggleBtn = card.querySelector(".content-title .toggle-button");
  const contentDiv = card.querySelector(".content-text");
  if (toggleBtn && contentBody && contentDiv) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = contentBody.style.display === "none";
      contentBody.style.display = isHidden ? "block" : "none";
      contentDiv.classList.toggle("expanded", isHidden);
      toggleBtn.textContent = isHidden ? "접기" : "더보기";
    });
  }

  // 복사 기능
  const copyBtn = card.querySelector(".copy-button");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const formattedText = `${item.summary}\n\n\n\n출처: ${item.title}\n${item.url}`;
      navigator.clipboard.writeText(formattedText).catch((err) => console.error("Could not copy text: ", err));
    });
  }

  // 삭제 기능
  const deleteBtn = card.querySelector(".delete-button");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (confirm("이 요약을 삭제하시겠습니까?")) {
        try {
          const success = await ServiceWorkerAPI.deleteSummary(item.id);
          if (success) {
            const index = localHistory.findIndex((historyItem) => historyItem.id === item.id);
            if (index !== -1) {
              localHistory.splice(index, 1);
              renderHistory();
            }
          } else {
            alert("삭제에 실패했습니다.");
          }
        } catch (error) {
          console.error("Error deleting summary:", error);
          alert("삭제 중 오류가 발생했습니다.");
        }
      }
    });
  }

  // Attach retry button event (always present, but only active if not in-progress)
  const retryBtn = card.querySelector(".retry-button");
  if (retryBtn && item.status !== "in-progress") {
    retryBtn.addEventListener("click", async () => {
      await startSummary(item);
    });
  }
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
    await initializeMLCEngine();
    if (!isEngineReady) {
      alert("엔진이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error("활성 탭을 찾을 수 없습니다.");
    }
    const response: any = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabs[0].id!, { type: "EXTRACT_MAIN_CONTENT" }, resolve);
    });
    if (!response?.content) {
      throw new Error("본문 추출에 실패했습니다.");
    }
    const { content, title } = response;
    const currentUrl = tabs[0].url || "";
    const timestamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Add as pending
    const newItem = await ServiceWorkerAPI.addSummaryItem({
      content: content.length > 3000 ? content.substring(0, 3000) + "..." : content,
      summary: "",
      timestamp,
      title,
      url: currentUrl,
      status: "pending",
      error: undefined,
    });
    localHistory.unshift(newItem);
    renderHistory();
    // Always generate a new summary
    await startSummary(newItem);
  } catch (error) {
    console.error("Error:", error);
    alert(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
  } finally {
    updateUI("button", { loading: false });
    updateUI("loading", { show: false });
  }
});

// Helper to start summary from pending or retry
async function startSummary(item) {
  item.status = "in-progress";
  item.summary = "";
  item.error = undefined;
  renderHistory();
  await ServiceWorkerAPI.updateSummary(item.id, item.summary, item.status, item.error);
  await initializeMLCEngine();
  if (isEngineReady) {
    const requestId = ++currentRequestId;
    await generateSummaryWithEngine(item.id, item.content, requestId);
  }
}

// 페이지 언로드 시 엔진 정리 (WebLLM 엔진은 자동으로 정리됨)
window.addEventListener("beforeunload", () => {
  if (engine) {
    console.log("Cleaning up WebLLM engine...");
    // WebLLM 엔진은 자동으로 정리되므로 별도 terminate가 필요하지 않음
  }
});

// 페이지 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  try {
    const loadingContainer = document.getElementById("loadingContainer");
    if (loadingContainer) {
      progressBar = new Line("#loadingContainer", {
        strokeWidth: 4,
        easing: "easeInOut",
        duration: 1400,
        color: "#ffd166",
        trailColor: "#eee",
        trailWidth: 1,
        svgStyle: { width: "100%", height: "100%" },
      });
    }
  } catch (e) {
    console.error("Failed to initialize ProgressBar:", e);
  }
  initializeUI().then(async () => {
    // On panel open, mark any in-progress summaries as interrupted
    let needsUpdate = false;
    for (const item of localHistory) {
      if (item.status === "in-progress") {
        item.status = "error";
        item.error = "요약이 중단되었습니다. 다시 시도해주세요.";
        await ServiceWorkerAPI.updateSummary(item.id, item.summary, item.status, item.error);
        needsUpdate = true;
      }
    }
    if (needsUpdate) renderHistory();
  });
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

  static async updateSummary(id: string, summary: string, status: string, error?: string): Promise<void> {
    try {
      await this.sendMessage({ type: "UPDATE_SUMMARY", id, summary, status, error });
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

  static async deleteSummary(id: string): Promise<boolean> {
    try {
      const response = await this.sendMessage({ type: "DELETE_SUMMARY", id });
      return response.success || false;
    } catch (error) {
      console.error("Failed to delete summary:", error);
      return false;
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
      messages: messages,
      extra_body: {
        enable_thinking: false,
      },
    });
    let summary = "";
    for await (const chunk of completion) {
      const curDelta = chunk.choices[0]?.delta?.content;
      if (curDelta) {
        summary += curDelta;
        updateSummaryInPlace(itemId, summary);
      }
    }
    const finalSummary = await engine.getMessage();
    await finalizeSummary(itemId, finalSummary);
  } catch (error) {
    handleSummaryError(itemId, error instanceof Error ? error.message : "Unknown error");
  }
}

async function initializeMLCEngine() {
  if (engine) {
    return;
  }
  try {
    // Show loading UI
    loadingContainerWrapper.style.display = "flex";
    const statusText = document.getElementById("model-status-text");
    if (statusText) statusText.innerText = "모델 준비 중입니다...";

    const selectedModel = "Qwen3-4B-q4f16_1-MLC";
    engine = await CreateExtensionServiceWorkerMLCEngine(selectedModel, {
      initProgressCallback: (report: InitProgressReport) => {
        if (progressBar) progressBar.animate(report.progress, { duration: 50 });
        if (statusText) statusText.innerText = `모델 로딩 중... (${Math.round(report.progress * 100)}%)`;
        if (report.progress === 1.0) {
          isEngineReady = true;
          loadingContainerWrapper.style.display = "none";
          if (statusText) statusText.innerText = "";
        }
      },
    });
    isEngineReady = true;
    loadingContainerWrapper.style.display = "none";
    if (statusText) statusText.innerText = "";
  } catch (error) {
    isEngineReady = false;
    loadingContainerWrapper.style.display = "none";
    const statusText = document.getElementById("model-status-text");
    if (statusText) statusText.innerText = "모델 로딩 실패";
    alert(`WebLLM 초기화 실패: ${error}`);
  }
}
