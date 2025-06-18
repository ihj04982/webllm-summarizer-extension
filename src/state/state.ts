import type { SummaryItem } from "../types";
import { ServiceWorkerAPI } from "../sw/serviceWorkerAPI";

let localHistory: (SummaryItem & { partialSummary?: string })[] = [];
let currentRequestId = 0;
let activeSummaryRequests = new Map<string, SummaryItem>();
let onHistoryChanged: (() => void) | null = null;

export function getLocalHistory() {
  return localHistory;
}
export function getCurrentRequestId() {
  return currentRequestId;
}
export function nextRequestId() {
  return ++currentRequestId;
}
export function getActiveSummaryRequests() {
  return activeSummaryRequests;
}
export function setOnHistoryChanged(cb: () => void) {
  onHistoryChanged = cb;
}

export async function refreshLocalHistory(maxItems: number) {
  localHistory = (await ServiceWorkerAPI.getHistory(maxItems)) as (SummaryItem & { partialSummary?: string })[];
  if (onHistoryChanged) onHistoryChanged();
}

export async function addSummaryItem(item: Omit<SummaryItem, "id">, maxItems: number): Promise<SummaryItem> {
  const newItem = (await ServiceWorkerAPI.addSummaryItem(item, maxItems)) as SummaryItem;
  await refreshLocalHistory(maxItems);
  return newItem;
}

export async function updateSummary(
  id: string,
  summary: string,
  status: string,
  error: string | undefined,
  maxItems: number
) {
  await ServiceWorkerAPI.updateSummary(id, summary, status, error, maxItems);
  await refreshLocalHistory(maxItems);
}

export async function deleteSummary(id: string, maxItems: number) {
  await ServiceWorkerAPI.deleteSummary(id, maxItems);
  await refreshLocalHistory(maxItems);
}

export function setPartialSummary(itemId: string, partial: string) {
  const item = localHistory.find((item) => item.id === itemId);
  if (item) {
    item.partialSummary = partial;
    if (onHistoryChanged) onHistoryChanged();
  }
}
