// 렌더링 관련 함수 및 헬퍼

import type { SummaryItem } from "../types";
import { cleanThinkTags } from "../sidepanel";
import { Line } from "progressbar.js";

/** Escape HTML to prevent XSS when inserting untrusted data into innerHTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe href: only allow http/https to prevent javascript: or data: XSS. */
function safeHref(url: string): string {
  const t = url.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return escapeHtml(t);
  return "#";
}

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
    color: "#2563EB",
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
  const loadingBar = document.getElementById("loadingContainer");
  if (loadingBar) {
    const value = Math.round(progress * 100);
    loadingBar.setAttribute("aria-valuenow", String(value));
  }
}

export function renderModelStatusText(progress: number) {
  const statusText = document.getElementById("model-status-text");
  const wrapper = document.getElementById("loadingContainerWrapper");
  if (statusText) {
    if (progress >= 1.0) {
      statusText.textContent = "AI 모델 준비 완료!";
      if (wrapper) {
        wrapper.setAttribute("aria-busy", "false");
        hideLoadingState(wrapper);
      }
    } else {
      const percent = Math.round(progress * 100);
      statusText.textContent = `AI 모델 다운로드 중… (${percent}%)`;
    }
  }
}

export function setExtractButtonEnabled(enabled: boolean) {
  const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
  if (extractButton) extractButton.disabled = !enabled;
}

const EMPTY_HISTORY_HTML = `
  <div class="history-empty" role="status" aria-label="요약 히스토리 없음">
    <p class="history-empty-text">아직 요약한 페이지가 없습니다.</p>
    <p class="history-empty-hint">위의 <strong>페이지 요약하기</strong> 버튼을 눌러 시작하세요.</p>
  </div>
`;

export function renderHistory(
  historyToShow: (SummaryItem & { partialSummary?: string })[],
  historyWrapper: HTMLElement,
  setupCardEventListeners: (card: Element, item: SummaryItem) => void,
  isSummarizing: boolean
) {
  historyWrapper.innerHTML = "";
  if (historyToShow.length === 0) {
    historyWrapper.insertAdjacentHTML("beforeend", EMPTY_HISTORY_HTML);
    return;
  }
  const fragment = document.createDocumentFragment();
  historyToShow.forEach((item) => {
    const itemEl = document.createElement("article");
    itemEl.className = `history-item status-${item.status}`;
    itemEl.setAttribute("data-id", item.id);

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
      summaryHtml = `<div class="summary-error">${escapeHtml(item.error || "오류")}</div>`;
    } else if (item.partialSummary) {
      const raw = normalizeNewlines(cleanThinkTags(item.partialSummary));
      summaryHtml = escapeHtml(raw).replace(/\n/g, "<br>");
    } else {
      const raw = normalizeNewlines(cleanThinkTags(item.summary));
      summaryHtml = escapeHtml(raw).replace(/\n/g, "<br>");
    }

    const retryDisabled = item.status === "in-progress" ? "disabled" : "";
    const actionBtnHtml = `<button type="button" class="retry-button" aria-label="다시 요약" ${retryDisabled}><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>`;
    const deleteDisabled = isSummarizing && item.status === "in-progress" ? "disabled" : "";

    const safeUrl = safeHref(item.url);
    const safeTitle = escapeHtml(item.title);
    const safeContent = escapeHtml(item.content).replace(/\n/g, "<br>");
    const safeTimestamp = escapeHtml(item.timestamp);
    const safeId = escapeHtml(item.id);

    itemEl.innerHTML = `
      <div class="section-container">
        <div class="content-text">
        ${statusBadge}
          <div class="content-title">
          <span class="content-title-text">${safeTitle}</span>
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="원문 열기: ${safeTitle}">
            <i class="fa-solid fa-external-link-alt" aria-hidden="true"></i>
          </a>
          <button type="button" class="toggle-button" aria-expanded="false">더보기</button>
          </div>
          <div class="content-body" style="display: none;">${safeContent}</div>
          </div>
      </div>
      <div class="section-container">
        <div class="summary-text">${summaryHtml}</div>
      </div>
      <div class="meta-container">
        <span class="history-timestamp">${safeTimestamp}</span>
        <div class="meta-actions">
          <button type="button" class="copy-button" aria-label="요약 복사" title="클립보드에 복사">
            <i class="fa-solid fa-copy fa-lg" aria-hidden="true"></i>
          </button>
          ${actionBtnHtml}
          <button type="button" class="delete-button" aria-label="요약 삭제" title="이 요약 삭제" data-id="${safeId}" ${deleteDisabled}>
            <i class="fa-solid fa-trash fa-sm" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
    setupCardEventListeners(itemEl, item);
    fragment.appendChild(itemEl);
  });
  historyWrapper.appendChild(fragment);
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
      const span = btn.querySelector("span");
      if (span) span.textContent = "페이지 요약하기";
      else btn.innerText = "페이지 요약하기";
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
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
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

/**
 * Updates only the summary text of one card (by data-id). Use during streaming to avoid
 * full history re-render and layout thrashing.
 */
export function updateSummaryCardContent(
  historyWrapper: HTMLElement,
  itemId: string,
  partialSummary: string,
  cleanThinkTags: (str: string) => string
) {
  const card = historyWrapper.querySelector(`[data-id="${CSS.escape(itemId)}"]`);
  const summaryEl = card?.querySelector<HTMLElement>(".summary-text");
  if (summaryEl) {
    const raw = normalizeNewlines(cleanThinkTags(partialSummary));
    summaryEl.innerHTML = escapeHtml(raw).replace(/\n/g, "<br>");
  }
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
