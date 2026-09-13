const HEX64 = /^[a-f0-9]{64}$/;
const EVIDENCE_VERSION = "0.1";
const MAX_PROOF_ARTIFACT_CHARS = 100_000;
const MAX_REQUEST_CHARS = 100_000;

function text(value, name, maxLength = 2000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${name} is invalid.`);
  return value.trim();
}

function digest(value, name) {
  const result = text(value, name, 64);
  if (!HEX64.test(result)) throw new Error(`${name} must be a SHA-256 digest.`);
  return result;
}

function cloneBounded(value, name, maxChars) {
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch { throw new Error(`${name} is not serializable.`); }
  if (!serialized || serialized.length > maxChars) throw new Error(`${name} is too large to preserve in the browser evidence archive.`);
  return JSON.parse(serialized);
}

function environment(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Formal certificate environment is invalid.");
  return {
    lean_toolchain: text(candidate.lean_toolchain, "Formal Lean toolchain", 200),
    // Git object IDs are SHA-1 (40 hex) or SHA-256 (64 hex), not proof digests.
    mathlib_revision: (() => {
      const revision = text(candidate.mathlib_revision, "Formal mathlib revision", 64);
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) throw new Error("Formal mathlib revision must be a Git commit ID.");
      return revision;
    })(),
  };
}

function certificate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Formal certificate is missing.");
  if (candidate.certificate_version !== "0.2") throw new Error("Formal certificate version must be 0.2.");
  if (typeof candidate.proof_artifact !== "string" || !candidate.proof_artifact || candidate.proof_artifact.length > MAX_PROOF_ARTIFACT_CHARS) throw new Error("Formal proof artifact is invalid.");
  const proofArtifact = candidate.proof_artifact;
  const axioms = Array.isArray(candidate.axioms)
    ? candidate.axioms.map((item) => text(item, "Formal axiom", 300)).slice(0, 100)
    : (() => { throw new Error("Formal certificate axiom audit is invalid."); })();
  const elapsedMs = Number(candidate.elapsed_ms);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Formal certificate elapsed time is invalid.");
  return {
    certificate_version: "0.2",
    verifier_version: text(candidate.verifier_version, "Formal verifier version", 100),
    verified_at: text(candidate.verified_at, "Formal verification time", 80),
    request_hash: digest(candidate.request_hash, "Formal certificate request hash"),
    statement_hash: digest(candidate.statement_hash, "Formal certificate statement hash"),
    submission_hash: digest(candidate.submission_hash, "Formal certificate submission hash"),
    lean_source_hash: digest(candidate.lean_source_hash, "Formal Lean source hash"),
    proof_artifact: proofArtifact,
    proof_mode: text(candidate.proof_mode, "Formal proof mode", 80),
    axioms,
    environment: environment(candidate.environment),
    elapsed_ms: elapsedMs,
    certificate_digest: digest(candidate.certificate_digest, "Formal certificate digest"),
  };
}

export function buildFormalEvidenceRecord({ profileId, skillId, questionId, problemBindingSha256, request, verification, recordedAt = new Date().toISOString() }) {
  if (!verification || verification.status !== "verified") throw new Error("Only kernel-verified results can enter the formal evidence archive.");
  const cert = certificate(verification.certificate);
  if (cert.proof_mode !== "submitted") throw new Error("Only a complete learner-submitted proof can enter the assessment evidence archive.");
  const requestHash = digest(verification.request_hash ?? cert.request_hash, "Formal verification request hash");
  const statementHash = digest(verification.statement_hash ?? cert.statement_hash, "Formal verification statement hash");
  if (requestHash !== cert.request_hash || statementHash !== cert.statement_hash) throw new Error("Formal verification hashes do not match the certificate.");
  const binding = digest(problemBindingSha256, "Formal problem binding");
  const normalizedRequest = cloneBounded(request, "Formal proof request", MAX_REQUEST_CHARS);
  if (normalizedRequest?.request_id !== `quickmaths:${binding}`) throw new Error("Formal proof request does not match the displayed problem binding.");
  return {
    version: EVIDENCE_VERSION,
    evidenceId: `formal:${cert.certificate_digest}`,
    profileId: text(profileId, "Formal evidence profile ID", 100),
    skillId: text(skillId, "Formal evidence skill ID", 120),
    questionId: text(questionId, "Formal evidence question ID", 120),
    problemBindingSha256: binding,
    requestHash,
    statementHash,
    submissionHash: cert.submission_hash,
    certificateDigest: cert.certificate_digest,
    request: normalizedRequest,
    certificate: cert,
    verifiedAt: cert.verified_at,
    recordedAt: text(recordedAt, "Formal evidence record time", 80),
  };
}

export function normalizeFormalEvidenceRecord(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new Error("Formal evidence record must be an object.");
  if (candidate.version !== EVIDENCE_VERSION) throw new Error(`Formal evidence version must be ${EVIDENCE_VERSION}.`);
  const cert = certificate(candidate.certificate);
  const certificateDigest = digest(candidate.certificateDigest, "Formal evidence certificate digest");
  if (certificateDigest !== cert.certificate_digest) throw new Error("Formal evidence certificate digest does not match its certificate.");
  const evidenceId = text(candidate.evidenceId, "Formal evidence ID", 80);
  if (evidenceId !== `formal:${certificateDigest}`) throw new Error("Formal evidence ID does not match its certificate digest.");
  const requestHash = digest(candidate.requestHash, "Formal evidence request hash");
  const statementHash = digest(candidate.statementHash, "Formal evidence statement hash");
  const submissionHash = digest(candidate.submissionHash, "Formal evidence submission hash");
  if (requestHash !== cert.request_hash || statementHash !== cert.statement_hash || submissionHash !== cert.submission_hash) {
    throw new Error("Formal evidence hashes do not match its certificate.");
  }
  const binding = digest(candidate.problemBindingSha256, "Formal evidence problem binding");
  const request = cloneBounded(candidate.request, "Formal proof request", MAX_REQUEST_CHARS);
  if (request?.request_id !== `quickmaths:${binding}`) throw new Error("Formal evidence request does not match its problem binding.");
  return {
    version: EVIDENCE_VERSION,
    evidenceId,
    profileId: text(candidate.profileId, "Formal evidence profile ID", 100),
    skillId: text(candidate.skillId, "Formal evidence skill ID", 120),
    questionId: text(candidate.questionId, "Formal evidence question ID", 120),
    problemBindingSha256: binding,
    requestHash,
    statementHash,
    submissionHash,
    certificateDigest,
    request,
    certificate: cert,
    verifiedAt: text(candidate.verifiedAt ?? cert.verified_at, "Formal evidence verification time", 80),
    recordedAt: text(candidate.recordedAt, "Formal evidence record time", 80),
  };
}

export function formalEvidenceReceipt(record) {
  const evidence = normalizeFormalEvidenceRecord(record);
  return {
    evidence_id: evidence.evidenceId,
    problem_binding_sha256: evidence.problemBindingSha256,
    request_hash: evidence.requestHash,
    statement_hash: evidence.statementHash,
    submission_hash: evidence.submissionHash,
    certificate_digest: evidence.certificateDigest,
    verified_at: evidence.verifiedAt,
  };
}
