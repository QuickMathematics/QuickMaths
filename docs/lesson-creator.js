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
    summary: "Asks for one mathematical step per line and checks the shape of each line before submission.",
    syntax: "Use readable maths such as 2x + 5 = 13, one equation or expression per line.",
    flow: "Student enters steps → app checks notation and step count → app grades the final answer.",
  },
  proof_obligations: {
    title: "Structured proof",
    summary: "Shows a required proof box plus a checklist of claims the proof must address.",
    syntax: "Plain text—no JSON, LaTeX, or magic keywords. One claim or reason per line is easiest to review.",
    flow: "Student writes proof → app checks that work was supplied → self, human, or agent review signs it off → mastery updates.",
  },
  rubric_check: {
    title: "Rubric-reviewed response",
    summary: "Shows a required response box and the exact criteria the reviewer will use.",
    syntax: "Plain text. Paragraphs, labelled sections, or one point per line all work.",
    flow: "Student responds → app checks that work was supplied → reviewer checks every criterion → mastery updates.",
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
    prompt: "What should the learner solve?", expectedAnswer: "", answerType: "text",
    gradingMethod: "exact_text", difficulty: "medium", tolerance: "0.001", options: "A | First choice\nB | Second choice",
    acceptedForms: "", solutionSteps: "Explain the key idea.\nComplete the calculation or reasoning.", mistakeTags: "concept_error",
    answerMode: "final_only", workMode: "none", workPrompt: "", minimumSteps: 2,
    lineType: "expression", proofObligations: "State the claim clearly\nName the facts or definitions you use\nJustify how they lead to the conclusion", proofStrategies: "Direct proof\nProof by contradiction\nProof by contrapositive",
    rubricCriteria: "Makes a clear central claim\nUses relevant evidence or calculations\nExplains how the evidence supports the conclusion", workReview: "none", masteryRequiresReview: false, allowSelfReview: true,
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
    problems: [blankProblem(id, 0)],
  };
}

function blankDraft(snapshot) {
  const subject = snapshot?.activeSubject;
  return {
    tutorialOpen: true, activeSkill: 0, lastValidation: null,
    id: "PACK_MY_LESSONS", name: "My lesson set", description: "A custom curriculum built in QuickMaths.", author: "", version: "1.0.0",
    subjectMode: "extend", subjectId: subject?.id ?? "SUBJECT_MATH", subjectName: subject?.name ?? "Mathematics",
    subjectShortName: subject?.shortName ?? "Maths", subjectIcon: subject?.icon ?? "∑", subjectDescription: subject?.description ?? "",
    theme: { ...(subject?.theme ?? DEFAULT_THEME) }, skills: [blankSkill(0)],
  };
}

function restoreDraft(snapshot) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (parsed && Array.isArray(parsed.skills) && parsed.skills.length) return parsed;
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

