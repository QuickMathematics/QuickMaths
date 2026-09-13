/**
 * One runtime trust owner for the learner UI, WebMCP and assessment.
 * The companion remains trusted; hashes are binding checks, not authentication.
 * Only this closure's fresh RPC results can grant assessment eligibility.
 * Archives, agent input and persisted proof-state flags cannot hydrate it.
 */
import {
  appendFormalStep, assertFormalSessionForJob, beginFormalStepEdit, checkFormalProgress,
  formalDraftEvidence, replaceFormalStep, replayFormalEvidence, startFormalProof, verifyFormalProof,
} from "./formal-proof-client.js?v=20260913-formal-kernel-v1";
import { formalRequestHash } from "./formal-proof-trust.js?v=20260913-formal-kernel-v1";
import { publicFormalProof } from "./formal-tutor.js?v=20260913-formal-kernel-v1";

const clone = (value) => structuredClone(value);
const sessionFrom = (evidence) => ({
  problemBindingSha256: evidence?.problem_binding_sha256,
  request: evidence?.request, proofState: evidence?.proof_state,
  pendingEdit: evidence?.pending_edit ?? null,
  kernelAvailable: evidence?.kernel_available === true,
  verification: null, kernelVerified: false,
});
let runtimeSerial = 0;

export function createFormalLearning({ read, write, archive, getArchive, options = {} }) {
  const runtimeId = `${++runtimeSerial}:${globalThis.crypto?.randomUUID?.() ?? Math.random()}`;
  const live = new Map();
  const busy = new Map();
  const revisions = new Map();
  let generation = 0;
  const key = (item) => JSON.stringify([item.profileId, item.draftId, item.problem.template_id]);
  const identity = (item) => formalRequestHash({
    runtimeId, generation, revision: revisions.get(key(item)) ?? 0,
    profile: item.profileId, draft: item.draftId, question: item.problem.template_id,
    job: item.problem.formal_job,
    request: item.evidence?.request ?? null, pending: item.evidence?.pending_edit ?? null,
    // Imported display text cannot inherit a live badge even with the same AST.
    state: item.evidence?.proof_state ?? null,
  });
  function target(questionId) {
    const item = read(questionId);
    if (!item?.problem?.proof_spec || !item.problem.formal_job) throw new Error("Open a formal question in the active test first.");
    return item;
  }
  function invalidate(questionId) {
    const item = read(questionId);
    if (!item) return;
    const id = key(item);
    revisions.set(id, (revisions.get(id) ?? 0) + 1);
    live.delete(id);
  }
  function clear() { generation += 1; live.clear(); revisions.clear(); }
  function matching(item) {
    const record = live.get(key(item));
    return record?.identity === identity(item) && !item.evidence?.pending_edit ? record : null;
  }
  function display(questionId) {
    const item = target(questionId);
    const record = matching(item);
    const evidence = item.evidence ? clone(item.evidence) : null;
    if (evidence) {
      // Only live proof-state text is used to display live verification.
      if (record?.state) evidence.proof_state = clone(record.state);
      if (record?.receipt) evidence.verification = { status: "verified", proof_mode: "submitted", ...record.receipt };
      else if (evidence.verification) evidence.verification = {
        ...evidence.verification,
        status: evidence.verification.evidence_id ? "replay_required" : evidence.verification.status === "verified" ? "needs_justification" : evidence.verification.status,
      };
      if (evidence.pending_edit) evidence.verification = null;
    }
    return { evidence, progress: record?.progress ? clone(record.progress) : null,
      freshState: Boolean(record), assessmentEligible: Boolean(record?.receipt),
      revision: identity(item), busy: busy.has(key(item)) };
  }
  function inspect(questionId) {
    const item = target(questionId);
    const view = display(questionId);
    return publicFormalProof({ problem: item.problem, ...view,
      guidance: item.evidence?.guidance?.proof_revision === view.revision ? item.evidence.guidance : null });
  }
  function assessment(questionId) {
    const item = target(questionId);
    const record = matching(item);
    if (!record?.receipt || busy.has(key(item))) return null;
    return { status: "verified", authority: "lean4", ...clone(record.receipt) };
  }
  function recordGuidance(questionId, proofRevision, guidanceId) {
    const item = target(questionId);
    if (busy.has(key(item))) throw new Error("Wait for the current proof check to finish before recording guidance.");
    if (!item.evidence?.request) throw new Error("Start the proof before recording a question about it.");
    const publicState = inspect(questionId);
    if (proofRevision !== publicState.proof_revision) throw new Error("This proof has changed. Inspect its current state before giving guidance.");
    const choice = publicState.guidance_options.find((entry) => entry.id === guidanceId);
    if (!choice) throw new Error("Select a bounded guidance option from this exact public proof state.");
    const guidance = { proof_revision: proofRevision, id: choice.id, question: choice.question,
      focus_step_id: choice.focus_step_id, kind: choice.kind, assessment_effect: "none" };
    write(questionId, { ...clone(item.evidence), guidance });
    return { ok: true, guidance: clone(guidance), assessment_effect: "none" };
  }
  async function run(questionId, action, input = {}) {
    const item = target(questionId);
    const id = key(item);
    if (busy.has(id)) throw new Error("A check is already running for this proof.");
    if (busy.size >= 4) throw new Error("Four proof operations are already running. Finish a current check before starting another.");
    if (!["start", "edit", "cancel", "append", "progress", "verify", "replay"].includes(action)) throw new Error("Unknown formal proof action.");
    if (["verify", "replay"].includes(action) && Object.keys(item.problem.proof_spec.assessment_policy ?? {}).length) {
      throw new Error("This exercise declares a method-specific assessment policy that is not supported yet. It cannot receive formal assessment credit; use an unrestricted policy or author a supported exercise.");
    }
    const old = matching(item);
    const before = identity(item);
    const ticket = {};
    busy.set(id, ticket);
    const current = () => {
      const latest = read(questionId);
      return latest && identity(latest) === before && busy.get(id) === ticket;
    };
    try {
      let session = sessionFrom(item.evidence);
      let verification = null;
      if (action === "start") session = await startFormalProof(item.problem.formal_job, options);
      else if (action === "edit") session = beginFormalStepEdit(session, input.stepId);
      else if (action === "cancel") session = { ...session, pendingEdit: null };
      else {
        if (!session.request) throw new Error("Start the proof before checking or editing it.");
        if (session.pendingEdit && action !== "append") throw new Error("Save the edited step before checking the proof.");
        await assertFormalSessionForJob(session, item.problem.formal_job, options);
        if (!current()) throw new Error("The proof changed while the companion was working. Its late result was discarded.");
        if (action === "append") session = await (session.pendingEdit?.step_id ? replaceFormalStep : appendFormalStep)(session, input, options);
        if (action === "progress") session = await checkFormalProgress(session, options);
        if (action === "verify") {
          session = await verifyFormalProof(session, options);
          if (session.kernelVerified) verification = session.verification;
        }
        if (action === "replay") {
          const record = getArchive(item.evidence?.verification?.evidence_id);
          if (!record || record.problemBindingSha256 !== session.problemBindingSha256
              || formalRequestHash(record.request) !== formalRequestHash(session.request)) throw new Error("The archived certificate does not match this exact learner proof.");
          const replay = await replayFormalEvidence(record, options);
          session = { ...session, verification: replay, kernelVerified: replay.kernelVerified,
            proofState: replay.proofState ?? session.proofState };
          if (replay.kernelVerified) verification = replay;
        }
      }
      if (!current()) throw new Error("The proof changed while the companion was working. Its late result was discarded.");
      if (!["edit", "cancel"].includes(action) && session.proofState?.request_hash !== formalRequestHash(session.request)) throw new Error("The companion returned a stale proof-state interpretation.");
      const next = formalDraftEvidence(session);
      // Fail explicitly rather than silently dropping a large proof on autosave.
      if (JSON.stringify(next).length > 28_000) throw new Error("This proof exceeds the browser draft limit. Shorten it or use the advanced workbench; the previous draft is preserved.");
      const receipt = verification ? archive(questionId, session.problemBindingSha256, session.request, verification) : null;
      if (receipt) next.verification = { status: "verified", proof_mode: "submitted", ...receipt };
      // A progress check never mints an assessment. It may retain an already
      // live final certificate for the identical unedited request.
      if (action === "progress" && old?.receipt) next.verification = { status: "verified", proof_mode: "submitted", ...old.receipt };
      if (action === "progress" && !old?.receipt && item.evidence?.verification?.evidence_id) next.verification = { ...item.evidence.verification, status: "replay_required" };
      write(questionId, next);
      revisions.set(id, (revisions.get(id) ?? 0) + 1);
      const latest = target(questionId);
      live.delete(id);
      if (!["edit", "cancel"].includes(action)) {
        // Bound runtime memory is deliberately absent from backups and sync.
        if (live.size >= 32) live.clear();
        live.set(id, { identity: identity(latest), state: clone(session.proofState),
          progress: session.progress ?? (action === "verify" ? old?.progress : null),
          receipt: receipt ?? (action === "progress" ? old?.receipt : null) });
      }
      return { ok: true, action, verification_status: session.verification?.status ?? session.progress?.status ?? "not_checked",
        assessment_eligible: Boolean(receipt ?? (action === "progress" ? old?.receipt : null)) };
    } finally {
      if (busy.get(id) === ticket) busy.delete(id);
    }
  }
  return Object.freeze({ run, display, inspect, assessment, recordGuidance, invalidate, clear });
}
