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

// DOM 복제 최적화를 위한 캐시
let lastUrl = "";
let cachedContent = null;

function extractMainContent() {
  try {
    // URL이 변경되지 않았으면 캐시된 결과 반환
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl && cachedContent) {
      return cachedContent;
    }

    // 특정 요소만 복제하여 성능 개선
    const bodyClone = document.body.cloneNode(true);

    // 불필요한 요소 제거
    const selectorsToRemove = [
      "script",
      "style",
      "nav",
      "header",
      "footer",
      ".advertisement",
      ".ads",
      ".sidebar",
      ".menu",
    ];

    selectorsToRemove.forEach((selector) => {
      const elements = bodyClone.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    // 임시 문서 생성
    const tempDoc = document.implementation.createHTMLDocument();
    tempDoc.body.appendChild(bodyClone);

    const article = new Readability(tempDoc).parse();
    const result = {
      content: article?.textContent || "",
      title: article?.title || document.title || "Untitled",
    };

    // 캐시 저장
    lastUrl = currentUrl;
    cachedContent = result;

    return result;
  } catch (e) {
    const fallback = {
      content: "",
      title: document.title || "Untitled",
    };

    // 실패 시에도 캐시 저장 (재시도 방지)
    lastUrl = window.location.href;
    cachedContent = fallback;

    return fallback;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "EXTRACT_MAIN_CONTENT") {
    const result = extractMainContent();
    sendResponse(result);
  }
});
