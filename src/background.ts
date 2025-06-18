import { ExtensionServiceWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
import { unloadEngine } from "./engine/engineManager";

// ============================================================================
// Extension Service Worker for WebLLM Summarizer
// 역할: ExtensionServiceWorkerMLCEngineHandler + 데이터 관리 + 메시지 라우팅
// ============================================================================

// 서비스워커 중앙 데이터 관리
interface SummaryItem {
  content: string;
  summary: string;
  timestamp: string;
  title: string;
  url: string;
  id: string;
  status: "pending" | "in-progress" | "done" | "error";
  error?: string | null;
}

class DataManager {
  private summaryHistory: SummaryItem[] = [];
  private summaryCache = new Map<string, string>();
  private readonly MAX_HISTORY_ITEMS = 50;
  private readonly MAX_CACHE_SIZE = 100;

  async init() {
    const stored = await chrome.storage.local.get(["summaryHistory", "summaryCache"]);

    if (stored.summaryHistory) {
      this.summaryHistory = stored.summaryHistory;
    }

    if (stored.summaryCache) {
      this.summaryCache = new Map(stored.summaryCache);
    }
  }

  async addSummary(item: Omit<SummaryItem, "id" | "status" | "error">) {
    const newItem: SummaryItem = {
      ...item,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      status: "pending",
      error: null,
    };

    this.summaryHistory.unshift(newItem);

    if (this.summaryHistory.length > this.MAX_HISTORY_ITEMS) {
      this.summaryHistory = this.summaryHistory.slice(0, this.MAX_HISTORY_ITEMS);
    }

    await this.persistData();
    return newItem;
  }

  async updateSummary(
    id: string,
    summary: string,
    status: "pending" | "in-progress" | "done" | "error" = "done",
    error: string | null = null
  ) {
    const item = this.summaryHistory.find((item) => item.id === id);
    if (item) {
      item.summary = summary;
      item.status = status;
      item.error = error;
      await this.persistData();
    }
  }

  async deleteSummary(id: string) {
    const index = this.summaryHistory.findIndex((item) => item.id === id);
    if (index !== -1) {
      this.summaryHistory.splice(index, 1);
      await this.persistData();
      return true;
    }
    return false;
  }

  getHistory(limit?: number): SummaryItem[] {
    return limit ? this.summaryHistory.slice(0, limit) : [...this.summaryHistory];
  }

  getCachedSummary(contentHash: string): string | null {
    return this.summaryCache.get(contentHash) || null;
  }

  setCachedSummary(contentHash: string, summary: string) {
    this.summaryCache.set(contentHash, summary);

    if (this.summaryCache.size > this.MAX_CACHE_SIZE) {
      const keysToDelete = Array.from(this.summaryCache.keys()).slice(0, this.summaryCache.size - this.MAX_CACHE_SIZE);
      keysToDelete.forEach((key) => this.summaryCache.delete(key));
    }

    this.persistData();
  }

  private async persistData() {
    await chrome.storage.local.set({
      summaryHistory: this.summaryHistory,
      summaryCache: Array.from(this.summaryCache.entries()),
    });
  }

  async cleanup() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.summaryHistory = this.summaryHistory.filter((item) => {
      const itemTime = new Date(item.timestamp).getTime();
      return itemTime > thirtyDaysAgo;
    });

    await this.persistData();
  }
}

// ============================================================================
// 전역 변수 및 초기화
// ============================================================================

const dataManager = new DataManager();
let isInitialized = false;

async function initializeServiceWorker() {
  if (!isInitialized) {
    await dataManager.init();
    isInitialized = true;
  }
}

// ============================================================================
// 서비스워커 생명주기 이벤트
// ============================================================================

chrome.runtime.onStartup.addListener(async () => {
  await initializeServiceWorker();
});

chrome.runtime.onInstalled.addListener(async () => {
  await initializeServiceWorker();
});

// 즉시 초기화
initializeServiceWorker().catch(console.error);

