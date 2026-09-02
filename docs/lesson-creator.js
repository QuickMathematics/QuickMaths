const DRAFT_KEY = "quickmaths.lesson-creator.v1";

const DEFAULT_THEME = {
  paper: "#eef6f1", paperDeep: "#dcebe2", paperLight: "#ffffff", ink: "#18231d",
  muted: "#607067", line: "#c7d8ce", primary: "#225c48", primaryAlt: "#33765e",
  tint: "#bfe2ce", highlight: "#e4ef9b", accent: "#e06b54",
};

const WORK_MODE_GUIDES = {
  none: {
    title: "Final answer only",
    summary: "QuickMaths shows one final-answer field and grades it locally.",
    syntax: "Best for numbers, equations, multiple choice, or short conclusions.",
    flow: "Student answers → app grades → mastery updates after reflection.",
  },
  capture_only: {
    title: "Written explanation",
    summary: "Adds a plain-text reasoning box beneath the final answer.",
    syntax: "No special syntax. The learner writes normal sentences or notes.",
    flow: "Student answers and explains → app grades the final answer → the explanation is saved for review.",
  },
  procedural_steps: {
    title: "Checked maths steps",
    summary: "The Advanced Algebra-style workflow: the learner writes one transformation per line and QuickMaths checks that each line stays mathematically equivalent.",
    syntax: "Use readable maths such as 2x + 5 = 13, one equation or expression per line. This is machine-checked work, not a formal proof review.",
    flow: "Student enters steps → app checks every transition and the final line → mastery can update immediately.",
  },
  proof_obligations: {
    title: "Required formal proof",
    summary: "Creates two judgments: QuickMaths grades the short conclusion, then a self, human, or agent reviewer judges the proof against your obligation checklist.",
    syntax: "The proof is ordinary text—no JSON, LaTeX, or magic keywords. QuickMaths checks that proof text exists; it never pretends that this proves the logic is valid.",
    flow: "Conclusion is graded → proof is saved as pending review → reviewer checks every obligation → mastery moves only after a pass.",
  },
  rubric_check: {
    title: "Rubric-reviewed response",
    summary: "Shows a required response box and the exact criteria the reviewer will use.",
    syntax: "Plain text. Paragraphs, labelled sections, or one point per line all work.",
    flow: "Student responds → app checks that work was supplied → reviewer checks every criterion → mastery updates.",
  },
  rational_equation_steps: {
    title: "Rational-equation workspace",
    summary: "Gives the learner separate fields for original restrictions, algebra steps, candidate classifications, and substitution checks.",
    syntax: "The student never writes JSON. QuickMaths stores the structured ledger, verifies the valid-candidate set, and requires original-equation checks when enabled.",
    flow: "Student records restrictions → solves → classifies every candidate → checks the original equation → app validates the final finite set.",
  },
  sign_chart_steps: {
    title: "Structured sign chart",
    summary: "Builds a guided critical-point, interval-test, endpoint, and final interval-set editor.",
    syntax: "Author the expression and its trusted critical-point model. Learners receive ordinary form fields for values, signs, selections, and endpoint decisions.",
    flow: "Student factors → identifies critical points → tests each interval → decides endpoints → app checks the final interval set.",
  },
  code_trace_steps: {
    title: "Structured code trace",
    summary: "Shows formatted Python and a real table with one authored execution checkpoint per row.",
    syntax: "Choose the visible columns, then enter one pipe-separated expected row per checkpoint. QuickMaths compares the learner's cells without executing lesson-supplied code.",
    flow: "Student reads formatted code → completes every state row → app reports the first divergent variable or output → final answer grades separately.",
  },
};

const REVIEW_OPTIONS = [
  ["none", "No separate review"],
  ["optional", "Review can be added later"],
  ["auto", "App checks the work format"],
  ["self_review", "Learner signs off"],
  ["tutor_required", "Tutor / agent signs off"],
];

function cleanId(value, prefix) {
  const body = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 42);
  if (body.startsWith(prefix)) return body;
  return `${prefix}${body || "UNTITLED"}`;
}

function lines(value) {
  return String(value ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function blankProblem(skillId, index = 0) {
  return {
    templateId: `${skillId}_Q${String(index + 1).padStart(2, "0")}`,
    sourceTemplateId: "",
    prompt: "What should the learner solve?", promptCode: "", promptCodeLanguage: "python", expectedAnswer: "", answerType: "text",
    gradingMethod: "exact_text", difficulty: "medium", tolerance: "0.001", options: "A | First choice\nB | Second choice",
    acceptedForms: "", solutionSteps: "Explain the key idea.\nComplete the calculation or reasoning.", mistakeTags: "concept_error",
    answerMode: "final_only", workMode: "none", workPrompt: "", minimumSteps: 2,
    lineType: "expression", proofObligations: "State the claim clearly\nName the facts or definitions you use\nJustify how they lead to the conclusion", proofStrategies: "Direct proof\nProof by contradiction\nProof by contrapositive",
    rubricCriteria: "Makes a clear central claim\nUses relevant evidence or calculations\nExplains how the evidence supports the conclusion", workReview: "none", masteryRequiresReview: false, allowSelfReview: true,
    answerValues: "", excludedValues: "", answerVariable: "x", requireReducedForm: true,
    targetVariable: "x", originalEquation: "", expectedRestrictions: "", requireRestrictions: true, requireOriginalEquationCheck: true,
    signExpressionKind: "polynomial", signExpression: "", signRelation: ">", expectedFactorization: "", reducedExpression: "", requireFactorization: false,
    criticalPoints: "", requireTestValues: true, requireIntervalSigns: true, requireEndpointDecisions: true, requireFinalAnswerMatch: true,
    traceDisplayCode: "", traceColumns: "step\nx\noutput", traceRows: "1 | 2 |\n2 | 5 |\n3 | 5 | 5",
    pythonEntrypoint: "solve", pythonParameters: "value | int", pythonReturnType: "json",
    pythonTests: 'example | ordinary | [2] | 4\nafter_submission | boundary | [0] | 0\nhidden | negative | [-3] | -6',
    pythonBuiltins: "", pythonWallTime: 1500, pythonStepLimit: 20000, pythonStdoutChars: 1000,
  };
}

function blankSkill(index = 0) {
  const id = `CUSTOM_NEW_LESSON_${String(index + 1).padStart(3, "0")}`;
  return {
    id, name: "New lesson", description: "A short description of what learners will master.", subdomain: "Foundations",
    theory: "Explain the core idea here.\n\n- Add a useful rule\n- Point out a common mistake", tags: "foundation",
    prerequisites: [], passingScore: 0.8, minimumConfidence: 3, reviewMasteredDays: 7, reviewLearningDays: 2,
    examples: [{ prompt: "A worked example", solution: "Show the result", explanation: "Explain why each step works." }],
    applications: [{ title: "Why it matters", description: "Connect this lesson to a real problem or another subject." }],
    activeProblem: 0, problems: [blankProblem(id, 0)],
  };
}

function blankDraft(snapshot) {
  const subject = snapshot?.activeSubject;
  return {
    tutorialOpen: true, activeSkill: 0, lastValidation: null,
    mode: "add", nativeSkillId: snapshot?.selectedSkill?.custom ? "" : (snapshot?.selectedSkill?.id ?? ""),
    nativePreviewVariation: 0,
    id: "PACK_MY_LESSONS", name: "My lesson set", description: "A custom curriculum built in QuickMaths.", author: "", version: "1.0.0",
    subjectMode: "extend", subjectId: subject?.id ?? "SUBJECT_MATH", subjectName: subject?.name ?? "Mathematics",
    subjectShortName: subject?.shortName ?? "Maths", subjectIcon: subject?.icon ?? "∑", subjectDescription: subject?.description ?? "",
    theme: { ...(subject?.theme ?? DEFAULT_THEME) }, skills: [blankSkill(0)],
  };
}

function restoreDraft(snapshot) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (parsed && Array.isArray(parsed.skills) && parsed.skills.length) return { mode: "add", nativeSkillId: "", ...parsed };
  } catch { /* Start from a clean author draft. */ }
  return blankDraft(snapshot);
}

function persist(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* Author can still download the draft. */ }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function helpButton(help) {
  if (!help) return "";
  return `<button class="studio-help" type="button" data-studio-help data-tooltip="${esc(help)}" aria-label="Help: ${esc(help)}" aria-expanded="false">?</button>`;
}

function field(label, name, value, { type = "text", help = "", hint = "", placeholder = "", min = "", max = "", step = "", readonly = false } = {}) {
  return `<label class="studio-field"><span>${esc(label)}${helpButton(help)}</span><input data-creator-field="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${min !== "" ? `min="${esc(min)}"` : ""} ${max !== "" ? `max="${esc(max)}"` : ""} ${step !== "" ? `step="${esc(step)}"` : ""} ${readonly ? "readonly" : ""}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
}

function area(label, name, value, { help = "", hint = "", rows = 4, placeholder = "" } = {}) {
  return `<label class="studio-field studio-area"><span>${esc(label)}${helpButton(help)}</span><textarea data-creator-field="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
}

function select(label, name, value, options, help = "") {
  return `<label class="studio-field"><span>${esc(label)}${helpButton(help)}</span><select data-creator-field="${esc(name)}">${options.map(([id, text]) => `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}

function applyWorkModeDefaults(problem, mode) {
  if (mode === "none") {
    problem.answerMode = "final_only";
    problem.workReview = "none";
    problem.masteryRequiresReview = false;
    return;
  }
  if (mode === "capture_only") {
    if (problem.answerMode === "final_only") problem.answerMode = "final_plus_optional_work";
    if (!problem.workPrompt) problem.workPrompt = "Explain how you reached your answer.";
    return;
  }
  problem.answerMode = "final_plus_required_work";
  if (mode === "procedural_steps") {
    if (!problem.workPrompt) problem.workPrompt = "Show one mathematical step per line.";
    problem.workReview = "auto";
    problem.masteryRequiresReview = false;
    return;
  }
  if (["rational_equation_steps", "sign_chart_steps", "code_trace_steps"].includes(mode)) {
    if (!problem.workPrompt) problem.workPrompt = mode === "rational_equation_steps"
      ? "State the restrictions, show the solving steps, classify every candidate, and check candidates in the original equation."
      : mode === "sign_chart_steps"
        ? "Factor or reduce, list every critical point, test each interval, decide endpoints, and enter the final interval set."
        : "Complete every authored execution checkpoint in the trace table.";
    problem.workReview = "auto";
    problem.masteryRequiresReview = false;
    return;
  }
  if (mode === "proof_obligations") {
    problem.workPrompt = problem.workPrompt || "Write a proof that addresses every obligation below. Use one claim or reason per line.";
  }
  if (mode === "rubric_check") {
    problem.workPrompt = problem.workPrompt || "Write a complete response that addresses every rubric criterion below.";
  }
  problem.workReview = "tutor_required";
  problem.masteryRequiresReview = true;
  problem.allowSelfReview = false;
}

