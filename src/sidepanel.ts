import "./styles";
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
import {
  renderHistoryPanel,
  setProgressBar,
  renderModelStatusText,
  setExtractButtonEnabled,
  showToast,
  updateUI,
  updateSummaryInPlace,
  finalizeSummary,
  handleSummaryError,
} from "./ui/render";
import { setupCardEventListeners, bindAppEvents } from "./ui/events";
import type { SummaryItem } from "./types";

interface ExtractedContent {
  content: string;
  title: string;
  error?: string;
}

const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
const historyWrapper = document.getElementById("historyWrapper")!;
const loadingContainerWrapper = document.getElementById("loadingContainerWrapper")!;

const MAX_HISTORY_ITEMS = 20;
let isModelReady = false;
let isSummarizing = false;

function setAllRetryButtonsEnabled(enabled: boolean) {
  document.querySelectorAll<HTMLButtonElement>(".retry-button").forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function setDeleteButtonsEnabled(isSummarizing: boolean) {
  document.querySelectorAll<HTMLDivElement>(".history-card").forEach((card) => {
    const isInProgress = card.classList.contains("status-in-progress");
    const deleteBtn = card.querySelector<HTMLButtonElement>(".delete-button");
    if (deleteBtn) {
      if (isSummarizing && isInProgress) {
        deleteBtn.disabled = true;
      } else {
        deleteBtn.disabled = false;
      }
    }
  });
}

async function startSummary(item: SummaryItem) {
  if (isSummarizing) return;
  isSummarizing = true;
  setExtractButtonEnabled(false);
  setAllRetryButtonsEnabled(false);
  setDeleteButtonsEnabled(true);
  await stateUpdateSummary(item.id, "", "in-progress", undefined, MAX_HISTORY_ITEMS);
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
  try {
    let partial = "";
    await generateSummaryWithEngine(item.content, {
      onPartial: (partialSummary) => {
        partial = partialSummary;
        updateSummaryInPlace(item.id, partialSummary, setPartialSummary, cleanThinkTags);
      },
      onDone: async (finalSummary) => {
        await finalizeSummary(
          item.id,
          finalSummary,
          stateUpdateSummary,
          refreshLocalHistory,
          cleanThinkTags,
          MAX_HISTORY_ITEMS
        );
        isSummarizing = false;
        setExtractButtonEnabled(isModelReady);
        setAllRetryButtonsEnabled(true);
        setDeleteButtonsEnabled(false);
      },
      onError: async (error) => {
        await handleSummaryError(
          item.id,
          error instanceof Error ? error.message : String(error),
          stateUpdateSummary,
          refreshLocalHistory,
          MAX_HISTORY_ITEMS
        );
        isSummarizing = false;
        setExtractButtonEnabled(isModelReady);
        setAllRetryButtonsEnabled(true);
        setDeleteButtonsEnabled(false);
      },
    });
  } catch (error) {
    await handleSummaryError(
      item.id,
      error instanceof Error ? error.message : String(error),
      stateUpdateSummary,
      refreshLocalHistory,
      MAX_HISTORY_ITEMS
    );
    isSummarizing = false;
    setExtractButtonEnabled(isModelReady);
    setAllRetryButtonsEnabled(true);
    setDeleteButtonsEnabled(false);
  }
}

async function handleDeleteSummary(item: SummaryItem) {
  if (confirm("이 요약을 삭제하시겠습니까?")) {
    try {
      await stateDeleteSummary(item.id, MAX_HISTORY_ITEMS);
      renderHistoryPanel(
        getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
        historyWrapper,
        (card, item) => setupCardEventListeners(card, item, startSummary, handleDeleteSummary),
        isSummarizing
      );
    } catch (error) {
      showToast("삭제 중 오류가 발생했습니다.", "error");
    }
  }
}

function onExtract() {
  if (isSummarizing) return;
  if (!isModelReady) return;
  updateUI("button", { loading: true }, extractButton, document.getElementById("loading-indicator")!);
  updateUI("loading", { show: true }, extractButton, document.getElementById("loading-indicator")!);
  (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error("활성 탭을 찾을 수 없습니다.");
      }
      await chrome.scripting.executeScript({
        files: ["content.js"],
        target: { tabId: tabs[0].id! },
      });
      const response: ExtractedContent = await new Promise((resolve, reject) => {
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
      await startSummary(newItem);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.", "error");
      isSummarizing = false;
      setExtractButtonEnabled(isModelReady);
      setAllRetryButtonsEnabled(true);
      setDeleteButtonsEnabled(false);
    } finally {
      updateUI("button", { loading: false }, extractButton, document.getElementById("loading-indicator")!);
      updateUI("loading", { show: false }, extractButton, document.getElementById("loading-indicator")!);
    }
  })();
}

function onModelLoadProgress(progress: number) {
  setProgressBar(progress);
  renderModelStatusText(progress);
  setExtractButtonEnabled(progress >= 1.0);
  isModelReady = progress >= 1.0;
}

function onHistoryChanged() {
  renderHistoryPanel(
    getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
    historyWrapper,
    (card, item) => setupCardEventListeners(card, item, startSummary, handleDeleteSummary),
    isSummarizing
  );
}

bindAppEvents({
  onExtract,
  onDelete: handleDeleteSummary,
  onRetry: startSummary,
  onModelLoadProgress,
  onHistoryChanged,
});

setOnHistoryChanged(onHistoryChanged);

(async () => {
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
  renderHistoryPanel(
    getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
    historyWrapper,
    (card, item) => setupCardEventListeners(card, item, startSummary, handleDeleteSummary),
    isSummarizing
  );
  setExtractButtonEnabled(false);
  setAllRetryButtonsEnabled(false);
  setDeleteButtonsEnabled(false);

  initializeMLCEngine();
})();

export function cleanThinkTags(str: string) {
  return str.replace(/<think>|<\/think>/g, "");
}
