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

function extractMainContent(): ExtractedContent {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = document.body.innerHTML;
  const reader = new Readability(doc);
  const article = reader.parse();
  return {
    content: article?.textContent?.trim() || "",
    title: article?.title?.trim() || document.title || "Untitled",
  };
}

// 메시지 리스너
if (!(window as any).__webllm_content_listener_registered) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    return false;
  });
  (window as any).__webllm_content_listener_registered = true;
}
