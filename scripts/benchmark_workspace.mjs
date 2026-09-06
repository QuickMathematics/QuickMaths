// Run with: node scripts/benchmark_workspace.mjs
// Synthetic workspaces only. Timings are diagnostic, never a CI pass/fail gate.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createQuickMathsStore, STORAGE_KEY } from "../docs/challenge-core.js";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const curriculum = read("../docs/curriculum-data.json");
const packs = ["estimation-lab/1.0.0", "geography/1.0.0", "programming-fundamentals-python/1.2.0"]
  .map(path => read(`../docs/lesson-depot/lessons/${path}/lesson-set.json`));
const now = () => new Date("2026-09-06T12:00:00Z");
const memoryStorage = raw => ({
  getItem: key => key === STORAGE_KEY ? raw ?? null : null,
  setItem: (key, value) => { if (key === STORAGE_KEY) raw = value; },
});

function workspace({ installed = false, attempts = 0 } = {}) {
  let store = createQuickMathsStore({ curriculum, storage: memoryStorage(), now });
  const profile = store.createProfile("Performance fixture");
  if (installed) for (const pack of packs) store.importLessonPack(pack);
  store.completeTutorial();
  const draft = store.startTest("MATH_ARITH_001");
  for (const question of draft.problems) store.updateResponse(question.template_id, { finalAnswer: String(question.expected_answer), work: "" });
  store.submitTest();
  const attempt = store.saveReflection({ confidenceRating: 4, guessed: "no" });
  const state = JSON.parse(store.exportSyncState());
  state.attempts = Array.from({ length: attempts }, (_, index) => ({ ...structuredClone(attempt), attemptId: `benchmark-attempt-${index}` }));
  state.progress[profile.id][draft.skillId].attemptCount = attempts;
  store = createQuickMathsStore({ curriculum, storage: memoryStorage(JSON.stringify(state)), now });
  return store;
}

function measure(run) {
  for (let index = 0; index < 10; index += 1) run();
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    for (let index = 0; index < 20; index += 1) run();
    return (performance.now() - start) / 20;
  }).sort((a, b) => a - b);
  return Number(samples[3].toFixed(3));
}

for (const options of [{}, { installed: true }, { installed: true, attempts: 200 }]) {
  const store = workspace(options);
  const view = store.snapshot();
  console.log(JSON.stringify({
    lessons: view.curriculum.allSkills.length,
    attempts: view.attempts.length,
    snapshotBytes: Buffer.byteLength(JSON.stringify(view)),
    snapshotMs: measure(() => store.snapshot()),
    timerReadMs: measure(() => store.getTimers ? store.getTimers() : store.snapshot().timers),
    syncExportMs: measure(() => store.exportSyncState()),
  }));
}