function field(label, name, value, { type = "text", help = "", hint = "", placeholder = "", min = "", max = "", step = "" } = {}) {
  return `<label class="studio-field"><span>${esc(label)}${helpButton(help)}</span><input data-creator-field="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${min !== "" ? `min="${esc(min)}"` : ""} ${max !== "" ? `max="${esc(max)}"` : ""} ${step !== "" ? `step="${esc(step)}"` : ""}>${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
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
  return "Write your reasoning here…";
}

function renderStudentPreview(problem) {
  const guide = WORK_MODE_GUIDES[problem.workMode] ?? WORK_MODE_GUIDES.none;
  const obligations = lines(problem.proofObligations);
  const strategies = lines(problem.proofStrategies);
  const criteria = lines(problem.rubricCriteria);
  const required = ["procedural_steps", "proof_obligations", "rubric_check"].includes(problem.workMode) || problem.answerMode === "final_plus_required_work";
  return `<section class="studio-student-preview" aria-label="Learner view preview">
    <header><div><span>Learner view preview</span><strong>${esc(guide.title)}</strong></div><b>${required ? "Required work" : problem.answerMode === "final_plus_optional_work" ? "Optional work" : "Final answer"}</b></header>
    <article>
      <small>QUESTION</small><h4>${esc(problem.prompt || "Your learner-facing question appears here.")}</h4>
      <label><span>Final answer</span><i>${esc(problem.expectedAnswer ? "Learner enters an answer here" : "Set the private expected answer above")}</i></label>
      ${problem.workMode === "proof_obligations" ? `<div class="studio-preview-guide"><strong>Your proof must cover</strong><ol>${obligations.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Add at least one proof obligation.</li>"}</ol>${strategies.length ? `<p><b>Accepted approaches:</b> ${strategies.map(esc).join(" · ")}</p>` : ""}</div>` : ""}
      ${problem.workMode === "rubric_check" ? `<div class="studio-preview-guide"><strong>Your response will be reviewed for</strong><ul>${criteria.map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Add at least one rubric criterion.</li>"}</ul></div>` : ""}
      ${problem.workMode !== "none" ? `<label class="studio-preview-work"><span>${esc(problem.workPrompt || "Show your work")} ${required ? "(required)" : "(optional)"}</span><i>${esc(workPlaceholder(problem.workMode)).replaceAll("\n", "<br>")}</i></label>` : ""}
    </article>
    <footer>${esc(guide.flow)}</footer>
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
    : ["procedural_steps", "proof_obligations", "rubric_check"].includes(problem.workMode) ? "final_plus_required_work" : problem.answerMode;
  return `<details class="studio-advanced studio-work-authoring" ${problem.workMode !== "none" ? "open" : ""}>
    <summary><span>How the learner answers</span><b>${esc(guide.title)}</b></summary>
    <div class="studio-mode-guide"><span aria-hidden="true">${problem.workMode === "proof_obligations" ? "∴" : problem.workMode === "rubric_check" ? "☷" : problem.workMode === "procedural_steps" ? "=" : "✎"}</span><div><strong>${esc(guide.summary)}</strong><p>${esc(guide.syntax)}</p></div></div>
    <div class="studio-two">${indexed(select("Answer layout", "problem.answerMode", answerValue, answerOptions, "Proofs, rubrics, and checked maths steps always require the work box; explanations may be optional."))}${indexed(select(reviewIsRequired ? "Who signs it off?" : "After submission", "problem.workReview", reviewValue, reviewOptions, "Proofs and rubric responses are never semantically auto-graded; a reviewer must pass them."))}</div>
    ${problem.workMode !== "none" ? indexed(area("Instruction above the learner's work box", "problem.workPrompt", problem.workPrompt, { rows: 2, hint: "This sentence appears verbatim above the learner's response box." })) : ""}
    ${problem.workMode === "procedural_steps" ? `<div class="studio-two">${indexed(field("Minimum lines", "problem.minimumSteps", problem.minimumSteps, { type:"number", min:1, max:10, hint:"The app blocks submission until this many non-empty lines are present." }))}${indexed(select("Allowed line format", "problem.lineType", problem.lineType, [["expression","Expressions"],["equation","Equations / relations"],["mixed","Maths or explanatory text"],["text","Text only"]], "Equation mode expects =, <, >, ≤, or ≥ on every line."))}</div><button class="studio-example-button" type="button" data-creator-action="apply-procedural-example" data-index="${index}">Use a clear step-by-step instruction</button>` : ""}
    ${problem.workMode === "proof_obligations" ? `<aside class="studio-syntax-note"><strong>No proof language to learn.</strong><p>The learner writes ordinary text in one box. Each line below becomes a visible checklist item; it is not a command or a hidden keyword.</p></aside>${indexed(area("What the proof must establish — one item per line", "problem.proofObligations", problem.proofObligations, { rows:5, hint:"Write outcomes, not instructions: “Defines continuity at x = a” is better than “Do the proof.”" }))}${indexed(area("Accepted proof approaches — one per line", "problem.proofStrategies", problem.proofStrategies, { rows:3, hint:"These are suggestions shown to the learner, not exact phrases they must type." }))}<button class="studio-example-button" type="button" data-creator-action="apply-proof-example" data-index="${index}">Fill with an editable proof example</button>` : ""}
    ${problem.workMode === "rubric_check" ? `<aside class="studio-syntax-note"><strong>Describe observable qualities.</strong><p>Each line becomes one visible review criterion with equal weight. The learner can structure the response however the prompt asks.</p></aside>${indexed(area("Review criteria — one per line", "problem.rubricCriteria", problem.rubricCriteria, { rows:5, hint:"Use specific criteria such as “Uses two relevant sources” rather than “Good answer.”" }))}<button class="studio-example-button" type="button" data-creator-action="apply-rubric-example" data-index="${index}">Fill with an editable rubric example</button>` : ""}
    ${reviewIsRequired ? `<div class="studio-review-lock"><span aria-hidden="true">✓</span><div><strong>Mastery waits for a passed review</strong><p>${problem.workReview === "self_review" ? "The learner can review this response on the Results page." : "A human tutor or connected agent reviews the saved response on the Results page."}</p></div></div>` : `<div class="studio-checks"><label><input type="checkbox" data-index="${index}" data-creator-field="problem.masteryRequiresReview" ${problem.masteryRequiresReview ? "checked" : ""}> Review must pass before mastery</label><label><input type="checkbox" data-index="${index}" data-creator-field="problem.allowSelfReview" ${problem.allowSelfReview ? "checked" : ""}> Allow self review</label></div>`}
    ${renderStudentPreview(problem)}
  </details>`;
}

