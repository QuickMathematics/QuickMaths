import test from "node:test";
import assert from "node:assert/strict";

import { BRIDGE_TOOL_NAMES, buildBridgeToolDefinitions, registerBridgeWebMcpTools } from "./bridge-webmcp-tools.js";

function harness() {
  const calls = [];
  const status = {
    role: "agent", connected: true, phase: "synced", dirty: false, remoteAvailable: true,
    lastPushedAt: null, lastPulledAt: "2026-09-01T12:00:00.000Z", lastRemoteUpdatedAt: "2026-09-01T11:59:59.000Z",
    config: { owner: "octo", repo: "quickmaths-sync", branch: "main", token: undefined }, error: null, conflict: null,
  };
  return {
    calls,
    controller: {
      snapshot: () => ({ ...status }),
      async pullNow() { calls.push("pull"); return { updated: true, channel: "learner", sha: "learner-sha" }; },
      async pushNow() { calls.push("push"); return { channel: "agent", sha: "agent-sha" }; },
    },
  };
}

test("bridge tools expose status without credentials", async () => {
  const { controller } = harness();
  const tools = Object.fromEntries(buildBridgeToolDefinitions(controller).map((tool) => [tool.name, tool]));
  const status = await tools.get_bridge_sync_status.execute({});
  assert.equal(status.repository, "octo/quickmaths-sync");
  assert.equal(status.branch, "main");
  assert.equal(JSON.stringify(status).includes("token"), false);
});

test("bridge pull and publish tools call the serialized controller operations", async () => {
  const { controller, calls } = harness();
  const tools = Object.fromEntries(buildBridgeToolDefinitions(controller).map((tool) => [tool.name, tool]));
  const pulled = await tools.sync_from_learner.execute({});
  const pushed = await tools.publish_agent_checkpoint.execute({});
  assert.deepEqual(calls, ["pull", "push"]);
  assert.equal(pulled.updated, true);
  assert.equal(pushed.sha, "agent-sha");
  await assert.rejects(tools.sync_from_learner.execute({ surprise: true }), /unknown input property/i);
});

test("registers all agent bridge tools and degrades without WebMCP", async () => {
  const { controller } = harness();
  const registered = [];
  const result = await registerBridgeWebMcpTools(controller, { async registerTool(tool) { registered.push(tool.name); } });
  assert.equal(result.available, true);
  assert.deepEqual(registered, BRIDGE_TOOL_NAMES);
  assert.ok(BRIDGE_TOOL_NAMES.every((name) => registered.includes(name)));
  assert.deepEqual(await registerBridgeWebMcpTools(controller, undefined), { available: false, registered: [], error: null });
});
