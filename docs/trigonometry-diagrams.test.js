import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createQuickMathsStore } from "./challenge-core.js";
import { questionDiagram, renderQuestionDiagram } from "./question-diagrams.js";
import { diagramExpression, diagramValue } from "./trigonometry-diagrams.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url)));
const store = createQuickMathsStore({ curriculum, storage: { getItem: () => null, setItem() {} } });
const question = (id, prompt, skill_id) => ({ source_template_id: id, skill_id, prompt });
const abstract = new Set(["TRIG_ID_PYTHAGOREAN_SIMPLIFY_001", "TRIG_ID_ODD_SINE_001", "TRIG_ID_SECANT_DIFFERENCE_001", "TRIG_ID_QUOTIENT_PRODUCT_001", "TRIG_ID_COFUNCTION_001", "TRIG_ID_FALSE_IDENTITY_001"]);

test("73 spatial trig scenarios render from displayed givens across 100 retakes and saved results", () => {
  const ids = new Set();
  for (const skill of curriculum.skills.filter(s => s.id.startsWith("MATH_TRIG_"))) {
    for (let variation = 0; variation < 100; variation++) {
      for (const p of store.previewNativeAssessment(skill.id, variation).problems) {
        if (abstract.has(p.source_template_id)) { assert.equal(questionDiagram(p), null); continue; }
        const spec = questionDiagram(p); assert.ok(spec, `${p.source_template_id}: ${p.prompt}`);
        ids.add(p.source_template_id);
        const html = renderQuestionDiagram(p);
        assert.match(html, /role="img"/); assert.doesNotMatch(html, /NaN|Infinity|undefined|FORBIDDEN/);
        assert.equal(html, renderQuestionDiagram({ ...p, values: { secret: "FORBIDDEN" }, expected_answer: "FORBIDDEN", options: ["FORBIDDEN"] }));
        assert.equal(html, renderQuestionDiagram({ questionId: p.template_id, prompt: p.prompt }, p.skill_id));
        if (spec.kind === "wave") assert.ok(spec.xmax > spec.xmin);
      }
    }
  }
  assert.equal(ids.size, 73);
});

test("given-expression grammar respects multiplication, powers, signs and functions without executing code", () => {
  for (const [expression, expected] of [
    ["-2cos(x)^2 + 1", x => -2*Math.cos(x)**2+1],
    ["8sin(6(x - 4)) + 8", x => 8*Math.sin(6*(x-4))+8],
    ["3cos(2*pi*t/20) - sqrt(3)", x => 3*Math.cos(2*Math.PI*x/20)-Math.sqrt(3)],
    ["sin(x)^2 = 1", null],
  ]) {
    const tree = diagramExpression(expression);
    if (!expected) { assert.equal(tree, null); continue; }
    assert.ok(tree);
    for (const x of [-3.2, 0, .75, 8]) assert.ok(Math.abs(diagramValue(tree,x)-expected(x)) < 1e-10, expression);
  }
  for (const input of ["alert(1)", "x.constructor", "import('x')", "window.x", "1e309", "(".repeat(40)+"x"+")".repeat(40), "x".repeat(200)]) assert.equal(diagramExpression(input), null);
});

test("diagrams retain signed turns, phase windows, interval endpoints, unknowns and units", () => {
  const unit = prompt => questionDiagram(question("TRIG_RAD_RADIANS_TO_DEGREES_001",prompt,"MATH_TRIG_002"));
  assert.equal(unit("Convert pi/6 radians to degrees.").angle, Math.PI/6);
  assert.equal(unit("Convert -pi/6 radians to degrees.").angle, -Math.PI/6);
  assert.equal(unit("Convert -19pi/6 radians to degrees.").label, "-19pi/6");
  const phase = questionDiagram(question("TRIG_GRAPH_PHASE_SHIFT_RIGHT_001", "Find the phase shift of y = 8sin(6(x - 4)) + 8. Enter a positive number for a shift right.", "MATH_TRIG_003"));
  assert.ok(Math.abs(phase.xmin - (4-Math.PI/3)) < 1e-10);
  const tower = questionDiagram(question("TRIG_RIGHT_ANGLE_OF_ELEVATION_45_001", "From a point 48 meters from the base of a vertical tower, the angle of elevation to the top is 45 degrees. Ignore eye height. Find the tower height.", "MATH_TRIG_001"));
  assert.equal(tower.adjacent, "48 m"); assert.equal(tower.opposite, "height ?"); assert.equal(tower.angle, "45°");
  const missing = questionDiagram(question("TRIANGLE_MISSING_HEIGHT", "A triangle's area is 15 cm² and its base is 3 cm. Find the matching perpendicular height in cm.", "MATH_GEOM_004"));
  assert.equal(missing.height, "?"); assert.equal(missing.base, "3 cm"); assert.equal(missing.area, "15 cm²");
  for (const endpoint of [")", "]"]) {
    const spec = questionDiagram(question("TRIG_EQ_COSINE_ONE_CLOSED_INTERVAL_001", `Solve on [0, 2pi${endpoint}: 2*cos(x) = 2`, "MATH_TRIG_005"));
    assert.equal(spec.interval, `[0, 2π${endpoint}`);
  }
});

test("custom authored media wins and altered or hostile prompts fail closed", () => {
  const p = question("TRIG_GRAPH_PERIOD_001", "Find the period of y = cos(4x). Give an exact answer in terms of pi.", "MATH_TRIG_003");
  assert.equal(renderQuestionDiagram({ ...p, media: [{ src: "media/own.svg" }] }), "");
  assert.equal(renderQuestionDiagram({ ...p, skill_id: "CUSTOM_TRIG" }), "");
  for (const prompt of ["A rewritten prompt without a function.", "For y = window.alert(1), find y.", "For y = cos(999999999x), find y.", "<svg onload='bad()'>"]) assert.equal(renderQuestionDiagram({ ...p, prompt }), "");
});
