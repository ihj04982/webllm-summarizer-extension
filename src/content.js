import { ExtensionServiceWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

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
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@mozilla/readability@0.4.4/Readability.js";
    script.onload = () => {
      try {
        const article = new window.Readability(document.cloneNode(true)).parse();
        resolve(article?.textContent || "");
      } catch (e) {
        resolve("");
      }
    };
    document.head.appendChild(script);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_MAIN_CONTENT") {
    (async () => {
      let content = "";
      if (window.Readability) {
        try {
          const article = new window.Readability(document.cloneNode(true)).parse();
          content = article?.textContent || "";
        } catch (e) {
          content = "";
        }
        sendResponse({ content });
      } else {
        content = await extractMainContent();
        sendResponse({ content });
      }
    })();
    return true; // async 응답
  }
});
