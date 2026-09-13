// Transport mocks ONLY. These exercise application contracts; they do not run Lean.
import { readFileSync } from "node:fs";
import { createQuickMathsStore, normalizeFormalProofSpec } from "../challenge-core.js";
import { buildBoundFormalJob } from "../formal-binding.js";
import { FORMAL_ENVIRONMENT, formalRequestHash } from "../formal-proof-trust.js";
import { requestFixture, mockVerification, mockProgress } from "./formal-fixtures.js";
export const SECRET = "HIDDEN_REFERENCE_SENTINEL_DO_NOT_EXPOSE";
export const SKILL = "MATH_ARITH_001";
export function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}
export function formalCurriculum() {
  const curriculum = JSON.parse(readFileSync(new URL("../curriculum-data.json", import.meta.url), "utf8"));
  const skill = curriculum.skills.find((row) => row.id === SKILL);
  const problem = structuredClone(skill.problems[0]);
  Object.assign(problem, { template_id: "FORMAL_TRUST_DEMO", skill_id: SKILL, seed: 1, values: {},
    prompt: "Let x be real. Show that x = x.", grading_method: "exact_text", expected_answer: SECRET,
    solution_steps: [SECRET], accepted_forms: [SECRET], options: [], answer_mode: "final_only", work_required: false, work: { mode: "none" },
    proof_spec: normalizeFormalProofSpec({ version: "0.1", statement: { declarations: ["x:real"], assumptions: [], goal: "x = x" },
      allowed_rules: ["eq_refl"], reference_proof: { mode: "steps", steps: [{ claim: SECRET, rule: "eq_refl" }] },
      environment: { backend: "lean4", library: "mathlib", toolchain: FORMAL_ENVIRONMENT.lean_toolchain, library_revision: FORMAL_ENVIRONMENT.mathlib_revision } }) });
  problem.formal_job = buildBoundFormalJob(problem);
  skill.problems = [problem]; skill.native_templates = []; skill.question_count = 1;
  return curriculum;
}
export function mockCompanion({ unavailable = false, before = async () => {}, mutateVerification = (value) => value } = {}) {
  const calls = [];
  const state = (request) => ({ request_hash: formalRequestHash(request), goal: "x = x", kernel_ready: request.steps.length > 0,
    goal_established: request.steps.length > 0, status: "ready_for_kernel", context: [],
    steps: request.steps.map((step) => ({ step_id: step.id, scope: step.scope, claim: "x = x", rule: step.rule,
      premises: step.premises, parameters: step.parameters, status: "candidate_ready" })),
    obligations: [], suggestions: [], reference_proof: SECRET, strategy: SECRET });
  const fetchImpl = async (url, init = {}) => {
    if (String(url).endsWith("/health")) return { ok: true, json: async () => ({ service: "quickmaths-formal", protocol_version: "0.1", lean_available: !unavailable,
      environment: { backend: "lean4", library: "mathlib", ...FORMAL_ENVIRONMENT } }) };
    const rpc = JSON.parse(init.body);
    calls.push(structuredClone(rpc));
    await before(rpc);
    let result;
    if (rpc.op === "new_text_request") {
      const request = { ...requestFixture(), request_id: rpc.request_id, steps: [], policy: { ...requestFixture().policy, allowed_rules: rpc.allowed_rules, max_seconds: rpc.max_seconds } };
      result = { request, proof_state: state(request) };
    } else if (rpc.op === "append_text_step") {
      const request = structuredClone(rpc.request);
      request.steps.push({ ...requestFixture().steps[0], id: `user_step_${request.steps.length + 1}`, rule: rpc.rule, premises: rpc.premises });
      result = { request, proof_state: state(request) };
    } else if (rpc.op === "replace_text_step") {
      const request = structuredClone(rpc.request);
      Object.assign(request.steps.find((step) => step.id === rpc.step_id), { rule: rpc.rule, premises: rpc.premises });
      result = { request, proof_state: state(request) };
    } else if (rpc.op === "state") result = state(rpc.request);
    else if (rpc.op === "check_progress") result = unavailable
      ? { request_hash: formalRequestHash(rpc.request), proof_state: state(rpc.request), status: "verification_unavailable", assessment_eligible: false, verified_step_ids: [], checked_prefixes: [], blocked_step_id: null }
      : { ...mockProgress(rpc.request), proof_state: state(rpc.request) };
    else if (["check", "replay"].includes(rpc.op)) result = unavailable ? { status: "verification_unavailable", certificate: null }
      : mutateVerification(mockVerification(rpc.request));
    else throw new Error(`Unexpected mock RPC: ${rpc.op}`);
    return { ok: true, json: async () => ({ protocol_version: "0.1", ok: true, result }) };
  };
  return { fetchImpl, calls };
}
export function makeFormalStore(options = {}) {
  const curriculum = options.curriculum ?? formalCurriculum();
  const storage = options.storage ?? memoryStorage();
  const companion = options.companion ?? mockCompanion();
  const store = createQuickMathsStore({ curriculum, storage, formalOptions: { fetchImpl: companion.fetchImpl } });
  const profile = store.createProfile("Proof learner");
  store.completeTutorial({ skipped: true });
  const draft = store.startTest(SKILL);
  const questionId = draft.problems[0].template_id;
  return { store, profile, questionId, storage, curriculum, companion };
}
export async function candidate(fixture) {
  await fixture.store.runFormalProof(fixture.questionId, "start");
  await fixture.store.runFormalProof(fixture.questionId, "append", { claim: "x = x", rule: "eq_refl", premises: [] });
}
export const reflection = { confidenceRating: 5, difficultyFelt: "easy", hintsUsed: "none", guessed: "no", wantsMorePractice: "no" };
