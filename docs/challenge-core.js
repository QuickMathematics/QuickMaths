export const STORAGE_KEY = "quickmaths.webmcp.challenge.v1";

export const SKILL = Object.freeze({
  id: "MATH_ALG_002",
  name: "Two-step equations",
  description: "Solve linear equations using two inverse operations.",
});

export const PROBLEM_BANK = Object.freeze([
  {
    id: "ALG002-P1",
    skillId: SKILL.id,
    prompt: "3x + 5 = 20",
    difficulty: "foundation",
    focus: "inverse_operations",
    answers: ["5", "x=5"],
    hint: "What operation removes +5 while keeping both sides balanced?",
    success: "You subtracted 5 from both sides, then divided by 3.",
  },
  {
    id: "ALG002-P2",
    skillId: SKILL.id,
    prompt: "4x - 7 = 21",
    difficulty: "standard",
    focus: "equation_balance",
    answers: ["7", "x=7"],
    hint: "What should you undo first: multiplying by 4 or subtracting 7?",
    success: "You added 7 to both sides, then divided by 4.",
  },
  {
    id: "ALG002-P3",
    skillId: SKILL.id,
    prompt: "-3x + 4 = 19",
    difficulty: "standard",
    focus: "sign_error",
    answers: ["-5", "x=-5"],
    hint: "After removing +4, check the sign when you divide by -3.",
    success: "You kept the negative coefficient through the division step.",
  },
  {
    id: "ALG002-P4",
    skillId: SKILL.id,
    prompt: "3(x + 4) = 21",
    difficulty: "stretch",
    focus: "distribution",
    answers: ["3", "x=3"],
    hint: "You can divide both sides by 3 before opening the parentheses.",
    success: "You simplified the outer multiplication before isolating x.",
  },
]);

const INITIAL_STATE = Object.freeze({
  version: 1,
  currentProblemId: PROBLEM_BANK[0].id,
  work: "",
  finalAnswer: "",
  finalAnswerStatus: "not_checked",
  workStatus: "not_reviewed",
  masteryScore: 0.45,
  attemptCount: 0,
  completedCount: 0,
  streak: 0,
  mistakeTags: [],
  tutorFeedback: null,
  activity: [],
});

const ALLOWED_DIFFICULTIES = new Set(["same", "easier", "harder"]);
const MAX_ACTIVITY = 20;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAnswer(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^[a-z]=/, "x=");
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getProblem(problemId) {
  return PROBLEM_BANK.find((problem) => problem.id === problemId) ?? PROBLEM_BANK[0];
}

function safeState(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return clone(INITIAL_STATE);
  }

  const base = clone(INITIAL_STATE);
  const problem = getProblem(candidate.currentProblemId);
  const validFeedback = candidate.tutorFeedback && typeof candidate.tutorFeedback === "object"
    ? {
        feedback: cleanText(candidate.tutorFeedback.feedback, 1500),
        nextStep: cleanText(candidate.tutorFeedback.nextStep, 300),
        mistakeTag: cleanText(candidate.tutorFeedback.mistakeTag, 80),
        confidence: ["low", "medium", "high"].includes(candidate.tutorFeedback.confidence)
          ? candidate.tutorFeedback.confidence
          : "medium",
      }
    : null;

  return {
    ...base,
    currentProblemId: problem.id,
    work: cleanText(candidate.work, 4000),
    finalAnswer: cleanText(candidate.finalAnswer, 120),
    finalAnswerStatus: ["not_checked", "correct", "incorrect"].includes(candidate.finalAnswerStatus)
      ? candidate.finalAnswerStatus
      : base.finalAnswerStatus,
    workStatus: ["not_reviewed", "pending_review", "reviewed"].includes(candidate.workStatus)
      ? candidate.workStatus
      : base.workStatus,
    masteryScore: Number.isFinite(candidate.masteryScore)
      ? Math.max(0, Math.min(1, candidate.masteryScore))
      : base.masteryScore,
    attemptCount: Number.isInteger(candidate.attemptCount) && candidate.attemptCount >= 0
      ? candidate.attemptCount
      : base.attemptCount,
    completedCount: Number.isInteger(candidate.completedCount) && candidate.completedCount >= 0
      ? candidate.completedCount
      : base.completedCount,
    streak: Number.isInteger(candidate.streak) && candidate.streak >= 0 ? candidate.streak : base.streak,
    mistakeTags: Array.isArray(candidate.mistakeTags)
      ? candidate.mistakeTags.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 8)
      : [],
    tutorFeedback: validFeedback?.feedback && validFeedback?.nextStep ? validFeedback : null,
    activity: Array.isArray(candidate.activity)
      ? candidate.activity
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            at: cleanText(item.at, 40),
            tool: cleanText(item.tool, 80),
            message: cleanText(item.message, 180),
          }))
          .filter((item) => item.at && item.tool && item.message)
          .slice(-MAX_ACTIVITY)
      : [],
  };
}

