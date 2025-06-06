import { ExtensionServiceWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
import { Readability } from "@mozilla/readability";

// Hookup an engine to a service worker handler
let handler;

chrome.runtime.onConnect.addListener(function (port) {
  console.assert(port.name === "web_llm_service_worker");
  if (handler === undefined) {
    handler = new ExtensionServiceWorkerMLCEngineHandler(port);
  } else {
    handler.setPort(port);
  }
  port.onMessage.addListener(handler.onmessage.bind(handler));
});

// Readability를 CDN에서 동적으로 import
function extractMainContent() {
  try {
    const article = new Readability(document.cloneNode(true)).parse();
    return Promise.resolve(article?.textContent || "");
  } catch (e) {
    return Promise.resolve("");
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_MAIN_CONTENT") {
    const article = new Readability(document.cloneNode(true)).parse();
    sendResponse({
      content: article?.textContent || "",
      title: article?.title || document.title || "Untitled",
    });
  }
});
