import { ExtensionServiceWorkerMLCEngineHandler, CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm";
import type { MLCEngineInterface, ChatCompletionMessageParam } from "@mlc-ai/web-llm";

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

// 전역 데이터 매니저
const dataManager = new DataManager();

// 서비스워커 초기화
let isInitialized = false;

async function initializeServiceWorker() {
  if (!isInitialized) {
    console.log("Initializing service worker (data management only)...");
    await dataManager.init();
    isInitialized = true;
    console.log("Service worker initialized");
  }
}

chrome.runtime.onStartup.addListener(async () => {
  await initializeServiceWorker();
});

chrome.runtime.onInstalled.addListener(async () => {
  await initializeServiceWorker();
});

// 즉시 초기화
initializeServiceWorker().catch(console.error);

// 서비스워커 전용 엔진 관리
let engine: MLCEngineInterface | null = null;
let isEngineReady = false;
let isInitializingEngine = false;

async function getOrInitEngine() {
  if (engine && isEngineReady) return engine;
  if (isInitializingEngine) throw new Error("엔진 초기화 중입니다. 잠시 후 다시 시도해주세요.");
  isInitializingEngine = true;
  try {
    const selectedModel = "Qwen2.5-7B-Instruct-q4f16_1-MLC";
    engine = await CreateWebWorkerMLCEngine(null, selectedModel, {});
    isEngineReady = true;
    return engine;
  } catch (e) {
    engine = null;
    isEngineReady = false;
    throw e;
  } finally {
    isInitializingEngine = false;
  }
}

async function summarizeWithEngine(content: string) {
  const MAX_CONTENT_LENGTH = 3000;
  const truncatedContent =
    content.length > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) + "..." : content;
  const CONSISTENT_SUMMARY_PROMPT = `당신은 전문 한국어 요약 전문가입니다.\n\n규칙:\n1. 정확히 3-4문장으로 작성\n2. 핵심 사실과 중요한 정보만 포함\n3. 객관적이고 간결한 문체 사용\n4. 원문의 주요 결론이나 결과 포함\n\n형식: 각 문장은 완전한 한국어 문장으로 끝나야 하며, 불완전한 문장은 작성하지 마세요.`;
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: CONSISTENT_SUMMARY_PROMPT },
    { role: "user", content: `다음 텍스트를 요약해주세요:\n\n${truncatedContent}` },
  ];
  const engineInstance = await getOrInitEngine();
  if (!engineInstance) throw new Error("엔진이 준비되지 않았습니다.");
  let result = "";
  const completion = await engineInstance.chat.completions.create({
    stream: true,
    messages,
    extra_body: { enable_thinking: false },
  });
  for await (const chunk of completion) {
    const curDelta = chunk.choices[0]?.delta?.content;
    if (curDelta) result += curDelta;
  }
  return result;
}

// 메시지 통신 (데이터 관리만)
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
      if (mlcHandler && typeof (mlcHandler as any).dispose === "function") {
        (mlcHandler as any).dispose();
        mlcHandler = undefined;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "No handler or dispose not available" });
      }
      break;

    case "SUMMARIZE":
      (async () => {
        try {
          const summary = await summarizeWithEngine(message.content);
          sendResponse({ summary });
        } catch (e) {
          sendResponse({ error: e instanceof Error ? e.message : String(e) });
        }
      })();
      return true; // 비동기 응답
  }
  return true; // 비동기 응답
});

// 해시 생성 함수
function generateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
}

// 브로드캐스트 함수
async function broadcastToSidePanels(message: any) {
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // 사이드패널이 없는 탭은 무시
        });
      }
    });
  } catch (error) {
    console.error("Failed to broadcast message:", error);
  }
}

// 주기적 정리
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

// WebLLM Extension Service Worker Handler
let mlcHandler: ExtensionServiceWorkerMLCEngineHandler | undefined;

// WebLLM 포트 연결 처리
chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name === "web_llm_service_worker");
  if (mlcHandler === undefined) {
    mlcHandler = new ExtensionServiceWorkerMLCEngineHandler(port);
    console.log("WebLLM handler created");
  } else {
    mlcHandler.setPort(port);
    console.log("WebLLM handler port updated");
  }
  port.onMessage.addListener(mlcHandler.onmessage.bind(mlcHandler));
  port.onDisconnect.addListener(() => {
    if (mlcHandler && typeof (mlcHandler as any).dispose === "function") {
      (mlcHandler as any).dispose();
      mlcHandler = undefined;
      console.log("WebLLM handler disposed on port disconnect");
    }
  });
});
