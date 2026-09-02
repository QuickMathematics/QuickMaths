import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.argv[2]) {
  throw new Error("Usage: node scripts/install_programming_pack.mjs <extracted-programming-pack-directory>");
}
const sourceRoot = resolve(process.argv[2]);
const targetRoot = resolve("docs/lesson-depot/lessons/programming-fundamentals-python/1.2.0");
const pack = JSON.parse(await readFile(resolve(sourceRoot, "lesson-set.json"), "utf8"));
const metadata = JSON.parse(await readFile(resolve(sourceRoot, "metadata.json"), "utf8"));

function splitTracePrompt(prompt) {
  const colon = prompt.indexOf(":");
  if (colon < 0 || !/[⏎↳]/u.test(prompt)) return null;
  const tail = prompt.slice(colon + 1).trim();
  const questionMatch = tail.match(/\.\s+((?:What|How|Which|Why)\b[\s\S]*\?)$/u);
  const codeSource = (questionMatch ? tail.slice(0, questionMatch.index) : tail).trim();
  const code = codeSource
    .replaceAll(" ⏎ ", "\n")
    .replaceAll("⏎", "\n")
    .replaceAll(" ↳↳ ", "\n        ")
    .replaceAll("↳↳", "\n        ")
    .replaceAll(" ↳ ", "\n    ")
    .replaceAll("↳", "\n    ")
    .split("\n")
    .map((line) => line.replace(/^\s+/, (space) => " ".repeat(space.length)).trimEnd())
    .join("\n")
    .trim();
  const lead = prompt.slice(0, colon).replace(/, where ⏎ marks a new line/iu, "").trim();
  const question = questionMatch?.[1] ?? "Trace the program and determine its final state.";
  return { code, blocks: [{ type: "text", text: `${lead}. ${question}` }, { type: "code", language: "python", text: code }] };
}

for (const skill of pack.skills) {
  for (const problem of skill.problems) {
    const formatted = splitTracePrompt(problem.prompt);
    if (formatted) problem.prompt_blocks = formatted.blocks;
  }
}

const traceSpecs = {
  CUSTOM_PROG_001_Q02: { columns: ["step", "x", "output"], rows: [[1, 4, ""], [2, 7, ""], [3, 7, 7]] },
  CUSTOM_PROG_001_Q03: { columns: ["step", "x", "y", "output"], rows: [[1, 2, null, ""], [2, 2, 10, ""], [3, 9, 10, ""], [4, 9, 10, 10]] },
  CUSTOM_PROG_002_Q04: { columns: ["step", "score", "output"], rows: [[1, 5, ""], [2, 7, ""], [3, 7, 7]] },
  CUSTOM_PROG_003_Q06: { columns: ["step", "total", "output"], rows: [[1, 10, ""], [2, 14, ""], [3, 14, 14]] },
  CUSTOM_PROG_005_Q01: { columns: ["step", "temperature", "branch", "output"], rows: [[1, 28, "", ""], [2, 28, "if", ""], [3, 28, "if", "hot"]] },
  CUSTOM_PROG_005_Q02: { columns: ["step", "age", "branch", "output"], rows: [[1, 18, "", ""], [2, 18, "if", ""], [3, 18, "if", "adult"]] },
  CUSTOM_PROG_005_Q03: { columns: ["step", "score", "branch", "grade"], rows: [[1, 82, "", null], [2, 82, "elif", "B"]] },
  CUSTOM_PROG_006_Q02: { columns: ["step", "n", "output"], rows: [[1, 0, ""], [2, 1, ""], [3, 2, ""], [4, 3, ""], [5, 4, ""], [6, 4, 4]] },
  CUSTOM_PROG_006_Q03: { columns: ["step", "n", "total"], rows: [[1, 1, 0], [2, 2, 1], [3, 3, 3], [4, 4, 6], [5, 5, 10]] },
  CUSTOM_PROG_007_Q04: { columns: ["step", "n", "total"], rows: [[1, null, 0], [2, 1, 1], [3, 2, 3], [4, 3, 6], [5, 4, 10]] },
  CUSTOM_PROG_008_Q01: { columns: ["step", "a", "b", "result"], rows: [[1, 2, 3, null], [2, 2, 3, 5]] },
  CUSTOM_PROG_010_Q04: { columns: ["step", "items", "output"], rows: [[1, '["a", "b"]', ""], [2, '["a", "b", "c"]', ""], [3, '["a", "b", "c"]', 3]] },
  CUSTOM_PROG_011_Q02: { columns: ["step", "value", "count"], rows: [[1, null, 0], [2, -2, 0], [3, 0, 0], [4, 5, 1], [5, 7, 2]] },
  CUSTOM_PROG_012_Q02: { columns: ["step", "counts_a"], rows: [[1, 2], [2, 3]] },
  CUSTOM_PROG_016_Q02: { columns: ["step", "x", "y", "output"], rows: [[1, 5, 8, ""], [2, 8, 5, ""], [3, 8, 5, 8]] },
  CUSTOM_PROG_017_Q02: { columns: ["step", "level", "output"], rows: [[1, 2, ""], [2, 3, ""], [3, 3, 3]] },
};

