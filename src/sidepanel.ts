// import "./popup.css";
import {
  ChatCompletionMessageParam,
  CreateExtensionServiceWorkerMLCEngine,
  MLCEngineInterface,
  InitProgressReport,
} from "@mlc-ai/web-llm";
import * as ProgressBar from "progressbar.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const queryInput = document.getElementById("query-input")!;
const submitButton = document.getElementById("submit-button")!;
const extractButton = document.getElementById("extract-button")!;
let isLoadingParams = false;
(<HTMLButtonElement>submitButton).disabled = true;
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
  if (report.progress == 1.0) enableInputs();
};
const engine: MLCEngineInterface = await CreateExtensionServiceWorkerMLCEngine("Qwen2-0.5B-Instruct-q4f16_1-MLC", {
  initProgressCallback: initProgressCallback,
});
const chatHistory: ChatCompletionMessageParam[] = [];
isLoadingParams = true;
function enableInputs() {
  if (isLoadingParams) {
    sleep(500);
    (<HTMLButtonElement>submitButton).disabled = false;
    const loadingBarContainer = document.getElementById("loadingContainer")!;
    loadingBarContainer.remove();
    queryInput.focus();
    isLoadingParams = false;
  }
}
queryInput.addEventListener("keyup", () => {
  (<HTMLButtonElement>submitButton).disabled = (<HTMLInputElement>queryInput).value === "";
});
queryInput.addEventListener("keyup", (event) => {
  if (event.code === "Enter") {
    event.preventDefault();
    submitButton.click();
  }
});
async function handleClick() {
  const message = (<HTMLInputElement>queryInput).value;
  chatHistory.push({ role: "user", content: message });
  document.getElementById("answer")!.innerHTML = "";
  document.getElementById("answerWrapper")!.style.display = "none";
  document.getElementById("loading-indicator")!.style.display = "block";
  let curMessage = "";
  const completion = await engine.chat.completions.create({ stream: true, messages: chatHistory });
  for await (const chunk of completion) {
    const curDelta = chunk.choices[0].delta.content;
    if (curDelta) curMessage += curDelta;
    updateAnswer(curMessage);
  }
  chatHistory.push({ role: "assistant", content: await engine.getMessage() });
}
submitButton.addEventListener("click", handleClick);
function updateAnswer(answer: string) {
  document.getElementById("answerWrapper")!.style.display = "block";
  const answerWithBreaks = answer.replace(/\n/g, "<br>");
  document.getElementById("answer")!.innerHTML = answerWithBreaks;
  document.getElementById("copyAnswer")!.addEventListener("click", () => {
    navigator.clipboard.writeText(answer).catch((err) => console.error("Could not copy text: ", err));
  });
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  const time = new Date().toLocaleString("en-US", options);
  document.getElementById("timestamp")!.innerText = time;
  document.getElementById("loading-indicator")!.style.display = "none";
}
// 본문 추출 버튼 클릭 시 content script에 메시지 전송
extractButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "EXTRACT_MAIN_CONTENT" }, (response) => {
        if (response?.content) {
          (<HTMLInputElement>queryInput).value = response.content;
          (<HTMLButtonElement>submitButton).disabled = false;
        } else {
          (<HTMLInputElement>queryInput).value = "본문 추출에 실패했습니다.";
        }
      });
    }
  });
});
