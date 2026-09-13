import test from "node:test";
import assert from "node:assert/strict";
import { createQuickMathsStore, gradeProblem, normalizeFormalProofSpec } from "./challenge-core.js";
import { formalRequestHash } from "./formal-proof-trust.js";
import { buildToolDefinitions, TOOL_NAMES } from "./webmcp-tools.js";
import { renderFormalWorkspace } from "./formal-proof-workspace.js";
import { mockVerification } from "./test-support/formal-fixtures.js";
import { makeFormalStore, mockCompanion, candidate, reflection, SECRET, SKILL } from "./test-support/formal-learning-fixtures.js";
const toolsFor = (store) => Object.fromEntries(buildToolDefinitions(store).map((tool) => [tool.name, tool]));
const draftResponse = (f) => f.store.snapshot().activeTest.responses[f.questionId];

test("formal answers cannot pass through the legacy text grader or a forged status", () => {
  const f = makeFormalStore();
  const problem = f.store.snapshot().activeTest.problems[0];
  assert.equal(gradeProblem(problem, SECRET, { formal: { status: "verified" } }).correct, false);
  f.store.updateResponse(f.questionId, { finalAnswer: SECRET, work: "correct", structuredWorkJson: { formal: { verification: { status: "verified" } } } });
  const result = f.store.submitTest();
  assert.equal(result.ok, false);
  assert.match(result.workIssues[0].message, /Lean/);
  assert.equal(f.store.snapshot().attempts.length, 0);
});

test("mock-transport contract: learner proof → reference-free tutor → final certificate → mastery", async () => {
  const f = makeFormalStore(); await candidate(f);
  const tools = toolsFor(f.store);
  const view = await tools.inspect_formal_proof.execute({ question_id: f.questionId });
  assert.deepEqual(view.verified_step_ids, []);
  assert.equal(view.assessment_eligible, false);
  assert.equal(JSON.stringify(view).includes(SECRET), false);
  assert.equal(JSON.stringify(await tools.get_learning_context.execute({})).includes(SECRET), false);
  assert.equal(JSON.stringify(await tools.inspect_student_work.execute({ question_id: f.questionId })).includes(SECRET), false);
  const guided = await tools.record_formal_guidance.execute({ question_id: f.questionId, proof_revision: view.proof_revision, guidance_id: view.guidance_options[0].id });
  assert.equal(guided.assessment_effect, "none");
  assert.equal(f.store.submitTest().ok, false);
  await f.store.runFormalProof(f.questionId, "verify");
  assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, true);
  const submitted = f.store.submitTest();
  assert.equal(submitted.ok, true);
  assert.equal(submitted.results.results[0].gradingMethod, "formal_proof");
  assert.equal(submitted.results.results[0].expectedAnswer, "");
  assert.deepEqual(submitted.results.results[0].solutionSteps, []);
  const attempt = f.store.saveReflection(reflection);
  assert.equal(attempt.hasPendingReview, false);
  assert.equal(attempt.masteryUpdate.status, "proven");
  assert.equal(attempt.results[0].formalAssessment.authority, "lean4");
  assert.equal(JSON.stringify(f.store.inspectStudentWork({ questionId: f.questionId })).includes(SECRET), false);
  // Only learner inputs, never reference solutions, are sent to the companion.
  assert.equal(JSON.stringify(f.companion.calls).includes(SECRET), false);
});

test("prefix verification informs the tutor but can never grade the complete exercise", async () => {
  const f = makeFormalStore(); await candidate(f);
  await f.store.runFormalProof(f.questionId, "progress");
  const view = f.store.inspectFormalProof({ questionId: f.questionId });
  assert.deepEqual(view.verified_step_ids, ["user_step_1"]);
  assert.equal(view.assessment_eligible, false);
  assert.equal(f.store.submitTest().ok, false);
  assert.match(view.verification_summary, /complete proof is not certified/);
});