const problemsById = new Map(pack.skills.flatMap((skill) => skill.problems.map((problem) => [problem.template_id, problem])));
for (const [id, spec] of Object.entries(traceSpecs)) {
  const problem = problemsById.get(id);
  const formatted = splitTracePrompt(problem.prompt);
  if (!formatted) throw new Error(`Could not extract trace code from ${id}.`);
  problem.answer_mode = "final_plus_required_work";
  problem.work_required = true;
  problem.work = {
    mode: "code_trace_steps",
    prompt: "Complete every authored execution checkpoint in the trace table.",
    trace_spec: {
      language: "python",
      display_code: formatted.code,
      columns: spec.columns,
      expected_rows: spec.rows.map((values) => Object.fromEntries(spec.columns.map((column, index) => [column, values[index]]))),
      comparison: { trim_strings: true, numeric_equivalence: true, blank_equals_null: true },
    },
  };
  problem.review_policy = { work_review: "auto", mastery_requires_review_pass: false, allow_self_review: true };
}

const defaultPolicy = (allowed_builtins = []) => ({
  allowed_builtins,
  imports: [],
  network: false,
  storage: false,
  clock: false,
  randomness: false,
});

function pythonProblem(skillId, suffix, {
  prompt,
  code,
  entrypoint,
  parameters,
  returnType,
  tests,
  allowedBuiltins = [],
  difficulty = "hard",
  solutionSteps,
  mistakeTags,
}) {
  const templateId = `${skillId}_${suffix}`;
  return {
    template_id: templateId,
    skill_id: skillId,
    difficulty,
    prompt,
    prompt_blocks: [
      { type: "text", text: prompt },
      { type: "code", language: "python", text: code },
    ],
    expected_answer: "All declared Python tests pass.",
    answer_type: "code",
    grading_method: "python_program",
    solution_steps: solutionSteps,
    mistake_tags: mistakeTags,
    answer_mode: "final_only",
    work: { mode: "none" },
    review_policy: { work_review: "none", mastery_requires_review_pass: false, allow_self_review: true },
    program_spec: {
      runtime: "python_subset_v1",
      entrypoint: { kind: "function", name: entrypoint, parameters, return_type: returnType },
      tests,
      limits: { wall_time_ms: 1500, step_limit: 20000, memory_mb: 32, stdout_chars: 1000 },
      policy: defaultPolicy(allowedBuiltins),
    },
  };
}