function renderProblemEditor(skill, problem, index) {
  const indexed = (markup) => markup.replaceAll("data-creator-field", `data-index="${index}" data-creator-field`);
  const graderHelp = "This checks only the final-answer field. Proofs and long responses are handled separately under How the learner answers.";
  return `<details ${index === 0 ? "open" : ""}>
    <summary><span>${String(index + 1).padStart(2, "0")}</span><b>${esc(problem.prompt || "Untitled question")}</b><small>${esc(problem.gradingMethod)} · ${esc(WORK_MODE_GUIDES[problem.workMode]?.title ?? problem.workMode)}</small></summary>
    <div class="studio-problem-body">
      <div class="studio-repeat-head"><b>Question ${index + 1}</b>${skill.problems.length > 1 ? `<button data-creator-action="remove-problem" data-index="${index}">Remove</button>` : ""}</div>
      ${indexed(field("Question ID", "problem.templateId", problem.templateId, { hint: "A stable internal name; learners do not see it." }))}
      ${indexed(area("Learner prompt", "problem.prompt", problem.prompt, { rows: 3, hint: "Ask for both the final answer and reasoning here when reasoning matters." }))}
      <div class="studio-response-picker"><div><strong>Question response type</strong><small>Proof requirements belong to each mastery question, so one lesson can mix ordinary answers, calculations, and proofs.</small></div>${indexed(select("What must the learner submit?", "problem.workMode", problem.workMode, [["none","Final answer only"],["capture_only","Final answer + written explanation"],["procedural_steps","Required step-by-step maths"],["proof_obligations","Proof required — structured proof + review"],["rubric_check","Required long response + rubric review"]], "Choose proof here to give the learner a required proof box and visible proof checklist. Proof mastery waits for a self, tutor, or agent review."))}</div>
      <div class="studio-three">
        ${indexed(select("Difficulty", "problem.difficulty", problem.difficulty, [["easy","Easy"],["medium","Medium"],["hard","Hard"],["brutal","Brutal"]]))}
        ${indexed(select("Final-answer grader", "problem.gradingMethod", problem.gradingMethod, [["exact_numeric","Exact number"],["numeric_with_tolerance","Number with tolerance"],["multiple_choice","Multiple choice"],["symbolic_expression","Equivalent expression"],["equation_solution","Equation solution"],["exact_text","Exact text"],["theorem_conclusion","Accepted conclusion"]], graderHelp))}
        ${indexed(field("Private expected answer", "problem.expectedAnswer", problem.expectedAnswer, { help: "Never shown before submission. For multiple choice, enter the correct option ID.", hint: "The final-answer grader compares the learner's answer with this value." }))}
      </div>
      ${problem.gradingMethod === "multiple_choice" ? indexed(area("Choices — ID | label, one per line", "problem.options", problem.options, { rows: 4, hint: "Example: A | Pacific Ocean. Put the correct ID, such as A, in Private expected answer." })) : ""}
      ${problem.gradingMethod === "numeric_with_tolerance" ? indexed(field("Allowed numerical difference", "problem.tolerance", problem.tolerance, { type: "number", min: 0, step: .001, hint: "0.01 accepts answers within ±0.01 of the expected number." })) : ""}
      ${["theorem_conclusion", "symbolic_expression", "equation_solution"].includes(problem.gradingMethod) ? indexed(area("Other accepted final answers — one per line", "problem.acceptedForms", problem.acceptedForms, { rows: 3, hint: "These apply only to the short final answer, not the proof text." })) : ""}
      ${indexed(area("Private solution outline — one step per line", "problem.solutionSteps", problem.solutionSteps, { rows: 4, hint: "Shown after submission; keep answer-key reasoning out of the learner prompt." }))}
      ${indexed(area("Mistake tags — one per line", "problem.mistakeTags", problem.mistakeTags, { rows: 2, hint: "Short labels such as sign_error or missing_evidence help the tutor target follow-up work." }))}
      ${renderAdvancedWork(problem, index)}
    </div>
  </details>`;
}