test("ordinary lessons remain gradable when the companion is unavailable", () => {
  const f = makeFormalStore({ companion: mockCompanion({ unavailable: true }) });
  f.store.startTest("MATH_ARITH_002", { force: true });
  for (const problem of f.store.snapshot().activeTest.problems) f.store.updateResponse(problem.template_id, {
    finalAnswer: String(problem.expected_answer),
    work: Array.from({ length: Math.max(1, Number(problem.work?.minimum_steps ?? 1)) }, () => String(problem.expected_answer)).join("\n"),
  });
  assert.equal(f.store.submitTest().ok, true);
});

test("unavailable Lean is pending, not a failed learner attempt or a fresh archive flag", async () => {
  const f = makeFormalStore({ companion: mockCompanion({ unavailable: true }) }); await candidate(f);
  await f.store.runFormalProof(f.questionId, "verify");
  assert.equal(f.store.inspectFormalProof({ questionId: f.questionId }).proof_status, "verification_unavailable");
  assert.equal(f.store.submitTest().ok, false);
  assert.equal(f.store.snapshot().attempts.length, 0);
  assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, false);
});

test("raw, even consistently hashed, certificate JSON cannot mint runtime mastery", async () => {
  const f = makeFormalStore(); await candidate(f);
  const evidence = draftResponse(f).structuredWorkJson.formal;
  const receipt = f.store.recordFormalEvidence(f.questionId, evidence.problem_binding_sha256, evidence.request, mockVerification(evidence.request));
  f.store.updateResponse(f.questionId, { ...draftResponse(f), structuredWorkJson: { formal: { ...evidence, verification: { status: "verified", ...receipt } } } });
  assert.equal(f.store.getFormalWorkspace(f.questionId).evidence.verification.status, "replay_required");
  assert.deepEqual(f.store.inspectFormalProof({ questionId: f.questionId }).verified_step_ids, []);
  assert.equal(f.store.submitTest().ok, false);
});

test("stored reports cannot fabricate live verified steps or inject hidden fields into tutor output", async () => {
  const f = makeFormalStore(); await candidate(f);
  const response = draftResponse(f);
  const formal = response.structuredWorkJson.formal;
  formal.proof_state.steps[0].claim = SECRET;
  formal.proof_state.steps[0].status = "verified";
  formal.progress = { verified_step_ids: ["user_step_1"] };
  formal.kernel_available = true;
  f.store.updateResponse(f.questionId, response);
  const view = f.store.inspectFormalProof({ questionId: f.questionId });
  assert.equal(view.proof_state_fresh, false);
  assert.deepEqual(view.verified_step_ids, []);
  assert.equal(view.steps[0].claim, "");
  assert.equal(JSON.stringify(view).includes(SECRET), false);
});

for (const change of ["proof", "pending edit", "display", "answer", "work"]) {
  test(`editing ${change} withdraws final assessment and invalidates the old guidance revision`, async () => {
    const f = makeFormalStore(); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
    const inspected = f.store.inspectFormalProof({ questionId: f.questionId });
    const response = draftResponse(f);
    if (change === "proof") response.structuredWorkJson.formal.request.steps[0].premises = ["user_step_1"];
    if (change === "pending edit") response.structuredWorkJson.formal.pending_edit = { claim: "x = 0" };
    if (change === "display") response.structuredWorkJson.formal.proof_state.steps[0].claim = "x = 0";
    if (change === "answer") response.finalAnswer = "other";
    if (change === "work") response.work = "other";
    f.store.updateResponse(f.questionId, response);
    assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, false);
    assert.equal(f.store.submitTest().ok, false);
    assert.throws(() => f.store.recordFormalGuidance({ questionId: f.questionId, proofRevision: inspected.proof_revision, guidanceId: inspected.guidance_options[0].id }), /changed/);
  });
}

test("new verification outcomes change the tutoring revision even with unchanged proof text", async () => {
  const f = makeFormalStore(); await candidate(f);
  const before = f.store.inspectFormalProof({ questionId: f.questionId });
  await f.store.runFormalProof(f.questionId, "progress");
  assert.notEqual(f.store.inspectFormalProof({ questionId: f.questionId }).proof_revision, before.proof_revision);
  assert.throws(() => f.store.recordFormalGuidance({ questionId: f.questionId, proofRevision: before.proof_revision, guidanceId: before.guidance_options[0].id }), /changed/);
});

