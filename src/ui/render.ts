// 렌더링 관련 함수 및 헬퍼

import type { SummaryItem } from "../types";
import { cleanThinkTags } from "../sidepanel";

function normalizeNewlines(str: string) {
  return str.replace(/\n{2,}/g, "\n");
}

export function renderHistory(
  historyToShow: (SummaryItem & { partialSummary?: string })[],
  historyWrapper: HTMLElement,
  setupCardEventListeners: (card: Element, item: SummaryItem) => void
) {
  historyWrapper.innerHTML = "";
  historyToShow.forEach((item) => {
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
    } else if (item.partialSummary) {
      summaryHtml = normalizeNewlines(cleanThinkTags(item.partialSummary)).replace(/\n/g, "<br>");
    } else {
      summaryHtml = normalizeNewlines(cleanThinkTags(item.summary)).replace(/\n/g, "<br>");
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

export function updateUI(
  type: "button" | "loading",
  data: any,
  extractButton: HTMLElement,
  loadingIndicator: HTMLElement
) {
  switch (type) {
    case "button":
      const btn = extractButton as HTMLButtonElement;
      btn.disabled = data.loading;
      btn.innerText = "페이지 요약하기";
      break;
    case "loading":
      loadingIndicator.style.display = data.show ? "block" : "none";
      break;
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
