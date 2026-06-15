import { ExtensionServiceWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
import type { SummaryItem, SummaryStatus } from "./types";

// ============================================================================
// Extension Service Worker
// 역할: WebLLM 엔진 핸들러 + 요약 히스토리 저장/관리 + 메시지 라우팅
// 참고: 모델 가중치는 WebLLM이 Cache API(디스크)에 저장하므로 브라우저/PC
//       재시작 후에도 유지됨. 여기서는 로드 상태(loadedModelId)만 추적.
// ============================================================================

const MAX_HISTORY_ITEMS = 50;
const HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

const VALID_STATUSES: SummaryStatus[] = ["pending", "in-progress", "done", "error"];

class DataManager {
  private history: SummaryItem[] = [];
  private readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    const stored = await chrome.storage.local.get("summaryHistory");
    if (Array.isArray(stored.summaryHistory)) {
      // 30일 지난 항목 정리 (createdAt 없는 구버전 항목은 유지)
      const cutoff = Date.now() - HISTORY_TTL_MS;
      this.history = (stored.summaryHistory as SummaryItem[]).filter(
        (item) => (item.createdAt ?? Date.now()) > cutoff
      );
    }
  }

  private persist() {
    return chrome.storage.local.set({ summaryHistory: this.history });
  }

  async getHistory(limit?: number): Promise<SummaryItem[]> {
    await this.ready;
    return limit ? this.history.slice(0, limit) : [...this.history];
  }

  async add(item: Omit<SummaryItem, "id" | "status" | "error">): Promise<SummaryItem> {
    await this.ready;
    const newItem: SummaryItem = {
      ...item,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 11),
      createdAt: Date.now(),
      status: "pending",
      error: null,
    };
    this.history.unshift(newItem);
    this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
    await this.persist();
    return newItem;
  }

  async update(id: string, summary: string, status: SummaryStatus, error: string | null) {
    await this.ready;
    const item = this.history.find((i) => i.id === id);
    if (!item) return false;
    item.summary = summary;
    item.status = status;
    item.error = error;
    await this.persist();
    return true;
  }

  async delete(id: string): Promise<boolean> {
    await this.ready;
    const index = this.history.findIndex((i) => i.id === id);
    if (index === -1) return false;
    this.history.splice(index, 1);
    await this.persist();
    return true;
  }

  /** 사이드패널이 닫혔을 때 진행 중이던 요약을 에러 처리 */
  async markInProgressAsError(message: string) {
    await this.ready;
    let changed = false;
    for (const item of this.history) {
      if (item.status === "in-progress") {
        item.status = "error";
        item.error = message;
        changed = true;
      }
    }
    if (changed) await this.persist();
  }
}

const dataManager = new DataManager();

// ============================================================================
// 메시지 라우팅 (sidepanel ↔ service worker)
// ============================================================================

function isSummaryItemPayload(item: unknown): item is Omit<SummaryItem, "id" | "status" | "error"> {
  if (!item || typeof item !== "object") return false;
  const o = item as Record<string, unknown>;
  return (
    typeof o.content === "string" &&
    typeof o.summary === "string" &&
    typeof o.timestamp === "string" &&
    typeof o.title === "string" &&
    typeof o.url === "string"
  );
}

async function handleMessage(message: Record<string, unknown>): Promise<unknown> {
  switch (message.type) {
    case "GET_HISTORY": {
      const limit = Number(message.limit);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : undefined;
      return { history: await dataManager.getHistory(safeLimit) };
    }

    case "ADD_SUMMARY_ITEM":
      if (!isSummaryItemPayload(message.item)) {
        return { success: false, error: "Invalid summary item payload" };
      }
      return { success: true, item: await dataManager.add(message.item) };

    case "UPDATE_SUMMARY": {
      if (typeof message.id !== "string" || !message.id) {
        return { success: false, error: "Invalid id" };
      }
      const summary = typeof message.summary === "string" ? message.summary : "";
      const status = VALID_STATUSES.includes(message.status as SummaryStatus)
        ? (message.status as SummaryStatus)
        : "done";
      const error = message.error != null ? String(message.error) : null;
      return { success: await dataManager.update(message.id, summary, status, error) };
    }

    case "DELETE_SUMMARY":
      if (typeof message.id !== "string" || !message.id) return { success: false };
      return { success: await dataManager.delete(message.id) };

    case "MODEL_LOADED":
      loadedModelId = typeof message.modelId === "string" && message.modelId ? message.modelId : null;
      return { success: true };

    case "MODEL_UNLOADED":
      loadedModelId = null;
      return { success: true };

    case "GET_LOADED_MODEL":
      return { modelId: loadedModelId };

    default:
      console.warn("Unknown message type:", message.type);
      return { success: false, error: "Unknown message type" };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      console.error("[background] message error:", message?.type, error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true; // 비동기 응답
});

// ============================================================================
// WebLLM 엔진 핸들러 (sidepanel의 MLCEngine 클라이언트와 포트로 연결)
// ============================================================================

let mlcHandler: ExtensionServiceWorkerMLCEngineHandler | undefined;
/** 서비스워커(메모리)에 현재 로드된 모델 ID — 사이드패널을 닫아도 유지됨 */
let loadedModelId: string | null = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "web_llm_service_worker") return;

  if (!mlcHandler) {
    mlcHandler = new ExtensionServiceWorkerMLCEngineHandler(port);
  } else {
    mlcHandler.setPort(port);
  }
  port.onMessage.addListener(mlcHandler.onmessage.bind(mlcHandler));

  port.onDisconnect.addListener(() => {
    // 사이드패널이 닫히면 진행 중이던 요약만 에러 처리.
    // 엔진은 unload하지 않음 — 패널을 다시 열면 재다운로드 없이 즉시 재사용.
    dataManager.markInProgressAsError("사이드패널이 닫혀 요약이 중단되었습니다").catch(console.error);
  });
});

// 확장 프로그램 아이콘 클릭 시 사이드패널 열기
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    // @types/chrome 구버전에 sidePanel.open 타입이 없어 캐스팅
    (chrome.sidePanel as unknown as { open: (opts: { windowId: number }) => void }).open({ windowId: tab.windowId });
  }
});
