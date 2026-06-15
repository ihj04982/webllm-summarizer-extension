import type { SummaryItem, SummaryStatus } from "../types";

/** 서비스워커로 메시지 전송. 일시적 오류(SW 재기동 등) 시 1회 재시도. */
async function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  const send = () =>
    new Promise<T>((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve((response ?? {}) as T);
        }
      });
    });

  try {
    return await send();
  } catch {
    await new Promise((r) => setTimeout(r, 200));
    return send();
  }
}

export const ServiceWorkerAPI = {
  async getHistory(limit?: number): Promise<SummaryItem[]> {
    try {
      const res = await sendMessage<{ history?: SummaryItem[] }>({ type: "GET_HISTORY", limit });
      return res.history ?? [];
    } catch (error) {
      console.error("Failed to get history:", error);
      return [];
    }
  },

  async addSummaryItem(item: Omit<SummaryItem, "id">): Promise<SummaryItem> {
    const res = await sendMessage<{ item?: SummaryItem }>({ type: "ADD_SUMMARY_ITEM", item });
    if (!res.item) throw new Error("Failed to add summary item");
    return res.item;
  },

  async updateSummary(id: string, summary: string, status: SummaryStatus, error?: string | null): Promise<void> {
    try {
      await sendMessage({ type: "UPDATE_SUMMARY", id, summary, status, error });
    } catch (e) {
      console.error("Failed to update summary:", e);
    }
  },

  async deleteSummary(id: string): Promise<boolean> {
    try {
      const res = await sendMessage<{ success?: boolean }>({ type: "DELETE_SUMMARY", id });
      return res.success ?? false;
    } catch (error) {
      console.error("Failed to delete summary:", error);
      return false;
    }
  },

  async getLoadedModelId(): Promise<string | null> {
    try {
      const res = await sendMessage<{ modelId?: string | null }>({ type: "GET_LOADED_MODEL" });
      return res.modelId ?? null;
    } catch {
      return null;
    }
  },

  notifyModelLoaded(modelId: string) {
    sendMessage({ type: "MODEL_LOADED", modelId }).catch(() => {});
  },

  notifyModelUnloaded() {
    sendMessage({ type: "MODEL_UNLOADED" }).catch(() => {});
  },
};
