export const BRIDGE_TOOL_NAMES = Object.freeze([
  "get_bridge_sync_status",
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
      name: "sync_from_learner",
      description: "Pull and apply the newest learner-owned QuickMaths checkpoint before inspecting progress, recommending work, or tutoring. This never overwrites the GitHub learner file.",
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
      description: "Publish agent-made QuickMaths changes, such as saved tutor feedback or a staged lesson set, to the learner's GitHub bridge. The learner app applies it only if it is based on the current learner checkpoint.",
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
