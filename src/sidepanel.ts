import { CreateExtensionServiceWorkerMLCEngine, MLCEngineInterface, InitProgressReport } from "@mlc-ai/web-llm";
import * as ProgressBar from "progressbar.js";
import "./styles";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const extractButton = document.getElementById("extract-button")!;
const historyWrapper = document.getElementById("historyWrapper")!;
const loadingContainerWrapper = document.getElementById("loadingContainerWrapper")!;
let isLoadingParams = false;

const progressBar = new ProgressBar.Line("#loadingContainer", {
  strokeWidth: 4,
  easing: "easeInOut",
  duration: 1400,
  color: "#ffd166",
  trailColor: "#eee",
  trailWidth: 1,
  svgStyle: { width: "100%", height: "100%" },
});

const initProgressCallback = (report: InitProgressReport) => {
  progressBar.animate(report.progress, { duration: 50 });
  if (report.progress == 1.0) {
    loadingContainerWrapper.style.display = "none";
    enableInputs();
  }
};

const engine: MLCEngineInterface = await CreateExtensionServiceWorkerMLCEngine("Qwen2-0.5B-Instruct-q4f16_1-MLC", {
  initProgressCallback: initProgressCallback,
});
let summaryHistory: { content: string; summary: string; timestamp: string; title: string }[] = [];

function enableInputs() {
  if (isLoadingParams) {
    setTimeout(() => {
      const loadingBarContainer = document.getElementById("loadingContainer")!;
      loadingBarContainer.remove();
      isLoadingParams = false;
    }, 500);
  }
}

function renderHistory() {
  historyWrapper.innerHTML = "";
  summaryHistory
    .slice()
    .reverse()
    .forEach((item, idx) => {
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
      <div class="section-container">
        <div class="content-text">
          <div class="content-title">
            ${item.title}
            <button class="toggle-button">더보기</button>
          </div>
          <div class="content-body">${item.content.replace(/\n/g, "<br>")}</div>
        </div>
      </div>
      <div class="section-container">
        <div class="summary-text">${item.summary.replace(/\n/g, "<br>")}</div>
        <button class="toggle-button" style="display: none;">접기</button>
      </div>
      <div class="meta-container">
        <span class="history-timestamp">${item.timestamp}</span>
        <button class="copy-button" title="Copy the Summary to the Clipboard">
          <i class="fa-solid fa-copy fa-lg"></i>
        </button>
      </div>
    `;

      // 본문 더보기/접기
      const contentDiv = card.querySelector(".content-text")!;
      const contentBody = card.querySelector(".content-body") as HTMLElement;
      const toggleBtn = card.querySelector(".content-title .toggle-button")!;
      let isExpanded = false;

      // Initially hide the content body
      contentBody.style.display = "none";
      console.log("Initial content body display:", contentBody.style.display);

      toggleBtn.addEventListener("click", () => {
        isExpanded = !isExpanded;
        console.log("Toggle clicked, isExpanded:", isExpanded);
        if (isExpanded) {
          contentBody.style.display = "block";
          contentDiv.classList.add("expanded");
          toggleBtn.textContent = "접기";
        } else {
          contentBody.style.display = "none";
          contentDiv.classList.remove("expanded");
          toggleBtn.textContent = "더보기";
        }
        console.log("Content body display after toggle:", contentBody.style.display);
      });

      // 요약 더보기/접기
      const summaryDiv = card.querySelector(".summary-text")!;
      const summaryToggleBtn = card.querySelectorAll(".toggle-button")[1] as HTMLButtonElement;
      let isSummaryExpanded = true;
      setTimeout(() => {
        const lineHeight = parseFloat(getComputedStyle(summaryDiv).lineHeight) || 16;
        const maxHeight = lineHeight * 4;
        if (item.summary === "요약 중...") {
          summaryDiv.classList.remove("expanded");
          summaryToggleBtn.style.display = "none";
        } else if (summaryDiv.scrollHeight > maxHeight + 2) {
          summaryToggleBtn.style.display = "inline-block";
          summaryToggleBtn.textContent = "접기";
          summaryDiv.classList.add("expanded");
        } else {
          summaryToggleBtn.style.display = "none";
          summaryDiv.classList.add("expanded");
        }
      }, 0);
      summaryToggleBtn.addEventListener("click", () => {
        isSummaryExpanded = !isSummaryExpanded;
        if (isSummaryExpanded) {
          summaryDiv.classList.add("expanded");
          summaryToggleBtn.textContent = "접기";
        } else {
          summaryDiv.classList.remove("expanded");
          summaryToggleBtn.textContent = "더보기";
        }
      });
      card.querySelector(".copy-button")!.addEventListener("click", () => {
        navigator.clipboard.writeText(item.summary).catch((err) => console.error("Could not copy text: ", err));
      });
      historyWrapper.appendChild(card);
    });
}

// 버튼 상태 관리 함수 추가
function setExtractButtonState(loading: boolean) {
  const btn = extractButton as HTMLButtonElement;
  if (loading) {
    btn.disabled = true;
    btn.innerText = "요약 중...";
  } else {
    btn.disabled = false;
    btn.innerText = "본문 추출 및 요약";
  }
}

extractButton.addEventListener("click", () => {
  setExtractButtonState(true);
  document.getElementById("loading-indicator")!.style.display = "block";
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_MAIN_CONTENT" }, async (response) => {
        if (response?.content) {
          const content = response.content;
          const title = response.title;
          const timestamp = new Date().toLocaleString("en-US", {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
          // 히스토리에 빈 summary 카드 먼저 추가
          summaryHistory.push({ content, summary: "", timestamp, title });
          renderHistory();
          // 요약 요청
          let summary = "";
          try {
            const completion = await engine.chat.completions.create({
              stream: true,
              messages: [{ role: "user", content: `다음 본문을 한국어로 간결하게 요약해줘.\n\n${content}` }],
            });
            // 마지막 카드의 summary DOM을 직접 참조
            const lastCard = historyWrapper.querySelector(".history-card");
            const summaryDiv = lastCard?.querySelector(".summary-text");
            for await (const chunk of completion) {
              const curDelta = chunk.choices[0].delta.content;
              console.log("chunk delta:", curDelta);
              if (curDelta) {
                summary += curDelta;
                summaryHistory[summaryHistory.length - 1].summary = summary;
                if (summaryDiv) {
                  summaryDiv.innerHTML += curDelta.replace(/\n/g, "<br>");
                  console.log("summaryDiv.innerHTML:", summaryDiv.innerHTML);
                }
                console.log("summary:", summary);
              }
            }
            // 스트리밍이 끝난 후 전체 답변을 getMessage로 보정
            const fullReply = await engine.getMessage();
            summary = fullReply;
            summaryHistory[summaryHistory.length - 1].summary = summary || "요약 실패";
            if (summaryDiv) summaryDiv.innerHTML = (summary || "요약 실패").replace(/\n/g, "<br>");
          } finally {
            document.getElementById("loading-indicator")!.style.display = "none";
            setExtractButtonState(false);
            // 최종 요약 결과로 카드 업데이트 및 전체 렌더링
            renderHistory();
          }
        } else {
          document.getElementById("loading-indicator")!.style.display = "none";
          setExtractButtonState(false);
          alert("본문 추출에 실패했습니다.");
        }
      });
    }
  });
});