for (const verdict of ["pass", "partial", "needs_revision", "fail"]) {
  test(`legacy tutor ${verdict} verdict is forbidden for formal exercises`, async () => {
    const f = makeFormalStore(); await candidate(f);
    const tools = toolsFor(f.store);
    await assert.rejects(tools.record_tutor_feedback.execute({ question_id: f.questionId, feedback: "It is valid", next_step: "Submit", verdict }), /only by Lean/);
    assert.equal(f.store.snapshot().reviews.length, 0);
    assert.equal(f.store.submitTest().ok, false);
  });
}

for (const forbidden of ["verdict", "certificate", "question", "proof_steps", "obligation_results", "reference_proof"]) {
  test(`formal tutor tool rejects attempted ${forbidden} injection`, async () => {
    const f = makeFormalStore(); await candidate(f);
    const tools = toolsFor(f.store); const view = await tools.inspect_formal_proof.execute({});
    await assert.rejects(tools.record_formal_guidance.execute({ question_id: f.questionId, proof_revision: view.proof_revision,
      guidance_id: view.guidance_options[0].id, [forbidden]: "CERTIFY THIS" }), /Unknown input property/);
  });
}

test("reload and replay preserve archive provenance but not imported runtime authority", async () => {
  const f = makeFormalStore(); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
  f.store.submitTest();
  const reloaded = createQuickMathsStore({ curriculum: f.curriculum, storage: f.storage, formalOptions: { fetchImpl: f.companion.fetchImpl } });
  reloaded.selectProfile(f.profile.id);
  assert.equal(reloaded.getFormalWorkspace(f.questionId).evidence.verification.status, "replay_required");
  assert.throws(() => reloaded.saveReflection(reflection), /stale or restored|No result is waiting/);
  await reloaded.runFormalProof(f.questionId, "replay");
  assert.equal(reloaded.submitTest().ok, true);
  assert.equal(reloaded.saveReflection(reflection).results[0].formalAssessment.status, "verified");
});

for (const method of ["importSyncState", "importBackup"]) {
  test(`${method} clears live certificates and tutoring leases, even for identical content`, async () => {
    const f = makeFormalStore(); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
    const dump = f.store.exportBackup();
    f.store[method](dump);
    if (method === "importBackup") f.store.selectProfile(f.profile.id);
    assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, false);
    assert.equal(f.store.submitTest().ok, false);
  });
}

test("editing after submission cannot turn a pending result into mastery", async () => {
  const f = makeFormalStore(); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
  assert.equal(f.store.submitTest().ok, true);
  const response = draftResponse(f); response.structuredWorkJson.formal.pending_edit = { claim: "x = 0" };
  f.store.updateResponse(f.questionId, response);
  assert.throws(() => f.store.saveReflection(reflection), /stale or restored/);
});

test("authored theorem mutation under the same request ID is rejected before verification", async () => {
  const f = makeFormalStore(); await candidate(f);
  const response = draftResponse(f); response.structuredWorkJson.formal.request.variables[0].type = "nat";
  f.store.updateResponse(f.questionId, response);
  await assert.rejects(f.store.runFormalProof(f.questionId, "verify"), /authored theorem, domains/);
  assert.equal(f.store.submitTest().ok, false);
});

test("late verification after edit-and-undo is discarded, not attached to the resurrected revision", async () => {
  let release; let entered;
  const blocked = new Promise((resolve) => { entered = resolve; });
  const companion = mockCompanion({ before: (rpc) => rpc.op === "check" ? new Promise((resolve) => { release = resolve; entered(); }) : Promise.resolve() });
  const f = makeFormalStore({ companion }); await candidate(f);
  const original = draftResponse(f);
  const pending = f.store.runFormalProof(f.questionId, "verify"); await blocked;
  f.store.updateResponse(f.questionId, { ...original, work: "edited" });
  f.store.updateResponse(f.questionId, original);
  release();
  await assert.rejects(pending, /late result was discarded/);
  assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, false);
});

