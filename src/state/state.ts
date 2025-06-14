import type { SummaryItem } from "../sidepanel";
import { ServiceWorkerAPI } from "../sw/serviceWorkerAPI";

// 상태 변수
let localHistory: SummaryItem[] = [];
let currentRequestId = 0;
let activeSummaryRequests = new Map<string, SummaryItem>();

// 상태 변경 콜백
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
  localHistory = await ServiceWorkerAPI.getHistory(maxItems);
  if (onHistoryChanged) onHistoryChanged();
}

export async function addSummaryItem(item: Omit<SummaryItem, "id">, maxItems: number) {
  const newItem = await ServiceWorkerAPI.addSummaryItem(maxItems, item);
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
  await ServiceWorkerAPI.updateSummary(maxItems, id, summary, status, error);
  await refreshLocalHistory(maxItems);
}

export async function deleteSummary(id: string, maxItems: number) {
  await ServiceWorkerAPI.deleteSummary(maxItems, id);
  await refreshLocalHistory(maxItems);
}
