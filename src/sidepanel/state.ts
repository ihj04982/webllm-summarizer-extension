import { SummaryItem } from "../types";
import { ServiceWorkerAPI } from "./serviceworker";

let localHistory: SummaryItem[] = [];
let activeRequestIds: Map<string, number> = new Map(); // 요청 ID → localHistory 인덱스

export function getLocalHistory(): SummaryItem[] {
  return localHistory;
}

export function setLocalHistory(newList: SummaryItem[]): void {
  localHistory = newList;
}

export function getActiveRequestIds(): Map<string, number> {
  return activeRequestIds;
}

export function setActiveRequestIds(newMap: Map<string, number>): void {
  activeRequestIds = newMap;
}

export function clearActiveRequestIds(): void {
  activeRequestIds.clear();
}

export async function refreshLocalHistory(MAX_HISTORY_ITEMS: number): Promise<SummaryItem[]> {
  const newList = await ServiceWorkerAPI.getHistory(MAX_HISTORY_ITEMS);
  setLocalHistory(newList);
  return newList;
}
