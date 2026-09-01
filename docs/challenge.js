import { createLearningStore, SKILL } from "./challenge-core.js";
import { registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js";

const store = createLearningStore({ storage: window.localStorage });

const elements = {
  work: document.querySelector("#student-work"),
  answer: document.querySelector("#final-answer"),
  equation: document.querySelector("#equation"),
  problemId: document.querySelector("#problem-id"),
  difficulty: document.querySelector("#difficulty"),
  feedback: document.querySelector("#tutor-feedback"),
  feedbackTitle: document.querySelector("#feedback-title"),
  feedbackBody: document.querySelector("#feedback-body"),
  feedbackStep: document.querySelector("#feedback-step"),
  answerStatus: document.querySelector("#answer-status"),
  mastery: document.querySelector("#mastery-value"),
  masteryBar: document.querySelector("#mastery-bar"),
  attempts: document.querySelector("#attempt-count"),
  activity: document.querySelector("#activity-list"),
  emptyActivity: document.querySelector("#activity-empty"),
  bridgeStatus: document.querySelector("#bridge-status"),
  bridgeDetail: document.querySelector("#bridge-detail"),
  copyLabel: document.querySelector("#copy-label"),
};

let rendering = false;

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "now";
  }
}

function renderActivity(activity) {
  elements.activity.replaceChildren();
  elements.emptyActivity.hidden = activity.length > 0;
  activity.slice().reverse().forEach((entry) => {
    const item = document.createElement("li");
    const time = document.createElement("time");
    time.dateTime = entry.at;
    time.textContent = formatTime(entry.at);
    const content = document.createElement("span");
    const tool = document.createElement("code");
    tool.textContent = entry.tool;
    const message = document.createElement("small");
    message.textContent = entry.message;
    content.append(tool, message);
    item.append(time, content);
    elements.activity.append(item);
  });
}

function render(state) {
  rendering = true;
  elements.work.value = state.work;
  elements.answer.value = state.finalAnswer;
  elements.equation.textContent = state.currentProblem.prompt;
  elements.problemId.textContent = state.currentProblem.id;
  elements.difficulty.textContent = state.currentProblem.difficulty;
  elements.mastery.textContent = `${Math.round(state.masteryScore * 100)}%`;
  elements.masteryBar.style.width = `${Math.round(state.masteryScore * 100)}%`;
  elements.attempts.textContent = String(state.attemptCount);

  if (state.finalAnswerStatus === "correct") {
    elements.answerStatus.className = "answer-status is-correct";
    elements.answerStatus.textContent = "Final answer checks out";
  } else if (state.finalAnswerStatus === "incorrect") {
    elements.answerStatus.className = "answer-status is-retry";
    elements.answerStatus.textContent = "Final answer needs another look";
  } else {
    elements.answerStatus.className = "answer-status";
    elements.answerStatus.textContent = "Not checked yet";
  }

  if (state.tutorFeedback) {
    elements.feedback.hidden = false;
    const passed = state.tutorFeedback.mistakeTag === "none";
    elements.feedback.dataset.tone = passed ? "success" : "coach";
    elements.feedbackTitle.textContent = passed ? "Nice recovery." : "I found one key move to revisit.";
    elements.feedbackBody.textContent = state.tutorFeedback.feedback;
    elements.feedbackStep.textContent = state.tutorFeedback.nextStep;
  } else {
    elements.feedback.hidden = true;
  }

  renderActivity(state.activity);
  rendering = false;
}

function saveResponse() {
  if (rendering) return;
  store.setStudentResponse({ work: elements.work.value, finalAnswer: elements.answer.value });
}

elements.work.addEventListener("change", saveResponse);
elements.answer.addEventListener("change", saveResponse);

document.querySelector("#check-answer").addEventListener("click", () => {
  saveResponse();
  store.checkAnswer();
});

document.querySelector("#ask-tutor").addEventListener("click", () => {
  saveResponse();
  store.runLocalTutor();
});

document.querySelector("#demo-mistake").addEventListener("click", () => {
  store.setStudentResponse({ work: "3x = 25\nx = 8.33", finalAnswer: "8.33" });
  store.checkAnswer();
});

document.querySelector("#follow-up").addEventListener("click", () => {
  const state = store.snapshot();
  store.createFollowupProblem({
    skillId: SKILL.id,
    difficulty: "same",
    focus: state.tutorFeedback?.mistakeTag || state.currentProblem.focus,
  });
});

document.querySelector("#reset-demo").addEventListener("click", () => store.reset());

document.querySelector("#copy-prompt").addEventListener("click", async () => {
  const prompt = document.querySelector("#agent-prompt").textContent.trim();
  try {
    await navigator.clipboard.writeText(prompt);
    elements.copyLabel.textContent = "Copied";
    window.setTimeout(() => { elements.copyLabel.textContent = "Copy prompt"; }, 1600);
  } catch {
    elements.copyLabel.textContent = "Select to copy";
  }
});

store.subscribe(render);
render(store.snapshot());

registerWebMcpTools(store).then((result) => {
  if (result.error) {
    elements.bridgeStatus.dataset.state = "warning";
    elements.bridgeStatus.textContent = "WebMCP partially available";
    elements.bridgeDetail.textContent = `${result.registered.length} of ${TOOL_NAMES.length} tools registered.`;
  } else if (result.available) {
    elements.bridgeStatus.dataset.state = "ready";
    elements.bridgeStatus.textContent = "Agent tools connected";
    elements.bridgeDetail.textContent = `${result.registered.length} tools are available to the browser agent.`;
  } else {
    elements.bridgeStatus.dataset.state = "idle";
    elements.bridgeStatus.textContent = "Ready for a WebMCP browser";
    elements.bridgeDetail.textContent = "The lesson still works here. Open it in a compatible ChatGPT or Codex browser to expose the tools.";
  }
});
