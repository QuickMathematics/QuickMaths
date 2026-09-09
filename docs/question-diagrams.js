import { renderCartesianDiagram } from "./cartesian-diagrams.js?v=20260909-calculus-v1";
// Native assessment illustrations are reconstructed from the displayed givens.
// Never read answer keys or hidden generator values: the same saved prompt must
// produce the same picture, including for drafts created before this feature.
import { extendedQuestionDiagram, renderExtendedDrawing } from "./trigonometry-diagrams.js?v=20260906-illustrations-v1";
const NUMBER = "-?\\d+(?:\\.\\d+)?";
const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = value => Math.abs(value) < 1e-9 ? "0" : String(Number(value.toPrecision(6)));
const point = (x, y) => ({ x: Number(x), y: Number(y) });
const pair = p => `(${n(p.x)}, ${n(p.y)})`;
const graph = (points, extra = {}) => ({ kind: "graph", points, caption: "Use the marked coordinates. The horizontal and vertical axis scales may differ.", ...extra });
const match = (text, pattern) => text.match(new RegExp(pattern));

// A bounded parser for sums of constants and x/y terms; no eval or user code.
function linearSide(raw) {
  const text = raw.replace(/\s/g, "");
  const token = /([+-]?)(?:(\d+(?:\.\d+)?)?([xy])|(\d+(?:\.\d+)?))/y;
  const result = { x: 0, y: 0, constant: 0 };
  let index = 0;
  while (index < text.length) {
    token.lastIndex = index;
    const item = token.exec(text);
    if (!item || (index && !item[1])) return null;
    const value = (item[1] === "-" ? -1 : 1) * Number(item[3] ? item[2] || 1 : item[4]);
    if (!Number.isFinite(value) || Math.abs(value) > 1e6) return null;
    result[item[3] || "constant"] += value;
    index = token.lastIndex;
  }
  return index ? result : null;
}

function equationLine(text) {
  const equation = text.replace(/[.?]$/, "").split("=");
  if (equation.length !== 2) return null;
  const left = linearSide(equation[0]), right = linearSide(equation[1]);
  if (!left || !right || left.y === right.y) return null;
  return { m: (right.x - left.x) / (left.y - right.y), b: (right.constant - left.constant) / (left.y - right.y) };
}

function lineGraph(line, extra = {}) {
  return graph([], { line, anchors: [point(-2, line.b - 2 * line.m), point(2, line.b + 2 * line.m)], caption: "Graph of the given relationship. Use the axis values to reason about the line.", ...extra });
}

function graphQuestion(id, text) {
  const points = [...text.matchAll(new RegExp(`\\((${NUMBER}),\\s*(${NUMBER})\\)`, "g"))].map(m => point(m[1], m[2]));
  if (id.startsWith("COORD_PLANE_") && points.length === 1) return graph(points, { equalAxes: true });
  if (points.length === 2 && /^(Find|Classify|For the points|A (?:line|table))/.test(text)) return graph(points, { connect: true });
  let m;
  if ((m = match(text, `^A linear table has y = (${NUMBER}) when x = 0, and y = (${NUMBER}) when x = 2\\.`))) return graph([point(0, m[1]), point(2, m[2])], { connect: true });
  if ((m = match(text, `^A line has slope (${NUMBER}) and passes through`)) && points.length === 1) {
    const p = points[0], slope = +m[1];
    return graph(points, { line: { m: slope, b: p.y - slope * p.x }, anchors: [point(p.x - 2, p.y - 2 * slope), point(p.x + 2, p.y + 2 * slope)], caption: `The line passes through the marked point with the given slope ${m[1]}. Write its equation from those givens.` });
  }
  if ((m = match(text, `^A line has y-intercept (${NUMBER}) and passes through`)) && points.length === 1) return graph([point(0, m[1]), ...points], { connect: true });
  if ((m = match(text, `^A line is parallel to (y = .+) and has y-intercept (${NUMBER})\\.`))) {
    const line = equationLine(m[1]);
    return line ? graph([point(0, m[2])], { line, anchors: [point(-1, line.b - line.m), point(1, line.b + line.m)], caption: "The solid line is the given reference line. The marked point is the new line's y-intercept; the new line must be parallel." }) : null;
  }
  if ((m = match(text, `^A line has slope (${NUMBER}) and y-intercept (${NUMBER})\\.`))) return lineGraph({ m: +m[1], b: +m[2] });
  if ((m = match(text, `^A line has y-intercept (${NUMBER}) and slope (${NUMBER})/(${NUMBER})\\.`)) && +m[3]) return lineGraph({ m: m[2] / m[3], b: +m[1] });
  if (id === "GRAPH_LINES_DIRECTION_OF_SLOPE_001" && text.includes("slope of -3/4")) return lineGraph({ m: -3 / 4, b: 0 }, { caption: "An example line with the stated slope. Decide how to move between points on it." });
  // The equation may be the question's subject or follow a rewrite instruction.
  const equation = text.match(/(?:line |for y: |y: )(.*?)(?:,|\?|\. |$)/)?.[1];
  const line = equation && equationLine(equation);
  if (line) return lineGraph(line);
  if ((m = match(text, `^A car travels (${NUMBER}) miles in (${NUMBER}) hours\\.`))) return graph([point(0, 0), point(m[2], m[1])], { connect: true, xLabel: "Time (hours)", yLabel: "Distance (miles)" });
  if ((m = match(text, `^(${NUMBER}) identical items cost \\$(${NUMBER})\\.`))) return graph([point(0, 0), point(m[1], m[2])], { connect: true, xLabel: "Items", yLabel: "Cost ($)" });
  if ((m = match(text, `^A machine makes (${NUMBER}) parts in (${NUMBER}) hours\\.`))) return graph([point(0, 0), point(m[2], m[1])], { connect: true, xLabel: "Time (hours)", yLabel: "Parts" });
  if ((m = match(text, `^A tank has (${NUMBER}) gallons at minute 0 and (${NUMBER}) gallons at minute (${NUMBER})\\.`))) return graph([point(0, m[1]), point(m[3], m[2])], { connect: true, xLabel: "Time (minutes)", yLabel: "Water (gallons)" });
  if ((m = match(text, `^A function has a rate of change of (${NUMBER})\\.`))) return lineGraph({ m: +m[1], b: 0 }, { caption: "An example line with the stated rate. Its position is illustrative; consider how y changes as x increases." });
  return null;
}

