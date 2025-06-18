// 렌더링 관련 함수 및 헬퍼

import type { SummaryItem } from "../types";
import { cleanThinkTags } from "../sidepanel";
import { Line } from "progressbar.js";

export function normalizeNewlines(str: string) {
  return str.replace(/\n{2,}/g, "\n");
}

let progressBar: InstanceType<typeof Line> | null = null;

export function renderLoading(container: HTMLElement) {
  container.style.display = "block";
}

export function hideLoadingState(loadingContainerWrapper: HTMLElement) {
  const loadingDiv = document.getElementById("initial-loading");
  if (loadingDiv) {
    loadingDiv.remove();
  }
  if (loadingContainerWrapper) {
    loadingContainerWrapper.style.display = "none";
  }
}

export function renderProgressBar(container: HTMLElement) {
  progressBar = new Line(container, {
    strokeWidth: 4,
    easing: "easeInOut",
    duration: 1400,
    color: "#ffd166",
    trailColor: "#eee",
    trailWidth: 1,
    svgStyle: { width: "100%", height: "100%" },
  });
  return progressBar;
}

export function setProgressBar(progress: number) {
  if (progressBar) {
    progressBar.set(progress);
  }
}

export function renderModelStatusText(progress: number) {
  const statusText = document.getElementById("model-status-text");
  if (statusText) {
    if (progress >= 1.0) {
      statusText.textContent = "AI 모델 준비 완료!";
      hideLoadingState(document.getElementById("loadingContainerWrapper")!);
    } else {
      const percent = Math.round(progress * 100);
      statusText.textContent = `AI 모델 다운로드 중... (${percent}%)`;
    }
  }
}

export function setExtractButtonEnabled(enabled: boolean) {
  const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
  if (extractButton) extractButton.disabled = !enabled;
}

export function renderHistory(
  historyToShow: (SummaryItem & { partialSummary?: string })[],
  historyWrapper: HTMLElement,
  setupCardEventListeners: (card: Element, item: SummaryItem) => void,
  isSummarizing: boolean
) {
  historyWrapper.innerHTML = "";
  historyToShow.forEach((item) => {
    const card = document.createElement("div");
    card.className = `history-card status-${item.status}`;
    card.setAttribute("data-id", item.id);

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

    let summaryHtml = "";
    if (item.status === "error") {
      summaryHtml = `<div class="summary-error">${item.error || "오류"}</div>`;
    } else if (item.partialSummary) {
      summaryHtml = normalizeNewlines(cleanThinkTags(item.partialSummary)).replace(/\n/g, "<br>");
    } else {
      summaryHtml = normalizeNewlines(cleanThinkTags(item.summary)).replace(/\n/g, "<br>");
    }

    let retryDisabled = item.status === "in-progress" ? "disabled" : "";
    let actionBtnHtml = `<button class="retry-button" ${retryDisabled}><i class="fa-solid fa-rotate-right"></i></button>`;
    let deleteDisabled = isSummarizing && item.status === "in-progress" ? "disabled" : "";

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
          <button class="delete-button" title="Delete this summary" data-id="${item.id}" ${deleteDisabled}>
            <i class="fa-solid fa-trash fa-sm"></i>
          </button>
        </div>
      </div>
    `;
    setupCardEventListeners(card, item);
    historyWrapper.appendChild(card);
  });
}

export function renderHistoryPanel(
  history: (SummaryItem & { partialSummary?: string })[],
  historyWrapper: HTMLElement,
  setupCardEventListeners: (card: Element, item: SummaryItem) => void,
  isSummarizing: boolean
) {
  renderHistory(history, historyWrapper, setupCardEventListeners, isSummarizing);
}

export type UpdateUIData = { loading: boolean } | { show: boolean };

export function updateUI(
  type: "button" | "loading",
  data: UpdateUIData,
  extractButton: HTMLElement,
  loadingIndicator: HTMLElement
) {
  switch (type) {
    case "button": {
      const btn = extractButton as HTMLButtonElement;
      if ("loading" in data) {
        btn.disabled = data.loading;
      }
      btn.innerText = "페이지 요약하기";
      break;
    }
    case "loading": {
      if ("show" in data) {
        loadingIndicator.style.display = data.show ? "block" : "none";
      }
      break;
    }
  }
}

export function showToast(message: string, type: "error" | "info" | "success" = "info") {
  let toast = document.getElementById("toast-container");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-container";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

export function updateSummaryInPlace(
  itemId: string,
  partialSummary: string,
  setPartialSummary: (id: string, summary: string) => void,
  cleanThinkTags: (str: string) => string
) {
  setPartialSummary(itemId, cleanThinkTags(normalizeNewlines(partialSummary)));
}

export async function finalizeSummary(
  itemId: string,
  finalSummary: string,
  stateUpdateSummary: (
    id: string,
    summary: string,
    status: string,
    error: string | undefined,
    maxItems: number
  ) => Promise<void>,
  refreshLocalHistory: (maxItems: number) => Promise<void>,
  cleanThinkTags: (str: string) => string,
  MAX_HISTORY_ITEMS: number
) {
  const cleanedSummary = cleanThinkTags(finalSummary);
  await stateUpdateSummary(itemId, cleanedSummary, "done", undefined, MAX_HISTORY_ITEMS);
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
}

export async function handleSummaryError(
  itemId: string,
  error: string,
  stateUpdateSummary: (
    id: string,
    summary: string,
    status: string,
    error: string | undefined,
    maxItems: number
  ) => Promise<void>,
  refreshLocalHistory: (maxItems: number) => Promise<void>,
  MAX_HISTORY_ITEMS: number
) {
  await stateUpdateSummary(itemId, `요약 중 오류가 발생했습니다: ${error}`, "error", error, MAX_HISTORY_ITEMS);
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
}