test("late verification after leaving and returning to the same profile is discarded", async () => {
  let release; let enter;
  const blocked = new Promise((resolve) => { enter = resolve; });
  const companion = mockCompanion({ before: (rpc) => rpc.op === "check" ? new Promise((resolve) => { release = resolve; enter(); }) : Promise.resolve() });
  const f = makeFormalStore({ companion }); await candidate(f);
  const pending = f.store.runFormalProof(f.questionId, "verify"); await blocked;
  f.store.createProfile("Other learner"); f.store.selectProfile(f.profile.id); f.store.startTest(SKILL);
  release(); await assert.rejects(pending, /late result was discarded/);
});

test("duplicate concurrent verification is bounded to one request per proof", async () => {
  let release; let enter;
  const blocked = new Promise((resolve) => { enter = resolve; });
  const companion = mockCompanion({ before: (rpc) => rpc.op === "check" ? new Promise((resolve) => { release = resolve; enter(); }) : Promise.resolve() });
  const f = makeFormalStore({ companion }); await candidate(f);
  const first = f.store.runFormalProof(f.questionId, "verify"); await blocked;
  await assert.rejects(f.store.runFormalProof(f.questionId, "verify"), /already running/);
  release(); await first;
  assert.equal(companion.calls.filter((rpc) => rpc.op === "check").length, 1);
});

test("forged verifier statuses with a wrong proof digest never reach assessment", async () => {
  const f = makeFormalStore({ companion: mockCompanion({ mutateVerification: (value) => ({ ...value, certificate: { ...value.certificate, request_hash: "a".repeat(64) } }) }) });
  await candidate(f);
  await assert.rejects(f.store.runFormalProof(f.questionId, "verify"), /certificate does not match/);
  assert.equal(f.store.submitTest().ok, false);
});

for (const mode of ["progress", "reference", "assisted"]) {
  test(`a ${mode} certificate cannot be laundered into learner assessment`, async () => {
    const f = makeFormalStore({ companion: mockCompanion({ mutateVerification: (value) => {
      const certificate = { ...value.certificate, proof_mode: mode }; delete certificate.certificate_digest;
      certificate.certificate_digest = formalRequestHash(certificate);
      return { ...value, proof_mode: mode, certificate };
    } }) });
    await candidate(f);
    await assert.rejects(f.store.runFormalProof(f.questionId, "verify"), /certificate does not match/);
    assert.equal(f.store.submitTest().ok, false);
  });
}

test("proof draft size limit fails explicitly, preserving the previous argument", async () => {
  const f = makeFormalStore(); await candidate(f);
  const before = draftResponse(f);
  assert.throws(() => f.store.updateResponse(f.questionId, { ...before, structuredWorkJson: { formal: { padding: "x".repeat(31_000) } } }), /too large/);
  assert.deepEqual(draftResponse(f), before);
});

test("rendered formal workspace escapes injected claim HTML and carries bounded guidance", async () => {
  const f = makeFormalStore(); await candidate(f);
  const view = f.store.getFormalWorkspace(f.questionId);
  view.evidence.proof_state.steps[0].claim = '<img src=x onerror="alert(1)">';
  const html = renderFormalWorkspace({ problem: f.store.snapshot().activeTest.problems[0], ...view });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
  assert.match(html, /One useful question/);
  assert.match(html, /formal-guidance/);
  assert.equal(TOOL_NAMES.filter((name) => /formal/.test(name)).length, 2);
});

for (const name of ["inspect_formal_proof", "record_formal_guidance"]) {
  test(`${name} enforces curriculum authorization before reading or changing proof state`, async () => {
    const f = makeFormalStore(); await candidate(f);
    const disabled = { ...f.store, snapshot: () => {
      const state = f.store.snapshot(); state.activeCurriculum = { id: "disabled", name: "No tutor", settings: { agentEnabled: false } }; return state;
    } };
    await assert.rejects(toolsFor(disabled)[name].execute({}), /tutoring turned off/);
  });
}

