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

function openTabInstruction(browserName) {
  const location = browserName === "this browser" ? browserName : `${browserName}`;
  return `This QuickMaths session is already open in ${location}. Use WebMCP with this open QuickMaths tab; do not open a new QuickMaths tab unless I ask.`;
}

export function buildLearnerAgentPrompt({ navigatorObject = globalThis.navigator } = {}) {
  return `${openTabInstruction(detectBrowserName(navigatorObject))} Get the QuickMaths agent guide summary, check my app state and progress, then guide me through the learning experience.`;
}

export function buildEducatorAgentPrompt({ navigatorObject = globalThis.navigator } = {}) {
  return `${openTabInstruction(detectBrowserName(navigatorObject))} Call get_educator_agent_manifest through WebMCP, read the educator manifest, inspect my open curriculum with get_curriculum_workspace, and help me design it while keeping every lesson installation, learner-policy change, and publication step visible and human-approved.`;
}
