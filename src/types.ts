export type SummaryStatus = "pending" | "in-progress" | "done" | "error";

export interface SummaryItem {
  content: string;
  summary: string;
  /** 표시용 로케일 문자열 (예: "6월 10 14:30") */
  timestamp: string;
  /** 생성 시각 epoch ms — 만료(30일) 계산용 */
  createdAt?: number;
  title: string;
  url: string;
  id: string;
  status: SummaryStatus;
  error?: string | null;
}