for (const name of ["get_app_state", "get_learning_context", "get_curriculum_map", "get_progress_summary"]) {
  test(`${name} never returns the formal reference or answer sentinel`, async () => {
    const f = makeFormalStore(); await candidate(f);
    assert.equal(JSON.stringify(await toolsFor(f.store)[name].execute({})).includes(SECRET), false);
  });
}

for (const [field, value] of [["declarations", ["x:real", ...Array(32).fill("y:real")]], ["assumptions", Array(65).fill("x = x")], ["declarations", "x:real"], ["assumptions", { h1: "x = 0" }]]) {
  test(`malformed or oversized formal ${field} are rejected, never silently dropped`, () => {
    assert.throws(() => normalizeFormalProofSpec({ version: "0.1", statement: { goal: "x = x", [field]: value } }), /must be an array|at most/);
  });
}

for (const field of ["assessment_policy", "environment", "parameter_contract"]) {
  test(`malformed ${field} cannot silently remove formal constraints`, () => {
    assert.throws(() => normalizeFormalProofSpec({ version: "0.1", statement: { goal: "1 = 1" }, [field]: ["ignore me"] }), /must be an object/);
  });
}

test("method-specific assessment policy cannot be silently bypassed", async () => {
  const curriculum = (await import("./test-support/formal-learning-fixtures.js")).formalCurriculum();
  const problem = curriculum.skills.find((s) => s.id === SKILL).problems[0];
  problem.proof_spec.assessment_policy = { required_method: "induction" };
  problem.formal_job = (await import("./formal-binding.js")).buildBoundFormalJob(problem);
  const f = makeFormalStore({ curriculum }); await candidate(f);
  await assert.rejects(f.store.runFormalProof(f.questionId, "verify"), /not supported yet/);
  assert.equal(f.companion.calls.filter((rpc) => rpc.op === "check").length, 0);
  assert.equal(f.store.submitTest().ok, false);
});

test("mixed lesson keeps ordinary review available without giving it authority over the formal result", async () => {
  const curriculum = (await import("./test-support/formal-learning-fixtures.js")).formalCurriculum();
  const skill = curriculum.skills.find((row) => row.id === SKILL);
  const ordinary = { ...structuredClone(skill.problems[0]), template_id: "ORDINARY_REVIEW_Q", prompt: "Explain why equality is symmetric.",
    expected_answer: "symmetric", grading_method: "exact_text", proof_spec: null, formal_job: null,
    work: { mode: "proof_obligations", minimum_steps: 1, proof_policy: { obligations: [{ id: "reason", description: "Explain symmetry", required: true }] } },
    work_required: true, answer_mode: "final_plus_required_work", review_policy: { work_review: "tutor_required", mastery_requires_review_pass: true } };
  skill.problems.push(ordinary); skill.question_count = 2;
  const f = makeFormalStore({ curriculum }); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
  f.store.updateResponse("ORDINARY_REVIEW_Q", { finalAnswer: "symmetric", work: "If both names denote the same value, reversing the order still denotes that same value." });
  assert.equal(f.store.submitTest().ok, true);
  const attempt = f.store.saveReflection(reflection);
  assert.equal(attempt.hasPendingReview, true);
  const before = attempt.results.find((result) => result.gradingMethod === "formal_proof").formalAssessment;
  f.store.recordTutorFeedback({ questionId: "ORDINARY_REVIEW_Q", feedback: "You explained the symmetry of equality.", nextStep: "Compare this with an inequality.", verdict: "pass", obligationResults: [{ id: "reason", status: "satisfied", note: "Explains equal values." }] });
  assert.equal(f.store.getAttempt().hasPendingReview, false);
  assert.deepEqual(f.store.getAttempt().results.find((result) => result.gradingMethod === "formal_proof").formalAssessment, before);
  assert.throws(() => f.store.recordTutorFeedback({ questionId: f.questionId, feedback: "Pass", nextStep: "Submit", verdict: "pass" }), /only by Lean/);
});

