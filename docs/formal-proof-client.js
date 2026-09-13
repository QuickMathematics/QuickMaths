import { assertFormalCertificate, formalRequestHash, validateFormalProgress } from "./formal-proof-trust.js?v=20260913-formal-kernel-v1";
import { normalizeFormalEvidenceRecord } from "./formal-evidence.js?v=20260913-formal-kernel-v1";
const DEFAULT_BASE_URL = "http://127.0.0.1:8765";
const MAX_RPC_BYTES = 1_000_000;
const PROTOCOL_VERSION = "0.1";
const SERVICE_NAME = "quickmaths-formal";

function cleanBaseUrl(value = DEFAULT_BASE_URL) {
  const url = new URL(String(value));
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (!local || !["http:", "https:"].includes(url.protocol)) throw new Error("Formal verifier URL must use a loopback http(s) address.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function jobContract(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("Formal job is missing.");
  if (job.version !== "0.1") throw new Error("Formal job version must be 0.1.");
  if (typeof job.problem_binding_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(job.problem_binding_sha256)) throw new Error("Formal job has an invalid problem binding.");
  if (!job.rpc || typeof job.rpc !== "object" || Array.isArray(job.rpc)) throw new Error("Formal job RPC is missing.");
  if (job.rpc.protocol_version !== PROTOCOL_VERSION) throw new Error("Formal verifier protocol version mismatch.");
  if (job.rpc.op !== "new_text_request") throw new Error("Learner formal jobs must start with new_text_request.");
  if (job.rpc.request_id !== `quickmaths:${job.problem_binding_sha256}`) throw new Error("Formal request ID does not match the problem binding.");
  return job;
}

function referenceJobContract(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) throw new Error("Formal reference job is missing.");
  if (job.version !== "0.1") throw new Error("Formal reference job version must be 0.1.");
  if (!job.rpc || typeof job.rpc !== "object" || Array.isArray(job.rpc)) throw new Error("Formal reference RPC is missing.");
  if (job.rpc.protocol_version !== PROTOCOL_VERSION) throw new Error("Formal verifier protocol version mismatch.");
  if (!["check_reference_text", "prove_text"].includes(job.rpc.op)) throw new Error("Formal reference job must check submitted steps or bounded search.");
  return job;
}

function runtimeCompatibility(requirements, health) {
  const issues = [];
  if (!health || typeof health !== "object" || Array.isArray(health)) {
    return { compatible: false, kernelAvailable: false, issues: ["Verifier health response is invalid."] };
  }
  if (health.service !== SERVICE_NAME) issues.push("Verifier service identity does not match QuickMaths formal verifier.");
  if (health.protocol_version !== PROTOCOL_VERSION) issues.push(`Verifier protocol must be ${PROTOCOL_VERSION}.`);
  const environment = health.environment && typeof health.environment === "object" && !Array.isArray(health.environment) ? health.environment : {};
  if (!health.environment || typeof health.environment !== "object") issues.push("Verifier did not report its formal environment.");
  const comparisons = [
    ["backend", "backend"],
    ["toolchain", "lean_toolchain"],
    ["library", "library"],
    ["library_revision", "mathlib_revision"],
  ];
  for (const [requiredKey, runtimeKey] of comparisons) {
    if (requirements?.[requiredKey] && environment[runtimeKey] !== requirements[requiredKey]) {
      issues.push(`Verifier ${requiredKey} does not match required value ${JSON.stringify(requirements[requiredKey])}.`);
    }
  }
  return { compatible: issues.length === 0, kernelAvailable: Boolean(health.lean_available) && issues.length === 0, issues, environment };
}

export function formalRuntimeCompatibility(job, health) {
  const validJob = jobContract(job);
  return runtimeCompatibility(validJob.environment_requirements ?? {}, health);
}

async function jsonFetch(fetchImpl, url, { timeoutMs = 15_000, ...options } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 90_000) throw new Error("Formal request timeout must be 1 to 90000 ms.");
  const abort = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, signal: abort.signal });
        let payload;
        try { payload = await response.json(); }
        catch { throw new Error("Formal verifier returned invalid JSON."); }
        if (!response.ok) throw new Error(payload?.error?.message ?? `Formal verifier returned HTTP ${response.status}.`);
        return payload;
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => {
        reject(new Error("Formal verifier timed out. Your draft is preserved; retry when the companion is available."));
        abort.abort();
      }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function getFormalHealth({ fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, timeoutMs = 5_000 } = {}) {
  return jsonFetch(fetchImpl, `${cleanBaseUrl(baseUrl)}/health`, { method: "GET", cache: "no-store", timeoutMs });
}

