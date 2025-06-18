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
    deleteBtn.addEventListener("click", async () => {
      onDelete(item);
    });
  }

  const retryBtn = card.querySelector<HTMLButtonElement>(".retry-button");
  if (retryBtn && item.status !== "in-progress") {
    retryBtn.addEventListener("click", async () => {
      onRetry(item);
    });
  }
}