function buildPack(draft) {
  const subjectId = draft.subjectMode === "extend" ? draft.subjectId : cleanId(draft.subjectId, "SUBJECT_");
  const skillIds = draft.skills.map((skill) => cleanId(skill.id, "CUSTOM_"));
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
      problems: skill.problems.map((problem, problemIndex) => {
        const answerMode = problem.workMode === "none" ? "final_only"
          : ["procedural_steps", "proof_obligations", "rubric_check"].includes(problem.workMode) ? "final_plus_required_work" : problem.answerMode;
        const work = {
          mode: problem.workMode, prompt: problem.workPrompt, minimum_steps: Number(problem.minimumSteps), line_type: problem.lineType,
          require_final_answer_match: true,
        };
        if (problem.workMode === "proof_obligations") work.proof_policy = { obligations: lines(problem.proofObligations), accepted_strategies: lines(problem.proofStrategies) };
        if (problem.workMode === "rubric_check") work.rubric = { criteria: lines(problem.rubricCriteria).map((description, index) => ({ id: `criterion_${index + 1}`, description, weight: 1 })) };
        const output = {
          template_id: cleanId(problem.templateId || `${skillId}_Q${problemIndex + 1}`, "QUESTION_"), skill_id: skillId,
          difficulty: problem.difficulty, prompt: problem.prompt, expected_answer: problem.expectedAnswer,
          answer_type: problem.answerType, grading_method: problem.gradingMethod, solution_steps: lines(problem.solutionSteps),
          mistake_tags: lines(problem.mistakeTags), answer_mode: answerMode, work,
          review_policy: {
            work_review: ["proof_obligations", "rubric_check"].includes(problem.workMode) ? (problem.workReview === "self_review" ? "self_review" : "tutor_required") : problem.workReview,
            mastery_requires_review_pass: ["proof_obligations", "rubric_check"].includes(problem.workMode) || Boolean(problem.masteryRequiresReview),
            allow_self_review: ["proof_obligations", "rubric_check"].includes(problem.workMode) ? problem.workReview === "self_review" : Boolean(problem.allowSelfReview),
          },
        };
        if (problem.gradingMethod === "numeric_with_tolerance") output.tolerance = Number(problem.tolerance);
        if (problem.gradingMethod === "multiple_choice") output.options = lines(problem.options).map((line, index) => {
          const [rawId, ...rest] = line.split("|");
          return { id: (rawId || String.fromCharCode(65 + index)).trim(), label: (rest.join("|") || rawId).trim() };
        });
        if (problem.acceptedForms.trim()) output.accepted_forms = lines(problem.acceptedForms);
        return output;
      }),
    };
  });
  return {
    format: "quickmaths.lesson-set", schema_version: "2.0", id: cleanId(draft.id, "PACK_"), name: draft.name,
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
    ...blankSkill(skillIndex), id: skill.id, name: skill.name, description: skill.description, subdomain: skill.subdomain ?? "Foundations",
    theory: skill.theory, tags: (skill.tags ?? []).join("\n"), prerequisites: (skill.prerequisites ?? []).map((ref) => typeof ref === "string" ? ref : ref.skill_id),
    passingScore: skill.mastery?.passing_score ?? .8, minimumConfidence: skill.mastery?.minimum_confidence ?? 3,
    reviewMasteredDays: skill.mastery?.review_after_days_if_mastered ?? 7, reviewLearningDays: skill.mastery?.review_after_days_if_learning ?? 2,
    examples: skill.examples?.length ? skill.examples : [], applications: skill.applications?.length ? skill.applications : [],
    problems: (skill.problems ?? []).map((problem, problemIndex) => ({
      ...blankProblem(skill.id, problemIndex), templateId: problem.template_id, prompt: problem.prompt, expectedAnswer: String(problem.expected_answer ?? ""),
      answerType: problem.answer_type ?? "text", gradingMethod: problem.grading_method, difficulty: problem.difficulty ?? "medium",
      tolerance: String(problem.tolerance ?? .001), options: (problem.options ?? []).map((option) => `${option.id} | ${option.label}`).join("\n"),
      acceptedForms: (problem.accepted_forms ?? []).join("\n"), solutionSteps: (problem.solution_steps ?? []).join("\n"), mistakeTags: (problem.mistake_tags ?? []).join("\n"),
      answerMode: problem.answer_mode ?? "final_only", workMode: problem.work?.mode ?? "none", workPrompt: problem.work?.prompt ?? "",
      minimumSteps: problem.work?.minimum_steps ?? 2, lineType: problem.work?.line_type ?? "expression",
      proofObligations: (problem.work?.proof_policy?.obligations ?? []).join("\n"), proofStrategies: (problem.work?.proof_policy?.accepted_strategies ?? []).join("\n"),
      rubricCriteria: (problem.work?.rubric?.criteria ?? []).map((criterion) => criterion.description).join("\n"),
      workReview: problem.review_policy?.work_review ?? "none", masteryRequiresReview: Boolean(problem.review_policy?.mastery_requires_review_pass),
      allowSelfReview: problem.review_policy?.allow_self_review !== false,
    })),
  }));
  if (!base.skills.length) base.skills = [blankSkill(0)];
  return base;
}

