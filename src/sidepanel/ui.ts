import { cleanThinkTags } from "../sidepanel";
import { SummaryItem } from "../types";

function normalizeNewlines(str: string) {
  return str.replace(/\n{2,}/g, "\n");
}

export function renderHistory(cards: SummaryItem[], historyWrapper: HTMLElement) {
  historyWrapper.innerHTML = "";
  cards.forEach((item) => {
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
    // 이벤트 리스너는 uiEvents.ts에서 바인딩 예정
    historyWrapper.appendChild(card);
  });
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

export function showLoadingState(historyWrapper: HTMLElement) {
  const loadingDiv = document.createElement("div");
  loadingDiv.id = "initial-loading";
  loadingDiv.innerHTML = `
    <div style="text-align: center; padding: 20px; color: #666;">
      <div>시스템 초기화 중...</div>
    </div>
  `;
  historyWrapper.appendChild(loadingDiv);
}

export function hideLoadingState() {
  const loadingDiv = document.getElementById("initial-loading");
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

export function updateSummaryInPlace(itemId: string, partialSummary: string) {
  const card = document.querySelector(`[data-id="${itemId}"]`);
  if (card) {
    const summaryDiv = card.querySelector(".summary-text") as HTMLElement;
    if (summaryDiv) {
      summaryDiv.innerHTML = partialSummary.replace(/\n/g, "<br>");
    }
  }
}