const codeProblems = [
  pythonProblem("CUSTOM_PROG_002", "CODE_01", {
    prompt: "Implement rectangle_area(width, height), returning the rectangular area as an integer. The grader calls the function directly.",
    code: "def rectangle_area(width, height):\n    # Return width multiplied by height.\n    pass",
    entrypoint: "rectangle_area", parameters: [{ name: "width", type: "int" }, { name: "height", type: "int" }], returnType: "int",
    tests: [{ id: "ordinary", args: [4, 3], expected_return: 12, visibility: "example" }, { id: "zero_width", args: [0, 8], expected_return: 0, visibility: "after_submission" }, { id: "unit", args: [1, 1], expected_return: 1, visibility: "hidden" }, { id: "larger", args: [17, 9], expected_return: 153, visibility: "hidden" }],
    solutionSteps: ["Define the named function with exactly two parameters.", "Return the product instead of printing it.", "Check the zero-width boundary case."], mistakeTags: ["function_contract", "return_vs_print", "numeric_expression"],
  }),
  pythonProblem("CUSTOM_PROG_004", "CODE_01", {
    prompt: "Implement is_even(number), returning a Boolean that is true exactly when number is even.",
    code: "def is_even(number):\n    # Return a Boolean expression.\n    pass",
    entrypoint: "is_even", parameters: [{ name: "number", type: "int" }], returnType: "bool",
    tests: [{ id: "positive_even", args: [8], expected_return: true, visibility: "example" }, { id: "positive_odd", args: [7], expected_return: false, visibility: "after_submission" }, { id: "zero", args: [0], expected_return: true, visibility: "hidden" }, { id: "negative_odd", args: [-13], expected_return: false, visibility: "hidden" }],
    solutionSteps: ["Use the remainder operator to test divisibility by two.", "Return the comparison result itself.", "Remember that zero is even and negative integers follow the same rule."], mistakeTags: ["boolean_expression", "modulo", "edge_case"],
  }),
  pythonProblem("CUSTOM_PROG_007", "CODE_01", {
    prompt: "Implement sum_to(n), returning 1 + 2 + … + n for every non-negative integer n.",
    code: "def sum_to(n):\n    # Accumulate the inclusive range from 1 through n.\n    pass",
    entrypoint: "sum_to", parameters: [{ name: "n", type: "int" }], returnType: "int", allowedBuiltins: ["range", "sum"],
    tests: [{ id: "five", args: [5], expected_return: 15, visibility: "example" }, { id: "empty_range", args: [0], expected_return: 0, visibility: "after_submission" }, { id: "one", args: [1], expected_return: 1, visibility: "hidden" }, { id: "hundred", args: [100], expected_return: 5050, visibility: "hidden" }],
    solutionSteps: ["Choose an inclusive upper bound.", "Initialize an accumulator or use sum on the range.", "Verify that n = 0 produces an empty sum of zero."], mistakeTags: ["range_boundary", "accumulator", "edge_case"],
  }),
  pythonProblem("CUSTOM_PROG_008", "CODE_01", {
    prompt: "Implement clamp(value, lower, upper), returning lower when value is too small, upper when it is too large, and value otherwise.",
    code: "def clamp(value, lower, upper):\n    # Assume lower <= upper.\n    pass",
    entrypoint: "clamp", parameters: [{ name: "value", type: "int" }, { name: "lower", type: "int" }, { name: "upper", type: "int" }], returnType: "int",
    tests: [{ id: "inside", args: [5, 0, 10], expected_return: 5, visibility: "example" }, { id: "below", args: [-3, 0, 10], expected_return: 0, visibility: "after_submission" }, { id: "above", args: [18, 0, 10], expected_return: 10, visibility: "hidden" }, { id: "boundary", args: [10, 0, 10], expected_return: 10, visibility: "hidden" }],
    solutionSteps: ["Define the below-range case.", "Define the above-range case.", "Return the unchanged value only when neither boundary is crossed."], mistakeTags: ["conditional_order", "return_path", "boundary_case"],
  }),
  pythonProblem("CUSTOM_PROG_009", "CODE_01", {
    prompt: "Implement normalize_label(text): remove surrounding whitespace, lowercase the text, and replace every ordinary space with a hyphen.",
    code: "def normalize_label(text):\n    # Chain string methods and return the new string.\n    pass",
    entrypoint: "normalize_label", parameters: [{ name: "text", type: "str" }], returnType: "str",
    tests: [{ id: "ordinary", args: ["  Hello World  "], expected_return: "hello-world", visibility: "example" }, { id: "single", args: ["PYTHON"], expected_return: "python", visibility: "after_submission" }, { id: "internal_spaces", args: ["a  b"], expected_return: "a--b", visibility: "hidden" }, { id: "empty", args: ["   "], expected_return: "", visibility: "hidden" }],
    solutionSteps: ["Strip only the surrounding whitespace first.", "Lowercase the stripped string.", "Replace ordinary space characters and return the result."], mistakeTags: ["string_immutability", "method_order", "return_vs_print"],
  }),
  pythonProblem("CUSTOM_PROG_010", "CODE_01", {
    prompt: "Implement rotate_left(items), returning a new list with the first item moved to the end. Return an empty list for empty input and do not mutate items.",
    code: "def rotate_left(items):\n    # Build and return a new list.\n    pass",
    entrypoint: "rotate_left", parameters: [{ name: "items", type: "list" }], returnType: "list",
    tests: [{ id: "ordinary", args: [[1, 2, 3]], expected_return: [2, 3, 1], visibility: "example" }, { id: "empty", args: [[]], expected_return: [], visibility: "after_submission" }, { id: "single", args: [["a"]], expected_return: ["a"], visibility: "hidden" }, { id: "duplicates", args: [[1, 1, 2]], expected_return: [1, 2, 1], visibility: "hidden" }],
    solutionSteps: ["Handle empty input before indexing.", "Use slices to separate the tail and first item.", "Concatenate new lists instead of mutating the argument."], mistakeTags: ["empty_collection", "list_slicing", "mutation_aliasing"],
  }),
  pythonProblem("CUSTOM_PROG_011", "CODE_01", {
    prompt: "Implement positive_total(values), returning the sum of only the strictly positive numbers.",
    code: "def positive_total(values):\n    # Traverse, filter, and accumulate.\n    pass",
    entrypoint: "positive_total", parameters: [{ name: "values", type: "list" }], returnType: "int",
    tests: [{ id: "mixed", args: [[-2, 0, 5, 7]], expected_return: 12, visibility: "example" }, { id: "none_positive", args: [[-4, 0]], expected_return: 0, visibility: "after_submission" }, { id: "empty", args: [[]], expected_return: 0, visibility: "hidden" }, { id: "all_positive", args: [[1, 2, 3, 4]], expected_return: 10, visibility: "hidden" }],
    solutionSteps: ["Start the total at zero.", "Add a value only when it is greater than zero.", "Return the accumulator after the traversal."], mistakeTags: ["filter_condition", "accumulator", "loop_scope"],
  }),
  pythonProblem("CUSTOM_PROG_012", "CODE_01", {
    prompt: "Implement count_words(words), returning a dictionary whose keys are the words and whose values are their occurrence counts.",
    code: "def count_words(words):\n    # Build a frequency table.\n    pass",
    entrypoint: "count_words", parameters: [{ name: "words", type: "list" }], returnType: "dict",
    tests: [{ id: "repeated", args: [["a", "b", "a"]], expected_return: { a: 2, b: 1 }, visibility: "example" }, { id: "empty", args: [[]], expected_return: {}, visibility: "after_submission" }, { id: "single", args: [["python"]], expected_return: { python: 1 }, visibility: "hidden" }, { id: "case_sensitive", args: [["A", "a"]], expected_return: { A: 1, a: 1 }, visibility: "hidden" }],
    solutionSteps: ["Create an empty dictionary.", "Read the prior count with get and a zero default.", "Store the incremented count for each word."], mistakeTags: ["dictionary_default", "frequency_table", "mutation"],
  }),
  pythonProblem("CUSTOM_PROG_013", "CODE_01", {
    prompt: "Implement mean_or_none(values), returning None for an empty list and otherwise returning the arithmetic mean.",
    code: "def mean_or_none(values):\n    # Guard the empty case before division.\n    pass",
    entrypoint: "mean_or_none", parameters: [{ name: "values", type: "list" }], returnType: "json", allowedBuiltins: ["len", "sum"],
    tests: [{ id: "ordinary", args: [[2, 3, 5]], expected_return: 10 / 3, visibility: "example" }, { id: "empty", args: [[]], expected_return: null, visibility: "after_submission" }, { id: "single", args: [[9]], expected_return: 9.0, visibility: "hidden" }, { id: "negatives", args: [[-3, 3]], expected_return: 0.0, visibility: "hidden" }],
    solutionSteps: ["Return None before attempting to divide an empty total.", "Divide the sum by the number of values.", "Return the value rather than printing it."], mistakeTags: ["empty_collection", "division_by_zero", "test_boundary"],
  }),
  pythonProblem("CUSTOM_PROG_014", "CODE_01", {
    prompt: "Implement running_totals(values), returning a list whose item at each position is the sum of all input values through that position.",
    code: "def running_totals(values):\n    # Keep one accumulator and one output list.\n    pass",
    entrypoint: "running_totals", parameters: [{ name: "values", type: "list" }], returnType: "list",
    tests: [{ id: "ordinary", args: [[3, 1, 4]], expected_return: [3, 4, 8], visibility: "example" }, { id: "empty", args: [[]], expected_return: [], visibility: "after_submission" }, { id: "negative", args: [[5, -2, -3]], expected_return: [5, 3, 0], visibility: "hidden" }, { id: "single", args: [[7]], expected_return: [7], visibility: "hidden" }],
    solutionSteps: ["Separate the running accumulator from the output list.", "Update the accumulator before appending it.", "Return the completed list after the loop."], mistakeTags: ["decomposition", "accumulator", "append_order"],
  }),
  pythonProblem("CUSTOM_PROG_016", "CODE_01", {
    prompt: "Implement unique_sorted(values), returning the distinct input values in ascending order.",
    code: "def unique_sorted(values):\n    # Combine set semantics with deterministic ordering.\n    pass",
    entrypoint: "unique_sorted", parameters: [{ name: "values", type: "list" }], returnType: "list", allowedBuiltins: ["set", "sorted"],
    tests: [{ id: "ordinary", args: [[3, 1, 3, 2]], expected_return: [1, 2, 3], visibility: "example" }, { id: "empty", args: [[]], expected_return: [], visibility: "after_submission" }, { id: "already_unique", args: [[-1, 4, 2]], expected_return: [-1, 2, 4], visibility: "hidden" }, { id: "one_value", args: [[5, 5, 5]], expected_return: [5], visibility: "hidden" }],
    solutionSteps: ["Use a set to remove duplicate values.", "Sort the unique values to make the result deterministic.", "Return the sorted list."], mistakeTags: ["set_uniqueness", "deterministic_order", "return_type"],
  }),
  pythonProblem("CUSTOM_PROG_017", "CODE_01", {
    prompt: "Implement highest_scorer(records), returning the name from the record with the greatest score. Return an empty string for no records; ties keep the earliest record.",
    code: "def highest_scorer(records):\n    # Each record has name and score keys.\n    pass",
    entrypoint: "highest_scorer", parameters: [{ name: "records", type: "list" }], returnType: "str",
    tests: [{ id: "ordinary", args: [[{ name: "Ada", score: 91 }, { name: "Lin", score: 84 }]], expected_return: "Ada", visibility: "example" }, { id: "empty", args: [[]], expected_return: "", visibility: "after_submission" }, { id: "later_winner", args: [[{ name: "A", score: 1 }, { name: "B", score: 9 }]], expected_return: "B", visibility: "hidden" }, { id: "tie", args: [[{ name: "First", score: 7 }, { name: "Second", score: 7 }]], expected_return: "First", visibility: "hidden" }],
    solutionSteps: ["Handle an empty record list first.", "Keep the current best record while traversing.", "Update only for a strictly larger score so ties keep the earlier record."], mistakeTags: ["nested_data", "empty_collection", "tie_policy"],
  }),
  pythonProblem("CUSTOM_PROG_021", "CODE_01", {
    prompt: "Implement normalize_names(names), returning stripped, lowercase, non-empty names with duplicates removed and the result sorted.",
    code: "def normalize_names(names):\n    # A comprehension can build the cleaned collection.\n    pass",
    entrypoint: "normalize_names", parameters: [{ name: "names", type: "list" }], returnType: "list", allowedBuiltins: ["set", "sorted"],
    tests: [{ id: "ordinary", args: [[" Ada ", "LIN", "ada"]], expected_return: ["ada", "lin"], visibility: "example" }, { id: "blanks", args: [["", "  ", "Kai"]], expected_return: ["kai"], visibility: "after_submission" }, { id: "empty", args: [[]], expected_return: [], visibility: "hidden" }, { id: "ordered", args: [["z", "B", "a"]], expected_return: ["a", "b", "z"], visibility: "hidden" }],
    solutionSteps: ["Strip and lowercase each name.", "Exclude values that are empty after stripping.", "Deduplicate and sort the cleaned names."], mistakeTags: ["comprehension_filter", "normalization", "deterministic_order"],
  }),
  pythonProblem("CUSTOM_PROG_023", "CODE_01", {
    prompt: "Implement first_index(values, target), returning the first matching index or -1 when target is absent.",
    code: "def first_index(values, target):\n    # Perform a linear search.\n    pass",
    entrypoint: "first_index", parameters: [{ name: "values", type: "list" }, { name: "target", type: "int" }], returnType: "int", allowedBuiltins: ["enumerate"],
    tests: [{ id: "middle", args: [[4, 7, 9], 7], expected_return: 1, visibility: "example" }, { id: "absent", args: [[4, 7, 9], 3], expected_return: -1, visibility: "after_submission" }, { id: "duplicate", args: [[5, 1, 5], 5], expected_return: 0, visibility: "hidden" }, { id: "empty", args: [[], 2], expected_return: -1, visibility: "hidden" }],
    solutionSteps: ["Traverse indexes and values together.", "Return immediately on the first match.", "Return -1 only after the whole search fails."], mistakeTags: ["linear_search", "early_return", "not_found"],
  }),
  pythonProblem("CUSTOM_PROG_024", "CODE_01", {
    prompt: "Implement parse_command(parts), returning a dictionary with command and arguments. Empty input returns an empty command and empty argument list.",
    code: "def parse_command(parts):\n    # Return {'command': ..., 'arguments': [...]}.\n    pass",
    entrypoint: "parse_command", parameters: [{ name: "parts", type: "list" }], returnType: "dict",
    tests: [{ id: "ordinary", args: [["add", "math", "90"]], expected_return: { command: "add", arguments: ["math", "90"] }, visibility: "example" }, { id: "empty", args: [[]], expected_return: { command: "", arguments: [] }, visibility: "after_submission" }, { id: "command_only", args: [["list"]], expected_return: { command: "list", arguments: [] }, visibility: "hidden" }, { id: "preserve", args: [["note", "Mixed Case"]], expected_return: { command: "note", arguments: ["Mixed Case"] }, visibility: "hidden" }],
    solutionSteps: ["Branch before indexing empty input.", "Use the first item as the command.", "Copy the remaining slice into the arguments field."], mistakeTags: ["command_parsing", "empty_input", "data_contract"],
  }),
  pythonProblem("CUSTOM_PROG_025", "CODE_01", {
    prompt: "Implement record_attempt(state, skill, score). Return a new tracker dictionary with score appended under skill, without mutating state.",
    code: "def record_attempt(state, skill, score):\n    # Copy both the outer dictionary and the chosen score list.\n    pass",
    entrypoint: "record_attempt", parameters: [{ name: "state", type: "dict" }, { name: "skill", type: "str" }, { name: "score", type: "int" }], returnType: "dict", allowedBuiltins: ["dict", "list"],
    tests: [{ id: "new_skill", args: [{}, "loops", 80], expected_return: { loops: [80] }, visibility: "example" }, { id: "existing", args: [{ loops: [70] }, "loops", 90], expected_return: { loops: [70, 90] }, visibility: "after_submission" }, { id: "preserve_other", args: [{ loops: [70], lists: [88] }, "loops", 75], expected_return: { loops: [70, 75], lists: [88] }, visibility: "hidden" }, { id: "zero", args: [{}, "basics", 0], expected_return: { basics: [0] }, visibility: "hidden" }],
    solutionSteps: ["Make a shallow copy of the outer dictionary.", "Copy the existing list for skill, or start a new list.", "Append the score to that copied list and assign it in the new dictionary."], mistakeTags: ["aliasing", "nested_mutation", "persistent_state"],
  }),
];