export function createLessonStudio({ store, download, showToast, getSnapshot, openFilePicker, publishToDepot = () => {} }) {
  let draft = restoreDraft(getSnapshot());

  const save = () => persist(draft);
  const currentSkill = () => draft.skills[Math.max(0, Math.min(draft.activeSkill, draft.skills.length - 1))];

  const setField = (path, value, target) => {
    const skill = currentSkill();
    if (path.startsWith("draft.")) draft[path.slice(6)] = value;
    else if (path.startsWith("theme.")) draft.theme[path.slice(6)] = value;
    else if (path.startsWith("skill.")) skill[path.slice(6)] = value;
    else if (path.startsWith("problem.")) skill.problems[Number(target.dataset.index)][path.slice(8)] = target.type === "checkbox" ? target.checked : value;
    else if (path.startsWith("example.")) skill.examples[Number(target.dataset.index)][path.slice(8)] = value;
    else if (path.startsWith("application.")) skill.applications[Number(target.dataset.index)][path.slice(12)] = value;
    if (path === "problem.workMode") applyWorkModeDefaults(skill.problems[Number(target.dataset.index)], value);
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
    const allSkills = [
      ...snapshot.curriculum.allSkills.map((item) => ({ id: item.id, name: item.name, subjectId: item.subjectId })),
      ...draft.skills.map((item) => ({ id: cleanId(item.id, "CUSTOM_"), name: item.name, subjectId: draft.subjectId })),
    ].filter((item, index, rows) => rows.findIndex((candidate) => candidate.id === item.id) === index && item.id !== cleanId(skill.id, "CUSTOM_"));
    const validation = draft.lastValidation;
    const subjectOptions = snapshot.subjects.map((subject) => [subject.id, `${subject.icon} ${subject.name} · ${subject.skillIds.length} lessons`]);
    return `
      <header class="page-head studio-head"><div><p class="eyebrow">Human Lesson Creator</p><h1>Build a curriculum without writing JSON.</h1><p>QuickMaths turns these friendly forms into the same validated lesson-set format an agent authors directly.</p></div><div class="page-actions"><button class="button button-outline" data-creator-action="import">Open JSON</button><button class="button button-primary" data-creator-action="download">Download lesson set</button></div></header>
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
          <div class="studio-section-title"><div><p class="eyebrow">Lessons</p><strong>${draft.skills.length} in this set</strong></div><button data-creator-action="add-skill" title="Add another lesson">＋</button></div>
          <div class="studio-skill-list">${draft.skills.map((item, index) => `<button data-creator-action="select-skill" data-index="${index}" class="${index === draft.activeSkill ? "is-active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><b>${esc(item.name || "Untitled lesson")}</b><small>${esc(item.id)}</small></button>`).join("")}</div>
          <button class="button button-outline studio-reset" data-creator-action="reset">Reset studio draft</button>
        </aside>
        <div class="studio-canvas">
          <section class="studio-card">
            <div class="studio-section-title"><div><p class="eyebrow">1 · Subject</p><h2>Where does this set live?</h2></div></div>
            <div class="studio-choice"><label><input type="radio" data-creator-field="draft.subjectMode" value="extend" ${draft.subjectMode === "extend" ? "checked" : ""}><span><b>Extend a subject</b><small>Add these lessons into an existing curriculum.</small></span></label><label><input type="radio" data-creator-field="draft.subjectMode" value="create" ${draft.subjectMode === "create" ? "checked" : ""}><span><b>Create a subject</b><small>Start a separate curriculum with its own colors.</small></span></label></div>
            ${draft.subjectMode === "extend" ? select("Existing subject", "draft.subjectId", draft.subjectId, subjectOptions, "The subject dropdown and mastery map will show these lessons here.") : `<div class="studio-two">${field("Subject ID", "draft.subjectId", draft.subjectId, { help: "A stable ID such as SUBJECT_BIOLOGY." })}${field("Subject name", "draft.subjectName", draft.subjectName)}</div><div class="studio-three">${field("Short name", "draft.subjectShortName", draft.subjectShortName)}${field("Icon", "draft.subjectIcon", draft.subjectIcon, { help: "One short symbol or emoji used in the subject picker." })}${field("Description", "draft.subjectDescription", draft.subjectDescription)}</div><div class="theme-palette">${Object.entries(draft.theme).map(([key, value]) => `<label title="${esc(key)}"><input data-creator-field="theme.${esc(key)}" type="color" value="${esc(value)}"><span>${esc(key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`))}</span></label>`).join("")}</div>`}
          </section>
          <section class="studio-card">
            <div class="studio-section-title"><div><p class="eyebrow">2 · Lesson ${draft.activeSkill + 1}</p><h2>${esc(skill.name)}</h2></div>${draft.skills.length > 1 ? `<button class="danger-link" data-creator-action="remove-skill">Remove lesson</button>` : ""}</div>
            <div class="studio-two">${field("Lesson name", "skill.name", skill.name)}${field("Lesson ID", "skill.id", skill.id, { help: "Stable and globally unique. The studio enforces the CUSTOM_ prefix." })}</div>
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
            <div class="studio-question-roadmap"><article><span>1</span><div><strong>Final answer</strong><p>The local grader checks a number, choice, expression, or conclusion.</p></div></article><i>→</i><article><span>2</span><div><strong>Shown work</strong><p>Optional explanation, checked maths steps, a proof, or a rubric response.</p></div></article><i>→</i><article><span>3</span><div><strong>Review</strong><p>Proofs and rubric responses wait for a self, tutor, or agent verdict.</p></div></article></div>
            <div class="studio-problems">${skill.problems.map((problem, index) => renderProblemEditor(skill, problem, index)).join("")}</div>
          </section>
          <section class="studio-card studio-publish">
            <div><p class="eyebrow">4 · Validate and publish</p><h2>Ready for the map?</h2><p>Validation uses the exact same safety and graph checks as file upload and WebMCP staging.</p></div>
            ${validation ? `<div class="studio-validation ${validation.ok ? "is-valid" : "is-error"}"><strong>${validation.ok ? "✓ Valid lesson set" : "Needs a little work"}</strong><p>${esc(validation.message)}</p>${validation.ok ? `<small>${validation.skillCount} lessons · ${validation.problemCount} questions · ${esc(validation.subjectName)}</small>` : ""}</div>` : `<div class="studio-validation"><strong>Not checked yet</strong><p>Validate before downloading or installing.</p></div>`}
            <div class="studio-publish-actions"><button class="button button-outline" data-creator-action="validate">Validate preview</button><button class="button button-secondary" data-creator-action="download">Download JSON</button><button class="button button-primary" data-creator-action="install">Install into QuickMaths</button><button class="button button-outline" data-creator-action="publish-depot">Publish to Lesson Depot ↗</button></div>
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
    const skill = currentSkill();
    const index = Number(target.dataset.index);
    if (action === "close-tutorial") draft.tutorialOpen = false;
    if (action === "open-tutorial") draft.tutorialOpen = true;
    if (action === "select-skill") draft.activeSkill = index;
    if (action === "add-skill") { draft.skills.push(blankSkill(draft.skills.length)); draft.activeSkill = draft.skills.length - 1; }
    if (action === "remove-skill" && draft.skills.length > 1 && confirm("Remove this lesson from the studio draft?")) { draft.skills.splice(draft.activeSkill, 1); draft.activeSkill = Math.max(0, draft.activeSkill - 1); }
    if (action === "add-problem") skill.problems.push(blankProblem(cleanId(skill.id, "CUSTOM_"), skill.problems.length));
    if (action === "remove-problem" && skill.problems.length > 1) skill.problems.splice(index, 1);
    if (action === "apply-procedural-example") {
      const problem = skill.problems[index];
      problem.workPrompt = "Show one mathematical step per line and keep each line equivalent to the one before it.";
      problem.minimumSteps = 3; problem.lineType = "equation";
    }
    if (action === "apply-proof-example") {
      const problem = skill.problems[index];
      problem.workPrompt = "Write a proof in plain language. Address every requirement below and put each claim or reason on its own line.";
      problem.proofObligations = "State the claim precisely\nName the definition, theorem, or evidence you rely on\nJustify the link between each step\nState why the conclusion follows";
      problem.proofStrategies = "Direct proof\nProof by contradiction\nProof by contrapositive";
    }
    if (action === "apply-rubric-example") {
      const problem = skill.problems[index];
      problem.workPrompt = "Write a complete response that addresses every criterion below. Use headings or paragraphs if they make the argument clearer.";
      problem.rubricCriteria = "Makes a precise, relevant claim\nUses accurate evidence, examples, or calculations\nExplains how the evidence supports the claim\nAcknowledges an important limitation or alternative\nEnds with a justified conclusion";
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
      if (preview && confirm(`Install ${preview.name}?\n\n${preview.skillCount} lessons · ${preview.problemCount} questions · ${preview.subjectName}\n\nIt will join the mastery map and be included in future progress backups.`)) {
        const result = store.importLessonPack(JSON.stringify(buildPack(draft))); showToast(`${result.name} installed in ${result.subjectName}.`);
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

  return { render, handleInput, handleAction, loadRaw, buildPack: () => buildPack(draft) };
}
