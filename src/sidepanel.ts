import "./styles";
import { Line } from "progressbar.js";
import { initializeMLCEngine, generateSummaryWithEngine } from "./engine/engineManager";
import {
  getLocalHistory,
  refreshLocalHistory,
  addSummaryItem,
  updateSummary as stateUpdateSummary,
  deleteSummary as stateDeleteSummary,
  setOnHistoryChanged,
  setPartialSummary,
} from "./state/state";
import { renderHistory, updateUI, showToast } from "./ui/render";
import { setupCardEventListeners } from "./ui/events";

const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
const historyWrapper = document.getElementById("historyWrapper")!;
const loadingContainerWrapper = document.getElementById("loadingContainerWrapper")!;

let progressBar: InstanceType<typeof Line> | null = null;

// ServiceWorker 정책과 동기화된 히스토리 최대 개수
const MAX_HISTORY_ITEMS = 20;

// 요약 버튼은 초기에는 비활성화
extractButton.disabled = true;

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
  if (message.type === "MODEL_LOAD_PROGRESS") {
    if (progressBar) {
      progressBar.set(message.progress);
    }
    // 상태 텍스트 업데이트
    const statusText = document.getElementById("model-status-text");
    if (statusText) {
      if (message.progress >= 1.0) {
        statusText.textContent = "모델 준비 완료!";
      } else {
        const percent = Math.round(message.progress * 100);
        statusText.textContent = `모델 준비 중... (${percent}%)`;
      }
    }
    if (message.progress >= 1.0) {
      extractButton.disabled = false;
      setTimeout(() => {
        hideLoadingState();
      }, 200);
    } else {
      extractButton.disabled = true;
      showLoadingState();
    }
  }
  switch (message.type) {
    case "HISTORY_UPDATED":
      refreshLocalHistory(MAX_HISTORY_ITEMS);
      break;
    case "SUMMARY_PROGRESS": {
      const item = getLocalHistory().find((item) => item.id === message.id);
      if (item) {
        item.summary = message.summary;
        item.status = "in-progress";
        renderHistory(getLocalHistory().slice(0, MAX_HISTORY_ITEMS), historyWrapper, (card, item) =>
          setupCardEventListeners(
            card,
            item,
            (retryItem) => startSummary(retryItem),
            (deleteItem) => handleDeleteSummary(deleteItem)
          )
        );
      }
      break;
    }
    case "SUMMARY_UPDATED": {
      const item = getLocalHistory().find((item) => item.id === message.id);
      if (item) {
        item.summary = message.summary;
        item.status = "done";
        item.error = undefined;
        renderHistory(getLocalHistory().slice(0, MAX_HISTORY_ITEMS), historyWrapper, (card, item) =>
          setupCardEventListeners(
            card,
            item,
            (retryItem) => startSummary(retryItem),
            (deleteItem) => handleDeleteSummary(deleteItem)
          )
        );
      }
      break;
    }
    case "SUMMARY_ERROR": {
      const item = getLocalHistory().find((item) => item.id === message.id);
      if (item) {
        item.status = "error";
        item.error = message.error;
        item.summary = `요약 중 오류가 발생했습니다: ${message.error}`;
        renderHistory(getLocalHistory().slice(0, MAX_HISTORY_ITEMS), historyWrapper, (card, item) =>
          setupCardEventListeners(
            card,
            item,
            (retryItem) => startSummary(retryItem),
            (deleteItem) => handleDeleteSummary(deleteItem)
          )
        );
      }
      break;
    }
    case "SUMMARY_DELETED":
      refreshLocalHistory(MAX_HISTORY_ITEMS);
      break;
  }
});

// 실시간 요약 업데이트
function normalizeNewlines(str: string) {
  return str.replace(/\n{2,}/g, "\n");
}

function updateSummaryInPlace(itemId: string, partialSummary: string) {
  setPartialSummary(itemId, cleanThinkTags(normalizeNewlines(partialSummary)));
}

// 요약 완료 처리
async function finalizeSummary(itemId: string, finalSummary: string) {
  // 상태 변경은 ServiceWorker에 먼저 반영
  await stateUpdateSummary(itemId, finalSummary, "done", undefined, MAX_HISTORY_ITEMS);
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
}

// 요약 에러 처리
async function handleSummaryError(itemId: string, error: string) {
  // 상태 변경은 ServiceWorker에 먼저 반영
  await stateUpdateSummary(itemId, `요약 중 오류가 발생했습니다: ${error}`, "error", error, MAX_HISTORY_ITEMS);
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
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
            showToast("서비스워커 연결 실패. 확장 프로그램을 다시 로드해주세요.", "error");
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

    await initializeMLCEngine();

    // 히스토리 로드 (최대 MAX_HISTORY_ITEMS)
    await refreshLocalHistory(MAX_HISTORY_ITEMS);

    console.log("UI initialized successfully");
  } catch (error) {
    console.error("Failed to initialize UI:", error);
    hideLoadingState();
  }
}

// 로딩 상태 함수
function showLoadingState() {
  if (document.getElementById("initial-loading")) return;

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
  if (loadingContainerWrapper) {
    loadingContainerWrapper.style.display = "none";
  }
}

