import "./styles";
import { hasModelInCache } from "@mlc-ai/web-llm";
import {
  initializeMLCEngine,
  generateSummaryWithEngine,
  unloadEngine,
  getEngine,
  DEFAULT_MODEL_ID,
} from "./engine/engineManager";
import {
  MAX_HISTORY_ITEMS,
  getLocalHistory,
  refreshLocalHistory,
  addSummaryItem,
  updateSummary,
  deleteSummary,
  setOnHistoryChanged,
  setOnPartialSummaryUpdated,
  setPartialSummary,
} from "./state/state";
import { ServiceWorkerAPI } from "./sw/serviceWorkerAPI";
import { cleanThinkTags } from "./utils/text";
import {
  renderHistory,
  setProgressBar,
  setExtractButtonEnabled,
  setModelStatusText,
  renderModelStatusText,
  showLoadingState,
  showToast,
  setExtractLoading,
  updateSummaryCardContent,
  renderProgressBar,
  setGlobalStepMessage,
  showDeleteModal,
  hideDeleteModal,
  confirmDeleteModal,
} from "./ui/render";
import { setupCardEventListeners } from "./ui/events";
import type { SummaryItem } from "./types";

// ============================================================================
// DOM 참조 및 상수
// ============================================================================

const extractButton = document.getElementById("extract-button") as HTMLButtonElement;
const historyWrapper = document.getElementById("historyWrapper")!;
const modelSelect = document.getElementById("model-select") as HTMLSelectElement;
const modelDownloadButton = document.getElementById("model-download-button") as HTMLButtonElement;
const modelOnboardingSteps = document.getElementById("model-onboarding-steps");

/** 용도별 제공 Qwen3 모델 (1.7B / 4B / 8B) */
const CURATED_MODELS: { id: string; label: string }[] = [
  { id: "Qwen3-1.7B-q4f16_1-MLC", label: "경량 · 빠른 응답 (1.7B)" },
  { id: "Qwen3-4B-q4f16_1-MLC", label: "균형 · 추천 (4B)" },
  { id: "Qwen3-8B-q4f16_1-MLC", label: "고품질 (8B)" },
];

const EXTRACT_TIMEOUT_MS = 10000;

// ============================================================================
// 상태
// ============================================================================

let isModelReady = false;
let isSummarizing = false;
/** 메모리에 로드 완료된 모델 ID (서비스워커와 동기화) */
let loadedModelId: string | null = null;
let abortController: AbortController | null = null;

// ============================================================================
// UI 헬퍼
// ============================================================================

function setModelReadyUI(ready: boolean) {
  modelOnboardingSteps?.classList.toggle("model-ready", ready);
  modelDownloadButton.classList.toggle("btn-secondary", ready);
  modelDownloadButton.classList.toggle("btn-download-primary", !ready);
}

function setDownloadButtonLabel(cached: boolean) {
  const span = modelDownloadButton.querySelector("span");
  if (span) span.textContent = cached ? "저장된 모델 불러오기" : "모델 다운로드";
}

/** 재시도/삭제 버튼의 활성 상태를 현재 요약·모델 상태에 맞춰 일괄 동기화 */
function syncActionButtons() {
  const disableRetry = isSummarizing || !isModelReady;
  historyWrapper.querySelectorAll<HTMLButtonElement>(".retry-button").forEach((btn) => {
    btn.disabled = disableRetry;
  });
  historyWrapper
    .querySelectorAll<HTMLButtonElement>(".history-item.status-in-progress .delete-button")
    .forEach((btn) => {
      btn.disabled = isSummarizing;
    });
}

function setSummarizing(active: boolean) {
  isSummarizing = active;
  setExtractButtonEnabled(!active && isModelReady);
  syncActionButtons();
}

function renderAll() {
  renderHistory(
    getLocalHistory().slice(0, MAX_HISTORY_ITEMS),
    historyWrapper,
    (card, item) => setupCardEventListeners(card, item, startSummary, handleDeleteSummary, onStopSummary),
    isSummarizing
  );
  syncActionButtons();
}

// ============================================================================
// 모델 캐시 감지 — 다운로드한 모델은 Cache API(디스크)에 저장되어 PC 재시작
// 후에도 유지된다. 저장 여부에 따라 버튼/안내 문구를 구분해 보여준다.
// ============================================================================

