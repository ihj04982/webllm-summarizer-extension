import type { SummaryItem } from "../sidepanel";

export function setupCardEventListeners(
  card: Element,
  item: SummaryItem,
  onRetry: (item: SummaryItem) => void,
  onDelete: (item: SummaryItem) => void
) {
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
      onDelete(item);
    });
  }

  // Attach retry button event (always present, but only active if not in-progress)
  const retryBtn = card.querySelector(".retry-button");
  if (retryBtn && item.status !== "in-progress") {
    retryBtn.addEventListener("click", async () => {
      onRetry(item);
    });
  }
}