// 메인 요약 버튼 이벤트
extractButton.addEventListener("click", async () => {
  updateUI("button", { loading: true }, extractButton, document.getElementById("loading-indicator")!);
  updateUI("loading", { show: true }, extractButton, document.getElementById("loading-indicator")!);
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error("활성 탭을 찾을 수 없습니다.");
    }
    await chrome.scripting.executeScript({
      files: ["content.js"],
      target: { tabId: tabs[0].id! },
    });

    const response: any = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("본문 추출 시간이 초과되었습니다 (10초)"));
      }, 10000);

      chrome.tabs.sendMessage(tabs[0].id!, { type: "EXTRACT_MAIN_CONTENT" }, (response) => {
        clearTimeout(timeout);

        if (chrome.runtime.lastError) {
          reject(new Error(`통신 오류: ${chrome.runtime.lastError.message}`));
          return;
        }

        if (!response) {
          reject(new Error("응답을 받지 못했습니다"));
          return;
        }

        resolve(response);
      });
    });

    const { content, title } = response;
    const currentUrl = tabs[0].url || "";
    const timestamp = new Date().toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    // Add as pending
    const newItem = await addSummaryItem(
      {
        content: content.length > 3000 ? content.substring(0, 3000) + "..." : content,
        summary: "",
        timestamp,
        title,
        url: currentUrl,
        status: "pending",
        error: undefined,
      },
      MAX_HISTORY_ITEMS
    );
    await refreshLocalHistory(MAX_HISTORY_ITEMS);
    // Always generate a new summary
    await startSummary(newItem);
  } catch (error) {
    console.error("Error:", error);
    alert(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
  } finally {
    updateUI("button", { loading: false }, extractButton, document.getElementById("loading-indicator")!);
    updateUI("loading", { show: false }, extractButton, document.getElementById("loading-indicator")!);
  }
});

// Helper to start summary from pending or retry
async function startSummary(item) {
  // 상태 변경은 ServiceWorker에 먼저 반영
  await stateUpdateSummary(item.id, "", "in-progress", undefined, MAX_HISTORY_ITEMS);
  await refreshLocalHistory(MAX_HISTORY_ITEMS);

  // generateSummaryWithEngine을 직접 호출, 콜백으로 진행률/완료/에러 처리
  try {
    await initializeMLCEngine();
    let partial = "";
    await generateSummaryWithEngine(item.content, {
      onPartial: (partialSummary) => {
        partial = partialSummary;
        updateSummaryInPlace(item.id, partialSummary);
      },
      onDone: async (finalSummary) => {
        await finalizeSummary(item.id, finalSummary);
      },
      onError: async (error) => {
        await handleSummaryError(item.id, error instanceof Error ? error.message : String(error));
      },
    });
  } catch (error) {
    await handleSummaryError(item.id, error instanceof Error ? error.message : String(error));
  }
}

// 페이지 언로드 시 엔진/워커 정리
window.addEventListener("beforeunload", () => {
  // 기존 엔진/워커 정리
  // cleanupMLCEngine();
  // 서비스워커에 리소스 해제 요청
  chrome.runtime.sendMessage({ type: "RELEASE_RESOURCES" }, (response) => {
    if (response && response.success) {
      console.log("Service worker resources released");
    } else {
      console.warn("Failed to release service worker resources", response?.error);
    }
  });
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
    for (const item of getLocalHistory()) {
      if (item.status === "in-progress") {
        item.status = "error";
        item.error = "요약이 중단되었습니다. 다시 시도해주세요.";
        await stateUpdateSummary(item.id, item.summary, item.status, item.error, MAX_HISTORY_ITEMS);
        needsUpdate = true;
      }
    }
    if (needsUpdate)
      renderHistory(getLocalHistory().slice(0, MAX_HISTORY_ITEMS), historyWrapper, (card, item) =>
        setupCardEventListeners(
          card,
          item,
          (retryItem) => startSummary(retryItem),
          (deleteItem) => handleDeleteSummary(deleteItem)
        )
      );
  });
});

// 렌더링 트리거를 onHistoryChanged 콜백으로 등록
setOnHistoryChanged(() => {
  const historyToShow = getLocalHistory().slice(0, MAX_HISTORY_ITEMS);
  renderHistory(historyToShow, historyWrapper, (card, item) =>
    setupCardEventListeners(
      card,
      item,
      (retryItem) => startSummary(retryItem),
      (deleteItem) => handleDeleteSummary(deleteItem)
    )
  );
});

// 삭제 핸들러 래퍼 함수 추가
async function handleDeleteSummary(item) {
  if (confirm("이 요약을 삭제하시겠습니까?")) {
    try {
      await stateDeleteSummary(item.id, MAX_HISTORY_ITEMS);
      renderHistory(getLocalHistory().slice(0, MAX_HISTORY_ITEMS), historyWrapper, (card, item) =>
        setupCardEventListeners(
          card,
          item,
          (retryItem) => startSummary(retryItem),
          (deleteItem) => handleDeleteSummary(deleteItem)
        )
      );
    } catch (error) {
      console.error("Error deleting summary:", error);
      alert("삭제 중 오류가 발생했습니다.");
    }
  }
}

// Think tag buffer and cleaning helpers (function style)
export function createThinkTagBuffer(bufferSize = 20) {
  return {
    buffer: "",
    bufferSize,
    result: "",
  };
}

export function pushThinkTagBuffer(bufObj, chunk) {
  let data = bufObj.buffer + chunk;
  data = data.replace(/(<think>|<\/think>)[\r\n]*/g, "");
  data = data.replace(/^[\r\n]+/, "");
  bufObj.buffer = data.slice(-bufObj.bufferSize);
  bufObj.result += data.slice(0, -bufObj.bufferSize);
  return bufObj.result;
}

export function flushThinkTagBuffer(bufObj) {
  let data = bufObj.buffer.replace(/(<think>|<\/think>)[\r\n]*/g, "");
  data = data.replace(/^[\r\n]+/, "");
  bufObj.result += data;
  bufObj.buffer = "";
  return bufObj.result;
}

export function cleanThinkTags(str) {
  return str.replace(/<think>|<\/think>/g, "");
}