function geometryQuestion(skillId, id, text) {
  let m;
  const compass = (bearings, labels = bearings.map(v => `${n(v)}°`), extra = {}) => ({ kind: "compass", bearings, labels, caption: "North is at the top. Use the marked directions to reason about the requested angle.", ...extra });
  const arc = (angle, angleLabel, radiusLabel = "r", extra = {}) => ({ kind: "arc", angle, angleLabel, radiusLabel, caption: "The marked arc and its central angle correspond. Diagram not to scale.", ...extra });
  if (skillId === "MATH_GEOM_001") {
    if (id.endsWith("_Q02") && text.startsWith("What bearing corresponds to due west?")) return compass([270], ["W"]);
    if ((m = match(text, `^Find the reciprocal bearing of (${NUMBER})°`))) return compass([+m[1]]);
    if ((m = match(text, `^Find the smaller angular separation between bearings (${NUMBER})° and (${NUMBER})°`))) return compass([+m[1], +m[2]]);
    if ((m = match(text, `^A direction is (${NUMBER})° counterclockwise from the positive x-axis`))) return compass([90 - m[1]], [`${m[1]}° from +x`], { fromX: true });
    if (id.endsWith("_Q09") && text.startsWith("Enter the conventional bearing for north")) return compass([0], ["N"]);
    if ((m = match(text, `^A rescue team reports that a missing hiker is on bearing (${NUMBER})°`))) return compass([+m[1]]);
  }
  if (skillId === "MATH_GEOM_002") {
    if ((m = match(text, `^What fraction of a full circumference is a (${NUMBER})° arc`))) return arc(+m[1], `${m[1]}°`);
    if ((m = match(text, `^A circle has radius (${NUMBER})\\. Find the arc length for a central angle of (${NUMBER}) radians`))) return arc(m[2] * 180 / Math.PI, `${m[2]} rad`, m[1]);
    if ((m = match(text, `^Convert (${NUMBER})° to radians`))) return arc(+m[1], `${m[1]}°`);
    if ((m = match(text, `^A (${NUMBER})° arc lies on a circle of radius (${NUMBER})\\.`))) return arc(+m[1], `${m[1]}°`, m[2]);
    if ((m = match(text, `^A surface arc is (${NUMBER}) km on a sphere of radius (${NUMBER}) km`))) return arc(40, "θ = ?", `${m[2]} km`, { arcLabel: `${m[1]} km`, caption: "Schematic cross-section through the sphere's centre; the angle is unknown. Use the stated lengths, not the drawing's proportions." });
    if (id.endsWith("_Q03") && text.startsWith("Which formula is valid when θ")) return arc(60, "θ", "r");
  }
  if (skillId === "MATH_GEOM_003") {
    if ((m = match(text, `^What is the smaller longitude separation between (${NUMBER})°E and (${NUMBER})°W`))) return compass([+m[1], -m[2]], [`${m[1]}°E`, `${m[2]}°W`], { longitude: true, caption: "View from above the North Pole. East and west longitudes meet across the 180° meridian." });
    if ((m = match(text, `^At latitude (${NUMBER})°, estimate the length of one degree of longitude`))) return { kind: "sphere", latitude: +m[1], caption: `Compare the ${m[1]}° parallel with the equator. The sketch shows the sphere's geometry, not a flat map.` };
    if (["_Q01", "_Q02", "_Q06", "_Q10"].some(suffix => id.endsWith(suffix)) && /geographic coordinates|great circle|latitude|raster/.test(text)) return { kind: "sphere", caption: "A spherical grid of meridians and parallels. Dashed lines are on the far side." };
  }
  return null;
}

