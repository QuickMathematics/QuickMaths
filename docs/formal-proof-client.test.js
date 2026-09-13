import { requestFixture, mockVerification } from "./test-support/formal-fixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFormalStep,
  callFormalRpc,
  checkFormalReferenceProof,
  formalDraftEvidence,
  formalRuntimeCompatibility,
  replayFormalEvidence,
  startFormalProof,
  verifyFormalProof,
} from "./formal-proof-client.js";

const binding = "a".repeat(64);
const job = {
  version: "0.1",
  problem_binding_sha256: binding,
  environment_requirements: { backend: "lean4", library: "mathlib", library_revision: "rev1" },
  rpc: {
    protocol_version: "0.1",
    op: "new_text_request",
    request_id: `quickmaths:${binding}`,
    declarations: ["x:real"],
    assumptions: ["x != 3"],
    goal: "x + 3 = 3 + x",
    allowed_rules: ["ring"],
    max_seconds: 10,
  },
};

const health = {
  service: "quickmaths-formal",
  protocol_version: "0.1",
  lean_available: false,
  environment: { backend: "lean4", library: "mathlib", mathlib_revision: "rev1" },
};

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

function mockFetch(routes) {
  return async (url, options = {}) => {
    const path = new URL(url).pathname;
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected ${path}`);
    return handler(options);
  };
}

test("runtime compatibility distinguishes usable proof-state service from unavailable kernel", () => {
  const result = formalRuntimeCompatibility(job, health);
  assert.equal(result.compatible, true);
  assert.equal(result.kernelAvailable, false);
  const drift = formalRuntimeCompatibility(job, { ...health, environment: { ...health.environment, mathlib_revision: "other" } });
  assert.equal(drift.compatible, false);
  assert.match(drift.issues.join(" "), /library_revision/);
});

test("formal client starts and advances an interactive proof without claiming verification", async () => {
  const fetchImpl = mockFetch({
    "/health": () => response(health),
    "/v1/rpc": (options) => {
      const rpc = JSON.parse(options.body);
      if (rpc.op === "new_text_request") return response({ protocol_version: "0.1", ok: true, result: { request: { id: "request", steps: [] }, proof_state: { status: "needs_justification", assumptions: [{ id: "h1", claim: "x ≠ 3" }] } } });
      if (rpc.op === "append_text_step") return response({ protocol_version: "0.1", ok: true, result: { request: { ...rpc.request, steps: [{ id: "user_step_1", rule: rpc.rule }] }, proof_state: { status: "ready_for_kernel", suggestions: [] } } });
      throw new Error(`unexpected op ${rpc.op}`);
    },
  });
  const started = await startFormalProof(job, { fetchImpl });
  assert.equal(started.kernelAvailable, false);
  assert.equal(started.proofState.status, "needs_justification");
  assert.equal(started.verification, null);
  const advanced = await appendFormalStep(started, { claim: "x + 3 = 3 + x", rule: "ring", premises: [] }, { fetchImpl });
  assert.equal(advanced.proofState.status, "ready_for_kernel");
  assert.equal(advanced.verification, null);
  assert.equal(formalDraftEvidence(advanced).problem_binding_sha256, binding);
});

test("author reference checks distinguish structural readiness from kernel certification", async () => {
  const referenceJob = {
    version: "0.1",
    environment_requirements: { backend: "lean4", library: "mathlib", library_revision: "rev1" },
    rpc: {
      protocol_version: "0.1", op: "check_reference_text", request_id: "studio:reference",
      declarations: ["x:real"], assumptions: [], goal: "x + 0 = x", allowed_rules: ["ring"],
      reference_steps: [{ claim: "x + 0 = x", rule: "ring", premises: [], parameters: {}, scope: "root" }], max_seconds: 10,
    },
  };
  const fetchImpl = mockFetch({
    "/health": () => response(health),
    "/v1/rpc": () => response({ protocol_version: "0.1", ok: true, result: {
      request: { id: "reference" }, proof_state: { status: "ready_for_kernel" },
      verification: { status: "verification_unavailable", certificate: null },
    } }),
  });
  const checked = await checkFormalReferenceProof(referenceJob, { fetchImpl });
  assert.equal(checked.proofState.status, "ready_for_kernel");
  assert.equal(checked.kernelAvailable, false);
  assert.equal(checked.kernelVerified, false);
  assert.equal(checked.verification.status, "verification_unavailable");
});

test("kernel verification badge requires verified status and a certificate", async () => {
  let certified = false;
  const fetchImpl = mockFetch({
    "/v1/rpc": (options) => {
      const rpc = JSON.parse(options.body);
      if (rpc.op === "state") return response({ protocol_version: "0.1", ok: true, result: { request_hash: mockVerification(rpc.request).request_hash, status: "ready_for_kernel" } });
      assert.equal(rpc.op, "check");
      return response({ protocol_version: "0.1", ok: true, result: certified
        ? mockVerification(rpc.request)
        : { status: "verification_unavailable", certificate: null } });
    },
  });
  const session = { problemBindingSha256: binding, request: requestFixture(), proofState: { status: "ready_for_kernel" } };
  const unavailable = await verifyFormalProof(session, { fetchImpl });
  assert.equal(unavailable.kernelVerified, false);
  assert.equal(formalDraftEvidence(unavailable).verification.status, "verification_unavailable");
  certified = true;
  const verified = await verifyFormalProof(session, { fetchImpl });
  assert.equal(verified.kernelVerified, true);
  assert.equal(formalDraftEvidence(verified).verification.certificate_digest, mockVerification(session.request).certificate.certificate_digest);
});

test("client rejects arbitrary remote verifier URLs and oversized RPCs", async () => {
  await assert.rejects(callFormalRpc({ protocol_version: "0.1", op: "x" }, { baseUrl: "https://evil.example", fetchImpl: async () => response({}) }), /loopback/);
  const huge = { protocol_version: "0.1", op: "x", payload: "x".repeat(1_000_001) };
  await assert.rejects(callFormalRpc(huge, { fetchImpl: async () => response({}) }), /1 MB/);
});


test("archived certificate replay uses the exact stored request and pinned environment", async () => {
  const h = (character) => character.repeat(64);
  const archivedBinding = h("a");
  const archivedRequest = { request_id: `quickmaths:${archivedBinding}`, variables: [], assumptions: [], steps: [], goal: { kind: "truth" } };
  const archivedCertificate = {
    certificate_version: "0.2", verifier_version: "0.4.0", verified_at: "2026-09-09T18:00:00+00:00",
    request_hash: h("b"), statement_hash: h("c"), submission_hash: h("d"), lean_source_hash: h("e"),
    proof_artifact: "import Mathlib\nexample : True := by trivial\n", proof_mode: "submitted", axioms: ["propext"],
    environment: { lean_toolchain: "leanprover/lean4:v4.34.0-rc2", mathlib_revision: h("f") }, elapsed_ms: 3, certificate_digest: h("1"),
  };
  const record = {
    version: "0.1", evidenceId: `formal:${h("1")}`, profileId: "p", skillId: "s", questionId: "q", problemBindingSha256: archivedBinding,
    requestHash: h("b"), statementHash: h("c"), submissionHash: h("d"), certificateDigest: h("1"),
    request: archivedRequest, certificate: archivedCertificate, verifiedAt: archivedCertificate.verified_at, recordedAt: "2026-09-09T18:01:00Z",
  };
  const fetchImpl = mockFetch({
    "/health": () => response({ service: "quickmaths-formal", protocol_version: "0.1", lean_available: false, environment: { backend: "lean4", library: "mathlib", lean_toolchain: archivedCertificate.environment.lean_toolchain, mathlib_revision: h("f") } }),
    "/v1/rpc": (options) => {
      const rpc = JSON.parse(options.body);
      if (rpc.op === "state") return response({ protocol_version: "0.1", ok: true, result: { request_hash: mockVerification(rpc.request).request_hash } });
      assert.equal(rpc.op, "replay");
      assert.deepEqual(rpc.request, archivedRequest);
      assert.deepEqual(rpc.certificate, archivedCertificate);
      return response({ protocol_version: "0.1", ok: true, result: { status: "verification_unavailable", certificate: null } });
    },
  });
  const replay = await replayFormalEvidence(record, { fetchImpl });
  assert.equal(replay.kernelVerified, false);
  assert.equal(replay.evidenceId, record.evidenceId);
});

test("hung companion and hung response-body reads time out and abort without a result", async () => {
  for (const hang of ["fetch", "body"]) {
    let signal;
    const fetchImpl = async (_url, options) => {
      signal = options.signal;
      if (hang === "fetch") return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    };
    await assert.rejects(callFormalRpc({ protocol_version: "0.1", op: "state" }, { fetchImpl, timeoutMs: 10 }), /timed out/);
    assert.equal(signal.aborted, true);
  }
});