export async function callFormalRpc(rpc, { fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, timeoutMs } = {}) {
  if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) throw new Error("Formal RPC must be an object.");
  const body = JSON.stringify(rpc);
  if (new TextEncoder().encode(body).length > MAX_RPC_BYTES) throw new Error("Formal RPC exceeds the 1 MB request limit.");
  const seconds = Number(rpc.request?.policy?.max_seconds ?? rpc.max_seconds ?? 30);
  const budget = Number.isFinite(seconds) ? Math.max(15_000, Math.min(75_000, seconds * 1000 + 5_000)) : 15_000;
  const payload = await jsonFetch(fetchImpl, `${cleanBaseUrl(baseUrl)}/v1/rpc`, {
    method: "POST", cache: "no-store", timeoutMs: timeoutMs ?? budget,
    headers: { "Content-Type": "application/json" }, body,
  });
  if (payload.protocol_version !== PROTOCOL_VERSION) throw new Error("Formal verifier response protocol mismatch.");
  if (payload.ok !== true) throw new Error(payload?.error?.message ?? "Formal verifier rejected the request.");
  return payload.result;
}

export async function startFormalProof(job, options = {}) {
  const validJob = jobContract(job);
  const health = await getFormalHealth(options);
  const compatibility = formalRuntimeCompatibility(validJob, health);
  if (!compatibility.compatible) throw new Error(compatibility.issues.join(" "));
  const result = await callFormalRpc(validJob.rpc, options);
  if (!result?.request || !result?.proof_state) throw new Error("Formal verifier returned an incomplete proof session.");
  return {
    version: "0.1",
    problemBindingSha256: validJob.problem_binding_sha256,
    request: result.request,
    proofState: result.proof_state,
    kernelAvailable: compatibility.kernelAvailable,
    verification: null,
  };
}

// A request ID is a label, not proof that an imported draft still has the
// authored theorem. Re-parse the current bound lesson in the existing companion;
// compare only its immutable root context so legitimate local subproofs survive.
export async function assertFormalSessionForJob(session, job, options = {}) {
  const validJob = jobContract(job);
  if (!session?.request || session.problemBindingSha256 !== validJob.problem_binding_sha256) {
    throw new Error("The proof draft does not belong to this lesson instance.");
  }
  const fresh = await callFormalRpc(validJob.rpc, options);
  if (!fresh?.request) throw new Error("The verifier did not return the authored theorem meaning.");
  const authoredContext = (request) => ({
    version: request.version, request_id: request.request_id, variables: request.variables,
    goal: request.goal, policy: request.policy,
    assumptions: request.assumptions.filter((row) => row.scope === "root"),
    scopes: request.scopes.filter((row) => row.id === "root"),
  });
  if (fresh.request.request_id !== validJob.rpc.request_id
      || formalRequestHash(authoredContext(fresh.request)) !== formalRequestHash(authoredContext(session.request))) {
    throw new Error("This draft changed the authored theorem, domains, assumptions, or rule policy. Start a fresh proof for this lesson.");
  }
  return true;
}

export async function checkFormalReferenceProof(job, options = {}) {
  const validJob = referenceJobContract(job);
  const health = await getFormalHealth(options);
  const compatibility = runtimeCompatibility(validJob.environment_requirements ?? {}, health);
  if (!compatibility.compatible) throw new Error(compatibility.issues.join(" "));
  const result = await callFormalRpc(validJob.rpc, options);
  if (!result?.verification) throw new Error("Formal verifier returned an incomplete reference-proof result.");
  const verification = result.verification;
  if (verification.status === "verified") assertFormalCertificate(verification, verification.resolved_request ?? result.request, validJob.rpc.op === "prove_text" ? "assisted" : "reference");
  return {
    version: "0.1",
    kernelAvailable: compatibility.kernelAvailable,
    kernelVerified: verification.status === "verified" && Boolean(verification.certificate),
    proofState: result.proof_state ?? null,
    request: result.request ?? null,
    verification,
  };
}

export async function appendFormalStep(session, input, options = {}) {
  if (!session?.request || !session?.problemBindingSha256) throw new Error("Formal proof session is not initialized.");
  const claim = String(input?.claim ?? "").trim();
  const rule = String(input?.rule ?? "").trim();
  if (!claim) throw new Error("Enter the claim established by this step.");
  if (!rule) throw new Error("Choose or enter the rule used by this step.");
  const premises = Array.isArray(input?.premises) ? input.premises.map((item) => String(item).trim()).filter(Boolean) : [];
  const parameters = input?.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters) ? input.parameters : {};
  const result = await callFormalRpc({
    protocol_version: PROTOCOL_VERSION,
    op: "append_text_step",
    request: session.request,
    claim,
    rule,
    premises,
    parameters,
    scope: String(input?.scope ?? "root"),
  }, options);
  if (!result?.request || !result?.proof_state) throw new Error("Formal verifier returned an incomplete step result.");
  return { ...session, request: result.request, proofState: result.proof_state, verification: null, kernelVerified: false, progress: null, pendingEdit: null };
}