export function loadState(storage) {
  try {
    return safeState(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return clone(INITIAL_STATE);
  }
}

function statusForMastery(score) {
  if (score >= 0.8) return "mastered";
  if (score >= 0.6) return "practicing";
  return "learning";
}

export function createLearningStore({ storage, now = () => new Date() } = {}) {
  let state = loadState(storage);
  const listeners = new Set();

  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing or a full storage quota should not break the lesson.
    }
  };

  const notify = () => {
    persist();
    listeners.forEach((listener) => listener(snapshot()));
  };

  const addActivity = (tool, message) => {
    state.activity = [
      ...state.activity,
      { at: now().toISOString(), tool, message },
    ].slice(-MAX_ACTIVITY);
  };

  const snapshot = () => {
    const problem = getProblem(state.currentProblemId);
    return {
      ...clone(state),
      skill: clone(SKILL),
      currentProblem: {
        id: problem.id,
        skillId: problem.skillId,
        prompt: problem.prompt,
        difficulty: problem.difficulty,
        focus: problem.focus,
        hint: problem.hint,
        success: problem.success,
      },
      progressStatus: statusForMastery(state.masteryScore),
    };
  };

  const setStudentResponse = ({ work, finalAnswer }) => {
    const nextWork = cleanText(work, 4000);
    const nextAnswer = cleanText(finalAnswer, 120);
    const changed = nextWork !== state.work || nextAnswer !== state.finalAnswer;
    state.work = nextWork;
    state.finalAnswer = nextAnswer;
    if (!changed) return;
    state.finalAnswerStatus = "not_checked";
    state.workStatus = state.work || state.finalAnswer ? "pending_review" : "not_reviewed";
    state.tutorFeedback = null;
    notify();
  };

  const checkAnswer = () => {
    const problem = getProblem(state.currentProblemId);
    const answer = normalizeAnswer(state.finalAnswer);
    const correct = Boolean(answer) && problem.answers.some((expected) => normalizeAnswer(expected) === answer);
    state.finalAnswerStatus = correct ? "correct" : "incorrect";
    state.workStatus = state.work ? "pending_review" : "not_reviewed";
    state.attemptCount += 1;
    state.streak = correct ? state.streak + 1 : 0;
    if (correct) {
      state.masteryScore = Math.min(1, Math.round((state.masteryScore + 0.12) * 100) / 100);
      state.completedCount += 1;
    } else {
      state.masteryScore = Math.max(0, Math.round((state.masteryScore - 0.03) * 100) / 100);
    }
    addActivity("check_answer", correct ? "Final answer passed the local check." : "Final answer needs another look.");
    notify();
    return { correct, status: state.finalAnswerStatus };
  };

  const inspectStudentWork = (questionId) => {
    const problem = getProblem(state.currentProblemId);
    if (questionId !== problem.id) throw new Error("question_id must match the problem currently on screen.");
    const work = state.work;
    const finalStatus = (() => {
      const answer = normalizeAnswer(state.finalAnswer);
      if (!answer) return "missing";
      return problem.answers.some((expected) => normalizeAnswer(expected) === answer) ? "correct" : "incorrect";
    })();
    let mistakeTag = "needs_explanation";
    let message = "The learner has not shown enough work to review the reasoning yet.";
    if (/3x\s*=\s*25/i.test(work)) {
      mistakeTag = "inverse_operations";
      message = "The constant was moved in the wrong direction; prompt the learner to undo +5 with its inverse.";
    } else if (/3x\s*=\s*15/i.test(work) && /x\s*=\s*5/i.test(work)) {
      mistakeTag = "none";
      message = "The work shows a valid constant-isolation step followed by division.";
    } else if (work) {
      mistakeTag = problem.focus;
      message = "Review whether each inverse operation was applied to both sides of the equation.";
    }
    addActivity("inspect_student_work", mistakeTag === "none" ? "Confirmed a sound two-step method." : "Found one reasoning step to revisit.");
    notify();
    return {
      ok: true,
      question_id: problem.id,
      prompt: problem.prompt,
      final_answer: state.finalAnswer,
      work,
      work_lines: work.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      final_answer_status: finalStatus,
      work_status: state.workStatus,
      mistake_tag: mistakeTag,
      messages: [message],
      inspected_at: now().toISOString(),
    };
  };

  const recordTutorFeedback = ({ questionId, feedback, mistakeTag = "", nextStep, confidence = "medium" }) => {
    const problem = getProblem(state.currentProblemId);
    if (questionId !== problem.id) throw new Error("question_id must match the problem currently on screen.");
    const safeFeedback = cleanText(feedback, 1500);
    const safeNextStep = cleanText(nextStep, 300);
    const safeTag = cleanText(mistakeTag, 80);
    if (!safeFeedback) throw new Error("feedback is required.");
    if (!safeNextStep) throw new Error("next_step is required.");
    if (!["low", "medium", "high"].includes(confidence)) throw new Error("confidence is invalid.");
    state.tutorFeedback = {
      feedback: safeFeedback,
      mistakeTag: safeTag,
      nextStep: safeNextStep,
      confidence,
    };
    state.workStatus = "reviewed";
    if (safeTag && safeTag !== "none") {
      state.mistakeTags = [safeTag, ...state.mistakeTags.filter((tag) => tag !== safeTag)].slice(0, 8);
    }
    addActivity("record_tutor_feedback", "Saved Socratic feedback in this browser.");
    notify();
    return {
      ok: true,
      feedback_id: `feedback-${state.attemptCount}-${state.activity.length}`,
      question_id: problem.id,
      saved: true,
      feedback: safeFeedback,
      next_step: safeNextStep,
      activity_message: "Tutor feedback saved.",
    };
  };

  const createFollowupProblem = ({ skillId, difficulty = "same", focus = "" }) => {
    if (skillId !== SKILL.id) throw new Error(`skill_id must be ${SKILL.id}.`);
    if (!ALLOWED_DIFFICULTIES.has(difficulty)) throw new Error("difficulty is invalid.");
    const safeFocus = cleanText(focus, 80);
    const current = getProblem(state.currentProblemId);
    const candidates = PROBLEM_BANK.filter((problem) => problem.id !== current.id);
    const focusMatch = candidates.find((problem) => problem.focus === safeFocus);
    const difficultyOrder = {
      easier: ["foundation", "standard", "stretch"],
      same: [current.difficulty, "standard", "foundation", "stretch"],
      harder: ["stretch", "standard", "foundation"],
    };
    const chosen = focusMatch ?? difficultyOrder[difficulty]
      .map((level) => candidates.find((problem) => problem.difficulty === level))
      .find(Boolean) ?? candidates[0];
    state.currentProblemId = chosen.id;
    state.work = "";
    state.finalAnswer = "";
    state.finalAnswerStatus = "not_checked";
    state.workStatus = "not_reviewed";
    state.tutorFeedback = null;
    addActivity("create_followup_problem", `Opened ${chosen.id} for targeted practice.`);
    notify();
    return {
      ok: true,
      problem: {
        question_id: chosen.id,
        skill_id: chosen.skillId,
        prompt: chosen.prompt,
        difficulty: chosen.difficulty,
      },
      saved: true,
      activity_message: "Follow-up problem created.",
    };
  };

  const getLearningContext = ({ includeHistory = false } = {}) => {
    const problem = getProblem(state.currentProblemId);
    addActivity("get_learning_context", "Loaded the current lesson and progress.");
    notify();
    return {
      ok: true,
      skill: clone(SKILL),
      current_problem: {
        question_id: problem.id,
        prompt: problem.prompt,
        difficulty: problem.difficulty,
        answer_mode: "final_plus_required_work",
      },
      progress: {
        mastery_score: state.masteryScore,
        status: statusForMastery(state.masteryScore),
        attempt_count: state.attemptCount,
        mistake_tags: clone(state.mistakeTags),
      },
      recent_attempts: includeHistory
        ? state.activity.slice(-5).map(({ at, tool, message }) => ({ at, tool, message }))
        : [],
    };
  };

  const runLocalTutor = () => {
    const problem = getProblem(state.currentProblemId);
    const inspection = inspectStudentWork(problem.id);
    const correct = inspection.final_answer_status === "correct" && inspection.mistake_tag === "none";
    const feedback = correct
      ? problem.success
      : inspection.mistake_tag === "inverse_operations"
        ? "You added 5 instead of subtracting 5. Which inverse operation removes +5 from both sides?"
        : "Check the first operation: does it undo the constant while keeping both sides balanced?";
    const nextStep = correct
      ? "Ask for a follow-up problem to make the method stick."
      : problem.hint;
    return recordTutorFeedback({
      questionId: problem.id,
      feedback,
      mistakeTag: inspection.mistake_tag,
      nextStep,
      confidence: "high",
    });
  };

  const reset = () => {
    state = clone(INITIAL_STATE);
    addActivity("reset_demo", "Reset the local challenge workspace.");
    notify();
  };

  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setStudentResponse,
    checkAnswer,
    inspectStudentWork,
    recordTutorFeedback,
    createFollowupProblem,
    getLearningContext,
    runLocalTutor,
    reset,
  };
}
