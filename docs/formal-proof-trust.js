// Consistency checks for FRESH responses from the local Lean companion.
// Hashes do not prove mathematics or authenticate a compromised companion.
// Imported JSON must never enter the live progress cache through this module.
import { canonicalFormalJson, sha256Hex } from "./formal-binding.js?v=20260913-formal-kernel-v1";

export const FORMAL_ENVIRONMENT = Object.freeze({
  lean_toolchain: "leanprover/lean4:v4.34.0-rc2",
  mathlib_revision: "42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c",
});
const AXIOMS = new Set(["propext", "Classical.choice", "Quot.sound"]);
export const formalRequestHash = (request) => sha256Hex(canonicalFormalJson(request));
const same = (left, right) => canonicalFormalJson(left) === canonicalFormalJson(right);

export function assertFormalCertificate(verification, request, mode = "submitted") {
  const cert = verification?.certificate;
  const fail = () => { throw new Error("Formal certificate does not match this exact proof, mode, or pinned environment."); };
  if (verification?.status !== "verified" || !cert || cert.certificate_version !== "0.2") fail();
  const requestHash = formalRequestHash(request);
  if (verification.request_hash !== requestHash || cert.request_hash !== requestHash) fail();
  const statementHash = formalRequestHash(request.goal);
  if (verification.statement_hash !== statementHash || cert.statement_hash !== statementHash) fail();
  if (cert.submission_hash !== formalRequestHash({ assumptions: request.assumptions, steps: request.steps })) fail();
  if (verification.proof_mode !== mode || cert.proof_mode !== mode) fail();
  if (!same(cert.environment, FORMAL_ENVIRONMENT)) fail();
  if (!Array.isArray(cert.axioms) || cert.axioms.some((axiom) => !AXIOMS.has(axiom))) fail();
  if (typeof cert.proof_artifact !== "string" || !cert.proof_artifact || cert.proof_artifact.length > 100_000) fail();
  if (cert.lean_source_hash !== sha256Hex(cert.proof_artifact)) fail();
  const { certificate_digest: digest, ...payload } = cert;
  if (digest !== formalRequestHash(payload)) fail();
  if (verification.resolved_request && !same(verification.resolved_request, request)) fail();
  return cert;
}

export function validateFormalProgress(result, request) {
  if (result?.request_hash !== formalRequestHash(request) || result?.proof_state?.request_hash !== result.request_hash || result?.assessment_eligible !== false
      || !Array.isArray(result.checked_prefixes) || result.checked_prefixes.length > 12
      || !Array.isArray(result.verified_step_ids)) {
    throw new Error("Progress response does not match the current proof request.");
  }
  const roots = request.steps.filter((step) => step.scope === "root");
  const verified = [];
  let blocked = false;
  for (const [index, row] of result.checked_prefixes.entries()) {
    if (blocked || row.step_id !== roots[index]?.id) throw new Error("Progress response skipped an unresolved step.");
    if (row.status !== "verified") { blocked = true; continue; }
    const end = request.steps.findIndex((step) => step.id === row.step_id);
    const prefix = row.request;
    if (!prefix?.policy || !Number.isInteger(prefix.policy.max_seconds)
        || prefix.policy.max_seconds < 1 || prefix.policy.max_seconds > request.policy.max_seconds) {
      throw new Error("Progress response changed the proof budget.");
    }
    const expected = {
      ...request, steps: request.steps.slice(0, end + 1), goal: request.steps[end].claim,
      policy: { ...request.policy, max_seconds: prefix.policy.max_seconds },
    };
    if (!same(prefix, expected)) throw new Error("Progress response changed a theorem, domain, assumption, or proof step.");
    assertFormalCertificate({ ...row, statement_hash: row.certificate?.statement_hash, proof_mode: "progress" }, prefix, "progress");
    verified.push(row.step_id);
  }
  if (!same(verified, result.verified_step_ids)) throw new Error("Progress response has uncertified step badges.");
  return structuredClone(result);
}

// Scope async work to a profile, attempt and exact revision, not a template ID.
export function formalWorkspaceIdentity(snapshot, problem, evidence = null) {
  return canonicalFormalJson({
    profile: snapshot.activeProfile?.id ?? null,
    draft: snapshot.activeTest?.draftId ?? null,
    question: problem.template_id,
    binding: problem.formal_job?.problem_binding_sha256 ?? null,
    request: evidence?.request ? formalRequestHash(evidence.request) : null,
    pending_edit: evidence?.pending_edit ?? null,
    proof_state: evidence?.proof_state ? formalRequestHash(evidence.proof_state) : null,
  });
}
