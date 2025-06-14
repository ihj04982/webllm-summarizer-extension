export class ServiceWorkerAPI {
  private static async sendMessage(message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Chrome runtime error:", chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            console.warn("No response from service worker for:", message.type);
            resolve({});
            return;
          }

          resolve(response);
        });
      } catch (error) {
        console.error("Error sending message to service worker:", error);
        reject(error);
      }
    });
  }

  static async getHistory(limit?: number): Promise<any[]> {
    try {
      const response = await this.sendMessage({ type: "GET_HISTORY", limit });
      return response.history || [];
    } catch (error) {
      console.error("Failed to get history:", error);
      return [];
    }
  }

  static async addSummaryItem(item: any): Promise<any> {
    try {
      const response = await this.sendMessage({ type: "ADD_SUMMARY_ITEM", item });
      if (!response.item) {
        throw new Error("Failed to add summary item - no item in response");
      }
      return response.item;
    } catch (error) {
      console.error("Failed to add summary item:", error);
      return {
        ...item,
        id: "temp_" + Date.now().toString(),
      };
    }
  }

  static async updateSummary(id: string, summary: string, status: string, error?: string): Promise<void> {
    try {
      await this.sendMessage({ type: "UPDATE_SUMMARY", id, summary, status, error });
    } catch (error) {
      console.error("Failed to update summary:", error);
    }
  }

  static async getCachedSummary(contentHash: string): Promise<string | null> {
    try {
      const response = await this.sendMessage({ type: "GET_CACHED_SUMMARY", contentHash });
      return response.cached || null;
    } catch (error) {
      console.error("Failed to get cached summary:", error);
      return null;
    }
  }

  static async setCachedSummary(contentHash: string, summary: string): Promise<void> {
    try {
      await this.sendMessage({ type: "SET_CACHED_SUMMARY", contentHash, summary });
    } catch (error) {
      console.error("Failed to set cached summary:", error);
    }
  }

  static async deleteSummary(id: string): Promise<boolean> {
    try {
      const response = await this.sendMessage({ type: "DELETE_SUMMARY", id });
      return response.success || false;
    } catch (error) {
      console.error("Failed to delete summary:", error);
      return false;
    }
  }
}
