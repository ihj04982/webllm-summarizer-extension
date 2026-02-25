import "./styles";
import {
  initializeMLCEngine,
  generateSummaryWithEngine,
  unloadEngine,
  getEngine,
  DEFAULT_MODEL_ID,
} from "./engine/engineManager";
import {
  getLocalHistory,
  refreshLocalHistory,
  addSummaryItem,
  updateSummary as stateUpdateSummary,
  deleteSummary as stateDeleteSummary,
  setOnHistoryChanged,
  setOnPartialSummaryUpdated,
  setPartialSummary,
} from "./state/state";
import { cleanThinkTags } from "./utils/text";
import {
  renderHistoryPanel,
  setProgressBar,
  setExtractButtonEnabled,
  renderModelStatusText,
  showLoadingState,
  showToast,
  updateUI,
  updateSummaryInPlace,
  updateSummaryCardContent,
  finalizeSummary,
  handleSummaryError,
  renderProgressBar,
  setGlobalStepMessage,
  showDeleteModal,
  hideDeleteModal,
  confirmDeleteModal,
} from "./ui/render";
import { setupCardEventListeners, bindAppEvents } from "./ui/events";
import type { SummaryItem } from "./types";

interface ExtractedContent {
  content: string;
  title: string;
  error?: string;
}

const extractButton = document.getElementById(
  "extract-button"
) as HTMLButtonElement;
const historyWrapper = document.getElementById("historyWrapper")!;
const modelSelect = document.getElementById(
  "model-select"
) as HTMLSelectElement;
const modelDownloadButton = document.getElementById(
  "model-download-button"
) as HTMLButtonElement;
const modelOnboardingSteps = document.getElementById("model-onboarding-steps");
const loadingIndicatorEl = document.getElementById("loading-indicator");

/** 용도별 제공 Qwen3 모델 (1.7B / 4B / 8B) — WebLLM에 1.5B 없음, 1.7B 사용 */
const CURATED_MODELS: { id: string; label: string }[] = [
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "경량 · 빠른 응답 (1.7B)" },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "균형 · 추천 (4B)" },
  { id: "Qwen3-8B-q4f16_1-MLC", label: "고품질 (8B)" },
];

const MAX_HISTORY_ITEMS = 20;
let isModelReady = false;
let isSummarizing = false;
/** 다운로드 완료 시점에 로드된 모델 ID (셀렉트 변경 시 null로 초기화) */
let currentLoadedModelId: string | null = null;
/** 다운로드 버튼으로 로드 중인 모델 ID (progress 100% 시 currentLoadedModelId로 이전) */
let loadingModelId: string | null = null;