export async function verifyFormalProof(session, options = {}) {
  if (session?.pendingEdit) throw new Error("Save the edited step before verifying the proof.");
  if (!session?.request || !session?.problemBindingSha256) throw new Error("Formal proof session is not initialized.");
  const verification = await callFormalRpc({
    protocol_version: PROTOCOL_VERSION,
    op: "check",
    request: session.request,
  }, options);
  if (verification?.status === "verified") assertFormalCertificate(verification, session.request);
  const verified = verification?.status === "verified";
  const proofState = await freshFormalState(session.request, options);
  return { ...session, proofState, verification, kernelVerified: verified };
}


async function freshFormalState(request, options) {
  const state = await callFormalRpc({ protocol_version: PROTOCOL_VERSION, op: "state", request }, options);
  if (state?.request_hash !== formalRequestHash(request)) throw new Error("Formal proof-state response is stale.");
  return state;
}

export async function checkFormalProgress(session, options = {}) {
  if (!session?.request) throw new Error("Start the formal proof session first.");
  if (session.pendingEdit) throw new Error("Save the edited step before checking its reasoning.");
  const result = await callFormalRpc({ protocol_version: PROTOCOL_VERSION, op: "check_progress", request: session.request }, options);
  const progress = validateFormalProgress(result, session.request);
  return { ...session, proofState: progress.proof_state, progress };
}

export function beginFormalStepEdit(session, stepId) {
  const step = session?.request?.steps?.find((row) => row.id === stepId);
  const report = session?.proofState?.steps?.find((row) => row.step_id === stepId);
  if (!step || !report) throw new Error("This proof step is no longer available to edit.");
  return {
    ...session, verification: null, kernelVerified: false, progress: null,
    pendingEdit: { step_id: stepId, claim: report.claim, rule: step.rule, premises: [...step.premises],
      parameter: String(Object.values(report.parameters ?? {})[0] ?? "") },
  };
}

export async function replaceFormalStep(session, input, options = {}) {
  if (!session?.request || !session?.pendingEdit) throw new Error("Choose a proof step to edit first.");
  const claim = String(input?.claim ?? "").trim();
  const rule = String(input?.rule ?? "").trim();
  if (!claim || !rule) throw new Error("Enter a claim and its justification before saving.");
  const result = await callFormalRpc({
    protocol_version: PROTOCOL_VERSION, op: "replace_text_step", request: session.request,
    step_id: session.pendingEdit.step_id, claim, rule,
    premises: input.premises ?? [], parameters: input.parameters ?? {},
  }, options);
  if (!result?.request || !result?.proof_state) throw new Error("Formal verifier returned an incomplete edit result.");
  return { ...session, request: result.request, proofState: result.proof_state,
    verification: null, kernelVerified: false, progress: null, pendingEdit: null };
}


export async function replayFormalEvidence(record, options = {}) {
  const evidence = normalizeFormalEvidenceRecord(record);
  const health = await getFormalHealth(options);
  if (health?.service !== SERVICE_NAME || health?.protocol_version !== PROTOCOL_VERSION) throw new Error("Formal verifier identity or protocol does not match the archived certificate.");
  const runtime = health?.environment ?? {};
  if (runtime.lean_toolchain !== evidence.certificate.environment.lean_toolchain || runtime.mathlib_revision !== evidence.certificate.environment.mathlib_revision) {
    throw new Error("Formal verifier environment does not match the archived certificate.");
  }
  const result = await callFormalRpc({
    protocol_version: PROTOCOL_VERSION,
    op: "replay",
    request: evidence.request,
    certificate: evidence.certificate,
  }, options);
  if (result?.status === "verified") assertFormalCertificate(result, evidence.request, evidence.certificate.proof_mode);
  const proofState = await freshFormalState(evidence.request, options);
  return {
    ...result,
    proofState,
    evidenceId: evidence.evidenceId,
    certificateDigest: evidence.certificateDigest,
    kernelVerified: result?.status === "verified" && Boolean(result?.certificate),
  };
}

export function formalDraftEvidence(session) {
  if (!session?.request || !session?.problemBindingSha256) return null;
  const verification = session.verification ? {
    status: String(session.verification.status ?? ""),
    proof_mode: String(session.verification.proof_mode ?? ""),
    // The full proof artifact/certificate belongs in the evidence store, not
    // the ordinary browser draft blob. A verified receipt is preserved only
    // as a binding-friendly digest here until the evidence store lands.
    certificate_digest: session.verification.certificate?.certificate_digest ?? session.verification.certificate?.digest ?? null,
  } : null;
  return {
    version: "0.1",
    problem_binding_sha256: session.problemBindingSha256,
    request: session.request,
    proof_state: session.proofState,
    kernel_available: Boolean(session.kernelAvailable),
    verification: session.pendingEdit ? null : verification,
    pending_edit: session.pendingEdit ?? null,
  };
}

export { DEFAULT_BASE_URL as DEFAULT_FORMAL_BASE_URL };
