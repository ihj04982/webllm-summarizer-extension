export type SummaryStatus = "pending" | "in-progress" | "done" | "error";

export interface SummaryItem {
  content: string;
  summary: string;
  timestamp: string;
  title: string;
  url: string;
  id: string;
  status: SummaryStatus;
  error?: string;
}