async function isModelCached(modelId: string): Promise<boolean> {
  try {
    return await hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/** 선택된 모델에 맞춰 모델 영역 UI 갱신 (로드됨 / 저장됨 / 미다운로드) */
async function updateModelSectionUI(modelId: string) {
  loadedModelId = await ServiceWorkerAPI.getLoadedModelId();

  if (loadedModelId === modelId) {
    // 서비스워커 메모리에 이미 로드됨 (패널 재오픈 등) — 클라이언트만 재연결
    isModelReady = true;
    setModelReadyUI(true);
    setExtractButtonEnabled(!isSummarizing);
    setModelStatusText("모델 준비 완료");
    syncActionButtons();
    initializeMLCEngine(modelId).catch(() => {});
    return;
  }

  isModelReady = false;
  setModelReadyUI(false);
  setExtractButtonEnabled(false);
  syncActionButtons();

  const cached = await isModelCached(modelId);
  setDownloadButtonLabel(cached);
  setModelStatusText(
    cached
      ? "모델이 이 기기에 저장되어 있습니다. '저장된 모델 불러오기'를 눌러주세요"
      : "모델을 선택한 뒤 '모델 다운로드' 버튼을 눌러주세요"
  );
}

function onModelLoadProgress(progress: number, fromCache: boolean, modelId: string) {
  setProgressBar(progress);
  renderModelStatusText(progress, fromCache);
  if (progress >= 1.0) {
    isModelReady = true;
    loadedModelId = modelId;
    ServiceWorkerAPI.notifyModelLoaded(modelId);
    setExtractButtonEnabled(!isSummarizing);
    setModelReadyUI(true);
    syncActionButtons();
  }
}

async function onDownloadModelClick() {
  const selectedId = modelSelect.value;
  if (!selectedId) {
    showToast("모델을 선택해주세요", "error");
    return;
  }
  if (loadedModelId === selectedId) {
    showToast("이미 로드된 모델입니다", "success");
    return;
  }

  const cached = await isModelCached(selectedId);
  isModelReady = false;
  setExtractButtonEnabled(false);
  setModelReadyUI(false);
  modelDownloadButton.disabled = true;
  showLoadingState();
  setProgressBar(0);
  renderModelStatusText(0, cached);

  // 기존 모델 메모리에서 해제 후 새 모델 로드
  await unloadEngine().catch(console.warn);
  ServiceWorkerAPI.notifyModelUnloaded();

  try {
    await initializeMLCEngine(selectedId, (p) => onModelLoadProgress(p, cached, selectedId));
  } catch (e) {
    console.error("Model load failed:", e);
    showToast("모델 로드에 실패했습니다", "error");
    void updateModelSectionUI(selectedId);
  } finally {
    modelDownloadButton.disabled = false;
  }
}

// ============================================================================
// 요약 생성
// ============================================================================

async function startSummary(item: SummaryItem) {
  if (isSummarizing) return;
  setSummarizing(true);
  setGlobalStepMessage("요약 생성 중…", item.id);
  await updateSummary(item.id, "", "in-progress");
  abortController = new AbortController();

  let finished = false;
  const finish = async (kind: "done" | "error", payload: string) => {
    if (finished) return;
    finished = true;
    abortController = null;
    if (kind === "done") {
      await updateSummary(item.id, cleanThinkTags(payload), "done");
    } else {
      await updateSummary(item.id, `요약 중 오류가 발생했습니다: ${payload}`, "error", payload);
    }
    setGlobalStepMessage(null);
    setSummarizing(false);
  };

  try {
    await generateSummaryWithEngine(item.content, {
      signal: abortController.signal,
      onPartial: (partial) => setPartialSummary(item.id, partial),
      onProgressStep: (message) => setGlobalStepMessage(message, item.id),
      onDone: (final) => void finish("done", final),
      onError: (error) => void finish("error", error instanceof Error ? error.message : String(error)),
    });
  } catch (error) {
    await finish("error", error instanceof Error ? error.message : String(error));
  }
}

function onStopSummary() {
  const engine = getEngine();
  if (engine && typeof engine.interruptGenerate === "function") {
    engine.interruptGenerate();
  }
  abortController?.abort();
}

async function handleDeleteSummary(item: SummaryItem) {
  const confirmed = await showDeleteModal();
  if (!confirmed) return;
  try {
    await deleteSummary(item.id);
  } catch {
    showToast("삭제 중 오류가 발생했습니다", "error");
  }
}

// ============================================================================
// 페이지 본문 추출
// ============================================================================

interface ExtractedContent {
  content: string;
  title: string;
  error?: string;
}

function requestExtraction(tabId: number): Promise<ExtractedContent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("본문 추출 시간이 초과되었습니다")), EXTRACT_TIMEOUT_MS);
    chrome.tabs.sendMessage(tabId, { type: "EXTRACT_MAIN_CONTENT" }, (response) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        reject(new Error(`통신 오류: ${chrome.runtime.lastError.message}`));
      } else if (!response) {
        reject(new Error("응답을 받지 못했습니다"));
      } else {
        resolve(response);
      }
    });
  });
}

