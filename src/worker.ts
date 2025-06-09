import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();

// 메시지 처리 최적화
let isProcessing = false;
const messageQueue: MessageEvent[] = [];

const processMessageQueue = async () => {
  if (isProcessing || messageQueue.length === 0) return;

  isProcessing = true;

  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    if (msg) {
      await handler.onmessage(msg);
    }
  }

  isProcessing = false;
};

self.onmessage = (msg: MessageEvent) => {
  messageQueue.push(msg);
  processMessageQueue();
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
