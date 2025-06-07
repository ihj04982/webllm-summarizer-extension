import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};

// 에러 처리
self.onerror = (error) => {
  let message = "Unknown error";
  if (typeof error === "string") {
    message = error;
  } else if (error && typeof (error as any).message === "string") {
    message = (error as any).message;
  }
  console.error("Worker error:", error);
  self.postMessage({ type: "error", error: message });
};

// 워커 종료 처리
self.onunhandledrejection = (event) => {
  console.error("Unhandled rejection in worker:", event.reason);
  self.postMessage({ type: "error", error: event.reason });
};
