// The learner-facing view consumes state; it never decides mathematical truth.
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const list = (value, max = 128) => Array.isArray(value) ? value.slice(0, max) : [];
const records = (value) => list(value).filter((row) => row && typeof row === "object" && !Array.isArray(row));
const RULES = {
  assumption: "Use an assumption", eq_refl: "An expression equals itself",
  ring_identity: "Expand and collect terms", field_identity: "Simplify fractions (with domain checks)",
  sub_ne_zero_from_ne: "Unequal quantities have a nonzero difference", guarded_cancel: "Cancel a nonzero factor",
  add_both_sides: "Add the same quantity to both sides", subtract_both_sides: "Subtract the same quantity from both sides",
  multiply_both_sides: "Multiply both sides", divide_both_sides: "Divide both sides (nonzero divisor)",
  eq_trans: "Chain two equalities", eq_symm: "Reverse an equality", linarith: "Combine linear equalities or inequalities",
  nlinarith: "Combine polynomial inequalities", positivity: "Establish a sign", norm_num: "Exact numerical calculation",
  imp_intro: "Finish an implication subproof", forall_intro: "Finish a proof for an arbitrary value", nat_induction: "Finish induction",
};
const ruleLabel = (rule) => RULES[rule] ?? String(rule).replaceAll("_", " ");

