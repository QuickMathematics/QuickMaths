export const BRIDGE_TOOL_NAMES = Object.freeze([
  "get_bridge_sync_status",
  "begin_agent_task",
  "sync_from_learner",
  "publish_agent_checkpoint",
]);

function noInput(name, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${name} input must be an object.`);
  const keys = Object.keys(input);
  if (keys.length) throw new Error(`Unknown input property: ${keys[0]}`);
}

function publicStatus(controller) {
  const status = controller.snapshot();
  return {
    role: status.role,
    connected: status.connected,
    phase: status.phase,
    dirty: status.dirty,
    remote_available: status.remoteAvailable,
    last_pushed_at: status.lastPushedAt,
    last_pulled_at: status.lastPulledAt,
    last_remote_updated_at: status.lastRemoteUpdatedAt,
    repository: status.config ? `${status.config.owner}/${status.config.repo}` : null,
    branch: status.config?.branch ?? null,
    error: status.error,
    conflict: status.conflict,
    task_started_at: status.taskStartedAt ?? null,
  };
}

export function buildBridgeToolDefinitions(controller) {
  if (!controller?.snapshot || !controller?.pullNow || !controller?.pushNow) throw new TypeError("A QuickMaths Bridge controller is required.");
  const emptySchema = { type: "object", properties: {}, additionalProperties: false };
  return [
    {
      name: "get_bridge_sync_status",
      description: "Check whether this agent-side QuickMaths workspace is connected to the learner's GitHub bridge, whether local changes are pending, and when each side last synchronized.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        noInput("get_bridge_sync_status", input);
        return publicStatus(controller);
      },
    },
    {
      name: "begin_agent_task",
      description: "FIRST action for each new learner prompt: record the current task start time locally, then load the learner workspace. The timestamp is pushed with the finished agent checkpoint. Do this before inspecting or editing; publish unfinished work before starting another task.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false },
      execute: async (input = {}) => {
        noInput("begin_agent_task", input);
        const result = await controller.beginAgentTask();
        return { ok: true, ...result, sync: publicStatus(controller) };
      },
    },
    {
      name: "sync_from_learner",
      description: "Pull the learner-owned checkpoint. Start every new prompt with begin_agent_task first. This starts a timestamped task if none is active, and never writes the learner file. Do not pull over work in progress.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false },
      execute: async (input = {}) => {
        noInput("sync_from_learner", input);
        const result = await controller.pullNow();
        return { ok: true, ...result, sync: publicStatus(controller) };
      },
    },
    {
      name: "publish_agent_checkpoint",
      description: "Publish agent-made changes with the task's original start timestamp and learner revision. If the learner changed that workspace in the meantime, their app opens a selective merge window; otherwise it applies the update automatically.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: false },
      execute: async (input = {}) => {
        noInput("publish_agent_checkpoint", input);
        const result = await controller.pushNow();
        return { ok: true, ...result, sync: publicStatus(controller) };
      },
    },
  ];
}

export async function registerBridgeWebMcpTools(controller, modelContext = globalThis.document?.modelContext) {
  if (!modelContext || typeof modelContext.registerTool !== "function") return { available: false, registered: [], failures: [], error: null };
  const registered = [];
  const failures = [];
  for (const definition of buildBridgeToolDefinitions(controller)) {
    try {
      await modelContext.registerTool(definition);
      registered.push(definition.name);
    } catch (cause) {
      failures.push({ name: definition.name, error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  return {
    available: true,
    registered,
    failures,
    error: failures.length ? `${failures.length} bridge tool${failures.length === 1 ? "" : "s"} failed to register: ${failures.map((failure) => failure.name).join(", ")}` : null,
  };
}
