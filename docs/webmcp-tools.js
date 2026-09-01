export const TOOL_NAMES = Object.freeze([
  "get_agent_guide",
  "get_app_state",
  "get_curriculum_map",
  "get_progress_summary",
  "navigate_learning_app",
  "get_learning_context",
  "start_skill_test",
  "inspect_student_work",
  "record_tutor_feedback",
  "create_followup_problem",
]);

const stringSchema = (description, maxLength) => ({ type: "string", description, maxLength });

function requireObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool input must be an object.");
}

function rejectUnknown(input, allowed) {
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Unknown input property: ${unknown}`);
}

function requiredString(input, key, maxLength) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required.`);
  if (value.length > maxLength) throw new Error(`${key} is too long.`);
  return value.trim();
}

function optionalString(input, key, maxLength) {
  if (input[key] == null || input[key] === "") return "";
  return requiredString(input, key, maxLength);
}

export function buildToolDefinitions(store, agentManifest = {}) {
  const guide = agentManifest && typeof agentManifest === "object" && !Array.isArray(agentManifest)
    ? JSON.parse(JSON.stringify(agentManifest))
    : {};
  return [
    {
      name: "get_agent_guide",
      title: "Get QuickMaths agent guide",
      description: "Read the QuickMaths operating guide, tutoring rules, backup policy, routes, tools, and custom lesson-set format before assisting a learner.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}) {
        requireObject(input); rejectUnknown(input, []);
        return {
          ok: true,
          guide: Object.keys(guide).length ? guide : {
            app: "QuickMaths Web",
            policy: ["Inspect state before acting.", "Never reveal pre-submission answer keys.", "Recommend a full JSON backup at natural stopping points and before imports."],
            authoring_guide: "./CUSTOM_LESSON_SETS.md",
            example_lesson_set: "./lesson-set-example.json",
          },
        };
      },
    },
    {
      name: "get_app_state",
      title: "Get QuickMaths app state",
      description: "Read the current QuickMaths view, selected learner, timers, mastery counts, and selected skill.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}) {
        requireObject(input); rejectUnknown(input, []);
        const state = store.snapshot();
        return {
          ok: true,
          has_profile: Boolean(state.activeProfile),
          profile: state.activeProfile ? { display_name: state.activeProfile.displayName } : null,
          view: state.ui.route,
          timers: state.timers,
          mastery_counts: state.progressCounts,
          selected_skill: state.activeProfile ? { skill_id: state.selectedSkill.id, name: state.selectedSkill.name } : null,
          suggested_next: state.suggested ? { skill_id: state.suggested.id, name: state.suggested.name, status: state.suggested.status } : null,
          backup: {
            last_export_at: state.backupStatus.lastExportAt,
            recommended: state.backupStatus.recommended,
            reason: state.backupStatus.reason,
          },
          custom_lesson_sets: state.lessonPacks.map((pack) => ({ id: pack.id, name: pack.name, skill_count: pack.skillCount })),
        };
      },
    },
    {
      name: "get_curriculum_map",
      title: "Get curriculum map",
      description: "Read the learner's 25-skill prerequisite map, including statuses and unlock relationships.",
      inputSchema: {
        type: "object",
        properties: { include_locked: { type: "boolean", description: "Include locked skills; defaults to true." } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      async execute(input = {}) {
        requireObject(input); rejectUnknown(input, ["include_locked"]);
        if (input.include_locked !== undefined && typeof input.include_locked !== "boolean") throw new Error("include_locked must be a boolean.");
        const state = store.snapshot();
        const rows = (input.include_locked ?? true) ? state.progressRows : state.progressRows.filter((row) => row.status !== "locked");
        return {
          ok: true,
          track: { id: state.curriculum.track.id, name: state.curriculum.track.name },
          custom_lesson_sets: state.lessonPacks.map((pack) => ({ id: pack.id, name: pack.name, skill_count: pack.skillCount })),
          skills: rows.map((row) => ({
            skill_id: row.id, name: row.name, subdomain: row.subdomain, status: row.status,
            mastery_score: row.masteryScore, prerequisites: row.prerequisites, unlocks: row.unlocks,
          })),
        };
      },
    },
    {
      name: "get_progress_summary",
      title: "Get progress summary",
      description: "Read mastery totals, suggested next work, attempts, and misconception tags for the selected learner.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}) {
        requireObject(input); rejectUnknown(input, []);
        return store.getProgressSummary();
      },
    },
    {
      name: "navigate_learning_app",
      title: "Navigate QuickMaths",
      description: "Open a QuickMaths dashboard, map, lesson, test, results, or save/load view. This changes the visible page.",
      inputSchema: {
        type: "object",
        properties: {
          view: { type: "string", enum: ["home", "map", "lesson", "test", "results", "data"] },
          skill_id: stringSchema("Optional skill to select when opening a lesson, test, or map.", 60),
        },
        required: ["view"],
        additionalProperties: false,
      },
      async execute(input) {
        requireObject(input); rejectUnknown(input, ["view", "skill_id"]);
        const view = requiredString(input, "view", 20);
        if (!["home", "map", "lesson", "test", "results", "data"].includes(view)) throw new Error("view is invalid.");
        const skillId = optionalString(input, "skill_id", 60) || null;
        store.navigate(view, skillId);
        return { ok: true, visible_view: view, selected_skill_id: store.snapshot().ui.selectedSkillId };
      },
    },
    {
      name: "get_learning_context",
      title: "Get learning context",
      description: "Read the selected lesson or active test without revealing expected answers or solution steps.",
      inputSchema: {
        type: "object",
        properties: { include_history: { type: "boolean", description: "Include up to five attempt summaries." } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}) {
        requireObject(input); rejectUnknown(input, ["include_history"]);
        if (input.include_history !== undefined && typeof input.include_history !== "boolean") throw new Error("include_history must be a boolean.");
        return store.getLearningContext({ includeHistory: input.include_history ?? false });
      },
    },
    {
      name: "start_skill_test",
      title: "Start mastery test",
      description: "Create or resume a mastery test for an unlocked QuickMaths skill and open it on screen.",
      inputSchema: {
        type: "object",
        properties: { skill_id: stringSchema("An unlocked skill ID from the curriculum map.", 60) },
        required: ["skill_id"],
        additionalProperties: false,
      },
      async execute(input) {
        requireObject(input); rejectUnknown(input, ["skill_id"]);
        const skillId = requiredString(input, "skill_id", 60);
        const draft = store.startTest(skillId);
        return {
          ok: true,
          visible_view: "test",
          skill_id: skillId,
          question_count: draft.problems.length,
          questions: draft.problems.map((problem) => ({ question_id: problem.template_id, prompt: problem.prompt, difficulty: problem.difficulty, answer_mode: problem.answer_mode })),
        };
      },
    },
    {
      name: "inspect_student_work",
      title: "Inspect student work",
      description: "Inspect one response in the active test without exposing its answer key.",
      inputSchema: {
        type: "object",
        properties: { question_id: stringSchema("Optional question ID; defaults to the first answered question.", 120) },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input = {}) {
        requireObject(input); rejectUnknown(input, ["question_id"]);
        return store.inspectStudentWork({ questionId: optionalString(input, "question_id", 120) });
      },
    },
    {
      name: "record_tutor_feedback",
      title: "Record tutor feedback",
      description: "Save concise Socratic feedback beside the learner's work. Do not reveal the final answer.",
      inputSchema: {
        type: "object",
        properties: {
          question_id: stringSchema("The reviewed question ID.", 120),
          feedback: stringSchema("One concise diagnosis or Socratic prompt.", 1500),
          mistake_tag: stringSchema("A short misconception tag, or none.", 80),
          next_step: stringSchema("One concrete next action for the learner.", 300),
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          verdict: { type: "string", enum: ["pass", "partial", "needs_revision", "fail"] },
        },
        required: ["question_id", "feedback", "next_step"],
        additionalProperties: false,
      },
      async execute(input) {
        requireObject(input); rejectUnknown(input, ["question_id", "feedback", "mistake_tag", "next_step", "confidence", "verdict"]);
        return store.recordTutorFeedback({
          questionId: requiredString(input, "question_id", 120),
          feedback: requiredString(input, "feedback", 1500),
          mistakeTag: optionalString(input, "mistake_tag", 80),
          nextStep: requiredString(input, "next_step", 300),
          confidence: input.confidence ?? "medium",
          verdict: input.verdict ?? "partial",
          reviewerType: "ai_tutor",
        });
      },
    },
    {
      name: "create_followup_problem",
      title: "Create follow-up problem",
      description: "Open an allowlisted problem from the selected skill, targeted to a misconception when possible.",
      inputSchema: {
        type: "object",
        properties: {
          skill_id: stringSchema("The unlocked skill ID to practice.", 60),
          focus: stringSchema("A short mistake tag or concept to target.", 80),
        },
        required: ["skill_id"],
        additionalProperties: false,
      },
      async execute(input) {
        requireObject(input); rejectUnknown(input, ["skill_id", "focus"]);
        const result = store.createFollowupProblem({ skillId: requiredString(input, "skill_id", 60), focus: optionalString(input, "focus", 80) });
        globalThis.document?.getElementById?.(`question-${result.problem.question_id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        return result;
      },
    },
  ];
}

export async function registerWebMcpTools(store, modelContext = globalThis.document?.modelContext, agentManifest = {}) {
  if (!modelContext || typeof modelContext.registerTool !== "function") return { available: false, registered: [], error: null };
  const registered = [];
  try {
    for (const definition of buildToolDefinitions(store, agentManifest)) {
      await modelContext.registerTool(definition);
      registered.push(definition.name);
    }
    return { available: true, registered, error: null };
  } catch (error) {
    return { available: true, registered, error: error instanceof Error ? error.message : String(error) };
  }
}
