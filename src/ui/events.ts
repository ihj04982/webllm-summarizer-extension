import type { SummaryItem } from "../types";
import { cleanThinkTags, normalizeNewlines } from "../utils/text";
import { showToast } from "./render";

const COPY_SUCCESS_MESSAGE = "복사되었습니다";

export function setupCardEventListeners(
  card: Element,
  item: SummaryItem,
  onRetry: (item: SummaryItem) => void,
  onDelete: (item: SummaryItem) => void,
  onStop?: () => void
) {
  const contentBody = card.querySelector<HTMLElement>(".content-body");
  const toggleBtn = card.querySelector<HTMLButtonElement>(
    ".content-title .toggle-button"
  );
  const contentDiv = card.querySelector<HTMLElement>(".content-text");
  if (toggleBtn && contentBody && contentDiv) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = contentBody.style.display === "none";
      contentBody.style.display = isHidden ? "block" : "none";
      contentDiv.classList.toggle("expanded", isHidden);
      toggleBtn.textContent = isHidden ? "접기" : "더보기";
      toggleBtn.setAttribute("aria-expanded", String(isHidden));
    });
  }

  const copyBtn = card.querySelector<HTMLButtonElement>(".copy-button");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const cleanedSummary = normalizeNewlines(
        cleanThinkTags(item.summary)
      ).trim();
      const formattedText = `${cleanedSummary}\n\n출처: ${item.title.trim()}\n${item.url.trim()}`;
      navigator.clipboard
        .writeText(formattedText)
        .then(() => showToast(COPY_SUCCESS_MESSAGE, "success", 4500))
        .catch((err) => {
          console.error("Could not copy text: ", err);
          showToast("복사에 실패했습니다", "error");
        });
    });
  }

  const deleteBtn = card.querySelector<HTMLButtonElement>(".delete-button");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (deleteBtn.disabled) return;
      onDelete(item);
    });
  }

  const stopBtn = card.querySelector<HTMLButtonElement>(".stop-button");
  if (stopBtn && onStop) {
    stopBtn.addEventListener("click", () => onStop());
  }

  const retryBtn = card.querySelector<HTMLButtonElement>(".retry-button");
  if (retryBtn && item.status !== "in-progress") {
    retryBtn.addEventListener("click", () => {
      if (retryBtn.disabled) return;
      onRetry(item);
    });
  }
}

interface AppEventHandlers {
  onExtract: () => void;
  onDelete: (item: SummaryItem) => void;
  onRetry: (item: SummaryItem) => void;
  onModelLoadProgress?: (progress: number) => void;
  onHistoryChanged?: () => void;
}

export function bindAppEvents(handlers: AppEventHandlers) {
  const extractButton = document.getElementById(
    "extract-button"
  ) as HTMLButtonElement;
  if (extractButton) {
    extractButton.addEventListener("click", handlers.onExtract);
  }

  // Do not release model on panel close so reopening the sidepanel can reuse it
  // without re-downloading. Use RELEASE_RESOURCES only for explicit unload if needed.

  document.addEventListener("DOMContentLoaded", () => {
    if (handlers.onHistoryChanged) handlers.onHistoryChanged();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (
      message.type === "MODEL_LOAD_PROGRESS" &&
      handlers.onModelLoadProgress
    ) {
      handlers.onModelLoadProgress(message.progress);
    }
  });
}
