import test from "node:test";
import assert from "node:assert/strict";
import { assertFormalCertificate, formalRequestHash, formalWorkspaceIdentity, validateFormalProgress } from "./formal-proof-trust.js";
import { assertFormalSessionForJob, beginFormalStepEdit, checkFormalProgress, formalDraftEvidence, replaceFormalStep, verifyFormalProof } from "./formal-proof-client.js";
import { renderFormalWorkspace } from "./formal-proof-workspace.js";
import { buildFormalEvidenceRecord } from "./formal-evidence.js";
import { requestFixture, mockVerification, mockProgress } from "./test-support/formal-fixtures.js";

const session = () => ({ request: requestFixture(), problemBindingSha256: "a".repeat(64),
  proofState: { steps: [{ step_id: "user_step_1", scope: "root", claim: "x = x", rule: "eq_refl", status: "candidate_ready" }] },
  kernelVerified: true, verification: mockVerification(), progress: mockProgress() });
const reply = (result) => ({ ok: true, json: async () => ({ protocol_version: "0.1", ok: true, result }) });
const problem = { template_id: "DEMO", formal_job: { problem_binding_sha256: "a".repeat(64) },
  proof_spec: { statement: { declarations: ["x:real"], assumptions: [], goal: "x = x" }, allowed_rules: ["eq_refl"] } };

// These are certificate-format tests; only the separate Python/Lean test can
// demonstrate mathematical verification in an installed formal environment.
test("fresh complete certificates must bind exact content and mode", () => {
  assert.doesNotThrow(() => assertFormalCertificate(mockVerification(), requestFixture()));
  assert.throws(() => assertFormalCertificate({ status: "verified", certificate: {} }, requestFixture()), /certificate/);
  assert.throws(() => assertFormalCertificate(mockVerification(requestFixture(), "progress"), requestFixture()), /certificate/);
});

for (const field of ["goal", "assumptions", "variables", "steps", "scopes", "request_id", "policy"]) {
  test(`stale certificate cannot follow an edited ${field}`, () => {
    const request = requestFixture();
    const edited = structuredClone(request);
    edited[field] = field === "request_id" ? "other" : [{ changed: true }];
    assert.throws(() => assertFormalCertificate(mockVerification(request), edited), /certificate/);
  });
}

test("tampered artifacts, environments and hidden axioms fail even with a recalculated record digest", () => {
  for (const mutate of [
    (cert) => { cert.proof_artifact += "\n-- changed"; },
    (cert) => { cert.environment.mathlib_revision = "0".repeat(64); },
    (cert) => { cert.axioms = ["hidden.axiom"]; },
  ]) {
    const result = mockVerification(); mutate(result.certificate);
    delete result.certificate.certificate_digest;
    result.certificate.certificate_digest = formalRequestHash(result.certificate);
    assert.throws(() => assertFormalCertificate(result, requestFixture()), /certificate/);
  }
});

test("progress is exact, contiguous, fresh and separate from final assessment", async () => {
  assert.equal(validateFormalProgress(mockProgress(), requestFixture()).verified_step_ids.length, 1);
  const proof = session();
  const result = await checkFormalProgress(proof, { fetchImpl: async () => reply(mockProgress()) });
  assert.equal(result.progress.assessment_eligible, false);
  assert.equal(formalDraftEvidence(result).progress, undefined);
  assert.equal(formalDraftEvidence(result).kernel_progress, undefined);
  assert.throws(() => validateFormalProgress({ ...mockProgress(), request_hash: "b".repeat(64) }, proof.request), /current proof/);
  assert.throws(() => validateFormalProgress({ ...mockProgress(), verified_step_ids: ["invented"] }, proof.request), /uncertified/);
  const skipped = mockProgress(); skipped.checked_prefixes[0].step_id = "invented";
  assert.throws(() => validateFormalProgress(skipped, proof.request), /skipped/);
});

test("a fresh-looking prefix cannot silently replace the original assumptions or scope", () => {
  for (const key of ["assumptions", "scopes", "goal", "variables"]) {
    const response = mockProgress(); response.checked_prefixes[0].request[key] = [{ changed: true }];
    assert.throws(() => validateFormalProgress(response, requestFixture()), /changed/);
  }
});

test("partial and assistant-generated certificates cannot enter learner assessment archive", () => {
  for (const mode of ["progress", "assisted", "reference"]) assert.throws(() => buildFormalEvidenceRecord({
    profileId: "p", skillId: "s", questionId: "q", problemBindingSha256: "a".repeat(64), request: requestFixture(),
    verification: mockVerification(requestFixture(), mode),
  }), /learner-submitted/);
});

test("beginning an edit withdraws all verification before any network call and persists the edit", async () => {
  const editing = beginFormalStepEdit(session(), "user_step_1");
  assert.equal(editing.kernelVerified, false); assert.equal(editing.verification, null); assert.equal(editing.progress, null);
  const persisted = JSON.parse(JSON.stringify(formalDraftEvidence(editing)));
  assert.equal(persisted.pending_edit.step_id, "user_step_1"); assert.equal(persisted.verification, null);
  const fetchImpl = async () => { throw new Error("Must not call the verifier before saving"); };
  await assert.rejects(verifyFormalProof(editing, { fetchImpl }), /Save the edited step/);
  await assert.rejects(checkFormalProgress(editing, { fetchImpl }), /Save the edited step/);
});

