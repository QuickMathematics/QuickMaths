const STRING = (description, maxLength) => ({ type: "string", description, maxLength });

export const TOOL_NAMES = Object.freeze([
  "get_learning_context",
  "inspect_student_work",
  "record_tutor_feedback",
  "create_followup_problem",
]);

function requireObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool input must be an object.");
  }
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

export function buildToolDefinitions(store) {
  return [
    {
      name: "get_learning_context",
      title: "Get learning context",
      description: "Read the learner's current algebra problem and progress without revealing the answer.",
      inputSchema: {
        type: "object",
        properties: {
          include_history: { type: "boolean", description: "Include up to five recent activity summaries." },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      async execute(input = {}) {
        requireObject(input);
        rejectUnknown(input, ["include_history"]);
        if (input.include_history !== undefined && typeof input.include_history !== "boolean") {
          throw new Error("include_history must be a boolean.");
        }
        return store.getLearningContext({ includeHistory: input.include_history ?? false });
      },
    },
    {
      name: "inspect_student_work",
      title: "Inspect student work",
      description: "Inspect the work and final answer currently visible in QuickMaths without exposing the answer key.",
      inputSchema: {
        type: "object",
        properties: {
          question_id: STRING("The ID of the problem currently on screen.", 40),
        },
        required: ["question_id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        requireObject(input);
        rejectUnknown(input, ["question_id"]);
        return store.inspectStudentWork(requiredString(input, "question_id", 40));
      },
    },
    {
      name: "record_tutor_feedback",
      title: "Record tutor feedback",
      description: "Save concise Socratic feedback beside the learner's work. Do not reveal the final answer.",
      inputSchema: {
        type: "object",
        properties: {
          question_id: STRING("The current problem ID.", 40),
          feedback: STRING("Socratic feedback identifying one reasoning move to revisit.", 1500),
          mistake_tag: STRING("A short misconception tag, or none.", 80),
          next_step: STRING("One concrete next action for the learner.", 300),
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["question_id", "feedback", "next_step"],
        additionalProperties: false,
      },
      async execute(input) {
        requireObject(input);
        rejectUnknown(input, ["question_id", "feedback", "mistake_tag", "next_step", "confidence"]);
        return store.recordTutorFeedback({
          questionId: requiredString(input, "question_id", 40),
          feedback: requiredString(input, "feedback", 1500),
          mistakeTag: input.mistake_tag ? requiredString(input, "mistake_tag", 80) : "",
          nextStep: requiredString(input, "next_step", 300),
          confidence: input.confidence ?? "medium",
        });
      },
    },
    {
      name: "create_followup_problem",
      title: "Create follow-up problem",
      description: "Open an allowlisted algebra problem selected for the learner's next practice step.",
      inputSchema: {
        type: "object",
        properties: {
          skill_id: { type: "string", const: "MATH_ALG_002", description: "The active QuickMaths skill ID." },
          difficulty: { type: "string", enum: ["same", "easier", "harder"] },
          focus: STRING("A short misconception or concept tag to target.", 80),
        },
        required: ["skill_id"],
        additionalProperties: false,
      },
      async execute(input) {
        requireObject(input);
        rejectUnknown(input, ["skill_id", "difficulty", "focus"]);
        return store.createFollowupProblem({
          skillId: requiredString(input, "skill_id", 40),
          difficulty: input.difficulty ?? "same",
          focus: input.focus ? requiredString(input, "focus", 80) : "",
        });
      },
    },
  ];
}

export async function registerWebMcpTools(store, modelContext = globalThis.document?.modelContext) {
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return { available: false, registered: [], error: null };
  }

  const registered = [];
  try {
    for (const definition of buildToolDefinitions(store)) {
      await modelContext.registerTool(definition);
      registered.push(definition.name);
    }
    return { available: true, registered, error: null };
  } catch (error) {
    return {
      available: true,
      registered,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