for (const problem of codeProblems) {
  const skill = pack.skills.find((item) => item.id === problem.skill_id);
  if (!skill) throw new Error(`Missing target lesson ${problem.skill_id}.`);
  if (skill.problems.some((item) => item.template_id === problem.template_id)) throw new Error(`Duplicate code problem ${problem.template_id}.`);
  skill.problems.push(problem);
  skill.question_count = skill.problems.length;
}

pack.version = "1.2.0";
pack.description = `${pack.description} Version 1.2 adds formatted Python prompts, deterministic trace-table checks, and isolated pure-function programming assessments.`;
pack.track.schema_version = "2.0";

metadata.version = "1.2.0";
metadata.description = `${metadata.description} This release adds formatted code, structured trace tables, and sandboxed pure-function grading.`;
metadata.tags = [...new Set([...(metadata.tags ?? []), "code-grading", "trace-tables", "sandbox"] )];
metadata.updated_at = "2026-09-02";

await mkdir(targetRoot, { recursive: true });
await writeFile(resolve(targetRoot, "lesson-set.json"), `${JSON.stringify(pack, null, 2)}\n`, "utf8");
await writeFile(resolve(targetRoot, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

const problemCount = pack.skills.reduce((total, skill) => total + skill.problems.length, 0);
console.log(`Installed ${pack.name} ${pack.version}: ${pack.skills.length} lessons, ${problemCount} problems, ${Object.keys(traceSpecs).length} trace tables, ${codeProblems.length} sandbox programs.`);