export function questionDiagram(problem, skillId = problem?.skill_id) {
  const extended = extendedQuestionDiagram(problem, skillId);
  if (extended) return extended;
  if (problem?.media?.length || !/^MATH_(?:GRAPH_00[1-6]|GEOM_00[1-3])$/.test(skillId ?? "")) return null;
  const id = String(problem.source_template_id ?? problem.template_id ?? problem.questionId ?? "").split("__")[0];
  const prefixes = {
    MATH_GRAPH_001: ["COORD_PLANE_"], MATH_GRAPH_002: ["SLOPE_TWO_POINTS_", "SLOPE_FIND_RISE_", "SLOPE_FIND_RUN_"],
    MATH_GRAPH_003: ["RATE_"], MATH_GRAPH_004: ["SLOPE_INTERCEPT_"], MATH_GRAPH_005: ["GRAPH_LINES_"], MATH_GRAPH_006: ["WRITE_LINE_"],
  }[skillId] ?? [`${skillId}_Q`];
  if (!prefixes.some(prefix => id.startsWith(prefix))) return null;
  const text = String(problem.prompt ?? "").replace(/−/g, "-");
  if (!text || text.length > 2000 || /[<>{}]/.test(text)) return null;
  const spec = skillId.startsWith("MATH_GRAPH_") ? graphQuestion(id, text) : geometryQuestion(skillId, id, text);
  // Rendering stays bounded even if a saved/native-overridden prompt is malformed.
  if (!spec) return null;
  if (spec.angle != null && (spec.angle < 0 || spec.angle > 360)) return null;
  if (spec.latitude != null && Math.abs(spec.latitude) > 90) return null;
  if (spec.bearings?.some(b => Math.abs(b) > 360)) return null;
  const numbers = [];
  const visit = value => { if (typeof value === "number") numbers.push(value); else if (value && typeof value === "object") Object.values(value).forEach(visit); };
  visit(spec);
  return numbers.every(v => Number.isFinite(v) && Math.abs(v) <= 1e6) ? spec : null;
}

