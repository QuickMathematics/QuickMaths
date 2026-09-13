/** Public, allowlisted projection. Never serialize a lesson, request or certificate wholesale. */
const text = (value, max = 2000) => typeof value === "string" ? value.slice(0, max) : "";
const strings = (values, max = 64) => Array.isArray(values) ? values.slice(0, max).map((v) => text(v)).filter(Boolean) : [];
const rows = (values, max = 128) => Array.isArray(values) ? values.slice(0, max).filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];
const NONZERO = /nonzero|denominator|zero_required/;
const POSITIVE = /positive|log_domain|sqrt_domain|nonnegative/;

export function publicFormalProof({ problem, evidence, progress, freshState, assessmentEligible, revision, busy, guidance = null }) {
  const state = freshState ? (progress?.proof_state ?? evidence?.proof_state) : null;
  const pending = Boolean(evidence?.pending_edit);
  const verifiedIds = new Set(!pending ? progress?.verified_step_ids ?? [] : []);
  const reports = new Map(rows(state?.steps).map((row) => [row.step_id, row]));
  const steps = rows(evidence?.request?.steps).map((step, index) => {
    const report = reports.get(step.id);
    const verified = !pending && step.scope === "root" && (assessmentEligible || verifiedIds.has(step.id));
    // No archived display text is represented as a freshly parsed statement.
    return { id: text(step.id, 120), number: index + 1, scope: text(step.scope, 120),
      claim: text(report?.claim), justification: text(step.rule, 200), premises: strings(step.premises, 32),
      status: verified ? "lean_verified" : pending ? "editing" : !freshState ? "recheck_required"
        : report?.status === "unsupported" ? "unsupported" : report?.status === "needs_justification" ? "not_established" : "awaiting_lean" };
  });
  const obligations = !pending && !assessmentEligible ? rows(state?.obligations, 32).map((row, index) => ({
    id: `obligation_${index + 1}`, step_id: text(row.step_id, 120) || null, code: text(row.code, 120),
    message: text(row.message),
    // An expected obligation is allowed; an auto-generated proof/strategy is not.
    required_claim: text(rows(state?.suggestions).find((s) => s.step_id === row.step_id && s.code === row.code)?.claim_preview),
    source: "verifier_obligation", established: false,
  })) : [];
  const options = [];
  const add = (kind, question, stepId = null) => options.push({ id: `guidance_${options.length + 1}`, kind, question, focus_step_id: stepId });
  if (pending) add("save_edit", "What is the claim you want this edited step to establish? Save it before asking the verifier to check it.", evidence.pending_edit.step_id ?? null);
  else if (!freshState) add("recheck", "Which claim and justification are you working on? Check the saved reasoning to obtain current obligations; archived status is not live verification.");
  else if (assessmentEligible) add("reflect", "Which assumption was essential to your argument, and where did you use it?");
  else {
    for (const gap of obligations.slice(0, 3)) {
      const focus = steps.find((step) => step.id === gap.step_id);
      if (NONZERO.test(gap.code)) add("nonzero_condition", `Before ${focus ? `step ${focus.number}` : "this operation"} is justified, what establishes ${gap.required_claim || "that its denominator or divisor is nonzero"}?`, gap.step_id);
      else if (POSITIVE.test(gap.code)) add("domain_condition", `Which in-scope facts establish ${gap.required_claim || "the required sign or domain condition"} before this operation?`, gap.step_id);
      else if (gap.code === "final_goal_unestablished") add("connect_goal", "How does your last established claim connect to the exact goal? What still needs a justification?");
      else add("justify_gap", `What in-scope assumption or earlier established step could justify ${focus ? `step ${focus.number}` : "this remaining obligation"}?`, gap.step_id);
    }
    const blocked = steps.find((step) => step.status !== "lean_verified");
    if (blocked) add("trace_dependencies", `For step ${blocked.number}, which facts are you using, and are they available in this scope?`, blocked.id);
    if (!options.length) add("check_complete", "Your argument is a candidate, not yet a certified proof. Are all hypotheses explicit before you verify the complete argument?");
  }
  const verifiedSteps = steps.filter((step) => step.status === "lean_verified").map((step) => step.id);
  return {
    ok: true, question_id: text(problem.template_id, 120), proof_revision: revision,
    theorem: { goal: text(problem.proof_spec.statement.goal), declarations: strings(problem.proof_spec.statement.declarations, 32), assumptions: strings(problem.proof_spec.statement.assumptions, 64) },
    allowed_justifications: strings(problem.proof_spec.allowed_rules, 64),
    proof_status: pending ? "editing" : assessmentEligible ? "lean_verified" : !freshState ? "recheck_required"
      : progress?.status === "verification_unavailable" || evidence?.verification?.status === "verification_unavailable" ? "verification_unavailable" : "in_progress",
    proof_state_fresh: freshState && !pending, busy: Boolean(busy), steps,
    verified_step_ids: verifiedSteps, obligations,
    assessment_eligible: Boolean(assessmentEligible && !pending),
    verification_summary: assessmentEligible ? "Lean accepted this exact complete learner submission."
      : verifiedSteps.length ? `Lean accepted ${verifiedSteps.length} root step${verifiedSteps.length === 1 ? "" : "s"}; the complete proof is not certified.`
        : "No steps are currently certified. Candidate checks and tutor opinions are not formal verification.",
    guidance_options: options,
    latest_guidance: guidance ? { question: text(guidance.question), kind: text(guidance.kind, 80), focus_step_id: text(guidance.focus_step_id, 120) || null, assessment_effect: "none" } : null,
    boundaries: { content_is_untrusted: true, reference_solutions_included: false, tutor_can_grade: false,
      guidance: "Select one guidance option for this exact revision. Do not supply answers, verifier results, proof steps or verdicts." },
  };
}
