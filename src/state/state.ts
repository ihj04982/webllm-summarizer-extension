import type { SummaryItem, SummaryStatus } from "../types";
import { ServiceWorkerAPI } from "../sw/serviceWorkerAPI";

/** 사이드패널에 표시할 최대 히스토리 개수 */
export const MAX_HISTORY_ITEMS = 20;

export type HistoryItem = SummaryItem & { partialSummary?: string };

let localHistory: HistoryItem[] = [];
let onHistoryChanged: (() => void) | null = null;
/** 스트리밍 중 한 항목의 부분 요약만 바뀔 때 호출 (전체 리렌더 방지) */
let onPartialSummaryUpdated: ((itemId: string, partial: string) => void) | null = null;

export function getLocalHistory(): HistoryItem[] {
  return localHistory;
}

export function setOnHistoryChanged(cb: () => void) {
  onHistoryChanged = cb;
}

export function setOnPartialSummaryUpdated(cb: (itemId: string, partial: string) => void) {
  onPartialSummaryUpdated = cb;
}

export async function refreshLocalHistory() {
  localHistory = (await ServiceWorkerAPI.getHistory(MAX_HISTORY_ITEMS)) as HistoryItem[];
  onHistoryChanged?.();
}

export async function addSummaryItem(item: Omit<SummaryItem, "id">): Promise<SummaryItem> {
  const newItem = await ServiceWorkerAPI.addSummaryItem(item);
  await refreshLocalHistory();
  return newItem;
}

export async function updateSummary(id: string, summary: string, status: SummaryStatus, error?: string | null) {
  await ServiceWorkerAPI.updateSummary(id, summary, status, error);
  await refreshLocalHistory();
}

export async function deleteSummary(id: string) {
  await ServiceWorkerAPI.deleteSummary(id);
  await refreshLocalHistory();
}

export function setPartialSummary(itemId: string, partial: string) {
  const item = localHistory.find((i) => i.id === itemId);
  if (!item) return;
  item.partialSummary = partial;
  if (onPartialSummaryUpdated) onPartialSummaryUpdated(itemId, partial);
  else onHistoryChanged?.();
}