async function onExtract() {
  if (isSummarizing || !isModelReady) return;
  setExtractButtonEnabled(false);
  setGlobalStepMessage("페이지 내용 추출 중…");
  setExtractLoading(true);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("활성 탭을 찾을 수 없습니다");

    await chrome.scripting.executeScript({ files: ["content.js"], target: { tabId: tab.id } });
    const { content, title } = await requestExtraction(tab.id);

    const timestamp = new Date().toLocaleString(navigator.language || "ko-KR", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const newItem = await addSummaryItem({
      content,
      summary: "",
      timestamp,
      createdAt: Date.now(),
      title,
      url: tab.url || "",
      status: "pending",
    });
    await startSummary(newItem);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다", "error");
    setSummarizing(false);
  } finally {
    setGlobalStepMessage(null);
    setExtractLoading(false);
  }
}

// ============================================================================
// 초기화
// ============================================================================

setOnHistoryChanged(renderAll);
setOnPartialSummaryUpdated((itemId, partial) => updateSummaryCardContent(historyWrapper, itemId, partial));

(async () => {
  // 디스크에 저장된 모델 가중치가 스토리지 정리로 삭제되지 않도록 영속 저장소 요청
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* 미지원 환경 무시 */
  }

  extractButton.addEventListener("click", onExtract);
  setExtractButtonEnabled(false);

  // 삭제 확인 모달
  const deleteModalBackdrop = document.getElementById("delete-modal-backdrop");
  deleteModalBackdrop?.addEventListener("click", (e) => {
    if (e.target === deleteModalBackdrop) hideDeleteModal();
  });
  document.getElementById("delete-modal-cancel")?.addEventListener("click", hideDeleteModal);
  document.getElementById("delete-modal-confirm")?.addEventListener("click", confirmDeleteModal);

  // 모델 다운로드 진행 바
  const loadingBarContainer = document.getElementById("loadingContainer");
  if (loadingBarContainer) renderProgressBar(loadingBarContainer);

  // 히스토리 로드 + 렌더
  await refreshLocalHistory();

  // 모델 셀렉트 구성 및 저장된 선택 복원
  modelSelect.innerHTML = "";
  for (const m of CURATED_MODELS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  }
  const stored = await chrome.storage.local.get("selectedModelId");
  const savedId = typeof stored.selectedModelId === "string" ? stored.selectedModelId.trim() : "";
  const selectedId = CURATED_MODELS.some((m) => m.id === savedId) ? savedId : DEFAULT_MODEL_ID;
  modelSelect.value = selectedId;
  await chrome.storage.local.set({ selectedModelId: selectedId });

  // 로드됨/저장됨/미다운로드 상태에 맞춰 모델 UI 표시
  await updateModelSectionUI(selectedId);

  modelSelect.addEventListener("change", async () => {
    const newId = modelSelect.value;
    if (!newId) return;
    await chrome.storage.local.set({ selectedModelId: newId });
    // 셀렉트 변경 시 기존 모델은 메모리에 유지 — 되돌아오면 재로드 불필요
    await updateModelSectionUI(newId);
  });

  modelDownloadButton.addEventListener("click", onDownloadModelClick);
})();