function setAllRetryButtonsEnabled(enabled: boolean) {
  const root = historyWrapper;
  if (!root) return;
  root.querySelectorAll<HTMLButtonElement>(".retry-button").forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function setDeleteButtonsEnabled(isSummarizing: boolean) {
  const root = historyWrapper;
  if (!root) return;
  root.querySelectorAll<HTMLElement>(".history-item").forEach((itemEl) => {
    const isInProgress = itemEl.classList.contains("status-in-progress");
    const deleteBtn = itemEl.querySelector<HTMLButtonElement>(".delete-button");
    if (deleteBtn) {
      deleteBtn.disabled = isSummarizing && isInProgress;
    }
  });
}

function clearSummaryStepMessage() {
  setGlobalStepMessage(null);
}

async function startSummary(item: SummaryItem) {
  if (isSummarizing) return;
  isSummarizing = true;
  setExtractButtonEnabled(false);
  setAllRetryButtonsEnabled(false);
  setDeleteButtonsEnabled(true);
  setGlobalStepMessage("요약 생성 중…", item.id);
  await stateUpdateSummary(
    item.id,
    "",
    "in-progress",
    undefined,
    MAX_HISTORY_ITEMS
  );
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
  abortController = new AbortController();
  const signal = abortController.signal;
  try {
    let partial = "";
    await generateSummaryWithEngine(item.content, {
      signal,
      onPartial: (partialSummary) => {
        partial = partialSummary;
        updateSummaryInPlace(
          item.id,
          partialSummary,
          setPartialSummary,
          cleanThinkTags
        );
      },
      onProgressStep: (message) => setGlobalStepMessage(message, item.id),
      onDone: async (finalSummary) => {
        abortController = null;
        await finalizeSummary(
          item.id,
          finalSummary,
          stateUpdateSummary,
          refreshLocalHistory,
          cleanThinkTags,
          MAX_HISTORY_ITEMS
        );
        clearSummaryStepMessage();
        isSummarizing = false;
        setExtractButtonEnabled(isModelReady);
        setAllRetryButtonsEnabled(true);
        setDeleteButtonsEnabled(false);
      },
      onError: async (error) => {
        abortController = null;
        await handleSummaryError(
          item.id,
          error instanceof Error ? error.message : String(error),
          stateUpdateSummary,
          refreshLocalHistory,
          MAX_HISTORY_ITEMS
        );
        clearSummaryStepMessage();
        isSummarizing = false;
        setExtractButtonEnabled(isModelReady);
        setAllRetryButtonsEnabled(true);
        setDeleteButtonsEnabled(false);
      },
    });
  } catch (error) {
    abortController = null;
    await handleSummaryError(
      item.id,
      error instanceof Error ? error.message : String(error),
      stateUpdateSummary,
      refreshLocalHistory,
      MAX_HISTORY_ITEMS
    );
    clearSummaryStepMessage();
    isSummarizing = false;
    setExtractButtonEnabled(isModelReady);
    setAllRetryButtonsEnabled(true);
    setDeleteButtonsEnabled(false);
  }
}

function onStopSummary() {
  const eng = getEngine();
  if (eng && typeof eng.interruptGenerate === "function") {
    eng.interruptGenerate();
  }
  if (abortController) {
    abortController.abort();
  }
}

/** Aborts the current summarization when user clicks Stop (multi-section: stops chunk loop and merge). */
let abortController: AbortController | null = null;

let pendingDeleteItem: SummaryItem | null = null;

async function handleDeleteSummary(item: SummaryItem) {
  pendingDeleteItem = item;
  showDeleteModal().then(async (confirmed) => {
    if (confirmed && pendingDeleteItem) {
      try {
        await stateDeleteSummary(pendingDeleteItem.id, MAX_HISTORY_ITEMS);
        renderHistoryPanel(
          getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
          historyWrapper,
          (card, i) =>
            setupCardEventListeners(
              card,
              i,
              startSummary,
              handleDeleteSummary,
              onStopSummary
            ),
          isSummarizing
        );
      } catch (error) {
        showToast("삭제 중 오류가 발생했습니다", "error");
      }
    }
    pendingDeleteItem = null;
  });
}

function onExtract() {
  setExtractButtonEnabled(false);
  if (isSummarizing) return;
  if (!isModelReady) return;
  setGlobalStepMessage("페이지 내용 추출 중…");
  const loadingIndicator = loadingIndicatorEl ?? document.getElementById("loading-indicator")!;
  updateUI("button", { loading: true }, extractButton, loadingIndicator);
  updateUI("loading", { show: true }, extractButton, loadingIndicator);
  (async () => {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tabs[0]?.id) {
        throw new Error("활성 탭을 찾을 수 없습니다");
      }
      await chrome.scripting.executeScript({
        files: ["content.js"],
        target: { tabId: tabs[0].id! },
      });
      const response: ExtractedContent = await new Promise(
        (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("본문 추출 시간이 초과되었습니다"));
          }, 10000);
          chrome.tabs.sendMessage(
            tabs[0].id!,
            { type: "EXTRACT_MAIN_CONTENT" },
            (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) {
                reject(
                  new Error(`통신 오류: ${chrome.runtime.lastError.message}`)
                );
                return;
              }
              if (!response) {
                reject(new Error("응답을 받지 못했습니다"));
                return;
              }
              resolve(response);
            }
          );
        }
      );
      const { content, title } = response;
      const currentUrl = tabs[0].url || "";
      const locale = navigator.language || "ko-KR";
      const timestamp = new Date().toLocaleString(locale, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const newItem = await addSummaryItem(
        {
          content,
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
      setGlobalStepMessage(null);
      showToast(
        error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다",
        "error"
      );
      isSummarizing = false;
      setExtractButtonEnabled(isModelReady);
      setAllRetryButtonsEnabled(true);
      setDeleteButtonsEnabled(false);
    } finally {
      setGlobalStepMessage(null);
      const loadingIndicator = loadingIndicatorEl ?? document.getElementById("loading-indicator")!;
      updateUI("button", { loading: false }, extractButton, loadingIndicator);
      updateUI("loading", { show: false }, extractButton, loadingIndicator);
    }
  })();
}

function onModelLoadProgress(progress: number) {
  setProgressBar(progress);
  renderModelStatusText(progress);
  if (progress >= 1.0) {
    isModelReady = true;
    if (loadingModelId) {
      currentLoadedModelId = loadingModelId;
      chrome.runtime.sendMessage({ type: "MODEL_LOADED", modelId: loadingModelId }).catch(() => {});
      loadingModelId = null;
    }
    setExtractButtonEnabled(true);
    modelOnboardingSteps?.classList.add("model-ready");
    modelDownloadButton.classList.remove("btn-download-primary");
    modelDownloadButton.classList.add("btn-secondary");
  } else {
    setExtractButtonEnabled(false);
    modelOnboardingSteps?.classList.remove("model-ready");
    modelDownloadButton.classList.remove("btn-secondary");
    modelDownloadButton.classList.add("btn-download-primary");
  }
}