// ============================================================================
// 데이터 관리 메시지 핸들러
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "PING":
      sendResponse({ success: true });
      break;

    case "GET_HISTORY":
      const history = dataManager.getHistory(message.limit);
      sendResponse({ history });
      break;

    case "ADD_SUMMARY_ITEM":
      dataManager
        .addSummary(message.item)
        .then((newItem) => {
          sendResponse({ success: true, item: newItem });
          broadcastToSidePanels({ type: "HISTORY_UPDATED", item: newItem });
        })
        .catch((error) => {
          console.error("Error adding summary item:", error);
          sendResponse({ success: false, error: error.message });
        });
      break;

    case "UPDATE_SUMMARY":
      dataManager.updateSummary(message.id, message.summary, message.status, message.error).then(() => {
        sendResponse({ success: true });
        broadcastToSidePanels({ type: "SUMMARY_UPDATED", id: message.id, summary: message.summary });
      });
      break;

    case "GET_CACHED_SUMMARY":
      const cached = dataManager.getCachedSummary(message.contentHash);
      sendResponse({ cached });
      break;

    case "SET_CACHED_SUMMARY":
      dataManager.setCachedSummary(message.contentHash, message.summary);
      sendResponse({ success: true });
      break;

    case "DELETE_SUMMARY":
      dataManager.deleteSummary(message.id).then((success) => {
        sendResponse({ success });
        if (success) {
          broadcastToSidePanels({ type: "SUMMARY_DELETED", id: message.id });
        }
      });
      break;

    case "CLEANUP":
      dataManager.cleanup().then(() => {
        sendResponse({ success: true });
      });
      break;

    case "RELEASE_RESOURCES":
      try {
        if (mlcHandler && typeof (mlcHandler as any).dispose === "function") {
          (mlcHandler as any).dispose();
        }
        unloadEngine().catch(console.error);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error disposing WebLLM handler:", error);
        sendResponse({ success: false, error: (error as Error).message });
      } finally {
        mlcHandler = undefined;
      }
      break;

    case "MODEL_LOAD_PROGRESS":
      chrome.runtime.sendMessage({ type: "MODEL_LOAD_PROGRESS", progress: message.progress });
      sendResponse({ success: true });
      break;

    default:
      console.warn("Unknown message type:", message.type);
      sendResponse({ success: false, error: "Unknown message type" });
      break;
  }
  return true;
});

// ============================================================================
// 유틸리티 함수
// ============================================================================

function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
}

async function broadcastToSidePanels(message: any) {
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // 사이드패널이 없는 탭은 무시 (정상적인 동작)
        });
      }
    });
  } catch (error) {
    console.error("Failed to broadcast message:", error);
  }
}

// 주기적 데이터 정리 (1시간마다)
setInterval(() => {
  dataManager.cleanup();
}, 60 * 60 * 1000);

// 확장 프로그램 아이콘 클릭 시 사이드패널 열기
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  if (tab.windowId) {
    // TypeScript 타입 에러 우회 - Chrome API 타입 정의 문제
    (chrome.sidePanel as any).open({ windowId: tab.windowId });
    console.log("Side panel opened for window:", tab.windowId);
  } else {
    console.error("No window ID found for tab");
  }
});

let mlcHandler: ExtensionServiceWorkerMLCEngineHandler | undefined;

chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name === "web_llm_service_worker");

  if (mlcHandler === undefined) {
    mlcHandler = new ExtensionServiceWorkerMLCEngineHandler(port);
  } else {
    mlcHandler.setPort(port);
  }

  port.onMessage.addListener(mlcHandler.onmessage.bind(mlcHandler));

  port.onDisconnect.addListener(async () => {
    try {
      if (mlcHandler && typeof (mlcHandler as any).dispose === "function") {
        (mlcHandler as any).dispose();
      }
      await unloadEngine();
    } catch (error) {
      console.error("Error disposing handler on disconnect:", error);
    } finally {
      mlcHandler = undefined;
    }
  });
});