test("native Proof Lab package imports three bound formal lessons without imported correctness", async () => {
  const { readFileSync } = await import("node:fs");
  const pack = JSON.parse(readFileSync(new URL("../examples/formal-proof-lab.lesson-set.json", import.meta.url), "utf8"));
  const f = makeFormalStore();
  const preview = f.store.previewLessonPack(pack);
  assert.equal(preview.skillCount, 3);
  f.store.importLessonPack(pack);
  for (const skill of pack.skills) {
    const draft = f.store.startTest(skill.id, { force: true });
    const problem = draft.problems[0];
    assert.equal(problem.proof_spec.statement.goal, skill.problems[0].proof_spec.statement.goal);
    assert.match(problem.formal_job.problem_binding_sha256, /^[a-f0-9]{64}$/);
    assert.equal(f.store.getFormalWorkspace(problem.template_id).assessmentEligible, false);
    assert.equal(f.store.submitTest().ok, false);
  }
});

test("hung companion leaves proof operations retryable rather than permanently busy", async () => {
  const f = makeFormalStore();
  let hang = true;
  const store = createQuickMathsStore({ curriculum: f.curriculum, storage: f.storage, formalOptions: {
    timeoutMs: 10, fetchImpl: (...args) => hang ? new Promise(() => {}) : f.companion.fetchImpl(...args),
  } });
  store.selectProfile(f.profile.id);
  await assert.rejects(store.runFormalProof(f.questionId, "start"), /timed out/);
  assert.equal(store.getFormalWorkspace(f.questionId).busy, false);
  assert.equal(store.getFormalWorkspace(f.questionId).assessmentEligible, false);
  hang = false;
  await store.runFormalProof(f.questionId, "start");
  assert.ok(store.getFormalWorkspace(f.questionId).evidence.request);
});

for (const payload of ["not a list", { forged: "verified" }, [null, "invalid"]]) {
  test("malformed archived proof display collections cannot crash the lesson or tutor", async () => {
    const f = makeFormalStore(); await candidate(f);
    const response = draftResponse(f);
    const formal = response.structuredWorkJson.formal;
    formal.proof_state.steps = payload;
    formal.proof_state.context = payload;
    formal.proof_state.obligations = payload;
    formal.proof_state.suggestions = payload;
    formal.request.steps = payload;
    formal.pending_edit = { premises: payload };
    f.store.updateResponse(f.questionId, response);
    const view = f.store.getFormalWorkspace(f.questionId);
    const html = renderFormalWorkspace({ problem: f.store.snapshot().activeTest.problems[0], ...view });
    assert.doesNotMatch(html, /class="[^"]*kernel-verified/);
    assert.equal(f.store.submitTest().ok, false);
  });
}

test("failed oversized edit preserves stored proof but withdraws live grading authority", async () => {
  const f = makeFormalStore(); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
  assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, true);
  const before = draftResponse(f);
  assert.throws(() => f.store.updateResponse(f.questionId, { ...before, structuredWorkJson: { formal: { ...before.structuredWorkJson.formal, pending_edit: { claim: "x".repeat(31_000) } } } }), /too large/);
  assert.deepEqual(draftResponse(f), before);
  assert.equal(f.store.getFormalWorkspace(f.questionId).assessmentEligible, false);
  assert.equal(f.store.submitTest().ok, false);
});

test("restored historical formal scores are not presented to the tutor as live correctness", async () => {
  const f = makeFormalStore(); await candidate(f); await f.store.runFormalProof(f.questionId, "verify");
  f.store.submitTest();
  const saved = f.store.saveReflection(reflection);
  const restored = createQuickMathsStore({ curriculum: f.curriculum, storage: f.storage });
  restored.selectProfile(f.profile.id); restored.openAttempt(saved.attemptId);
  const context = await toolsFor(restored).get_learning_context.execute({});
  assert.equal(context.active_attempt.questions[0].final_answer_status, "archived_requires_replay");
  assert.equal(restored.inspectStudentWork({ questionId: f.questionId }).proof_status, "archived_replay_required");
});