function workPlaceholder(mode) {
  if (mode === "procedural_steps") return "2x + 5 = 13\n2x = 8\nx = 4";
  if (mode === "proof_obligations") return "Claim: ...\nReason: ...\nTherefore: ...";
  if (mode === "rubric_check") return "My claim is ...\nThe evidence shows ...\nThis supports the conclusion because ...";
  if (mode === "rational_equation_steps") return "Restrictions → solving steps → candidate ledger → original-equation check";
  if (mode === "sign_chart_steps") return "Critical points → interval test values and signs → endpoint decisions → interval notation";
  if (mode === "code_trace_steps") return "step | variables after the step | output produced at the step";
  return "Write your reasoning here…";
}

function renderStudentPreview(problem) {
  const guide = WORK_MODE_GUIDES[problem.workMode] ?? WORK_MODE_GUIDES.none;
  const obligations = lines(problem.proofObligations);
  const strategies = lines(problem.proofStrategies);
  const criteria = lines(problem.rubricCriteria);
  const required = ["procedural_steps", "proof_obligations", "rubric_check", "rational_equation_steps", "sign_chart_steps", "code_trace_steps"].includes(problem.workMode) || problem.answerMode === "final_plus_required_work";
  return `<section class="studio-student-preview" aria-label="Learner view preview">
    <header><div><span>Learner view preview</span><strong>${esc(guide.title)}</strong></div><b>${required ? "Required work" : problem.answerMode === "final_plus_optional_work" ? "Optional work" : "Final answer"}</b></header>
    <article>
      <small>QUESTION</small><h4>${esc(problem.prompt || "Your learner-facing question appears here.")}</h4>
      ${problem.promptCode ? `<figure class="studio-code-preview"><figcaption>${esc(problem.promptCodeLanguage || "python")}</figcaption><pre><code>${esc(problem.promptCode)}</code></pre></figure>` : ""}
      <label><span>${problem.gradingMethod === "python_program" ? "Python solution" : problem.workMode === "proof_obligations" ? "Final conclusion (graded separately)" : "Final answer"}</span><i>${problem.gradingMethod === "python_program" ? `Code editor + Run sandboxed tests for ${esc(problem.pythonEntrypoint)}` : esc(problem.expectedAnswer ? "Learner enters an answer here" : problem.workMode === "proof_obligations" ? "Set the private expected conclusion above" : "Set the private expected answer above")}</i></label>
      ${problem.workMode === "proof_obligations" ? `<div class="studio-preview-guide"><strong>Your proof must cover</strong><ol>${obligations.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Add at least one proof obligation.</li>"}</ol>${strategies.length ? `<p><b>Accepted approaches:</b> ${strategies.map(esc).join(" · ")}</p>` : ""}</div>` : ""}
      ${problem.workMode === "rubric_check" ? `<div class="studio-preview-guide"><strong>Your response will be reviewed for</strong><ul>${criteria.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Add at least one rubric criterion.</li>"}</ul></div>` : ""}
      ${problem.workMode === "code_trace_steps" ? `<div class="studio-preview-guide"><strong>Trace table columns</strong><p>${lines(problem.traceColumns).map(esc).join(" · ")}</p><small>${lines(problem.traceRows).length} authored checkpoints; expected cells remain private.</small></div>` : ""}
      ${problem.workMode !== "none" ? `<label class="studio-preview-work"><span>${esc(problem.workPrompt || "Show your work")} ${required ? "(required)" : "(optional)"}</span><i>${esc(workPlaceholder(problem.workMode)).replaceAll("\n", "<br>")}</i></label>` : ""}
    </article>
    <footer>${esc(guide.flow)}</footer>
  </section>`;
}

function renderProofAnatomy(problem) {
  const reviewer = problem.workReview === "self_review" ? "Learner self-review" : "Human tutor or agent review";
  return `<section class="studio-proof-anatomy">
    <header><div><span>What “proof required” actually does</span><strong>One question, two judgments, four stages</strong></div><b>Mastery gate</b></header>
    <div class="studio-proof-flow">
      <article><span>1</span><div><strong>Conclusion</strong><b>Auto-graded</b><p>The short final conclusion is checked against the private expected conclusion and any accepted forms. This score alone does not validate the proof.</p></div></article>
      <i>→</i>
      <article><span>2</span><div><strong>Proof submission</strong><b>Required</b><p>The learner receives a separate proof box and the visible obligation checklist you author below. Empty or extremely short work is blocked.</p></div></article>
      <i>→</i>
      <article><span>3</span><div><strong>Pending review</strong><b>Saved, not guessed</b><p>QuickMaths stores the exact proof and exposes it with the obligations. It does not claim that keywords or a correct conclusion make the reasoning valid.</p></div></article>
      <i>→</i>
      <article><span>4</span><div><strong>${esc(reviewer)}</strong><b>Pass required</b><p>The reviewer compares the reasoning with every obligation and records pass, partial, revision, or fail. Mastery waits until the required review passes.</p></div></article>
    </div>
    <div class="studio-proof-contrast"><article><span>Advanced Algebra</span><strong>Checked maths steps</strong><p>QuickMaths checks whether each equation or expression is equivalent to the previous line and whether the last line matches the answer. Usually no tutor sign-off.</p></article><article><span>Formal proof</span><strong>Proof obligations</strong><p>QuickMaths checks submission requirements, then a human or WebMCP tutor judges validity against the proof skeleton. The final conclusion and the proof are deliberately separate.</p></article></div>
  </section>`;
}

function renderAdvancedWork(problem, index) {
  const indexed = (markup) => markup.replaceAll("data-creator-field", `data-index="${index}" data-creator-field`);
  const guide = WORK_MODE_GUIDES[problem.workMode] ?? WORK_MODE_GUIDES.none;
  const reviewIsRequired = ["proof_obligations", "rubric_check"].includes(problem.workMode);
  const reviewOptions = reviewIsRequired ? [["self_review", "Learner signs off"], ["tutor_required", "Tutor / agent signs off"]] : REVIEW_OPTIONS;
  const reviewValue = reviewIsRequired && !["self_review", "tutor_required"].includes(problem.workReview) ? "tutor_required" : problem.workReview;
  const answerOptions = problem.workMode === "none" ? [["final_only", "Final answer only"]]
    : problem.workMode === "capture_only" ? [["final_plus_optional_work", "Final answer + optional explanation"], ["final_plus_required_work", "Final answer + required explanation"]]
      : [["final_plus_required_work", "Final answer + required work"]];
  const answerValue = problem.workMode === "none" ? "final_only"
    : ["procedural_steps", "proof_obligations", "rubric_check", "rational_equation_steps", "sign_chart_steps", "code_trace_steps"].includes(problem.workMode) ? "final_plus_required_work" : problem.answerMode;
  return `<details class="studio-advanced studio-work-authoring" ${problem.workMode !== "none" ? "open" : ""}>
    <summary><span>How the learner answers</span><b>${esc(guide.title)}</b></summary>
    <div class="studio-mode-guide"><span aria-hidden="true">${problem.workMode === "proof_obligations" ? "∴" : problem.workMode === "rubric_check" ? "☷" : problem.workMode === "procedural_steps" ? "=" : "✎"}</span><div><strong>${esc(guide.summary)}</strong><p>${esc(guide.syntax)}</p></div></div>
    <div class="studio-two">${indexed(select("Answer layout", "problem.answerMode", answerValue, answerOptions, "Proofs, rubrics, and checked maths steps always require the work box; explanations may be optional."))}${indexed(select(reviewIsRequired ? "Who signs it off?" : "After submission", "problem.workReview", reviewValue, reviewOptions, "Proofs and rubric responses are never semantically auto-graded; a reviewer must pass them."))}</div>
    ${problem.workMode !== "none" ? indexed(area("Instruction above the learner's work box", "problem.workPrompt", problem.workPrompt, { rows: 2, hint: "This sentence appears verbatim above the learner's response box." })) : ""}
    ${problem.workMode === "procedural_steps" ? `<div class="studio-two">${indexed(field("Minimum lines", "problem.minimumSteps", problem.minimumSteps, { type:"number", min:1, max:10, hint:"The app blocks submission until this many non-empty lines are present." }))}${indexed(select("Allowed line format", "problem.lineType", problem.lineType, [["expression","Equivalent expressions"],["equation","Equivalent equations (=)"],["inequality","Equivalent inequalities (<, ≤, >, ≥)"],["mixed","Maths or explanatory text"],["text","Text only"]], "Choose Equations for = on every line. Choose Inequalities when every line must preserve the same one-variable solution set, including reversing the sign after multiplying or dividing by a negative."))}</div><button class="studio-example-button" type="button" data-creator-action="apply-procedural-example" data-index="${index}">Use a clear step-by-step instruction</button>` : ""}
    ${problem.workMode === "rational_equation_steps" ? `<aside class="studio-syntax-note"><strong>The learner sees a form, not JSON.</strong><p>Restrictions, algebra lines, candidate values, classifications, and substitution checks are stored together. The app compares the submitted restriction set and candidate ledger with the trusted model below.</p></aside><div class="studio-three">${indexed(field("Target variable", "problem.targetVariable", problem.targetVariable, { hint:"Usually x." }))}<label class="studio-check"><input type="checkbox" data-index="${index}" data-creator-field="problem.requireRestrictions" ${problem.requireRestrictions ? "checked" : ""}> Require original restrictions</label><label class="studio-check"><input type="checkbox" data-index="${index}" data-creator-field="problem.requireOriginalEquationCheck" ${problem.requireOriginalEquationCheck ? "checked" : ""}> Require substitution checks</label></div><div class="studio-two">${indexed(field("Original equation", "problem.originalEquation", problem.originalEquation || problem.prompt.replace(/^.*?:\s*/, ""), { hint:"The equation used to classify valid and extraneous candidates." }))}${indexed(area("Expected restrictions — one value per line", "problem.expectedRestrictions", problem.expectedRestrictions, { rows:3, hint:"Every original denominator zero, including values from factors that later cancel." }))}</div>` : ""}
    ${problem.workMode === "sign_chart_steps" ? `<aside class="studio-syntax-note"><strong>Author the trusted chart model.</strong><p>Critical point syntax is <code>value | kind | multiplicity | factor</code>, one point per line. Kind is <code>zero</code>, <code>undefined</code>, or <code>hole</code>. The learner receives a guided chart editor.</p></aside><div class="studio-three">${indexed(select("Expression kind", "problem.signExpressionKind", problem.signExpressionKind, [["polynomial","Polynomial"],["rational","Rational"]]))}${indexed(select("Relation", "problem.signRelation", problem.signRelation, [[">","> 0"],[">=","≥ 0"],["<","< 0"],["<=","≤ 0"]]))}${indexed(field("Target variable", "problem.targetVariable", problem.targetVariable))}</div>${indexed(field("Expression", "problem.signExpression", problem.signExpression, { hint:"Example: (x - 2)/(x + 1)." }))}<div class="studio-two">${indexed(field("Expected factorization", "problem.expectedFactorization", problem.expectedFactorization, { hint:"Equivalent factored form used when factorization is required." }))}${indexed(field("Reduced expression", "problem.reducedExpression", problem.reducedExpression, { hint:"Optional; use after canceled factors when holes must remain critical." }))}</div>${indexed(area("Critical points — value | kind | multiplicity | factor", "problem.criticalPoints", problem.criticalPoints, { rows:5, hint:"Example: 2 | zero | 1 | x - 2\n-1 | undefined | 1 | x + 1" }))}<div class="studio-checks"><label><input type="checkbox" data-index="${index}" data-creator-field="problem.requireFactorization" ${problem.requireFactorization ? "checked" : ""}> Require factorization</label><label><input type="checkbox" data-index="${index}" data-creator-field="problem.requireTestValues" ${problem.requireTestValues ? "checked" : ""}> Require test values</label><label><input type="checkbox" data-index="${index}" data-creator-field="problem.requireIntervalSigns" ${problem.requireIntervalSigns ? "checked" : ""}> Require interval signs</label><label><input type="checkbox" data-index="${index}" data-creator-field="problem.requireEndpointDecisions" ${problem.requireEndpointDecisions ? "checked" : ""}> Require endpoint decisions</label><label><input type="checkbox" data-index="${index}" data-creator-field="problem.requireFinalAnswerMatch" ${problem.requireFinalAnswerMatch ? "checked" : ""}> Match final interval set</label></div>` : ""}
    ${problem.workMode === "code_trace_steps" ? `<aside class="studio-syntax-note"><strong>The table is authored; lesson code is never executed.</strong><p>List one column name per line, starting with <code>step</code>. Then enter one expected row per line using <code>|</code> between cells in exactly that order. Empty cells mean no value or output yet. The learner sees ordinary inputs in a scrollable table.</p></aside>${indexed(area("Formatted Python to trace", "problem.traceDisplayCode", problem.traceDisplayCode || problem.promptCode, { rows:8, hint:"Indentation and line breaks are preserved exactly." }))}<div class="studio-two">${indexed(area("Table columns — one per line", "problem.traceColumns", problem.traceColumns, { rows:5, hint:"Example: step, x, total, output. The first column must be step." }))}${indexed(area("Expected rows — pipe-separated cells", "problem.traceRows", problem.traceRows, { rows:7, hint:"For columns step / x / output: 1 | 2 |\n2 | 5 |\n3 | 5 | 5" }))}</div>` : ""}
    ${problem.workMode === "proof_obligations" ? `${renderProofAnatomy(problem)}<aside class="studio-syntax-note"><strong>Author a proof skeleton, not a secret answer.</strong><p>Each line below becomes one visible requirement for the learner and the Results/WebMCP reviewer. Use concrete logical milestones. Accepted approaches are suggestions, never exact phrases the learner must type.</p></aside>${indexed(area("Proof obligations — one logical milestone per line", "problem.proofObligations", problem.proofObligations, { rows:6, hint:"Example: “Derives p² = 2q²” or “Explains why both p and q being even contradicts lowest terms.”" }))}${indexed(area("Accepted proof approaches — one per line", "problem.proofStrategies", problem.proofStrategies, { rows:3, hint:"Name legitimate routes such as direct proof, contradiction, induction, or a subject-specific argument." }))}<button class="studio-example-button" type="button" data-creator-action="apply-proof-example" data-index="${index}">Load the complete editable √2 contradiction-proof example</button>` : ""}
    ${problem.workMode === "rubric_check" ? `<aside class="studio-syntax-note"><strong>Describe observable qualities.</strong><p>Each line becomes one visible review criterion with equal weight. The learner can structure the response however the prompt asks.</p></aside>${indexed(area("Review criteria — one per line", "problem.rubricCriteria", problem.rubricCriteria, { rows:5, hint:"Use specific criteria such as “Uses two relevant sources” rather than “Good answer.”" }))}<button class="studio-example-button" type="button" data-creator-action="apply-rubric-example" data-index="${index}">Fill with an editable rubric example</button>` : ""}
    ${reviewIsRequired ? `<div class="studio-review-lock"><span aria-hidden="true">✓</span><div><strong>Mastery waits for a passed review</strong><p>${problem.workReview === "self_review" ? "The learner can review this response on the Results page." : "A human tutor or connected agent reviews the saved response on the Results page."}</p></div></div>` : `<div class="studio-checks"><label><input type="checkbox" data-index="${index}" data-creator-field="problem.masteryRequiresReview" ${problem.masteryRequiresReview ? "checked" : ""}> Review must pass before mastery</label><label><input type="checkbox" data-index="${index}" data-creator-field="problem.allowSelfReview" ${problem.allowSelfReview ? "checked" : ""}> Allow self review</label></div>`}
    ${renderStudentPreview(problem)}
  </details>`;
}

function renderProblemEditor(skill, problem, index) {
  const indexed = (markup) => markup.replaceAll("data-creator-field", `data-index="${index}" data-creator-field`);
  const isProof = problem.workMode === "proof_obligations";
  const graderHelp = isProof ? "This grades only the short conclusion. It never decides whether the proof is valid; that happens through the obligation review below." : "This checks only the final-answer field. Proofs and long responses are handled separately under How the learner answers.";
  return `<details open>
    <summary><span>${String(index + 1).padStart(2, "0")}</span><b>${esc(problem.prompt || "Untitled question")}</b><small>${esc(problem.gradingMethod)} · ${esc(WORK_MODE_GUIDES[problem.workMode]?.title ?? problem.workMode)}</small></summary>
    <div class="studio-problem-body">
      <div class="studio-repeat-head"><b>Question ${index + 1}</b>${skill.problems.length > 1 ? `<button data-creator-action="remove-problem" data-index="${index}">Remove</button>` : ""}</div>
      ${indexed(field("Question ID", "problem.templateId", problem.templateId, { hint: "A stable internal name; learners do not see it." }))}
      ${indexed(area("Learner prompt", "problem.prompt", problem.prompt, { rows: 3, hint: "Ask for both the final answer and reasoning here when reasoning matters." }))}
      <details class="studio-advanced formatted-prompt-authoring" ${problem.promptCode ? "open" : ""}><summary>Formatted code block <small>optional</small></summary><p class="studio-field-intro">Put the explanatory sentence in Learner prompt and the source code here. QuickMaths escapes the text and preserves indentation in a labelled, horizontally scrollable code block.</p><div class="studio-two">${indexed(select("Language label", "problem.promptCodeLanguage", problem.promptCodeLanguage, [["python","Python"],["javascript","JavaScript"],["text","Plain code / pseudocode"]]))}${indexed(area("Code shown beneath the prompt", "problem.promptCode", problem.promptCode, { rows:8, hint:"Presentation only: uploaded prompt code is never executed." }))}</div></details>
      <div class="studio-response-picker"><div><strong>Question response type</strong><small>Each question may use an ordinary answer, a sandboxed Python function, checked calculations, formal proof review, a rational-equation ledger, a trace table, or a structured sign chart.</small></div>${indexed(select("What must the learner submit?", "problem.workMode", problem.workMode, [["none","Final answer only"],["capture_only","Final answer + written explanation"],["procedural_steps","Checked maths steps — Advanced Algebra style"],["code_trace_steps","Code trace — variable/output table"],["rational_equation_steps","Rational equation — restrictions and candidate checks"],["sign_chart_steps","Sign chart — critical points and interval tests"],["proof_obligations","Formal proof required — reviewed before mastery"],["rubric_check","Required long response + rubric review"]], "Advanced Algebra-style steps are checked automatically. Code traces, rational equations, and sign charts use guided fields and local checks. Formal proofs are stored for obligation-by-obligation human or agent review."))}<div class="studio-response-summary"><span aria-hidden="true">${problem.workMode === "proof_obligations" ? "∴" : ["procedural_steps","rational_equation_steps","sign_chart_steps","code_trace_steps"].includes(problem.workMode) ? "=" : problem.workMode === "rubric_check" ? "☷" : "✎"}</span><div><strong>${esc(WORK_MODE_GUIDES[problem.workMode]?.title ?? problem.workMode)}</strong><p>${esc(WORK_MODE_GUIDES[problem.workMode]?.summary ?? "")}</p></div></div></div>
      <div class="studio-three">
        ${indexed(select("Difficulty", "problem.difficulty", problem.difficulty, [["easy","Easy"],["medium","Medium"],["hard","Hard"],["brutal","Brutal"]]))}
        ${indexed(select(isProof ? "Conclusion grader" : "Final-answer grader", "problem.gradingMethod", problem.gradingMethod, [["exact_numeric","Exact number"],["numeric_with_tolerance","Number with tolerance"],["multiple_choice","Multiple choice"],["python_program","Sandboxed Python function"],["symbolic_expression","Equivalent expression"],["equation_solution","Equation solution"],["inequality_solution","Linear inequality solution"],["finite_set","Finite solution set"],["rational_expression","Rational expression + exclusions"],["interval_set","Interval / union solution set"],["exact_text","Exact text"],["theorem_conclusion",isProof ? "Accepted conclusion · recommended" : "Accepted conclusion"]], graderHelp))}
        ${indexed(field(isProof ? "Private expected conclusion" : problem.gradingMethod === "python_program" ? "Result label" : "Private expected answer", "problem.expectedAnswer", problem.expectedAnswer, { help: problem.gradingMethod === "python_program" ? "Use a label such as “All declared Python tests pass.” Actual expected values live only in the declarative tests below." : isProof ? "The short conclusion is graded separately from the proof. This value is never shown before submission." : "Never shown before submission. For multiple choice, enter the correct option ID.", hint: isProof ? "A correct conclusion still leaves the proof pending review." : problem.gradingMethod === "python_program" ? "This is shown after submission; it is not executable code." : "The final-answer grader compares the learner's answer with this value." }))}
      </div>
      ${problem.gradingMethod === "multiple_choice" ? indexed(area("Choices — ID | label, one per line", "problem.options", problem.options, { rows: 4, hint: "Example: A | Pacific Ocean. Put the correct ID, such as A, in Private expected answer." })) : ""}
      ${problem.gradingMethod === "numeric_with_tolerance" ? indexed(field("Allowed numerical difference", "problem.tolerance", problem.tolerance, { type: "number", min: 0, step: .001, hint: "0.01 accepts answers within ±0.01 of the expected number." })) : ""}
      ${problem.gradingMethod === "finite_set" ? indexed(area("Expected members — one per line", "problem.answerValues", problem.answerValues, { rows:3, hint:"Order and duplicates do not matter. Leave empty for the empty set." })) : ""}
      ${problem.gradingMethod === "rational_expression" ? `<div class="studio-two">${indexed(area("Excluded values — one per line", "problem.excludedValues", problem.excludedValues, { rows:3, hint:"Keep every zero of the original denominator, including holes that cancel from the formula." }))}${indexed(field("Target variable", "problem.answerVariable", problem.answerVariable, { hint:"Usually x." }))}</div><label class="studio-check"><input type="checkbox" data-index="${index}" data-creator-field="problem.requireReducedForm" ${problem.requireReducedForm ? "checked" : ""}> Require a reduced formula with no obvious common factor</label>` : ""}
      ${problem.gradingMethod === "interval_set" ? indexed(field("Target variable", "problem.answerVariable", problem.answerVariable, { hint:"The learner may use interval notation, unions, a singleton [a,a], empty/all-real aliases, or equivalent inequalities." })) : ""}
      ${problem.gradingMethod === "python_program" ? `<section class="studio-python-authoring"><aside class="studio-syntax-note"><strong>Declarative tests, isolated learner code.</strong><p>The learner writes one pure function. Each test line supplies JSON arguments and an expected JSON return; lesson files cannot supply scripts or a test harness. The disposable Python worker rejects imports, files, network, browser access, dynamic evaluation, private attributes, and unsupported syntax.</p></aside><div class="studio-three">${indexed(field("Function name", "problem.pythonEntrypoint", problem.pythonEntrypoint, { hint:"Letters, numbers, and underscores; no leading underscore." }))}${indexed(select("Return type", "problem.pythonReturnType", problem.pythonReturnType, [["json","Any JSON value"],["bool","Boolean"],["int","Integer"],["float","Number"],["str","Text"],["list","List"],["dict","Dictionary"],["none","None"]]))}${indexed(area("Parameters — name | type", "problem.pythonParameters", problem.pythonParameters, { rows:4, hint:"One per line. Types: json, bool, int, float, str, list, dict." }))}</div>${indexed(area("Tests — visibility | id | arguments JSON | expected JSON", "problem.pythonTests", problem.pythonTests, { rows:7, hint:'Example: example | even | [8] | true. Include at least one example; after_submission reveals results later; hidden never reveals inputs or expected values.' }))}<div class="studio-two">${indexed(area("Allowed builtins — one per line", "problem.pythonBuiltins", problem.pythonBuiltins, { rows:4, hint:"Leave empty when none are needed. Available: abs, all, any, bool, dict, enumerate, float, int, len, list, max, min, range, round, set, sorted, str, sum, tuple, zip." }))}<div class="studio-three">${indexed(field("Wall time (ms)", "problem.pythonWallTime", problem.pythonWallTime, { type:"number", min:250, max:3000 }))}${indexed(field("Step limit", "problem.pythonStepLimit", problem.pythonStepLimit, { type:"number", min:100, max:50000 }))}${indexed(field("Output chars", "problem.pythonStdoutChars", problem.pythonStdoutChars, { type:"number", min:0, max:4000 }))}</div></div><button class="studio-example-button" type="button" data-creator-action="apply-python-example" data-index="${index}">Load an editable is_even sandbox example</button></section>` : ""}
      ${["theorem_conclusion", "symbolic_expression", "equation_solution", "inequality_solution"].includes(problem.gradingMethod) ? indexed(area(isProof ? "Other accepted conclusions — one per line" : "Other accepted final answers — one per line", "problem.acceptedForms", problem.acceptedForms, { rows: 3, hint: "These apply only to the short final answer, not the proof text." })) : ""}
      ${indexed(area("Private solution outline — one step per line", "problem.solutionSteps", problem.solutionSteps, { rows: 4, hint: "Shown after submission; keep answer-key reasoning out of the learner prompt." }))}
      ${indexed(area("Mistake tags — one per line", "problem.mistakeTags", problem.mistakeTags, { rows: 2, hint: "Short labels such as sign_error or missing_evidence help the tutor target follow-up work." }))}
      ${renderAdvancedWork(problem, index)}
    </div>
  </details>`;
}

function parseCriticalPoints(value) {
  return lines(value).map((line) => {
    const [point, kind = "zero", multiplicity = "1", ...factor] = line.split("|").map((item) => item.trim());
    return { value: point, kind, multiplicity: Math.max(1, Number(multiplicity) || 1), factor: factor.join(" | ") };
  });
}

function traceValue(value) {
  const source = String(value ?? "").trim();
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    return ["string", "number", "boolean"].includes(typeof parsed) || parsed == null ? parsed : source;
  } catch { return source; }
}

function parseTraceRows(value, columns) {
  return lines(value).map((line) => {
    const cells = line.split("|").map((item) => item.trim());
    return Object.fromEntries(columns.map((column, index) => [column, traceValue(cells[index])]));
  });
}

function parsePythonParameters(value) {
  return lines(value).map((line) => {
    const [name, type = "json"] = line.split("|").map((item) => item.trim());
    return { name, type };
  });
}

function parsePythonTests(value) {
  return lines(value).map((line) => {
    const [visibility, id, argsSource, ...expectedParts] = line.split("|").map((item) => item.trim());
    return { visibility, id, args: JSON.parse(argsSource), expected_return: JSON.parse(expectedParts.join("|")) };
  });
}

function buildPack(draft) {
  const subjectId = draft.subjectMode === "extend" ? draft.subjectId : cleanId(draft.subjectId, "SUBJECT_");
  const skillIds = draft.skills.map((skill) => draft.mode === "override" ? skill.id : cleanId(skill.id, "CUSTOM_"));
  const skills = draft.skills.map((skill, skillIndex) => {
    const skillId = skillIds[skillIndex];
    return {
      id: skillId, name: skill.name, domain: draft.subjectName, subdomain: skill.subdomain, description: skill.description,
      prerequisites: skill.prerequisites, unlocks: [], tags: lines(skill.tags),
      mastery: {
        passing_score: Number(skill.passingScore), minimum_confidence: Number(skill.minimumConfidence), max_guessing_allowed: "maybe",
        review_after_days_if_mastered: Number(skill.reviewMasteredDays), review_after_days_if_learning: Number(skill.reviewLearningDays),
      },
      theory: skill.theory,
      examples: skill.examples.map((example) => ({ prompt: example.prompt, solution: example.solution, explanation: example.explanation })),
      applications: skill.applications.map((application) => ({ title: application.title, description: application.description })),
      question_count: draft.mode === "override" ? Math.min(Number(skill.questionCount ?? skill.problems.length), skill.problems.length) : skill.problems.length,
      problems: skill.problems.map((problem, problemIndex) => {
        const answerMode = problem.workMode === "none" ? "final_only"
          : ["procedural_steps", "proof_obligations", "rubric_check", "rational_equation_steps", "sign_chart_steps", "code_trace_steps"].includes(problem.workMode) ? "final_plus_required_work" : problem.answerMode;
        const work = {
          mode: problem.workMode, prompt: problem.workPrompt, minimum_steps: Number(problem.minimumSteps), line_type: problem.lineType,
          require_final_answer_match: true,
        };
        if (problem.workMode === "proof_obligations") work.proof_policy = { obligations: lines(problem.proofObligations), accepted_strategies: lines(problem.proofStrategies) };
        if (problem.workMode === "rubric_check") work.rubric = { criteria: lines(problem.rubricCriteria).map((description, index) => ({ id: `criterion_${index + 1}`, description, weight: 1 })) };
        if (problem.workMode === "rational_equation_steps") {
          work.target_variable = problem.targetVariable || "x";
          work.original_equation = problem.originalEquation || problem.prompt.replace(/^.*?:\s*/, "");
          work.expected_restrictions = lines(problem.expectedRestrictions);
          work.require_restrictions = Boolean(problem.requireRestrictions);
          work.require_original_equation_check = Boolean(problem.requireOriginalEquationCheck);
        }
        if (problem.workMode === "sign_chart_steps") {
          work.target_variable = problem.targetVariable || "x";
          work.sign_chart = {
            expression_kind: problem.signExpressionKind,
            expression: problem.signExpression,
            relation: problem.signRelation,
            expected_factorization: problem.expectedFactorization,
            reduced_expression: problem.reducedExpression,
            require_factorization: Boolean(problem.requireFactorization),
            critical_points: parseCriticalPoints(problem.criticalPoints),
            require_test_values: Boolean(problem.requireTestValues),
            require_interval_signs: Boolean(problem.requireIntervalSigns),
            require_endpoint_decisions: Boolean(problem.requireEndpointDecisions),
            require_final_answer_match: Boolean(problem.requireFinalAnswerMatch),
          };
        }
        if (problem.workMode === "code_trace_steps") {
          const columns = lines(problem.traceColumns);
          work.trace_spec = {
            language: "python",
            display_code: problem.traceDisplayCode || problem.promptCode,
            columns,
            expected_rows: parseTraceRows(problem.traceRows, columns),
            comparison: { trim_strings: true, numeric_equivalence: true, blank_equals_null: true },
          };
        }
        const templateId = draft.mode === "override" ? problem.templateId : cleanId(problem.templateId || `${skillId}_Q${problemIndex + 1}`, "QUESTION_");
        const output = {
          template_id: templateId, source_template_id: problem.sourceTemplateId || templateId, skill_id: skillId,
          difficulty: problem.difficulty, prompt: problem.prompt, expected_answer: problem.gradingMethod === "finite_set" ? `{${lines(problem.answerValues).join(", ")}}` : problem.expectedAnswer,
          answer_type: problem.answerType, grading_method: problem.gradingMethod, solution_steps: lines(problem.solutionSteps),
          mistake_tags: lines(problem.mistakeTags), answer_mode: answerMode, work,
          review_policy: {
            work_review: ["proof_obligations", "rubric_check"].includes(problem.workMode) ? (problem.workReview === "self_review" ? "self_review" : "tutor_required") : problem.workReview,
            mastery_requires_review_pass: ["proof_obligations", "rubric_check"].includes(problem.workMode) || Boolean(problem.masteryRequiresReview),
            allow_self_review: ["proof_obligations", "rubric_check"].includes(problem.workMode) ? problem.workReview === "self_review" : Boolean(problem.allowSelfReview),
          },
        };
        if (problem.promptCode.trim()) output.prompt_blocks = [{ type: "text", text: problem.prompt }, { type: "code", language: problem.promptCodeLanguage || "python", text: problem.promptCode }];
        if (problem.gradingMethod === "numeric_with_tolerance") output.tolerance = Number(problem.tolerance);
        if (problem.gradingMethod === "finite_set") output.answer_metadata = { type: "finite_set", variable: problem.answerVariable || "x", values: lines(problem.answerValues) };
        if (problem.gradingMethod === "rational_expression") {
          output.answer_metadata = { type: "rational_expression", variable: problem.answerVariable || "x", value: problem.expectedAnswer, excluded_values: lines(problem.excludedValues) };
          output.grading_metadata = { require_reduced_form: Boolean(problem.requireReducedForm) };
        }
        if (problem.gradingMethod === "interval_set") output.answer_metadata = { type: "interval_set", variable: problem.answerVariable || "x", value: problem.expectedAnswer };
        if (problem.gradingMethod === "multiple_choice") output.options = lines(problem.options).map((line, index) => {
          const [rawId, ...rest] = line.split("|");
          return { id: (rawId || String.fromCharCode(65 + index)).trim(), label: (rest.join("|") || rawId).trim() };
        });
        if (problem.gradingMethod === "python_program") {
          output.answer_type = "code";
          output.program_spec = {
            runtime: "python_subset_v1",
            entrypoint: { kind: "function", name: problem.pythonEntrypoint, parameters: parsePythonParameters(problem.pythonParameters), return_type: problem.pythonReturnType },
            tests: parsePythonTests(problem.pythonTests),
            limits: { wall_time_ms: Number(problem.pythonWallTime), step_limit: Number(problem.pythonStepLimit), memory_mb: 32, stdout_chars: Number(problem.pythonStdoutChars) },
            policy: { allowed_builtins: lines(problem.pythonBuiltins), imports: [], network: false, storage: false, clock: false, randomness: false },
          };
        }
        if (problem.acceptedForms.trim()) output.accepted_forms = lines(problem.acceptedForms);
        return output;
      }),
    };
  });
  return {
    format: "quickmaths.lesson-set", schema_version: "2.0", mode: draft.mode === "override" ? "override" : "add", id: cleanId(draft.id, "PACK_"), name: draft.name,
    description: draft.description, author: draft.author || "QuickMaths Lesson Studio", version: draft.version,
    subject: {
      id: subjectId, name: draft.subjectName, short_name: draft.subjectShortName, icon: draft.subjectIcon,
      description: draft.subjectDescription, theme: draft.theme,
    },
    track: { id: `TRACK_${cleanId(draft.id, "PACK_")}`, name: draft.name, domain: draft.subjectName, description: draft.description, skills: skillIds },
    skills,
  };
}

function draftFromPack(pack, snapshot) {
  const base = blankDraft(snapshot);
  base.mode = pack.mode === "override" ? "override" : "add";
  base.nativeSkillId = base.mode === "override" ? (pack.skills?.[0]?.id ?? "") : "";
  base.id = pack.id ?? base.id; base.name = pack.name ?? base.name; base.description = pack.description ?? base.description;
  base.author = pack.author ?? ""; base.version = pack.version ?? "1.0.0";
  if (pack.subject) {
    base.subjectId = pack.subject.id ?? base.subjectId; base.subjectName = pack.subject.name ?? base.subjectName;
    base.subjectShortName = pack.subject.short_name ?? pack.subject.shortName ?? base.subjectShortName;
    base.subjectIcon = pack.subject.icon ?? base.subjectIcon; base.subjectDescription = pack.subject.description ?? "";
    base.theme = { ...DEFAULT_THEME, ...(pack.subject.theme ?? {}) };
    base.subjectMode = snapshot.subjects.some((subject) => subject.id === base.subjectId) ? "extend" : "create";
  }
  base.skills = (pack.skills ?? []).map((skill, skillIndex) => ({
    ...blankSkill(skillIndex), activeProblem: 0, id: skill.id, name: skill.name, description: skill.description, subdomain: skill.subdomain ?? "Foundations",
    theory: skill.theory, tags: (skill.tags ?? []).join("\n"), prerequisites: (skill.prerequisites ?? []).map((ref) => typeof ref === "string" ? ref : ref.skill_id),
    passingScore: skill.mastery?.passing_score ?? .8, minimumConfidence: skill.mastery?.minimum_confidence ?? 3,
    reviewMasteredDays: skill.mastery?.review_after_days_if_mastered ?? 7, reviewLearningDays: skill.mastery?.review_after_days_if_learning ?? 2,
    questionCount: skill.question_count ?? skill.problems?.length ?? 1,
    examples: skill.examples?.length ? skill.examples : [], applications: skill.applications?.length ? skill.applications : [],
    problems: (skill.problems ?? []).map((problem, problemIndex) => ({
      ...blankProblem(skill.id, problemIndex), templateId: problem.template_id, sourceTemplateId: problem.source_template_id ?? problem.template_id, prompt: problem.prompt,
      promptCode: problem.prompt_blocks?.find((block) => block.type === "code")?.text ?? "", promptCodeLanguage: problem.prompt_blocks?.find((block) => block.type === "code")?.language ?? "python",
      expectedAnswer: String(problem.expected_answer ?? ""),
      answerType: problem.answer_type ?? "text", gradingMethod: problem.grading_method, difficulty: problem.difficulty ?? "medium",
      tolerance: String(problem.tolerance ?? .001), options: (problem.options ?? []).map((option) => `${option.id} | ${option.label}`).join("\n"),
      acceptedForms: (problem.accepted_forms ?? []).join("\n"), solutionSteps: (problem.solution_steps ?? []).join("\n"), mistakeTags: (problem.mistake_tags ?? []).join("\n"),
      answerMode: problem.answer_mode ?? "final_only", workMode: problem.work?.mode ?? "none", workPrompt: problem.work?.prompt ?? "",
      minimumSteps: problem.work?.minimum_steps ?? 2, lineType: problem.work?.line_type ?? "expression",
      proofObligations: (problem.work?.proof_policy?.obligations ?? []).map((item) => typeof item === "string" ? item : item.description ?? item.label ?? item.id).join("\n"), proofStrategies: (problem.work?.proof_policy?.accepted_strategies ?? []).map((item) => typeof item === "string" ? item : item.name ?? item.id).join("\n"),
      rubricCriteria: (problem.work?.rubric?.criteria ?? []).map((criterion) => criterion.description).join("\n"),
      workReview: problem.review_policy?.work_review ?? "none", masteryRequiresReview: Boolean(problem.review_policy?.mastery_requires_review_pass),
      allowSelfReview: problem.review_policy?.allow_self_review !== false,
      answerValues: (problem.answer_metadata?.values ?? []).join("\n"), excludedValues: (problem.answer_metadata?.excluded_values ?? []).join("\n"),
      answerVariable: problem.answer_metadata?.variable ?? problem.variable ?? "x", requireReducedForm: problem.grading_metadata?.require_reduced_form !== false,
      targetVariable: problem.work?.target_variable ?? "x", originalEquation: problem.work?.original_equation ?? "", expectedRestrictions: (problem.work?.expected_restrictions ?? []).join("\n"), requireRestrictions: problem.work?.require_restrictions !== false,
      requireOriginalEquationCheck: problem.work?.require_original_equation_check !== false,
      signExpressionKind: problem.work?.sign_chart?.expression_kind ?? "polynomial", signExpression: problem.work?.sign_chart?.expression ?? "",
      signRelation: problem.work?.sign_chart?.relation ?? ">", expectedFactorization: problem.work?.sign_chart?.expected_factorization ?? "",
      reducedExpression: problem.work?.sign_chart?.reduced_expression ?? "", requireFactorization: problem.work?.sign_chart?.require_factorization === true,
      criticalPoints: (problem.work?.sign_chart?.critical_points ?? []).map((point) => `${point.value} | ${point.kind} | ${point.multiplicity ?? 1} | ${point.factor ?? ""}`).join("\n"),
      requireTestValues: problem.work?.sign_chart?.require_test_values !== false, requireIntervalSigns: problem.work?.sign_chart?.require_interval_signs !== false,
      requireEndpointDecisions: problem.work?.sign_chart?.require_endpoint_decisions !== false, requireFinalAnswerMatch: problem.work?.sign_chart?.require_final_answer_match !== false,
      traceDisplayCode: problem.work?.trace_spec?.display_code ?? "", traceColumns: (problem.work?.trace_spec?.columns ?? ["step", "x", "output"]).join("\n"),
      traceRows: (problem.work?.trace_spec?.expected_rows ?? []).map((row) => (problem.work?.trace_spec?.columns ?? []).map((column) => row[column] == null ? "" : typeof row[column] === "string" ? row[column] : JSON.stringify(row[column])).join(" | ")).join("\n"),
      pythonEntrypoint: problem.program_spec?.entrypoint?.name ?? "solve",
      pythonParameters: (problem.program_spec?.entrypoint?.parameters ?? [{ name: "value", type: "int" }]).map((parameter) => `${parameter.name} | ${parameter.type}`).join("\n"),
      pythonReturnType: problem.program_spec?.entrypoint?.return_type ?? "json",
      pythonTests: (problem.program_spec?.tests ?? []).map((test) => `${test.visibility} | ${test.id} | ${JSON.stringify(test.args)} | ${JSON.stringify(test.expected_return)}`).join("\n"),
      pythonBuiltins: (problem.program_spec?.policy?.allowed_builtins ?? []).join("\n"), pythonWallTime: problem.program_spec?.limits?.wall_time_ms ?? 1500,
      pythonStepLimit: problem.program_spec?.limits?.step_limit ?? 20000, pythonStdoutChars: problem.program_spec?.limits?.stdout_chars ?? 1000,
    })),
  }));
  if (!base.skills.length) base.skills = [blankSkill(0)];
  return base;
}

export function createLessonStudio({ store, download, showToast, getSnapshot, openFilePicker, publishToDepot = () => {} }) {
  let draft = restoreDraft(getSnapshot());

  const save = () => persist(draft);
  const currentSkill = () => draft.skills[Math.max(0, Math.min(draft.activeSkill, draft.skills.length - 1))];
  const loadNativeLesson = (skillId, { announce = true } = {}) => {
    const snapshot = getSnapshot();
    const source = store.skillsById[skillId];
    if (!source || source.custom) throw new Error("Choose a native QuickMaths lesson to improve.");
    if (source.overridden) throw new Error("Restore this lesson's installed improvement in Settings before creating a replacement.");
    const subject = snapshot.subjects.find((item) => item.id === source.subjectId);
    if (!subject) throw new Error("The native lesson subject is unavailable.");
    draft = draftFromPack({
      format: "quickmaths.lesson-set", schema_version: "2.0", mode: "override",
      id: cleanId(`IMPROVE_${source.id}`, "PACK_"),
      name: `Improvement · ${source.name}`,
      description: `A reversible improvement to the native QuickMaths lesson ${source.name}.`,
      author: "", version: "1.0.0",
      subject: { ...subject, short_name: subject.shortName },
      track: { id: `TRACK_IMPROVE_${source.id}`, name: `Improvement · ${source.name}`, skills: [source.id] },
      skills: [source],
    }, snapshot);
    draft.tutorialOpen = false;
    draft.nativeSkillId = source.id;
    draft.nativePreviewVariation = 0;
    save();
    if (announce) showToast(`${source.name} opened as an editable native improvement.`);
    return { ok: true, mode: "override", skillId: source.id, completedProgressPreserved: true };
  };

  const setField = (path, value, target) => {
    const skill = currentSkill();
    if (path.startsWith("draft.")) draft[path.slice(6)] = value;
    else if (path.startsWith("theme.")) draft.theme[path.slice(6)] = value;
    else if (path.startsWith("skill.")) skill[path.slice(6)] = value;
    else if (path.startsWith("problem.")) skill.problems[Number(target.dataset.index)][path.slice(8)] = target.type === "checkbox" ? target.checked : value;
    else if (path.startsWith("example.")) skill.examples[Number(target.dataset.index)][path.slice(8)] = value;
    else if (path.startsWith("application.")) skill.applications[Number(target.dataset.index)][path.slice(12)] = value;
    if (path === "problem.workMode") applyWorkModeDefaults(skill.problems[Number(target.dataset.index)], value);
    if (path === "problem.gradingMethod" && value === "python_program") {
      const problem = skill.problems[Number(target.dataset.index)];
      problem.answerType = "code";
      if (!problem.expectedAnswer) problem.expectedAnswer = "All declared Python tests pass.";
      if (!problem.promptCode) problem.promptCode = `def ${problem.pythonEntrypoint || "solve"}(value):\n    pass`;
    }
    if (path === "problem.workReview" && ["proof_obligations", "rubric_check"].includes(skill.problems[Number(target.dataset.index)].workMode)) {
      skill.problems[Number(target.dataset.index)].masteryRequiresReview = true;
      skill.problems[Number(target.dataset.index)].allowSelfReview = value === "self_review";
    }
    if (path === "draft.subjectMode" && value === "create" && draft.subjectId === "SUBJECT_MATH") {
      draft.subjectId = "SUBJECT_MY_SUBJECT"; draft.subjectName = "My subject"; draft.subjectShortName = "Subject";
      draft.subjectIcon = "◇"; draft.subjectDescription = "A custom QuickMaths curriculum."; draft.theme = { ...DEFAULT_THEME };
    }
    if (path === "draft.subjectMode" && value === "extend") {
      const subject = getSnapshot().activeSubject;
      draft.subjectId = subject.id; draft.subjectName = subject.name; draft.subjectShortName = subject.shortName;
      draft.subjectIcon = subject.icon; draft.subjectDescription = subject.description; draft.theme = { ...subject.theme };
    }
    if (path === "draft.subjectId" && draft.subjectMode === "extend") {
      const subject = getSnapshot().subjects.find((item) => item.id === value);
      if (subject) {
        draft.subjectName = subject.name; draft.subjectShortName = subject.shortName; draft.subjectIcon = subject.icon;
        draft.subjectDescription = subject.description; draft.theme = { ...subject.theme };
      }
    }
    draft.lastValidation = null;
    save();
  };

  const render = (snapshot) => {
    const skill = currentSkill();
    skill.activeProblem = Math.max(0, Math.min(Number(skill.activeProblem) || 0, skill.problems.length - 1));
    const activeProblem = skill.problems[skill.activeProblem];
    let nativePreview = null;
    if (draft.mode === "override") {
      try { nativePreview = store.previewNativeAssessment(skill.id, draft.nativePreviewVariation ?? 0); } catch { /* Older/custom native content has no runtime templates. */ }
    }
    const nativePreviewProblem = nativePreview?.problems.find((problem) => problem.source_template_id === activeProblem.sourceTemplateId) ?? nativePreview?.problems[skill.activeProblem % Math.max(1, nativePreview?.problems.length ?? 1)] ?? null;
    const nativeSkills = snapshot.curriculum.allSkills.filter((item) => item.native && !item.custom && !item.overridden);
    if (!draft.nativeSkillId || !nativeSkills.some((item) => item.id === draft.nativeSkillId)) draft.nativeSkillId = snapshot.selectedSkill?.custom ? (nativeSkills[0]?.id ?? "") : (snapshot.selectedSkill?.id ?? nativeSkills[0]?.id ?? "");
    const currentDraftSkillId = draft.mode === "override" ? skill.id : cleanId(skill.id, "CUSTOM_");
    const allSkills = [
      ...snapshot.curriculum.allSkills.map((item) => ({ id: item.id, name: item.name, subjectId: item.subjectId })),
      ...draft.skills.map((item) => ({ id: cleanId(item.id, "CUSTOM_"), name: item.name, subjectId: draft.subjectId })),
    ].filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index && item.id !== currentDraftSkillId);
    const validation = draft.lastValidation;
    const subjectOptions = snapshot.subjects.map((subject) => [subject.id, `${subject.icon} ${subject.name} · ${subject.skillIds.length} lessons`]);
    return `
      <header class="page-head studio-head"><div><p class="eyebrow">Human Lesson Creator</p><h1>Create something new—or improve what ships with QuickMaths.</h1><p>These friendly forms produce the same validated add-on and native-improvement formats an agent can author directly.</p></div><div class="page-actions"><button class="button button-outline" data-creator-action="import">Open JSON</button><button class="button button-primary" data-creator-action="download">Download lesson set</button></div></header>
      <section class="studio-native-picker"><div><p class="eyebrow">Improve our work</p><h2>Edit a native lesson</h2><p>Open any built-in lesson as a reversible override. Its ID and completed learner progress stay intact; unfinished tests restart on install, and restoring the original later does not erase mastery.</p></div><label><span>Native lesson</span><select data-creator-field="draft.nativeSkillId">${nativeSkills.map((item) => `<option value="${esc(item.id)}" ${item.id === draft.nativeSkillId ? "selected" : ""}>${esc(snapshot.subjects.find((subject) => subject.id === item.subjectId)?.name ?? "QuickMaths")} › ${esc(item.name)}</option>`).join("")}</select></label><button class="button button-secondary" data-creator-action="load-native">Open editable copy</button></section>
      ${draft.tutorialOpen ? `<section class="studio-tutorial"><div><p class="eyebrow">Two-minute tour</p><h2>Word for lesson files, basically.</h2><p>Pick a subject, write one or more lessons, add mastery questions, then validate and install. Tap or hover any <i aria-hidden="true">?</i> for a plain-English explanation.</p></div><ol><li><b>1</b><span>Subject<small>Extend Maths or start Biology, Physics, anything.</small></span></li><li><b>2</b><span>Lessons<small>Theory, examples, applications, and bridge prerequisites.</small></span></li><li><b>3</b><span>Questions<small>Answers, graders, shown work, proof, and review rules.</small></span></li><li><b>4</b><span>Publish<small>Validate, download, and install into the same save pipeline.</small></span></li></ol><button class="quiet-button" data-creator-action="close-tutorial">Got it — hide the tour</button></section>` : `<button class="quiet-button studio-tour-open" data-creator-action="open-tutorial">Show the two-minute tour</button>`}
      <section class="studio-grid">
        <aside class="studio-rail">
          <p class="eyebrow">Lesson set</p>
          ${field("Set name", "draft.name", draft.name, { help: "The title shown when this set is installed." })}
          ${field("Pack ID", "draft.id", draft.id, { help: "A stable unique ID. The studio formats it as PACK_SOMETHING." })}
          ${area("Description", "draft.description", draft.description, { rows: 3 })}
          ${field("Author", "draft.author", draft.author, { placeholder: "Your name" })}
          ${field("Version", "draft.version", draft.version)}
          <hr>
          <div class="studio-section-title"><div><p class="eyebrow">Lessons</p><strong>${draft.mode === "override" ? "Native improvement" : `${draft.skills.length} in this set`}</strong></div>${draft.mode === "override" ? "" : `<button data-creator-action="add-skill" title="Add another lesson">＋</button>`}</div>
          <div class="studio-skill-list">${draft.skills.map((item, index) => `<button data-creator-action="select-skill" data-index="${index}" class="${index === draft.activeSkill ? "is-active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><b>${esc(item.name || "Untitled lesson")}</b><small>${esc(item.id)}</small></button>`).join("")}</div>
          <button class="button button-outline studio-reset" data-creator-action="reset">Reset studio draft</button>
        </aside>
        <div class="studio-canvas">
          <section class="studio-card">
            <div class="studio-section-title"><div><p class="eyebrow">1 · Subject</p><h2>${draft.mode === "override" ? "Native lesson location" : "Where does this set live?"}</h2></div></div>
            ${draft.mode === "override" ? `<p class="studio-portability-note"><strong>Curriculum portability:</strong> native improvements apply browser-wide. Curriculum Designer blocks export until they are restored, so distribute an improvement separately for explicit review.</p>` : ""}
            ${draft.mode === "override" ? `<div class="studio-override-note"><span>↻</span><div><strong>${esc(draft.subjectName)} · ${esc(skill.id)}</strong><p>This improvement replaces the lesson content only while installed. The native ID, map position, and every learner’s completed progress remain preserved; unfinished tests restart when the improvement is installed or restored.</p></div></div>` : `<div class="studio-choice"><label><input type="radio" data-creator-field="draft.subjectMode" value="extend" ${draft.subjectMode === "extend" ? "checked" : ""}><span><b>Extend a subject</b><small>Add these lessons into an existing curriculum.</small></span></label><label><input type="radio" data-creator-field="draft.subjectMode" value="create" ${draft.subjectMode === "create" ? "checked" : ""}><span><b>Create a subject</b><small>Start a separate curriculum with its own colors.</small></span></label></div>${draft.subjectMode === "extend" ? select("Existing subject", "draft.subjectId", draft.subjectId, subjectOptions, "The subject dropdown and mastery map will show these lessons here.") : `<div class="studio-two">${field("Subject ID", "draft.subjectId", draft.subjectId, { help: "A stable ID such as SUBJECT_BIOLOGY." })}${field("Subject name", "draft.subjectName", draft.subjectName)}</div><div class="studio-three">${field("Short name", "draft.subjectShortName", draft.subjectShortName)}${field("Icon", "draft.subjectIcon", draft.subjectIcon, { help: "One short symbol or emoji used in the subject picker." })}${field("Description", "draft.subjectDescription", draft.subjectDescription)}</div><div class="theme-palette">${Object.entries(draft.theme).map(([key, value]) => `<label title="${esc(key)}"><input data-creator-field="theme.${esc(key)}" type="color" value="${esc(value)}"><span>${esc(key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`))}</span></label>`).join("")}</div>`}`}
          </section>
          <section class="studio-card">
            <div class="studio-section-title"><div><p class="eyebrow">2 · Lesson ${draft.activeSkill + 1}</p><h2>${esc(skill.name)}</h2></div>${draft.skills.length > 1 ? `<button class="danger-link" data-creator-action="remove-skill">Remove lesson</button>` : ""}</div>
            <div class="studio-two">${field("Lesson name", "skill.name", skill.name)}${field("Lesson ID", "skill.id", skill.id, { readonly: draft.mode === "override", help: draft.mode === "override" ? "Locked so existing learner progress remains attached to this native lesson." : "Stable and globally unique. The studio enforces the CUSTOM_ prefix." })}</div>
            <div class="studio-two">${field("Topic / subdomain", "skill.subdomain", skill.subdomain)}${field("Tags, one per line", "skill.tags", skill.tags)}</div>
            ${area("What will learners master?", "skill.description", skill.description, { rows: 3 })}
            ${area("Lesson theory", "skill.theory", skill.theory, { rows: 9, help: "Plain text only. Blank lines make paragraphs; lines beginning with - make lists." })}
            <label class="studio-field"><span>Prerequisite bridges ${helpButton("Choose lessons from any installed subject or from this draft. In Hard path they lock this test; in Open path they are guidance.")}</span><select data-creator-prerequisites multiple size="${Math.min(8, Math.max(4, allSkills.length))}">${allSkills.map((item) => `<option value="${esc(item.id)}" ${skill.prerequisites.includes(item.id) ? "selected" : ""}>${esc(snapshot.subjects.find((subject) => subject.id === item.subjectId)?.name ?? "This set")} › ${esc(item.name)}</option>`).join("")}</select><small>Ctrl/Cmd-click to choose more than one.</small></label>
            <details class="studio-advanced"><summary>Mastery and review timing</summary><div class="studio-four">${field("Passing score", "skill.passingScore", skill.passingScore, { type: "number", min: .5, max: 1, step: .05 })}${field("Minimum confidence", "skill.minimumConfidence", skill.minimumConfidence, { type: "number", min: 1, max: 5 })}${field("Review if mastered", "skill.reviewMasteredDays", skill.reviewMasteredDays, { type: "number", min: 1, max: 365 })}${field("Review if learning", "skill.reviewLearningDays", skill.reviewLearningDays, { type: "number", min: 1, max: 365 })}</div></details>
          </section>
          <section class="studio-card">
            <div class="studio-section-title"><div><p class="eyebrow">Worked teaching material</p><h2>Examples and applications</h2></div></div>
            <div class="studio-repeat"><h3>Worked examples</h3>${skill.examples.map((example, index) => `<article><div class="studio-repeat-head"><b>Example ${index + 1}</b><button data-creator-action="remove-example" data-index="${index}">Remove</button></div>${field("Prompt", "example.prompt", example.prompt).replaceAll("data-creator-field", `data-index="${index}" data-creator-field`)}${field("Solution", "example.solution", example.solution).replaceAll("data-creator-field", `data-index="${index}" data-creator-field`)}${area("Explanation", "example.explanation", example.explanation, { rows: 3 }).replaceAll("data-creator-field", `data-index="${index}" data-creator-field`)}</article>`).join("")}<button class="button button-outline" data-creator-action="add-example">＋ Add worked example</button></div>
            <div class="studio-repeat"><h3>Real-world / cross-subject applications</h3>${skill.applications.map((application, index) => `<article><div class="studio-repeat-head"><b>Application ${index + 1}</b><button data-creator-action="remove-application" data-index="${index}">Remove</button></div>${field("Title", "application.title", application.title).replaceAll("data-creator-field", `data-index="${index}" data-creator-field`)}${area("Description", "application.description", application.description, { rows: 3 }).replaceAll("data-creator-field", `data-index="${index}" data-creator-field`)}</article>`).join("")}<button class="button button-outline" data-creator-action="add-application">＋ Add application</button></div>
          </section>
          <section class="studio-card">
            <div class="studio-section-title"><div><p class="eyebrow">3 · Mastery questions</p><h2>What proves this lesson?</h2><p>Build the short answer, any required reasoning, and the sign-off rule as three separate pieces.</p></div><button class="button button-secondary" data-creator-action="add-problem">＋ Add question</button></div>
            ${nativePreviewProblem ? `<aside class="studio-runtime-preview"><header><div><span>Original native runtime generator</span><strong>Variation ${Number(draft.nativePreviewVariation ?? 0) + 1} · ${nativePreview.templateCount} authored scenarios</strong></div><div><button type="button" class="quiet-button" data-creator-action="reroll-native-preview">Reroll values</button><button type="button" class="quiet-button" data-creator-action="download-native-preview">Download full audit</button></div></header><div><small>${esc(nativePreviewProblem.source_template_id)}</small><h3>${esc(nativePreviewProblem.prompt)}</h3><dl><div><dt>Generated values</dt><dd>${esc(Object.entries(nativePreviewProblem.values ?? {}).map(([key, value]) => `${key}=${value}`).join(" · ") || "fixed scenario")}</dd></div><div><dt>Expected answer</dt><dd>${esc(nativePreviewProblem.expected_answer)}</dd></div><div><dt>Self-grades</dt><dd>${esc(nativePreviewProblem.grading_method)}</dd></div></dl></div><footer>This audits the original trusted generator while you edit a fixed, reversible override. Installed custom/community files never execute generators.</footer></aside>` : ""}
            <div class="studio-question-roadmap"><article><span>1</span><div><strong>Final answer</strong><p>The local grader checks a number, choice, expression, or conclusion.</p></div></article><i>→</i><article><span>2</span><div><strong>Shown work</strong><p>Optional explanation, checked maths steps, a proof, or a rubric response.</p></div></article><i>→</i><article><span>3</span><div><strong>Review</strong><p>Proofs and rubric responses wait for a self, tutor, or agent verdict.</p></div></article></div>
            <nav class="studio-question-tabs" aria-label="Mastery question bank">${skill.problems.map((problem, index) => `<button type="button" data-creator-action="select-problem" data-index="${index}" aria-current="${index === skill.activeProblem ? "true" : "false"}"><span>${String(index + 1).padStart(2, "0")}</span><b>${esc(problem.prompt || "Untitled question")}</b><small>${esc(WORK_MODE_GUIDES[problem.workMode]?.title ?? problem.workMode)}</small></button>`).join("")}</nav>
            <p class="studio-question-count">Editing question ${skill.activeProblem + 1} of ${skill.problems.length}. ${draft.mode === "override" ? `The original comprehensive test length (${Math.min(Number(skill.questionCount ?? skill.problems.length), skill.problems.length)}) is preserved while the bank contains enough questions.` : "Every question in this bank becomes part of the mastery test."} Only the selected editor is rendered, so large native question banks stay fast.</p>
            <div class="studio-problems">${renderProblemEditor(skill, activeProblem, skill.activeProblem)}</div>
          </section>
          <section class="studio-card studio-publish">
            <div><p class="eyebrow">4 · Validate and publish</p><h2>Ready for the map?</h2><p>Validation uses the exact same safety and graph checks as file upload and WebMCP staging.</p></div>
            ${validation ? `<div class="studio-validation ${validation.ok ? "is-valid" : "is-error"}"><strong>${validation.ok ? "✓ Valid lesson set" : "Needs a little work"}</strong><p>${esc(validation.message)}</p>${validation.ok ? `<small>${validation.skillCount} lessons · ${validation.problemCount} questions · ${esc(validation.subjectName)}</small>` : ""}</div>` : `<div class="studio-validation"><strong>Not checked yet</strong><p>Validate before downloading or installing.</p></div>`}
            <div class="studio-publish-actions"><button class="button button-outline" data-creator-action="validate">Validate preview</button><button class="button button-secondary" data-creator-action="download">Download JSON</button><button class="button button-primary" data-creator-action="install">${draft.mode === "override" ? "Install improvement" : "Install into QuickMaths"}</button><button class="button button-outline" data-creator-action="publish-depot">Publish to Lesson Depot ↗</button></div>
            <p class="pack-security-note"><strong>Answer-key warning:</strong> the downloaded file contains expected answers and solutions. Treat it as an author file, not a learner worksheet.</p>
          </section>
        </div>
      </section>`;
  };

  const validate = () => {
    try {
      const preview = store.previewLessonPack(JSON.stringify(buildPack(draft)));
      draft.lastValidation = { ok: true, message: "All IDs, questions, prerequisite bridges, review rules, and safety limits passed.", ...preview };
      save(); showToast("Lesson set is valid."); return preview;
    } catch (error) {
      draft.lastValidation = { ok: false, message: error instanceof Error ? error.message : String(error) };
      save(); showToast(draft.lastValidation.message); return null;
    }
  };

  const handleInput = (target) => {
    if (target.matches("[data-creator-prerequisites]")) {
      currentSkill().prerequisites = [...target.selectedOptions].map((option) => option.value); draft.lastValidation = null; save(); return false;
    }
    const path = target.dataset.creatorField;
    if (!path) return false;
    setField(path, target.value, target);
    return ["draft.subjectMode", "draft.subjectId", "problem.gradingMethod", "problem.workMode"].includes(path);
  };

  const handleAction = (target) => {
    const action = target.dataset.creatorAction;
    if (!action) return false;
    if (action === "load-native") {
      const source = store.skillsById[draft.nativeSkillId];
      if (!source) { showToast("Choose a native lesson first."); return true; }
      if (confirm(`Open ${source.name} as an editable native improvement?\n\nThis replaces the current Studio draft. Nothing in the curriculum changes until you validate and install the improvement.`)) loadNativeLesson(source.id);
      return true;
    }
    const skill = currentSkill();
    const index = Number(target.dataset.index);
    if (action === "close-tutorial") draft.tutorialOpen = false;
    if (action === "open-tutorial") draft.tutorialOpen = true;
    if (action === "select-skill") draft.activeSkill = index;
    if (action === "add-skill") { draft.skills.push(blankSkill(draft.skills.length)); draft.activeSkill = draft.skills.length - 1; }
    if (action === "remove-skill" && draft.skills.length > 1 && confirm("Remove this lesson from the studio draft?")) { draft.skills.splice(draft.activeSkill, 1); draft.activeSkill = Math.max(0, draft.activeSkill - 1); }
    if (action === "select-problem") skill.activeProblem = index;
    if (action === "reroll-native-preview") draft.nativePreviewVariation = Number(draft.nativePreviewVariation ?? 0) + 1;
    if (action === "download-native-preview") {
      const preview = store.previewNativeAssessment(skill.id, draft.nativePreviewVariation ?? 0);
      const markdown = [`# Native Author Preview: ${preview.skillName}`, "", `Variation: ${preview.variation + 1}`, `Authored scenarios: ${preview.templateCount}`, "", ...preview.problems.flatMap((problem, previewIndex) => [`## ${previewIndex + 1}. ${problem.source_template_id}`, `- Prompt: ${problem.prompt}`, `- Values: ${Object.entries(problem.values ?? {}).map(([key, value]) => `${key}=${value}`).join(", ") || "fixed"}`, `- Expected answer: ${problem.expected_answer}`, `- Expected answer self-grades with: ${problem.grading_method}`, `- Work mode: ${problem.work?.mode ?? "none"}`, "- Solution / explanation:", ...(problem.solution_steps?.length ? problem.solution_steps.map((step) => `  - ${step}`) : ["  - None"]), ""] )].join("\n");
      download(`${skill.id.toLowerCase()}-native-author-preview.md`, markdown, "text/markdown");
      showToast("Native author preview downloaded.");
    }
    if (action === "add-problem") { skill.problems.push(blankProblem(cleanId(skill.id, "CUSTOM_"), skill.problems.length)); skill.activeProblem = skill.problems.length - 1; }
    if (action === "remove-problem" && skill.problems.length > 1) { skill.problems.splice(index, 1); skill.activeProblem = Math.max(0, Math.min(skill.activeProblem, skill.problems.length - 1)); }
    if (action === "apply-procedural-example") {
      const problem = skill.problems[index];
      problem.workPrompt = "Show one mathematical step per line and keep each line equivalent to the one before it.";
      problem.minimumSteps = 3; problem.lineType = "equation";
    }
    if (action === "apply-proof-example") {
      const problem = skill.problems[index];
      problem.prompt = "Prove that sqrt(2) is irrational using contradiction and parity.";
      problem.expectedAnswer = "sqrt(2) is irrational";
      problem.answerType = "text";
      problem.gradingMethod = "theorem_conclusion";
      problem.acceptedForms = "sqrt(2) is irrational\ntherefore sqrt(2) is irrational";
      problem.workPrompt = "Write the contradiction proof in plain language. Address every obligation below and put each main claim or reason on its own line.";
      problem.proofObligations = "Assumes sqrt(2) = p/q with p/q in lowest terms\nDerives p² = 2q² by squaring\nUses parity to show p is even\nSubstitutes p = 2k and shows q is even\nExplains why p and q both being even contradicts lowest terms\nConcludes that sqrt(2) is irrational";
      problem.proofStrategies = "Contradiction using parity";
      problem.solutionSteps = "Assume sqrt(2) = p/q in lowest terms.\nSquare to obtain p² = 2q², so p is even.\nWrite p = 2k and substitute to show q is even.\nBoth p and q are even, contradicting lowest terms.\nTherefore sqrt(2) is irrational.";
      problem.mistakeTags = "proof_structure\ncontradiction_error\nparity_reasoning";
      problem.workReview = "tutor_required";
      problem.masteryRequiresReview = true;
      problem.allowSelfReview = false;
    }
    if (action === "apply-rubric-example") {
      const problem = skill.problems[index];
      problem.workPrompt = "Write a complete response that addresses every criterion below. Use headings or paragraphs if they make the argument clearer.";
      problem.rubricCriteria = "Makes a precise, relevant claim\nUses accurate evidence, examples, or calculations\nExplains how the evidence supports the claim\nAcknowledges an important limitation or alternative\nEnds with a justified conclusion";
    }
    if (action === "apply-python-example") {
      const problem = skill.problems[index];
      problem.prompt = "Implement is_even(number), returning true exactly when number is even.";
      problem.promptCodeLanguage = "python";
      problem.promptCode = "def is_even(number):\n    # Return a Boolean expression.\n    pass";
      problem.expectedAnswer = "All declared Python tests pass.";
      problem.answerType = "code";
      problem.gradingMethod = "python_program";
      problem.pythonEntrypoint = "is_even";
      problem.pythonParameters = "number | int";
      problem.pythonReturnType = "bool";
      problem.pythonTests = "example | even | [8] | true\nafter_submission | odd | [7] | false\nhidden | zero | [0] | true\nhidden | negative | [-3] | false";
      problem.pythonBuiltins = "";
      problem.solutionSteps = "Use remainder modulo two.\nCompare the remainder with zero.\nReturn the Boolean result rather than printing it.";
      problem.mistakeTags = "modulo\nboolean_expression\nreturn_vs_print";
    }
    if (action === "add-example") skill.examples.push({ prompt: "", solution: "", explanation: "" });
    if (action === "remove-example") skill.examples.splice(index, 1);
    if (action === "add-application") skill.applications.push({ title: "", description: "" });
    if (action === "remove-application") skill.applications.splice(index, 1);
    if (action === "validate") validate();
    if (action === "download") {
      const preview = validate();
      if (preview) { const pack = buildPack(draft); download(`${pack.id.toLowerCase().replaceAll("_", "-")}.json`, JSON.stringify(pack, null, 2), "application/json"); showToast("Lesson-set JSON downloaded."); }
    }
    if (action === "install") {
      const preview = validate();
      const installNote = preview?.mode === "override"
        ? "This replaces the native lesson content while keeping its ID, map position, and completed learner progress. Unfinished tests for the lesson restart so answers cannot cross between question-bank versions. You can restore the original from Settings."
        : "It will join the mastery map and be included in future progress backups.";
      if (preview && confirm(`Install ${preview.name}?\n\n${preview.skillCount} lessons · ${preview.problemCount} questions · ${preview.subjectName}\n\n${installNote}`)) {
        const result = store.importLessonPack(JSON.stringify(buildPack(draft))); showToast(result.mode === "override" ? `${result.name} installed. Completed progress was preserved${result.restartedDraftCount ? `; ${result.restartedDraftCount} unfinished test${result.restartedDraftCount === 1 ? " restarted" : "s restarted"}` : ""}.` : `${result.name} installed in ${result.subjectName}.`);
      }
    }
    if (action === "publish-depot") {
      const preview = validate();
      if (preview) publishToDepot(buildPack(draft));
    }
    if (action === "import") openFilePicker();
    if (action === "reset" && confirm("Reset the Human Lesson Creator draft? Download it first if you want to keep it.")) draft = blankDraft(getSnapshot());
    draft.lastValidation = ["validate", "download", "install", "publish-depot"].includes(action) ? draft.lastValidation : null;
    save(); return true;
  };

  const loadRaw = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.format !== "quickmaths.lesson-set" || !Array.isArray(parsed.skills)) throw new Error("Choose a QuickMaths lesson-set JSON file.");
      draft = draftFromPack(parsed, getSnapshot()); save(); showToast("Lesson set opened in the studio. Validate it when you are ready."); return true;
    } catch (error) { showToast(error instanceof Error ? error.message : String(error)); return false; }
  };

  return { render, handleInput, handleAction, loadRaw, loadNativeLesson, buildPack: () => buildPack(draft) };
}
