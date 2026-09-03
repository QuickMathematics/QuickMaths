function browserFromUserAgent(userAgent = "", brands = []) {
  const brandText = Array.isArray(brands) ? brands.map((item) => item?.brand ?? "").join(" ") : "";
  const source = `${brandText} ${userAgent}`;
  if (/Edg\//i.test(source) || /Microsoft Edge/i.test(source)) return "Microsoft Edge";
  if (/Firefox\//i.test(source)) return "Firefox";
  if (/OPR\//i.test(source) || /Opera/i.test(source)) return "Opera";
  if (/Chrome\//i.test(source) || /Chromium/i.test(source) || /Google Chrome/i.test(source)) return "Chrome";
  if (/Safari\//i.test(source) && !/Chrome\//i.test(source)) return "Safari";
  return "this browser";
}

export function detectBrowserName(navigatorObject = globalThis.navigator) {
  return browserFromUserAgent(navigatorObject?.userAgent ?? "", navigatorObject?.userAgentData?.brands ?? []);
}

export function webMcpAvailable(modelContext = globalThis.document?.modelContext) {
  return typeof modelContext?.registerTool === "function";
}

function connectionInstruction({ navigatorObject, modelContext, available }) {
  if (available ?? webMcpAvailable(modelContext)) {
    return "QuickMaths is already open in the ChatGPT/Codex in-app browser with WebMCP available. Use this already-open QuickMaths tab; do not open another QuickMaths tab unless I ask.";
  }
  const browserName = detectBrowserName(navigatorObject);
  const location = browserName === "this browser" ? "an external browser" : `${browserName}, an external browser`;
  return `This QuickMaths page is open in ${location}, whose tabs cannot expose WebMCP tools. Open https://quickmathematics.github.io/QuickMaths/ in your ChatGPT or Codex in-app browser and reuse that in-app QuickMaths tab; do not open duplicates. If my workspace is not there, guide me through restoring it with private Workspace Storage, but never ask me to paste a token into chat.`;
}

export function buildLearnerAgentPrompt({ navigatorObject = globalThis.navigator, modelContext = globalThis.document?.modelContext, webMcpAvailable: available } = {}) {
  return `${connectionInstruction({ navigatorObject, modelContext, available })} Then call get_agent_guide with section \"summary\" through WebMCP, check my app state and progress, and guide me through the learning experience.`;
}

export function buildEducatorAgentPrompt({ navigatorObject = globalThis.navigator, modelContext = globalThis.document?.modelContext, webMcpAvailable: available } = {}) {
  return `${connectionInstruction({ navigatorObject, modelContext, available })} Then call get_educator_agent_manifest through WebMCP, read the educator manifest, inspect my open curriculum with get_curriculum_workspace, and help me design it while keeping every lesson installation, learner-policy change, and publication step visible and human-approved.`;
}