const textAt = (x, y, value, extra = "") => `<text x="${n(x)}" y="${n(y)}" ${extra}>${esc(value)}</text>`;
const lineAt = (x1, y1, x2, y2, extra = "") => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${extra}/>`;
const poly = (points, extra = "") => `<polyline points="${points.map(p => `${n(p[0])},${n(p[1])}`).join(" ")}" fill="none" ${extra}/>`;

function ticks(low, high) {
  const rough = (high - low) / 6, power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find(v => v * power >= rough) * power;
  const values = [];
  for (let i = Math.ceil(low / step); i <= Math.floor(high / step) && values.length < 12; i++) values.push(i * step);
  return values;
}

function plotGraph(spec) {
  const anchors = [...spec.points, ...(spec.anchors ?? [])];
  if (!anchors.length) return "";
  let xmin = Math.min(0, ...anchors.map(p => p.x)), xmax = Math.max(0, ...anchors.map(p => p.x));
  let ymin = Math.min(0, ...anchors.map(p => p.y)), ymax = Math.max(0, ...anchors.map(p => p.y));
  const xpad = Math.max(1, (xmax - xmin) * .24), ypad = Math.max(1, (ymax - ymin) * .28);
  xmin -= xpad; xmax += xpad; ymin -= ypad; ymax += ypad;
  if (spec.equalAxes) {
    // Keep the origin centred and use equal unit scales without clipping.
    const bound = Math.max(...anchors.flatMap(p => [Math.abs(p.x), Math.abs(p.y)])) + 2;
    xmin = ymin = -bound; xmax = ymax = bound;
  }
  let left = 80, top = 42, width = 600, height = 342;
  if (spec.equalAxes) { width = height; left = (720 - width) / 2; }
  const px = x => left + (x - xmin) / (xmax - xmin) * width;
  const py = y => top + (ymax - y) / (ymax - ymin) * height;
  let svg = "";
  for (const x of ticks(xmin, xmax)) svg += lineAt(px(x), top, px(x), top + height, 'class="diagram-grid"') + textAt(px(x), top + height + 29, n(x), 'text-anchor="middle" class="diagram-tick"');
  for (const y of ticks(ymin, ymax)) svg += lineAt(left, py(y), left + width, py(y), 'class="diagram-grid"') + textAt(left - 12, py(y) + 6, n(y), 'text-anchor="end" class="diagram-tick"');
  svg += lineAt(px(0), top, px(0), top + height, 'class="diagram-axis"') + lineAt(left, py(0), left + width, py(0), 'class="diagram-axis"');
  svg += textAt(left + width / 2, 454, spec.xLabel ?? "x", 'text-anchor="middle"') + textAt(left - 52, top + height / 2, spec.yLabel ?? "y", `text-anchor="middle" transform="rotate(-90 ${n(left - 52)} ${n(top + height / 2)})"`);
  let line = spec.line;
  if (spec.connect && spec.points.length === 2) {
    const [a, b] = spec.points;
    if (a.x === b.x) svg += lineAt(px(a.x), top, px(a.x), top + height, 'class="diagram-line"');
    else line = { m: (b.y - a.y) / (b.x - a.x), b: a.y - (b.y - a.y) / (b.x - a.x) * a.x };
  }
  if (line) {
    const ends = [point(xmin, line.m * xmin + line.b), point(xmax, line.m * xmax + line.b)];
    if (line.m) ends.push(point((ymin - line.b) / line.m, ymin), point((ymax - line.b) / line.m, ymax));
    const inside = ends.filter(p => p.x >= xmin - 1e-8 && p.x <= xmax + 1e-8 && p.y >= ymin - 1e-8 && p.y <= ymax + 1e-8).sort((a, b) => a.x - b.x || a.y - b.y);
    if (inside.length >= 2) svg += lineAt(px(inside[0].x), py(inside[0].y), px(inside.at(-1).x), py(inside.at(-1).y), 'class="diagram-line"');
  }
  spec.points.forEach((p, i) => {
    const x = px(p.x), y = py(p.y), right = x < left + width * .7;
    svg += `<circle cx="${n(x)}" cy="${n(y)}" r="6" class="diagram-point" data-x="${n(p.x)}" data-y="${n(p.y)}"/>`;
    svg += textAt(x + (right ? 12 : -12), y + (i % 2 ? 30 : -15), pair(p), `text-anchor="${right ? "start" : "end"}" class="diagram-label"`);
  });
  return svg;
}

function plotCompass(spec) {
  const cx = 360, cy = 225, radius = 142;
  const at = (bearing, r = radius) => [cx + r * Math.sin(bearing * Math.PI / 180), cy - r * Math.cos(bearing * Math.PI / 180)];
  let svg = `<circle cx="${cx}" cy="${cy}" r="${radius}" class="diagram-circle"/>`;
  svg += lineAt(cx - radius, cy, cx + radius, cy, 'class="diagram-grid"') + lineAt(cx, cy - radius, cx, cy + radius, 'class="diagram-grid"');
  const names = spec.longitude ? ["0°", "90°E", "180°", "90°W"] : ["N", spec.fromX ? "+x / E" : "E", "S", "W"];
  [0, 90, 180, 270].forEach((b, i) => { const [x, y] = at(b, radius + 36); svg += textAt(x, y + 7, names[i], 'text-anchor="middle"'); });
  spec.bearings.forEach((bearing, i) => {
    const end = at(bearing);
    svg += lineAt(cx, cy, ...end, 'class="diagram-line"') + `<circle cx="${n(end[0])}" cy="${n(end[1])}" r="5" class="diagram-point"/>`;
    svg += textAt(i ? 692 : 28, 38, spec.labels[i], `text-anchor="${i ? "end" : "start"}" class="diagram-label"`);
    // A small leader makes even close directions distinguishable without labels overlapping.
    svg += poly([end, [i ? 560 : 160, 63]], 'class="diagram-leader"');
  });
  if (spec.fromX) {
    const angle = spec.bearings[0], points = Array.from({ length: 40 }, (_, i) => at(90 + (angle - 90) * i / 39, 70));
    svg += poly(points, 'class="diagram-accent"');
  }
  return svg;
}

function plotArc(spec) {
  const cx = 345, cy = 244, radius = 150;
  const at = (a, r = radius) => [cx + r * Math.cos(a * Math.PI / 180), cy - r * Math.sin(a * Math.PI / 180)];
  const end = at(spec.angle), points = Array.from({ length: 81 }, (_, i) => at(spec.angle * i / 80));
  let svg = `<circle cx="${cx}" cy="${cy}" r="${radius}" class="diagram-circle"/>`;
  svg += poly(points, 'class="diagram-accent"') + lineAt(cx, cy, cx + radius, cy, 'class="diagram-line"') + lineAt(cx, cy, ...end, 'class="diagram-line"');
  svg += textAt(cx + radius / 2, cy + 33, spec.radiusLabel === "r" ? "r" : `r = ${spec.radiusLabel}`, 'text-anchor="middle" class="diagram-label"');
  svg += textAt(35, 42, spec.angleLabel, 'class="diagram-label"') + poly([at(spec.angle / 2, 65), [160, 60]], 'class="diagram-leader"');
  if (spec.arcLabel) svg += textAt(690, 42, `arc: ${spec.arcLabel}`, 'text-anchor="end" class="diagram-label"');
  return svg;
}

function plotSphere(spec) {
  const rad = Math.PI / 180, tilt = 20 * rad, r = 166, cx = 360, cy = 233;
  const project = (latitude, longitude) => {
    const a = latitude * rad, b = longitude * rad;
    const x = Math.cos(a) * Math.sin(b), y = Math.sin(a), z = Math.cos(a) * Math.cos(b);
    return [cx + r * x, cy - r * (y * Math.cos(tilt) - z * Math.sin(tilt)), y * Math.sin(tilt) + z * Math.cos(tilt)];
  };
  const curve = (points, accent = false) => {
    let svg = "", segment = [points[0]], back = points[1][2] < 0;
    const draw = () => poly(segment, `class="${accent ? "diagram-accent" : "diagram-sphere-line"}" ${back ? 'stroke-dasharray="3 5" opacity=".5"' : ""}`);
    for (let i = 1; i < points.length; i++) {
      const nextBack = points[i][2] < 0;
      if (nextBack !== back) { svg += draw(); segment = [points[i - 1]]; back = nextBack; }
      segment.push(points[i]);
    }
    return svg + draw();
  };
  let svg = `<circle cx="${cx}" cy="${cy}" r="${r}" class="diagram-circle"/>`;
  for (const lat of [-60, -30, 0, 30, 60]) svg += curve(Array.from({ length: 73 }, (_, i) => project(lat, i * 5)), lat === spec.latitude);
  for (const lon of [0, 45, 90, 135, 180, 225, 270, 315]) svg += curve(Array.from({ length: 37 }, (_, i) => project(-90 + i * 5, lon)));
  svg += textAt(cx, 45, "N", 'text-anchor="middle"') + textAt(cx, 448, "S", 'text-anchor="middle"');
  if (spec.latitude != null) svg += textAt(35, 40, `${n(spec.latitude)}° latitude`, 'class="diagram-label"');
  return svg;
}

export function renderQuestionDiagram(problem, skillId) {
  if (problem.diagram) return renderCartesianDiagram(problem.diagram);
  const spec = questionDiagram(problem, skillId);
  if (!spec) return "";
  const renderer = { graph: plotGraph, compass: plotCompass, arc: plotArc, sphere: plotSphere }[spec.kind];
  const drawing = renderer ? renderer(spec) : renderExtendedDrawing(spec);
  if (!drawing) return "";
  const description = spec.kind === "graph" && spec.points.length ? `Marked points: ${spec.points.map(pair).join(" and ")}. ${spec.caption}` : spec.caption;
  return `<figure class="question-diagram${spec.equalAxes ? " question-diagram-square" : ""}" data-question-diagram="${spec.kind}"><svg viewBox="${spec.equalAxes ? "110 0 500 480" : "0 0 720 480"}" role="img" aria-label="${esc(description)}"><title>${esc(description)}</title>${drawing}</svg><figcaption>${esc(spec.caption)}</figcaption></figure>`;
}
