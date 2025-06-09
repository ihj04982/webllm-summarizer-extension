import { Readability } from "@mozilla/readability";

// 타입 정의
interface ExtractedContent {
  content: string;
  title: string;
}

interface ChromeMessage {
  type: string;
  [key: string]: any;
}

// DOM 복제 최적화를 위한 캐시
let lastUrl: string = "";
let cachedContent: ExtractedContent | null = null;

function extractMainContent(): ExtractedContent {
  try {
    // URL이 변경되지 않았으면 캐시된 결과 반환
    const currentUrl: string = window.location.href;
    if (currentUrl === lastUrl && cachedContent) {
      console.log("Using cached content for:", currentUrl);
      return cachedContent;
    }

    console.log("Extracting content from:", currentUrl);

    // 특정 요소만 복제하여 성능 개선
    const bodyClone = document.body.cloneNode(true) as HTMLElement;

    // 불필요한 요소 제거
    const selectorsToRemove: string[] = [
      "script",
      "style",
      "nav",
      "header",
      "footer",
      ".advertisement",
      ".ads",
      ".sidebar",
      ".menu",
      ".popup",
      ".modal",
      ".overlay",
      "[role='banner']",
      "[role='navigation']",
      "[role='complementary']",
    ];

    selectorsToRemove.forEach((selector: string) => {
      const elements = bodyClone.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    });

    // 임시 문서 생성
    const tempDoc: Document = document.implementation.createHTMLDocument();
    tempDoc.body.appendChild(bodyClone);

    // Readability로 본문 추출
    const reader = new Readability(tempDoc);
    const article = reader.parse();

    const result: ExtractedContent = {
      content: article?.textContent?.trim() || "",
      title: article?.title?.trim() || document.title?.trim() || "Untitled",
    };

    // 최소 콘텐츠 길이 검증
    if (result.content.length < 100) {
      console.warn("Extracted content too short, using fallback method");

      // 대체 방법: 모든 텍스트 노드 수집
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);

      let textContent = "";
      let node: Node | null;

      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.trim().length > 0) {
          // 부모 요소가 숨겨진 요소가 아닌지 확인
          const parent = node.parentElement;
          if (parent && getComputedStyle(parent).display !== "none") {
            textContent += node.textContent.trim() + " ";
          }
        }
      }

      if (textContent.length > result.content.length) {
        result.content = textContent.trim();
      }
    }

    // 캐시 저장
    lastUrl = currentUrl;
    cachedContent = result;

    console.log(`Content extracted: ${result.content.length} characters`);
    return result;
  } catch (error) {
    console.error("Content extraction failed:", error);

    const fallback: ExtractedContent = {
      content: document.body.innerText?.slice(0, 5000) || "",
      title: document.title || "Untitled",
    };

    // 실패 시에도 캐시 저장 (재시도 방지)
    lastUrl = window.location.href;
    cachedContent = fallback;

    return fallback;
  }
}

// 페이지 변경 감지 (SPA 대응)
let previousUrl = location.href;

function detectPageChange(): void {
  if (location.href !== previousUrl) {
    console.log("Page changed, clearing cache");
    previousUrl = location.href;
    cachedContent = null; // 페이지 변경 시 캐시 초기화
    lastUrl = "";
  }
}

// URL 변경 감지를 위한 이벤트 리스너
window.addEventListener("popstate", detectPageChange);

// pushState/replaceState 감지 (SPA용)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
  originalPushState.apply(history, args);
  detectPageChange();
};

history.replaceState = function (...args) {
  originalReplaceState.apply(history, args);
  detectPageChange();
};

// 메시지 리스너
chrome.runtime.onMessage.addListener(
  (request: ChromeMessage, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void): boolean => {
    if (request.type === "EXTRACT_MAIN_CONTENT") {
      try {
        const result = extractMainContent();
        sendResponse(result);
      } catch (error) {
        console.error("Error in message handler:", error);
        sendResponse({
          content: "",
          title: document.title || "Untitled",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return false; // 동기 응답
  }
);

// 콘텐츠 스크립트 준비 완료 로그
console.log("WebLLM Summarizer content script loaded");

// 페이지 로드 완료 후 초기 캐시 준비
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM loaded, content script ready");
  });
} else {
  console.log("Content script loaded after DOM ready");
}