function onHistoryChanged() {
  renderHistoryPanel(
    getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
    historyWrapper,
    (card, item) =>
      setupCardEventListeners(
        card,
        item,
        startSummary,
        handleDeleteSummary,
        onStopSummary
      ),
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
setOnPartialSummaryUpdated((itemId, partial) => {
  updateSummaryCardContent(historyWrapper, itemId, partial, cleanThinkTags);
});

(async () => {
  await refreshLocalHistory(MAX_HISTORY_ITEMS);
  renderHistoryPanel(
    getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
    historyWrapper,
    (card, item) =>
      setupCardEventListeners(
        card,
        item,
        startSummary,
        handleDeleteSummary,
        onStopSummary
      ),
    isSummarizing
  );
  setExtractButtonEnabled(false);

  const deleteModalBackdrop = document.getElementById("delete-modal-backdrop");
  const deleteModalCancel = document.getElementById("delete-modal-cancel");
  const deleteModalConfirm = document.getElementById("delete-modal-confirm");
  if (deleteModalBackdrop) {
    deleteModalBackdrop.addEventListener("click", (e) => {
      if (e.target === deleteModalBackdrop) hideDeleteModal();
    });
  }
  if (deleteModalCancel)
    deleteModalCancel.addEventListener("click", hideDeleteModal);
  if (deleteModalConfirm)
    deleteModalConfirm.addEventListener("click", confirmDeleteModal);
  setAllRetryButtonsEnabled(false);
  setDeleteButtonsEnabled(false);

  const loadingBarContainer = document.getElementById("loadingContainer");
  if (loadingBarContainer) renderProgressBar(loadingBarContainer);

  // 용도별 Qwen3 모델만 노출
  modelSelect.innerHTML = "";
  for (const m of CURATED_MODELS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  }

  const stored = await chrome.storage.local.get("selectedModelId");
  const savedId =
    typeof stored.selectedModelId === "string"
      ? stored.selectedModelId.trim()
      : "";
  const validId = CURATED_MODELS.some((m) => m.id === savedId)
    ? savedId
    : DEFAULT_MODEL_ID;
  modelSelect.value = validId;
  await chrome.storage.local.set({ selectedModelId: validId });

  const modelStatusText = document.getElementById("model-status-text");
  if (modelStatusText) {
    modelStatusText.textContent =
      "모델을 선택한 뒤 '모델 다운로드' 버튼을 눌러주세요";
  }

  // If the same model is already loaded in the service worker (e.g. after reopening panel), show ready and reconnect client
  chrome.runtime.sendMessage({ type: "GET_LOADED_MODEL" }, (res) => {
    if (res?.modelId === validId) {
      currentLoadedModelId = validId;
      isModelReady = true;
      setExtractButtonEnabled(true);
      modelOnboardingSteps?.classList.add("model-ready");
      modelDownloadButton.classList.remove("btn-download-primary");
      modelDownloadButton.classList.add("btn-secondary");
      if (modelStatusText) modelStatusText.textContent = "모델 준비 완료";
      initializeMLCEngine(validId).catch(() => {});
    }
  });

  modelSelect.addEventListener("change", async () => {
    const newId = modelSelect.value;
    if (!newId) return;
    await chrome.storage.local.set({ selectedModelId: newId });
    // Do NOT unload on dropdown change — keep current model in memory so switching back doesn't require re-download
    chrome.runtime.sendMessage({ type: "GET_LOADED_MODEL" }, (res) => {
      const loadedId = res?.modelId ?? null;
      currentLoadedModelId = loadedId;
      const selectedMatchesLoaded = newId === loadedId;
      isModelReady = selectedMatchesLoaded;
      setExtractButtonEnabled(selectedMatchesLoaded);
      if (selectedMatchesLoaded) {
        modelOnboardingSteps?.classList.add("model-ready");
        modelDownloadButton.classList.remove("btn-download-primary");
        modelDownloadButton.classList.add("btn-secondary");
        if (modelStatusText) modelStatusText.textContent = "모델 준비 완료";
        initializeMLCEngine(newId).catch(() => {});
      } else {
        modelOnboardingSteps?.classList.remove("model-ready");
        modelDownloadButton.classList.remove("btn-secondary");
        modelDownloadButton.classList.add("btn-download-primary");
        if (modelStatusText) {
          modelStatusText.textContent =
            "모델을 선택한 뒤 '모델 다운로드' 버튼을 눌러주세요";
        }
      }
    });
  });

  modelDownloadButton.addEventListener("click", async () => {
    const selectedId = modelSelect.value;
    if (!selectedId) {
      showToast("모델을 선택해주세요", "error");
      return;
    }
    if (currentLoadedModelId === selectedId) {
      showToast("이미 로드된 모델입니다", "success");
      return;
    }
    loadingModelId = selectedId;
    isModelReady = false;
    setExtractButtonEnabled(false);
    modelDownloadButton.disabled = true;
    showLoadingState();
    setProgressBar(0);
    renderModelStatusText(0);
    try {
      await unloadEngine();
      chrome.runtime.sendMessage({ type: "MODEL_UNLOADED" }).catch(() => {});
    } catch (e) {
      console.warn("Unload before new download:", e);
    }
    try {
      await initializeMLCEngine(selectedId);
    } catch (e) {
      console.error("Model load failed:", e);
      showToast("모델 로드에 실패했습니다", "error");
      loadingModelId = null;
    } finally {
      modelDownloadButton.disabled = false;
    }
  });

  // 초기 로드는 하지 않음 — 사용자가 모델 선택 후 '모델 다운로드' 클릭 시에만 로드
})();

export { cleanThinkTags };
