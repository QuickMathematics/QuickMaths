export const QUICKMATHS_APP_URL = "https://quickmathematics.github.io/QuickMaths/";

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

export function buildAgentPrompt() {
  return "QuickMaths is open in your in-app browser. Call get_agent_guide with section \"summary\" through WebMCP, then follow the unified manifest to route me into the right learner or educator workflow.";
}

export function buildQuickMathsDesktopLink({ role = "learner", includePrompt = true, handoff = "workspace" } = {}) {
  const prompt = buildAgentPrompt();
  const browserUrl = new URL(QUICKMATHS_APP_URL);
  browserUrl.searchParams.set("handoff", handoff === "fresh" ? "fresh" : "workspace");
  const parameters = new URLSearchParams({ mode: "codex", browserUrl: browserUrl.toString() });
  if (includePrompt) parameters.set("prompt", prompt);
  return `codex://threads/new?${parameters.toString()}`;
}
