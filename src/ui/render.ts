// 렌더링 관련 함수 및 헬퍼

import type { SummaryItem } from "../types";
import { cleanThinkTags, normalizeNewlines } from "../utils/text";
import { Line } from "progressbar.js";

/** Escape HTML to prevent XSS when inserting untrusted data into innerHTML. */
function escapeHtml(str: string): string {
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

let progressBar: InstanceType<typeof Line> | null = null;

let cachedOperationEls: {
  root: HTMLElement | null;
  model: HTMLElement | null;
  summary: HTMLElement | null;
} | null = null;

function getCurrentOperationEls() {
  if (!cachedOperationEls) {
    cachedOperationEls = {
      root: document.getElementById("currentOperation"),
      model: document.getElementById("operationModel"),
      summary: document.getElementById("operationSummary"),
    };
  }
  return cachedOperationEls;
}

/** 모델 다운로드/로드 진행 시 현재 작업 영역에 모델 패널 표시 */
export function showModelProgress() {
  const { root, model, summary } = getCurrentOperationEls();
  if (root) {
    root.setAttribute("aria-hidden", "false");
    root.setAttribute("aria-busy", "true");
  }
  if (model) model.setAttribute("aria-hidden", "false");
  if (summary) summary.setAttribute("aria-hidden", "true");
}

/** 모델 로드 완료 후 현재 작업 영역에서 모델 패널 숨김 */
export function hideModelProgress() {
  const { root, model, summary } = getCurrentOperationEls();
  if (model) model.setAttribute("aria-hidden", "true");
  const summaryVisible = summary?.getAttribute("aria-hidden") !== "true";
  if (root && !summaryVisible) {
    root.setAttribute("aria-hidden", "true");
    root.removeAttribute("aria-busy");
  }
}

/** 모델 다운로드/로드 시 현재 작업 영역 표시 */
export function showLoadingState() {
  showModelProgress();
}

let cachedThemeColors: { color: string; trailColor: string } | null = null;

function getThemeColors() {
  if (!cachedThemeColors) {
    const style = getComputedStyle(document.documentElement);
    cachedThemeColors = {
      color: style.getPropertyValue("--brand-primary").trim() || "#2563EB",
      trailColor: style.getPropertyValue("--bg-accent").trim() || "#F1F5F9",
    };
  }
  return cachedThemeColors;
}

export function renderProgressBar(container: HTMLElement) {
  const { color, trailColor } = getThemeColors();
  progressBar = new Line(container, {
    strokeWidth: 4,
    easing: "easeInOut",
    duration: 1400,
    color,
    trailColor,
    trailWidth: 1,
    svgStyle: { width: "100%", height: "100%" },
  });
  return progressBar;
}

let cachedLoadingBar: HTMLElement | null = null;

export function setProgressBar(progress: number) {
  if (progressBar) {
    progressBar.set(progress);
  }
  if (!cachedLoadingBar) cachedLoadingBar = document.getElementById("loadingContainer");
  if (cachedLoadingBar) {
    cachedLoadingBar.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  }
}

let cachedModelStatusText: HTMLElement | null = null;

export function setModelStatusText(text: string) {
  if (!cachedModelStatusText) cachedModelStatusText = document.getElementById("model-status-text");
  if (cachedModelStatusText) cachedModelStatusText.textContent = text;
}

/** @param fromCache true면 디스크 캐시에서 로드 중 (다운로드 아님) */
export function renderModelStatusText(progress: number, fromCache = false) {
  if (progress >= 1.0) {
    setModelStatusText("AI 모델 준비 완료!");
    hideModelProgress();
  } else {
    const percent = Math.round(progress * 100);
    setModelStatusText(
      fromCache ? `저장된 모델 불러오는 중… (${percent}%)` : `AI 모델 다운로드 중… (${percent}%)`
    );
  }
}

export function setExtractButtonEnabled(enabled: boolean) {
  const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
  if (extractButton) extractButton.disabled = !enabled;
}

/** 진행 메시지: 진행 중인 카드의 배지에 표시 */
export function setGlobalStepMessage(text: string | null, inProgressItemId?: string) {
  setCardStepMessage(text ? (inProgressItemId ?? null) : null, text);
}

function setCardStepMessage(itemId: string | null, text: string | null) {
  const historyWrapper = document.getElementById("historyWrapper");
  if (!historyWrapper) return;
  if (itemId && text) {
    const card = historyWrapper.querySelector(`[data-id="${CSS.escape(itemId)}"]`);
    const slot = card?.querySelector<HTMLElement>(".badge-step-text");
    if (slot) {
      slot.textContent = text;
    }
  } else {
    historyWrapper.querySelectorAll(".badge-step-text").forEach((slot) => {
      (slot as HTMLElement).textContent = "진행 중";
    });
  }
}

const EMPTY_HISTORY_HTML = `
  <div class="history-empty" role="status" aria-label="요약 히스토리 없음">
    <p class="history-empty-text">아직 요약한 페이지가 없습니다.</p>
    <p class="history-empty-hint">위의 <strong>페이지 요약하기</strong> 버튼을 눌러 시작하세요.</p>
    <p class="history-empty-capability">현재 탭의 본문을 추출해 3~4문장으로 요약합니다. 블로그·기사 등 텍스트가 많은 페이지에 적합하며, 요약 품질은 페이지 구조에 따라 달라질 수 있습니다.</p>
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
      statusBadge = '<span class="status-badge badge-inprogress"><i class="fa fa-spinner fa-spin"></i> <span class="badge-step-text">진행 중</span></span>';
    } else if (item.status === "done") {
      statusBadge = '<span class="status-badge badge-done"><i class="fa fa-check-circle"></i> 완료</span>';
    } else if (item.status === "error") {
      statusBadge = '<span class="status-badge badge-error"><i class="fa fa-exclamation-circle"></i> 오류</span>';
    }

    let summaryHtml = "";
    if (item.status === "error") {
      summaryHtml = `<div class="summary-error">${escapeHtml(item.error || "오류")}</div>`;
    } else {
      const raw = normalizeNewlines(cleanThinkTags(item.partialSummary || item.summary)).trim();
      summaryHtml = escapeHtml(raw).replace(/\n/g, "<br>");
    }

    const retryDisabled = item.status === "in-progress" ? "disabled" : "";
    const stopBtnHtml =
      item.status === "in-progress"
        ? '<button type="button" class="stop-button" aria-label="요약 중단"><i class="fa-solid fa-stop" aria-hidden="true"></i></button>'
        : "";
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
          ${stopBtnHtml}
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

/** 추출/요약 진행 중 로딩 인디케이터 표시 토글 */
export function setExtractLoading(loading: boolean) {
  const indicator = document.getElementById("loading-indicator");
  if (indicator) indicator.style.display = loading ? "block" : "none";
}

export function showToast(message: string, type: "error" | "info" | "success" = "info", durationMs = 3000) {
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
  }, durationMs);
}

let deleteModalResolve: ((confirmed: boolean) => void) | null = null;

export function showDeleteModal(): Promise<boolean> {
  const backdrop = document.getElementById("delete-modal-backdrop");
  if (!backdrop) return Promise.resolve(false);
  backdrop.classList.add("delete-modal-visible");
  backdrop.setAttribute("aria-hidden", "false");
  return new Promise<boolean>((resolve) => {
    deleteModalResolve = resolve;
  });
}

export function hideDeleteModal() {
  const backdrop = document.getElementById("delete-modal-backdrop");
  if (backdrop) {
    backdrop.classList.remove("delete-modal-visible");
    backdrop.setAttribute("aria-hidden", "true");
  }
  if (deleteModalResolve) {
    deleteModalResolve(false);
    deleteModalResolve = null;
  }
}

export function confirmDeleteModal() {
  if (deleteModalResolve) {
    deleteModalResolve(true);
    deleteModalResolve = null;
  }
  hideDeleteModal();
}

/**
 * 한 카드의 요약 텍스트만 갱신 (data-id 기준). 스트리밍 중 전체 리렌더로 인한
 * 레이아웃 출렁임을 방지한다.
 */
export function updateSummaryCardContent(historyWrapper: HTMLElement, itemId: string, partialSummary: string) {
  const card = historyWrapper.querySelector(`[data-id="${CSS.escape(itemId)}"]`);
  const summaryEl = card?.querySelector<HTMLElement>(".summary-text");
  if (summaryEl) {
    const raw = normalizeNewlines(cleanThinkTags(partialSummary)).trim();
    summaryEl.innerHTML = escapeHtml(raw).replace(/\n/g, "<br>");
  }
}
