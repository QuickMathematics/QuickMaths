import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore } from "./challenge-core.js";
import { questionDiagram, renderQuestionDiagram } from "./question-diagrams.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url)));
const store = createQuickMathsStore({ curriculum, storage: { getItem: () => null, setItem() {} } });
const question = (id, prompt, skill_id = "MATH_GRAPH_006") => ({ template_id: `${id}__RUNTIME_1`, skill_id, prompt });

test("the reported line and table questions plot their exact givens without an equation answer", () => {
  for (const [id, prompt, points] of [
    ["WRITE_LINE_FROM_TWO_SIMPLE_POINTS_001", "A line passes through (0, 8) and (1, 13). Enter only the right-hand side of the equation y = ?", [{ x: 0, y: 8 }, { x: 1, y: 13 }]],
    ["WRITE_LINE_FROM_TABLE_STEP_ONE_001", "A linear table has y = -13 when x = 0, and y = 3 when x = 2. Enter only the right-hand side of the equation y = ?", [{ x: 0, y: -13 }, { x: 2, y: 3 }]],
  ]) {
    const p = question(id, prompt);
    assert.deepEqual(questionDiagram(p).points, points);
    assert.doesNotMatch(renderQuestionDiagram(p), /5x|8x/);
    assert.match(renderQuestionDiagram(p), /role="img"/);
    assert.equal(renderQuestionDiagram({ ...p, values: { b: 999 }, expected_answer: "secret answer" }), renderQuestionDiagram(p));
  }
});

test("all 48 coordinate and line scenarios render bounded diagrams across 100 random variations", () => {
  for (const skill of curriculum.skills.filter(s => s.id.startsWith("MATH_GRAPH_"))) {
    for (let variation = 0; variation < 100; variation++) {
      for (const p of store.previewNativeAssessment(skill.id, variation).problems) {
        const spec = questionDiagram(p);
        assert.ok(spec, `${p.source_template_id}: ${p.prompt}`);
        const rendered = renderQuestionDiagram(p);
        assert.doesNotMatch(rendered, /NaN|Infinity|undefined/);
        assert.equal(rendered, renderQuestionDiagram({ questionId: p.template_id, prompt: p.prompt }, p.skill_id), "saved results use the original prompt, never today's generated values");
        for (const point of spec.points) {
          assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        }
      }
    }
  }
});

test("equation plots keep negative signs, rearrangement and fractional slopes", () => {
  for (const [prompt, m, b] of [
    ["For the line y = -4x + 17, what is y when x = 0?", -4, 17],
    ["For the line y = x - 6, what is the y-intercept?", 1, -6],
    ["Rewrite in slope-intercept form. Enter only the right-hand side for y: y + 7 = -3x", -3, -7],
    ["Rewrite in slope-intercept form. Enter only the right-hand side for y: 6x + y = -9", -6, -9],
    ["Rewrite in slope-intercept form. Enter only the right-hand side for y: 2y = 3x + 7", 1.5, 3.5],
    ["Rewrite in slope-intercept form. Enter only the right-hand side for y: y = -2x - 8 + 3", -2, -5],
  ]) {
    const p = question("SLOPE_INTERCEPT_SOLVE_FOR_Y_001", prompt, "MATH_GRAPH_004");
    assert.deepEqual(questionDiagram(p).line, { m, b });
    const line = renderQuestionDiagram(p).match(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" class="diagram-line"/);
    assert.ok(line, prompt);
    assert.notDeepEqual(line.slice(1, 3), line.slice(3, 5), "negative-slope lines must not collapse at opposite corners");
  }
});

test("a slope-and-point illustration uses the given slope and point, ignoring hidden values", () => {
  const p = question("WRITE_LINE_FROM_SLOPE_POINT_001", "A line has slope 5 and passes through (4, 31). Enter only the right-hand side of the equation y = ?");
  const spec = questionDiagram(p);
  assert.deepEqual(spec.points, [{ x: 4, y: 31 }]);
  assert.deepEqual(spec.line, { m: 5, b: 11 });
  assert.deepEqual(questionDiagram({ ...p, values: { b: 999 }, expected_answer: "5x + 999" }), spec);
  assert.doesNotMatch(renderQuestionDiagram(p), /b = 11|5x \+ 11/);
});

test("bearings, arcs and spherical questions use only marked givens", () => {
  for (const skill of curriculum.skills.filter(s => /^MATH_GEOM_00[1-3]$/.test(s.id))) {
    const illustrated = skill.problems.filter(p => questionDiagram(p));
    assert.ok(illustrated.length >= 6, skill.id);
    for (const p of illustrated) {
      const rendered = renderQuestionDiagram(p);
      assert.doesNotMatch(rendered, /NaN|Infinity|undefined/);
      assert.equal(rendered, renderQuestionDiagram({ ...p, expected_answer: "FORBIDDEN ANSWER", values: { secret: "FORBIDDEN ANSWER" } }));
    }
  }
  const circle = question("MATH_GEOM_002_Q02", "A circle has radius 12. Find the arc length for a central angle of 0.5 radians.", "MATH_GEOM_002");
  assert.equal(questionDiagram(circle).angleLabel, "0.5 rad");
  assert.equal(questionDiagram(circle).radiusLabel, "12");
  assert.ok(Math.abs(questionDiagram(circle).angle - 0.5 * 180 / Math.PI) < 1e-9);
});

test("authored media wins and unsupported or hostile prompts fail closed", () => {
  const p = question("WRITE_LINE_FROM_TWO_SIMPLE_POINTS_001", "A line passes through (0, 8) and (1, 13). Enter only the right-hand side of the equation y = ?");
  assert.equal(renderQuestionDiagram({ ...p, media: [{ src: "media/own.svg" }] }), "");
  assert.equal(renderQuestionDiagram({ ...p, skill_id: "CUSTOM_GEOMETRY" }), "");
  for (const prompt of ["A rewritten question without any graph information.", '<img src=x onerror="bad()">', "For the line y = window.alert(1), what is y?", "For the line y = 999999999999x + 8, what is y?"]) {
    assert.equal(renderQuestionDiagram({ ...p, prompt }), "");
  }
});
