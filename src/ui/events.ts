import type { SummaryItem } from "../types";

export function setupCardEventListeners(
  card: Element,
  item: SummaryItem,
  onRetry: (item: SummaryItem) => void,
  onDelete: (item: SummaryItem) => void
) {
  const contentBody = card.querySelector<HTMLElement>(".content-body");
  const toggleBtn = card.querySelector<HTMLButtonElement>(".content-title .toggle-button");
  const contentDiv = card.querySelector<HTMLElement>(".content-text");
  if (toggleBtn && contentBody && contentDiv) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = contentBody.style.display === "none";
      contentBody.style.display = isHidden ? "block" : "none";
      contentDiv.classList.toggle("expanded", isHidden);
      toggleBtn.textContent = isHidden ? "접기" : "더보기";
    });
  }

  const copyBtn = card.querySelector<HTMLButtonElement>(".copy-button");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const formattedText = `${item.summary}\n\n출처: ${item.title}\n${item.url}`;
      navigator.clipboard.writeText(formattedText).catch((err) => console.error("Could not copy text: ", err));
    });
  }

  const deleteBtn = card.querySelector<HTMLButtonElement>(".delete-button");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async (e) => {
      if (deleteBtn.disabled) return;
      onDelete(item);
    });
  }

  const retryBtn = card.querySelector<HTMLButtonElement>(".retry-button");
  if (retryBtn && item.status !== "in-progress") {
    retryBtn.addEventListener("click", async () => {
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
  const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
  if (extractButton) {
    extractButton.addEventListener("click", handlers.onExtract);
  }

  window.addEventListener("beforeunload", () => {
    chrome.runtime.sendMessage({ type: "RELEASE_RESOURCES" }, (response) => {});
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (handlers.onHistoryChanged) handlers.onHistoryChanged();
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "MODEL_LOAD_PROGRESS" && handlers.onModelLoadProgress) {
      handlers.onModelLoadProgress(message.progress);
    }
  });
}
