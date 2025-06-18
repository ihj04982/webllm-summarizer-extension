export class ServiceWorkerAPI {
  private static async sendMessage(message: any): Promise<any> {
    let attempt = 0;
    const maxAttempts = 2;
    while (attempt < maxAttempts) {
      try {
        return await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              if (attempt + 1 < maxAttempts) {
                attempt++;
                setTimeout(() => {
                  // 재시도
                  this.sendMessage(message).then(resolve).catch(reject);
                }, 200);
                return;
              }
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
        });
      } catch (error) {
        if (attempt + 1 < maxAttempts) {
          attempt++;
          continue;
        }
        throw error;
      }
    }
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

  static async addSummaryItem(item: any, limit: number): Promise<any> {
    try {
      const response = await this.sendMessage({ type: "ADD_SUMMARY_ITEM", item, limit });
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

  static async updateSummary(
    id: string,
    summary: string,
    status: string,
    error: string | undefined,
    limit: number
  ): Promise<void> {
    try {
      await this.sendMessage({ type: "UPDATE_SUMMARY", id, summary, status, error, limit });
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

  static async deleteSummary(id: string, limit: number): Promise<boolean> {
    try {
      const response = await this.sendMessage({ type: "DELETE_SUMMARY", id, limit });
      return response.success || false;
    } catch (error) {
      console.error("Failed to delete summary:", error);
      return false;
    }
  }
}