test("edit RPC preserves step identity and discards all stale certificates", async () => {
  const editing = beginFormalStepEdit(session(), "user_step_1");
  const next = await replaceFormalStep(editing, { claim: "x = x", rule: "eq_refl" }, { fetchImpl: async (_, options) => {
    const rpc = JSON.parse(options.body); assert.equal(rpc.op, "replace_text_step"); assert.equal(rpc.step_id, "user_step_1");
    return reply({ request: requestFixture(), proof_state: session().proofState });
  } });
  assert.equal(next.pendingEdit, null); assert.equal(next.kernelVerified, false); assert.equal(next.verification, null);
});

test("workspace identities change across profiles, attempts, proof revisions and unsaved edits", () => {
  const snapshot = { activeProfile: { id: "p" }, activeTest: { draftId: "d" } };
  const evidence = formalDraftEvidence(session());
  const original = formalWorkspaceIdentity(snapshot, problem, evidence);
  for (const [s, p, e] of [
    [{ ...snapshot, activeProfile: { id: "other" } }, problem, evidence],
    [{ ...snapshot, activeTest: { draftId: "other" } }, problem, evidence],
    [snapshot, { ...problem, formal_job: { problem_binding_sha256: "b".repeat(64) } }, evidence],
    [snapshot, problem, { ...evidence, request: { ...evidence.request, steps: [] } }],
    [snapshot, problem, { ...evidence, pending_edit: { claim: "x = 0" } }],
  ]) assert.notEqual(formalWorkspaceIdentity(s, p, e), original);
});

test("rendering never promotes candidate or imported proof-state success flags", () => {
  const evidence = formalDraftEvidence({ ...session(), verification: null });
  evidence.proof_state.steps[0].status = "verified";
  evidence.proof_state.kernel_progress = mockProgress();
  const html = renderFormalWorkspace({ problem, evidence });
  assert.doesNotMatch(html, /class="proof-reasoning-step kernel-verified"/);
  const live = renderFormalWorkspace({ problem, evidence, progress: mockProgress() });
  assert.match(live, /class="proof-reasoning-step kernel-verified"/);
  const editing = renderFormalWorkspace({ problem, evidence: { ...evidence, pending_edit: { step_id: "user_step_1" } }, progress: mockProgress() });
  assert.doesNotMatch(editing, /class="proof-reasoning-step kernel-verified"/);
});

test("the workspace escapes lesson text and supports archived replay without a green badge", () => {
  const unsafe = { ...problem, proof_spec: { ...problem.proof_spec, statement: { goal: '<img src=x onerror="alert(1)">' } } };
  assert.doesNotMatch(renderFormalWorkspace({ problem: unsafe }), /<img/);
  const evidence = { ...formalDraftEvidence(session()), verification: { status: "replay_required", evidence_id: "archived" } };
  const html = renderFormalWorkspace({ problem, evidence });
  assert.match(html, /Archived · replay required/); assert.match(html, /data-action="formal-replay"/);
  assert.doesNotMatch(html, /class="proof-reasoning-step kernel-verified"/);
});


test("the evidence archive accepts the real 40-character pinned mathlib commit ID", () => {
  const request = requestFixture();
  const record = buildFormalEvidenceRecord({ profileId: "p", skillId: "s", questionId: "q",
    problemBindingSha256: "a".repeat(64), request, verification: mockVerification(request) });
  assert.equal(record.certificate.environment.mathlib_revision.length, 40);
});


test("a fresh prefix uses its own bound display state, not imported report text", () => {
  const evidence = formalDraftEvidence({ ...session(), verification: null });
  evidence.proof_state.steps[0].claim = "0 = 1";
  const html = renderFormalWorkspace({ problem, evidence, progress: mockProgress() });
  assert.doesNotMatch(html, /0 = 1/);
  const bad = mockProgress(); bad.proof_state.request_hash = "b".repeat(64);
  assert.throws(() => validateFormalProgress(bad, requestFixture()), /current proof/);
});


for (const field of ["goal", "variables", "assumptions", "policy", "request_id"]) {
  test(`a retained request label cannot hide a changed authored ${field}`, async () => {
    const original = requestFixture();
    original.assumptions = [{ id: "h1", scope: "root", claim: { kind: "ne", left: { kind: "var", id: "x" }, right: { kind: "int", value: 3 } } }];
    const changed = structuredClone(original);
    if (field === "goal") changed.goal.proposition.right = { kind: "int", value: 0 };
    if (field === "variables") changed.variables[0].type = "int";
    if (field === "assumptions") changed.assumptions = [];
    if (field === "policy") changed.policy.allowed_rules = [];
    if (field === "request_id") changed.request_id = "another-lesson";
    const job = { version: "0.1", problem_binding_sha256: "a".repeat(64),
      rpc: { protocol_version: "0.1", op: "new_text_request", request_id: original.request_id } };
    let calls = 0;
    const options = { fetchImpl: async (_, opts) => {
      assert.equal(JSON.parse(opts.body).op, "new_text_request"); calls++;
      return reply({ request: { ...original, steps: [] } });
    } };
    await assert.rejects(assertFormalSessionForJob({ ...session(), request: changed }, job, options), /authored theorem/);
    assert.equal(calls, 1);
  });
}

test("authored-context comparison preserves legitimate local proof scopes", async () => {
  const original = requestFixture();
  const request = structuredClone(original);
  request.scopes.push({ id: "local", parent: "root", binders: [] });
  request.assumptions.push({ id: "local_h", scope: "local", claim: original.goal.proposition });
  const job = { version: "0.1", problem_binding_sha256: "a".repeat(64),
    rpc: { protocol_version: "0.1", op: "new_text_request", request_id: original.request_id } };
  assert.equal(await assertFormalSessionForJob({ ...session(), request }, job,
    { fetchImpl: async () => reply({ request: original }) }), true);
});