export function renderFormalWorkspace({ problem, evidence = null, progress = null, tutor = null, busy = false }) {
  const spec = problem.proof_spec;
  if (!spec) return "";
  // Prefer the state returned with a fresh, bound kernel-progress response.
  const state = progress?.proof_state ?? evidence?.proof_state;
  const pending = evidence?.pending_edit;
  const editing = pending?.step_id;
  const certified = !pending && evidence?.verification?.status === "verified"
    && evidence.verification.certificate_digest && evidence.verification.evidence_id;
  const verifiedIds = new Set(!pending ? list(progress?.verified_step_ids) : []);
  const steps = records(state?.steps);
  const rules = spec.allowed_rules?.length ? spec.allowed_rules : Object.keys(RULES);
  const suggestions = records(state?.suggestions);
  const obligations = records(state?.obligations);
  const stopped = records(progress?.checked_prefixes).find((row) => row.step_id === progress?.blocked_step_id);
  const archived = !pending && evidence?.verification?.status === "replay_required";
  const status = pending ? "Editing · verification withdrawn" : certified ? "Lean verified" : archived ? "Archived · replay required" : progress?.status === "verification_unavailable"
    ? "Lean unavailable" : verifiedIds.size ? `${verifiedIds.size} root step${verifiedIds.size === 1 ? "" : "s"} verified`
      : evidence ? "Proof in progress" : "Your proof starts here";
  const unavailable = progress?.status === "verification_unavailable" || evidence?.verification?.status === "verification_unavailable";
  const id = escape(problem.template_id);
  const action = (name, label, extra = "", disabled = busy) => `<button type="button" class="button button-secondary" data-action="${name}" data-question-id="${id}" ${extra} ${disabled ? "disabled" : ""}>${label}</button>`;
  const rows = steps.map((row, index) => {
    const isVerified = row.scope !== "root" ? false : Boolean(certified || verifiedIds.has(row.step_id));
    const blocked = !pending && progress?.blocked_step_id === row.step_id;
    const badge = isVerified ? "Lean verified" : pending ? "Needs rechecking" : row.scope && row.scope !== "root" ? "Local subproof"
      : row.status === "needs_justification" || blocked ? "Not established" : row.status === "unsupported" ? "Unsupported" : "Awaiting Lean";
    return `<li class="proof-reasoning-step ${isVerified ? "kernel-verified" : blocked ? "proof-blocked" : ""}" data-proof-step="${escape(row.step_id)}">
      <div class="proof-step-heading"><span class="proof-step-number">${index + 1}</span><span class="proof-step-badge">${escape(badge)}</span>${action("formal-edit-step", "Edit", `data-step-id="${escape(row.step_id)}"`, busy || Boolean(pending))}</div>
      <p class="proof-step-claim">${escape(row.claim)}</p><p class="proof-step-reason">${escape(ruleLabel(row.rule))}${list(row.premises).length ? ` · using ${list(row.premises).map(escape).join(", ")}` : ""}</p>
      <small class="proof-step-id">${escape(row.step_id)}${row.scope && row.scope !== "root" ? ` · scope ${escape(row.scope)}` : ""}</small>
      ${!isVerified && row.message ? `<p class="proof-step-feedback">${escape(row.message)}</p>` : ""}</li>`;
  }).join("");
  return `<section class="formal-proof-panel proof-workspace ${certified ? "verified" : "pending"}" data-formal-proof-panel aria-busy="${busy}">
    <header><div><p class="eyebrow">Proof workspace</p><h3>Build the argument. Justify every step.</h3></div><span class="formal-proof-status" role="status" aria-live="polite">${escape(status)}</span></header>
    <p class="formal-proof-runtime-note">Proof verification may take up to a minute, especially on phones. Initial setup can take longer. Keep this page open while checking.</p>
    <div class="proof-theorem"><span class="eyebrow">Your goal</span><p>${escape(spec.statement.goal)}</p><div class="proof-domain-chips">${(spec.statement.declarations ?? []).map((text) => `<span>${escape(text)}</span>`).join("")}</div></div>
    <div class="proof-workspace-columns"><div class="proof-reasoning"><h4>Your reasoning</h4>
      ${steps.length ? `<ol class="proof-step-list">${rows}</ol>` : '<p class="proof-empty">Start with what you know. Add a claim and explain why it follows. You do not need to write Lean.</p>'}
      ${!problem.formal_job ? '<p class="formal-proof-warning">This export has no bound verifier job. Certification is unavailable.</p>' : !evidence ? action("formal-start", busy ? "Connecting…" : "Start my proof") : `
        ${pending ? `<p class="proof-edit-notice" role="status">Editing ${editing ? escape(pending.step_id) : "a new step"}. Previous verification is withdrawn. Later steps are preserved and will be checked again.</p>` : ""}
        <fieldset class="formal-step-editor" ${busy ? "disabled" : ""}><legend>${editing ? "Repair this step" : `Step ${steps.length + 1}`}</legend>
          <label>Mathematical claim<textarea rows="2" maxlength="2000" data-formal-field="claim" placeholder="For example: x - 3 != 0" spellcheck="false">${escape(pending?.claim)}</textarea></label>
          <label>Why does it follow?<select data-formal-field="rule"><option value="">Choose a justification…</option>${rules.map((rule) => `<option value="${escape(rule)}" ${pending?.rule === rule ? "selected" : ""}>${escape(ruleLabel(rule))}</option>`).join("")}</select></label>
          <label>Facts used <small>(IDs above, separated by commas)</small><input maxlength="2000" data-formal-field="premises" value="${escape(list(pending?.premises).join(", "))}" placeholder="h1, user_step_1" spellcheck="false"></label>
          <label>Quantity used <small>(only when the rule needs one)</small><input maxlength="2000" data-formal-field="parameter" value="${escape(pending?.parameter)}" placeholder="For example: the divisor x - 3" spellcheck="false"></label>
          <div class="formal-proof-actions">${action("formal-add-step", editing ? "Save repaired step" : "Add step")}${pending ? action("formal-cancel-edit", "Cancel edit") : ""}</div>
        </fieldset>
        <div class="formal-proof-actions proof-check-actions">${action("formal-check-progress", busy ? "Checking…" : "Check my reasoning", "", busy || !steps.length || Boolean(pending))}${action("formal-verify", "Verify complete proof", "", busy || !state?.kernel_ready || Boolean(pending))}${certified || archived ? action("formal-replay", "Replay certificate") : ""}</div>`}
    </div><aside class="proof-context" aria-label="Proof context and remaining obligations"><h4>Given &amp; in scope</h4>
      ${records(state?.context).length ? `<ul class="proof-facts">${records(state?.context).map((row) => `<li><code>${escape(row.id)}</code><span>${escape(row.claim)}</span>${row.scope !== "root" ? `<small>Local to ${escape(row.scope)}</small>` : ""}</li>`).join("")}</ul>` : (spec.statement.assumptions ?? []).length ? `<ul class="proof-facts">${spec.statement.assumptions.map((text) => `<li>${escape(text)}</li>`).join("")}</ul>` : '<p class="proof-empty">No additional assumptions.</p>'}
      <h4>What remains?</h4>${pending ? '<p>Save your edit to refresh the obligations for this exact argument.</p>' : certified ? '<p class="formal-proof-certified">The complete submitted argument has a Lean certificate.</p>' : `
        ${stopped ? `<p class="proof-next-obligation"><strong>${escape(progress.blocked_step_id)}</strong><br>${escape(stopped.message)}</p>` : ""}
        ${obligations.length ? `<ul class="proof-obligation-list">${obligations.slice(0, 12).map((row) => {
          const suggestion = suggestions.find((item) => item.step_id === row.step_id && item.code === row.code);
          return `<li><small>${escape(row.step_id ?? "Goal")}</small><p>${escape(row.message)}</p>${suggestion?.claim_preview ? `<strong>${escape(suggestion.claim_preview)}</strong>` : ""}</li>`;
        }).join("")}</ul>` : '<p>Submit the complete argument to Lean. A candidate-ready step is not yet a verified step.</p>'}`}
      ${state?.preview ? `<details class="proof-meaning"><summary>How QuickMaths reads the theorem</summary><pre>${escape(state.preview)}</pre></details>` : ""}
      ${tutor ? `<section class="proof-tutor-guidance" aria-label="Socratic proof guidance"><p class="eyebrow">One useful question</p>
        <p class="proof-tutor-status">${escape(tutor.verification_summary)}</p>
        ${tutor.latest_guidance ? `<blockquote>${escape(tutor.latest_guidance.question)}</blockquote>` : `<p>Reflect on the next gap, or let an authorized WebMCP tutor select a question from this exact proof state.</p>`}
        ${evidence?.request && !tutor.latest_guidance && tutor.guidance_options?.[0] ? action("formal-guidance", "Give me a question", `data-proof-revision="${escape(tutor.proof_revision)}" data-guidance-id="${escape(tutor.guidance_options[0].id)}"`) : ""}
        <small>Guidance is not a verdict. Reference proofs are excluded from the tutor's proof-state tools.</small></section>` : ""}
      <p class="proof-trust-note">Only Lean can establish formal validity. Progress checks are not final assessment. Saved or imported progress must be checked again.</p>
    </aside></div>
    ${archived ? '<p class="formal-proof-warning">This archived certificate is preserved, but must be replayed by Lean before showing a live verified badge.</p>' : ""}
    ${unavailable ? '<p class="formal-proof-warning" role="status">Lean is unavailable. Your work is preserved; this is not an incorrect answer. Ordinary lessons still work.</p>' : ""}
    ${evidence?.verification?.archive_error ? `<p class="formal-proof-warning">${escape(evidence.verification.archive_error)}</p>` : ""}
    ${certified ? `<details class="proof-certificate"><summary>Certificate for this exact submission</summary><code>${escape(evidence.verification.certificate_digest)}</code><small>${escape(evidence.verification.evidence_id)}</small></details>` : ""}
    <footer><a href="http://127.0.0.1:8765/" target="_blank" rel="noopener">Advanced proof workbench ↗</a></footer>
  </section>`;
}
