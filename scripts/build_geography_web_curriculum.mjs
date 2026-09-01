import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "content", "geography", "foundations", "web-curriculum.json");

const mastery = Object.freeze({
  passing_score: 0.8,
  minimum_confidence: 3,
  max_guessing_allowed: "maybe",
  review_after_days_if_mastered: 10,
  review_after_days_if_learning: 3,
});

const mc = (prompt, correct, distractors, explanation, difficulty = "medium", tags = ["concept_confusion"]) => ({
  kind: "choice", prompt, correct, distractors, explanation, difficulty, tags,
});
const num = (prompt, answer, explanation, difficulty = "medium", tolerance = null, tags = ["calculation_error"]) => ({
  kind: "numeric", prompt, answer: String(answer), explanation, difficulty, tolerance, tags,
});
const text = (prompt, answer, accepted, explanation, difficulty = "medium", tags = ["terminology_error"]) => ({
  kind: "text", prompt, answer, accepted, explanation, difficulty, tags,
});
const caseStudy = (prompt, correct, distractors, explanation, rubric, difficulty = "hard", tags = ["evidence_reasoning"]) => ({
  kind: "case", prompt, correct, distractors, explanation, rubric, difficulty, tags,
});

function buildProblem(spec, skillId, index) {
  const id = `${skillId}_Q${String(index + 1).padStart(2, "0")}`;
  const base = {
    template_id: id,
    skill_id: skillId,
    difficulty: spec.difficulty,
    prompt: spec.prompt,
    solution_steps: [spec.explanation],
    mistake_tags: spec.tags,
    variable: null,
    values: {},
    source_template_id: id,
  };
  if (spec.kind === "numeric") {
    return {
      ...base,
      expected_answer: spec.answer,
      answer_type: "numeric",
      grading_method: spec.tolerance == null ? "exact_numeric" : "numeric_with_tolerance",
      tolerance: spec.tolerance,
      options: [],
      accepted_forms: [],
      answer_mode: "final_plus_optional_work",
      work: { mode: "capture_only", prompt: "Optional: record the setup, units, or estimate you used." },
      review_policy: { work_review: "optional", mastery_requires_review_pass: false, allow_self_review: true },
      work_required: false,
    };
  }
  if (spec.kind === "text") {
    return {
      ...base,
      expected_answer: spec.answer,
      answer_type: "text",
      grading_method: "exact_text",
      tolerance: null,
      options: [],
      accepted_forms: spec.accepted ?? [],
      answer_mode: "final_only",
      work: { mode: "none" },
      review_policy: { work_review: "none", mastery_requires_review_pass: false, allow_self_review: true },
      work_required: false,
    };
  }
  const labels = ["A", "B", "C", "D"];
  const rawOptions = [spec.correct, ...spec.distractors].slice(0, 4);
  const shift = index % rawOptions.length;
  const rotated = [...rawOptions.slice(shift), ...rawOptions.slice(0, shift)];
  const correctIndex = rotated.indexOf(spec.correct);
  const isCase = spec.kind === "case";
  return {
    ...base,
    expected_answer: labels[correctIndex],
    answer_type: "choice",
    grading_method: "multiple_choice",
    tolerance: null,
    options: rotated.map((label, optionIndex) => ({ id: labels[optionIndex], label })),
    accepted_forms: [],
    answer_mode: isCase ? "final_plus_required_work" : "final_only",
    work: isCase ? {
      mode: "rubric_check",
      prompt: "Justify the selected interpretation in 3–6 sentences. Name the evidence, the geographic process, and one limitation or alternative explanation.",
      rubric: {
        criteria: [
          { id: "evidence", description: "Uses the evidence supplied in the case rather than relying on assertion", weight: 2 },
          { id: "process", description: "Connects the evidence to a relevant geographic process or spatial relationship", weight: 2 },
          { id: "limits", description: spec.rubric, weight: 1 },
        ],
      },
    } : { mode: "none" },
    review_policy: isCase
      ? { work_review: "tutor_required", mastery_requires_review_pass: true, allow_self_review: false }
      : { work_review: "none", mastery_requires_review_pass: false, allow_self_review: true },
    work_required: isCase,
  };
}

const lessons = [];

function addLesson(candidate) {
  if (!candidate.id || lessons.some((lesson) => lesson.id === candidate.id)) throw new Error(`Invalid or duplicate lesson ${candidate.id}.`);
  if (candidate.questions.length !== 10) throw new Error(`${candidate.id} must contain exactly 10 questions.`);
  lessons.push({
    ...candidate,
    subjectId: candidate.subjectId ?? "SUBJECT_GEOGRAPHY",
    unlocks: candidate.unlocks ?? [],
    tags: candidate.tags ?? [],
    mastery: { ...mastery, ...(candidate.mastery ?? {}) },
    problems: candidate.questions.map((question, index) => buildProblem(question, candidate.id, index)),
  });
}

addLesson({
  id: "MATH_GEOM_001",
  subjectId: "SUBJECT_MATH",
  name: "Angles, bearings, and degree measure",
  domain: "Math",
  subdomain: "Coordinate Geometry",
  description: "Measure rotation in degrees, distinguish direction from orientation, and use bearings as angular descriptions of location.",
  prerequisites: ["MATH_ARITH_003", "MATH_ARITH_005", "MATH_GRAPH_001"],
  tags: ["geometry", "angles", "degrees", "bearings", "direction"],
  theory: `An angle measures rotation between two rays that share a vertex. A full turn is 360°, a half turn is 180°, and a quarter turn is 90°. Degree measure is not a length: two arcs can have different lengths while subtending the same angle if their radii differ. This distinction becomes essential when degrees are used to describe positions on Earth.

Angles may be measured clockwise or counterclockwise from a reference direction. In standard coordinate geometry, angles are commonly measured counterclockwise from the positive x-axis. A bearing uses a different convention: it is measured clockwise from north and written with three digits, such as 045° or 270°. Converting between conventions requires identifying the reference ray before doing arithmetic.

Compass directions provide useful benchmarks. North is 000° (or 360°), east is 090°, south is 180°, and west is 270°. A bearing of 135° points southeast because it lies halfway between east and south. The opposite, or reciprocal, bearing differs by 180° after wrapping the result into the interval from 000° to 359°.

Angular separation is the smaller rotation between two directions unless a problem explicitly asks for signed rotation. For bearings a and b, compute |a − b|. If that difference exceeds 180°, subtract it from 360°. Thus the smaller separation between 350° and 020° is 30°, not 330°.

Degrees can be divided into 60 minutes, and each minute into 60 seconds. The notation 42° 30′ 00″ is 42.5° because 30/60 = 0.5. Decimal degrees are easier to calculate with, while degrees–minutes–seconds remain common in navigation and surveying. Always label which representation you are using.

The central habit is to separate three questions: What is the reference direction? Which way is rotation measured? Do we want signed rotation or the smaller angular separation? Once those are explicit, bearings and geographic coordinates become ordinary, checkable geometry.`,
  examples: [
    { prompt: "Convert the bearing 225° into a compass direction.", solution: "Southwest", explanation: "225° lies halfway between south at 180° and west at 270°." },
    { prompt: "Find the reciprocal bearing of 070°.", solution: "250°", explanation: "Add 180° because 070° is below 180°: 70 + 180 = 250." },
    { prompt: "Find the smaller separation between 350° and 025°.", solution: "35°", explanation: "The direct difference is 325°; the smaller wrap-around angle is 360° − 325° = 35°." },
    { prompt: "Convert 18° 45′ to decimal degrees.", solution: "18.75°", explanation: "45 minutes is 45/60 = 0.75 degree." },
  ],
  applications: [
    { title: "Navigation", description: "Pilots, mariners, hikers, and surveyors express headings and lines of sight as bearings." },
    { title: "Geographic coordinates", description: "Latitude and longitude use angular displacement rather than flat-map distance." },
    { title: "Remote sensing", description: "Sensor look angles and solar angles affect how satellite imagery is recorded and interpreted." },
  ],
  questions: [
    mc("Which statement correctly distinguishes an angle from an arc length?", "An angle measures rotation; arc length also depends on radius.", ["An angle is always measured in kilometres.", "Arc length is independent of radius.", "Angles and arc lengths are interchangeable quantities."], "Equal central angles can cut different arc lengths from circles with different radii.", "easy", ["angle_length_confusion"]),
    num("What bearing corresponds to due west? Enter degrees.", 270, "Bearings are clockwise from north: north 0°, east 90°, south 180°, west 270°.", "easy"),
    num("Find the reciprocal bearing of 138°. Enter degrees from 0 to 359.", 318, "Add 180°: 138° + 180° = 318°.", "medium", null, ["reciprocal_bearing"]),
    num("Find the smaller angular separation between bearings 342° and 018°.", 36, "The ordinary difference is 324°, so the smaller wrap-around separation is 360° − 324° = 36°.", "medium", null, ["angle_wraparound"]),
    num("Convert 27° 18′ to decimal degrees. Round only if necessary.", 27.3, "Divide minutes by 60: 18/60 = 0.3, so the result is 27.3°.", "medium", 0.001, ["dms_conversion"]),
    num("Convert 12.75° to total arcminutes.", 765, "Multiply the full decimal-degree value by 60: 12.75 × 60 = 765 arcminutes.", "medium", null, ["degree_minute_conversion"]),
    mc("A direction is 40° counterclockwise from the positive x-axis. What is its bearing?", "050°", ["040°", "130°", "320°"], "The positive x-axis points east, bearing 090°. Rotating 40° counterclockwise points toward north, giving 90° − 40° = 50°.", "hard", ["reference_direction"]),
    mc("Why are three digits normally used for bearings?", "They make direction notation unambiguous and consistently ordered.", ["Bearings must always exceed 100°.", "Three digits convert degrees into distance.", "The final digit identifies the hemisphere."], "Writing 005° rather than 5° clearly marks a bearing and avoids ambiguous formatting.", "easy"),
    text("Enter the conventional bearing for north using three digits.", "000", ["000°", "360", "360°"], "North is the reference direction for bearings and is conventionally written 000°; 360° is coterminal.", "easy"),
    caseStudy("A rescue team reports that a missing hiker is on bearing 355° from camp. A second note says ‘5° west of north.’ Which interpretation is best?", "The descriptions agree: both indicate a direction 5° west of north.", ["They differ by 10°.", "355° is 5° east of north.", "A bearing cannot cross the 000° line."], "Bearings wrap at north. Moving 5° counterclockwise from 000° gives 355°, which is 5° west of north.", "Acknowledge that angular notation wraps at 360°/000° and distinguish east from west of north."),
  ],
});

addLesson({
  id: "MATH_GEOM_002",
  subjectId: "SUBJECT_MATH",
  name: "Circles, arcs, and angular distance",
  domain: "Math",
  subdomain: "Coordinate Geometry",
  description: "Relate central angles to arc length and use radians or degree fractions to measure distance along a circle.",
  prerequisites: ["MATH_GEOM_001", "MATH_ALG_001"],
  tags: ["geometry", "circles", "arc_length", "radians", "angular_distance"],
  theory: `A central angle has its vertex at the centre of a circle. It intercepts an arc, and the arc’s share of the circumference is the same as the angle’s share of a full turn. In degrees, s = (θ/360°)·2πr, where s is arc length, θ is the central angle, and r is radius.

Radians express the same relationship more directly. One radian is the angle that intercepts an arc equal in length to the radius. Because a full circumference is 2πr, a full turn is 2π radians. When θ is in radians, arc length is s = rθ. Never place a degree value directly into s = rθ without converting it.

Conversion follows from 180° = π radians. Multiply degrees by π/180 to obtain radians, and multiply radians by 180/π to obtain degrees. Familiar benchmarks are 30° = π/6, 45° = π/4, 60° = π/3, 90° = π/2, and 180° = π.

Angular distance and linear distance answer different questions. Two points separated by 10° on a small circle are closer together than two points separated by 10° on a large circle. On a sphere, the same angular separation also represents different east–west distances at different latitudes because circles of latitude shrink toward the poles.

The shortest route constrained to the circumference of a circle is the minor arc when the central angle is at most 180°. On a sphere the analogue is a segment of a great circle—a circle whose centre is the sphere’s centre. This is why long-distance routes can look curved on common flat maps while still following the shortest surface path.

Estimation is a useful safeguard. A 90° arc must be one quarter of a circumference; a 1° arc must be 1/360. If a calculation violates that scale, check units and whether the angle was converted correctly.`,
  examples: [
    { prompt: "Find the length of a 90° arc on a circle of radius 8.", solution: "4π", explanation: "A 90° arc is one quarter of the circumference: (90/360)·2π·8 = 4π." },
    { prompt: "Convert 72° to radians.", solution: "2π/5", explanation: "72·π/180 simplifies to 2π/5." },
    { prompt: "A circle has radius 10 and central angle 0.6 radians. Find the arc length.", solution: "6", explanation: "Use s = rθ = 10·0.6 = 6." },
    { prompt: "What fraction of a circumference is subtended by 24°?", solution: "1/15", explanation: "24/360 simplifies to 1/15." },
  ],
  applications: [
    { title: "Earth distance", description: "Surface distance can be estimated from Earth’s radius and the central angle between two locations." },
    { title: "Transport routing", description: "Great-circle reasoning explains why long flights bend on many flat map projections." },
    { title: "Astronomy", description: "Angular separation locates objects on the celestial sphere before physical distance is known." },
  ],
  questions: [
    num("What fraction of a full circumference is a 45° arc? Enter a decimal.", 0.125, "45/360 = 1/8 = 0.125.", "easy", 0.0001, ["angle_fraction"]),
    num("A circle has radius 12. Find the arc length for a central angle of 0.5 radians.", 6, "Use s = rθ: 12 × 0.5 = 6.", "easy", null, ["arc_length"]),
    mc("Which formula is valid when θ is measured in radians?", "s = rθ", ["s = θ/r", "s = 360r/θ", "s = 2πθ/r"], "Radians are defined by the ratio s/r, so s = rθ.", "easy", ["formula_selection"]),
    num("Convert 150° to radians as a decimal multiple of π. Enter the coefficient of π.", 0.833333, "150/180 = 5/6, so the angle is (5/6)π radians.", "medium", 0.001, ["radian_conversion"]),
    num("A 60° arc lies on a circle of radius 9. Enter its length as a decimal using π ≈ 3.14159.", 9.42477, "The arc is one sixth of 2π·9, which equals 3π ≈ 9.42477.", "medium", 0.01, ["arc_length", "degree_conversion"]),
    mc("Two circles contain 20° arcs. Circle B has twice the radius of circle A. How do the arc lengths compare?", "Circle B’s arc is twice as long.", ["The arcs have equal length.", "Circle B’s arc is four times as long.", "The comparison cannot be made from radius."], "For a fixed angle, arc length is proportional to radius.", "medium", ["proportional_reasoning"]),
    num("A surface arc is 314 km on a sphere of radius 6371 km. Estimate its central angle in radians.", 0.04929, "Rearrange s = rθ to θ = s/r = 314/6371 ≈ 0.04929 radians.", "hard", 0.001, ["formula_rearrangement"]),
    mc("Why can a great-circle route appear curved on a rectangular world map?", "A flat projection distorts the geometry of paths on a sphere.", ["Aircraft cannot travel in straight lines.", "Great circles avoid all lines of longitude.", "Map north changes every hour."], "A shortest path on a sphere need not plot as a straight line after projection onto a plane.", "medium", ["projection_geometry"]),
    text("What is the name of a circle on a sphere whose centre is also the sphere’s centre?", "great circle", ["a great circle", "great-circle"], "A great circle divides a sphere into two equal hemispheres.", "easy"),
    caseStudy("Route A spans a 70° central angle on Earth; Route B spans 80° along the same great circle. Which conclusion follows if both use the same Earth-radius model?", "Route A is shorter because arc length is proportional to central angle.", ["Route B is shorter because its angle is larger.", "The routes must have equal length.", "No comparison is possible without longitude."], "With the same radius and angles expressed consistently, s = rθ makes distance proportional to central angle.", "State the shared-radius assumption and avoid claiming that all real routes follow unobstructed great circles."),
  ],
});

addLesson({
  id: "MATH_GEOM_003",
  subjectId: "SUBJECT_MATH",
  name: "Spherical coordinates and great-circle models",
  domain: "Math",
  subdomain: "Coordinate Geometry",
  description: "Extend coordinate reasoning from a plane to a sphere and model angular separation, meridians, parallels, and great-circle distance.",
  prerequisites: ["MATH_GEOM_002", "MATH_GRAPH_001"],
  tags: ["geometry", "spherical_coordinates", "great_circle", "latitude", "longitude", "geodesy"],
  theory: `A flat coordinate plane uses perpendicular x- and y-axes. A sphere has no single flat grid that covers its surface without distortion, so positions are described by angles. Geographic latitude measures angular displacement north or south of the equatorial plane. Longitude measures angular displacement east or west around Earth from a chosen prime meridian.

Parallels are circles of constant latitude. The equator is the largest parallel and a great circle. Other parallels are smaller circles because their planes do not pass through Earth’s centre. Meridians are halves of great circles joining the poles. Opposite meridians together form a complete great circle.

Latitude ranges from 90° south to 90° north. Longitude is commonly represented from 180° west to 180° east, or equivalently from 0° to 360°. These conventions create wrap-around: 179°E and 179°W are only 2° apart across the antimeridian, not 358° apart.

North–south distance is comparatively simple in a spherical model because one degree of latitude always spans the same central angle on a meridian. East–west distance per degree of longitude shrinks with latitude. At latitude φ, the radius of the parallel is approximately R cos φ, so one degree of longitude spans about (πR/180) cos φ.

For general pairs of points, their longitude and latitude differences do not form an ordinary Cartesian right triangle over large distances. A great-circle calculation accounts for spherical geometry. The haversine formula is numerically stable: a = sin²(Δφ/2) + cos φ₁ cos φ₂ sin²(Δλ/2), c = 2 atan2(√a, √(1−a)), and distance d = Rc. Angles must be in radians.

Earth is not a perfect sphere. Precise surveying uses an ellipsoid and an explicit geodetic datum. A spherical calculation is a model whose adequacy depends on purpose: excellent for conceptual and many regional estimates, insufficient for boundary surveying or high-precision navigation.

The essential bridge is conceptual. Latitude and longitude are not arbitrary labels placed on a flat map; they are angular coordinates on a curved surface. Any flat display is a projection of that geometry and therefore introduces structured distortion.`,
  examples: [
    { prompt: "Compare 179°E and 179°W.", solution: "They are 2° apart across the antimeridian.", explanation: "Longitude wraps at ±180°, so the shorter separation crosses the date-line region." },
    { prompt: "At 60° latitude, how does one degree of longitude compare with the equator?", solution: "About half as long", explanation: "cos 60° = 0.5, so the parallel’s radius and east–west degree length are halved." },
    { prompt: "Why is the equator a great circle but 30°N is not?", solution: "Only the equator’s plane passes through Earth’s centre.", explanation: "A great circle must share the sphere’s centre." },
    { prompt: "Estimate one degree of latitude using R = 6371 km.", solution: "About 111.2 km", explanation: "πR/180 ≈ 111.2 km." },
  ],
  applications: [
    { title: "Geodesy", description: "Surveying and global positioning depend on reference ellipsoids, datums, and angular coordinates." },
    { title: "Global logistics", description: "Air and sea routing compares surface paths across the antimeridian and high latitudes." },
    { title: "Climate data", description: "Gridded observations require care because equal degree cells do not have equal area." },
  ],
  questions: [
    mc("Which statement about geographic coordinates is correct?", "Latitude and longitude are angular coordinates on a curved surface.", ["They are universal Cartesian distances measured in kilometres.", "Longitude is distance north of the equator.", "Latitude requires a chosen prime meridian."], "Latitude and longitude describe directions from Earth’s centre/reference axis, not fixed linear distances.", "easy", ["coordinate_model"]),
    mc("Which line is a complete great circle by itself?", "The equator", ["The parallel 45°N", "The Tropic of Capricorn", "A single meridian from pole to pole"], "The equator’s plane passes through Earth’s centre. A meridian is only half of a great circle unless paired with its opposite meridian.", "medium", ["great_circle_classification"]),
    num("What is the smaller longitude separation between 176°E and 178°W? Enter degrees.", 6, "Across the antimeridian the separation is (180−176) + (180−178) = 4 + 2 = 6°.", "medium", null, ["longitude_wraparound"]),
    num("Using 111.2 km per degree of latitude, estimate the north–south distance across 3.5° of latitude.", 389.2, "3.5 × 111.2 = 389.2 km.", "easy", 0.1, ["latitude_distance"]),
    num("At latitude 60°, estimate the length of one degree of longitude if it is 111.2 km at the equator.", 55.6, "Multiply by cos 60° = 0.5: 111.2 × 0.5 = 55.6 km.", "medium", 0.1, ["longitude_distance", "cosine_scaling"]),
    mc("Why are equal 1° × 1° latitude–longitude cells unequal in area?", "Meridians converge, so east–west width decreases toward the poles.", ["Latitude degrees become longer toward the poles.", "Earth’s rotation removes polar area.", "The prime meridian is wider than other meridians."], "Longitude spacing in linear distance scales approximately with cos(latitude).", "medium", ["grid_area"]),
    mc("What must be done before using latitude and longitude in trigonometric great-circle formulas?", "Convert degree values to radians.", ["Convert all longitudes to kilometres.", "Replace negative latitudes with positive values.", "Flatten the coordinates into a Mercator map."], "Standard trigonometric functions in formulas assume radian arguments.", "easy", ["angle_units"]),
    mc("Why does precision geodesy use an ellipsoid rather than a sphere?", "Earth is slightly flattened and irregular, so a sphere is not precise enough for all purposes.", ["An ellipsoid removes the need for a datum.", "Spheres cannot have latitude.", "Ellipsoids make every map projection distortion-free."], "Earth’s equatorial radius exceeds its polar radius; reference ellipsoids improve positional accuracy.", "medium", ["model_precision"]),
    text("What term names the 180° longitude region opposite the prime meridian?", "antimeridian", ["anti-meridian", "the antimeridian"], "The antimeridian is the meridian approximately opposite Greenwich and is where longitude notation wraps.", "easy"),
    caseStudy("A global raster assigns equal weight to every 1° × 1° cell when estimating average land conditions. Which critique is strongest?", "The method overweights high latitudes because equal angular cells cover less area there.", ["It underweights high latitudes because longitude degrees are longer there.", "It is unbiased because every cell has the same angular dimensions.", "It fails only at the prime meridian."], "Cell area decreases poleward as meridians converge, so unweighted cell averages distort area-based estimates.", "Recommend an area-weighting correction and state that the exact correction depends on grid geometry and Earth model."),
  ],
});

addLesson({
  id: "GEO_FOUND_001",
  name: "Spatial thinking and geographic inquiry",
  domain: "Geography",
  subdomain: "Geographic Foundations",
  description: "Ask geographic questions using location, scale, spatial pattern, process, place, and human–environment relationships.",
  prerequisites: [],
  tags: ["spatial_thinking", "scale", "place", "pattern", "geographic_inquiry"],
  theory: `Geography studies how phenomena are arranged across space, why those arrangements emerge, how places are connected, and why location matters. It includes physical processes, human systems, and the relationships between them. A geographic explanation therefore goes beyond naming where something is; it connects spatial evidence to processes operating at appropriate scales.

Location can be absolute or relative. Absolute location uses a coordinate or address. Relative location describes a place through distance, direction, accessibility, or relationship to other places. Relative location often explains outcomes better: a port’s importance depends not only on coordinates but also on shipping routes, hinterland connections, and political access.

Scale has several meanings. Cartographic scale is the ratio between map distance and ground distance. Analytical scale is the spatial extent at which a question is studied—street, city, watershed, state, continent, globe. Processes visible at one scale may disappear or reverse at another. A neighbourhood average can hide household inequality; a national average can hide regional drought.

Pattern is a description, not yet an explanation. Clustering, dispersion, gradients, boundaries, networks, and hierarchies are common spatial patterns. To explain a pattern, propose a mechanism and compare it with evidence. A cluster of factories near a river might reflect transport access, water demand, historical zoning, labour supply, or several interacting causes.

Place refers to the distinctive combination of physical conditions, built environments, institutions, meanings, and lived experience associated with a location. Regions are constructed by grouping places according to selected criteria. Formal regions share a measurable trait, functional regions are organized around flows or a node, and perceptual regions reflect identity and interpretation. Their boundaries need not coincide.

Geographic inquiry is iterative: frame a spatial question; define concepts and units; collect evidence; map or otherwise represent the evidence; compare scales and alternative explanations; assess uncertainty; and communicate a defensible conclusion. Maps are arguments because selection, classification, and symbolization affect what becomes visible.

Avoid spatial determinism—the claim that environment mechanically dictates society. Physical conditions create constraints and opportunities, but technology, institutions, culture, power, and historical choices shape how people respond. Serious geography treats outcomes as contingent and multi-causal.`,
  examples: [
    { prompt: "Why is ‘shops cluster near the station’ not yet a complete explanation?", solution: "It describes a pattern but does not identify a mechanism.", explanation: "An explanation might test pedestrian flow, rents, zoning, or network accessibility." },
    { prompt: "Classify a commuter zone centred on one city.", solution: "Functional region", explanation: "It is organized by flows between a node and surrounding places." },
    { prompt: "Give an analytical-scale problem.", solution: "A citywide average can hide neighbourhood heat exposure.", explanation: "Changing the unit or extent can change the apparent pattern." },
    { prompt: "Distinguish site and situation.", solution: "Site is the place’s internal physical setting; situation is its relative position and connections.", explanation: "A harbour’s sheltered bay is site; its position on trade routes is situation." },
  ],
  applications: [
    { title: "Public policy", description: "Spatial analysis reveals who can reach services, who bears hazards, and where averages conceal unequal outcomes." },
    { title: "Business and logistics", description: "Location decisions compare markets, transport networks, labour, land costs, and regulatory conditions." },
    { title: "Environmental management", description: "Watersheds, habitats, and pollution flows rarely align neatly with administrative boundaries." },
  ],
  questions: [
    mc("Which question is most explicitly geographic?", "How does access to rail stations vary across neighbourhoods, and what processes explain the pattern?", ["How many stations exist in total?", "Who invented the first railway?", "What colour should station signs be?"], "The question joins spatial variation with an explanatory process.", "easy", ["geographic_question"]),
    mc("A region defined by the daily flows of workers into a metropolitan core is what type?", "Functional region", ["Formal region", "Perceptual region", "Physiographic region only"], "Functional regions are organized around flows, interactions, or a central node.", "easy", ["region_type"]),
    mc("A national average shows adequate hospital capacity, but rural districts have severe shortages. What principle is illustrated?", "Results can change with analytical scale and aggregation.", ["Absolute location is always superior.", "Physical geography determines health care.", "National data cannot be mapped."], "Aggregation can hide important subnational variation.", "medium", ["scale_effect"]),
    mc("Which statement best distinguishes pattern from process?", "Pattern describes spatial arrangement; process explains mechanisms producing or changing it.", ["Pattern is causal while process is decorative.", "Pattern applies only to physical geography.", "Process is simply a more detailed map legend."], "Clusters and gradients require causal mechanisms before they become explanations.", "easy", ["pattern_process"]),
    mc("A city’s sheltered natural harbour is primarily an aspect of its site or situation?", "Site", ["Situation", "Functional region", "Perceptual distance"], "Site concerns characteristics of the location itself; situation concerns relative position and connections.", "easy", ["site_situation"]),
    mc("Which inference is spatially deterministic?", "Mountain environments inevitably produce politically isolated societies.", ["Steep terrain can raise transport costs, but policy and technology mediate the effect.", "Road investment may alter accessibility.", "Historical institutions influence settlement patterns."], "The deterministic claim treats one environmental condition as an unavoidable social cause.", "medium", ["spatial_determinism"]),
    mc("Why can two defensible regionalizations of the same area have different boundaries?", "Regions depend on selected criteria and purpose.", ["Only perceptual regions have boundaries.", "One map must be factually false.", "Coordinates change between studies."], "A labour-market region and a climatic region organize space using different evidence.", "medium", ["regionalization"]),
    mc("What is the strongest next step after observing a cluster of respiratory illness?", "Test plausible mechanisms using exposure, population, access, and uncertainty data.", ["Assume the nearest factory caused every case.", "Redraw the map with larger symbols.", "Remove observations outside the cluster."], "A cluster motivates hypotheses; it does not by itself establish causation.", "hard", ["spatial_causation"]),
    text("What term describes a place’s position relative to routes, markets, and other places?", "situation", ["relative situation"], "Situation captures relative location and connectivity.", "easy"),
    caseStudy("A city map shows more reported collisions downtown than at the edge. Which interpretation is most defensible before further analysis?", "The downtown cluster may reflect higher traffic exposure as well as street design, so counts should be normalized and contextualized.", ["Downtown streets are proven to be intrinsically unsafe.", "The edge is safer because its collision count is lower.", "The cluster is meaningless because all maps distort."], "Raw counts mix risk with exposure. Rates per trip, pedestrian volume, street design, reporting, and time are needed.", "Identify an appropriate exposure denominator and avoid claiming causation from a count map alone."),
  ],
});

addLesson({
  id: "GEO_CART_001",
  name: "Map scale, projection, and cartographic argument",
  domain: "Geography",
  subdomain: "Cartography",
  description: "Read scale, compare projections, recognize distortion, and evaluate how classification and symbol choices shape a map’s argument.",
  prerequisites: ["GEO_FOUND_001"],
  tags: ["cartography", "map_scale", "projection", "distortion", "classification"],
  theory: `A map is a selective model of space. It reduces detail, chooses variables, classifies observations, and encodes them with symbols. No map is neutral in the sense of showing everything; quality depends on whether choices are transparent and appropriate for the question.

Scale may be written as a representative fraction such as 1:50,000, a verbal statement, or a scale bar. At 1:50,000, one unit on the map equals 50,000 of the same units on the ground. A large-scale map shows a smaller area with more detail; a small-scale map shows a larger area with less detail. The language refers to the size of the fraction, not the geographic extent.

Transforming a curved Earth onto a flat surface requires a projection. Every world map distorts some combination of area, shape, distance, and direction. Equal-area projections preserve relative area but alter shape. Conformal projections preserve local angles and shapes but greatly enlarge some regions. Equidistant and azimuthal properties apply only from specified points or lines, not everywhere.

Projection choice must follow purpose. A Mercator projection is useful for local bearings and marine navigation because it is conformal, but it is poor for comparing country area at high latitudes. An equal-area projection is more defensible for a global choropleth of land use. A polar azimuthal projection can clarify routes and relationships around the Arctic.

Thematic maps add further choices. Choropleth maps shade enumeration units and normally require standardized rates or ratios; mapping raw population counts by administrative area can mislead. Graduated symbols can show totals. Isoline maps represent continuous fields such as pressure or elevation. Dot-density maps suggest distribution but individual dots rarely mark exact observations.

Classification affects visual conclusions. Equal intervals, quantiles, natural breaks, and meaningful policy thresholds can produce different patterns from the same values. A responsible map states data source, date, units, projection when relevant, classification method, and uncertainty or missing data.

Generalization is unavoidable as scale changes. Roads simplify, small features disappear, and boundaries shift visually. The test is not whether a map is perfectly literal, but whether its simplifications preserve the relationships necessary for the intended use.`,
  examples: [
    { prompt: "At 1:100,000, what ground distance does 3 cm represent?", solution: "3 km", explanation: "3 cm × 100,000 = 300,000 cm = 3 km." },
    { prompt: "Choose a projection for comparing forest area by country.", solution: "An equal-area projection", explanation: "Area comparisons require relative areas to remain faithful." },
    { prompt: "Why should a choropleth usually map rates rather than raw counts?", solution: "Areas have different populations or exposure.", explanation: "Standardization makes values more comparable across units." },
    { prompt: "What does a 1:25,000 map show compared with 1:1,000,000?", solution: "A smaller area in greater detail", explanation: "1/25,000 is the larger scale fraction." },
  ],
  applications: [
    { title: "Election reporting", description: "Area shading can exaggerate sparsely populated districts unless maps also represent voters or population." },
    { title: "Emergency response", description: "Operational maps need suitable scale, current data, legible symbols, and explicit uncertainty." },
    { title: "Climate communication", description: "Projection and colour classification influence how audiences perceive global gradients and anomalies." },
  ],
  questions: [
    num("On a 1:50,000 map, a road measures 8 cm. How many kilometres long is it on the ground?", 4, "8 × 50,000 = 400,000 cm = 4 km.", "easy", 0.001, ["map_scale_conversion"]),
    mc("Which map has the largest cartographic scale?", "1:10,000", ["1:50,000", "1:250,000", "1:1,000,000"], "The denominator is smallest, so 1/10,000 is the largest fraction and shows the most local detail.", "easy", ["large_small_scale"]),
    mc("Which projection property is most important for a map comparing country land area?", "Equal area", ["Conformal shape", "Constant scale everywhere", "Straight rhumb lines"], "An equal-area projection preserves relative area.", "easy", ["projection_choice"]),
    mc("Why is Mercator misleading for global area comparison?", "Its area inflation grows strongly toward the poles.", ["It reverses east and west.", "It has no lines of longitude.", "It preserves area but distorts colour."], "Mercator is conformal, not equal-area; high-latitude regions appear greatly enlarged.", "medium", ["mercator_distortion"]),
    mc("Which variable is most appropriate for a choropleth of traffic danger by district?", "Collisions per million vehicle-kilometres", ["Total collisions only", "Total road length only", "The geographic area of each district"], "A rate relates events to exposure, improving comparability.", "medium", ["choropleth_normalization"]),
    mc("What does a quantile classification guarantee?", "Each class contains roughly the same number of mapped units.", ["Each class covers the same numeric interval.", "Within-class values are nearly identical.", "The map preserves area."], "Quantiles balance unit counts but can place similar values in different classes or dissimilar values together.", "medium", ["classification_method"]),
    mc("Which map type best represents a continuous pressure surface?", "Isoline map", ["Unstandardized choropleth", "Political reference map", "Graduated symbol map of totals"], "Isolines connect equal values across a continuous field.", "easy", ["map_type"]),
    mc("Why does a scale bar remain useful after a map is proportionally resized?", "The bar resizes with the map, preserving its visual ground-distance relationship.", ["Representative fractions automatically change Earth’s radius.", "Scale bars eliminate projection distortion.", "The bar converts all units to degrees."], "A printed ratio may become wrong after resizing, while a scale bar changes proportionally with the image.", "medium", ["scale_bar"]),
    text("What term describes the necessary simplification of features when map scale becomes smaller?", "generalization", ["cartographic generalization", "map generalisation", "generalisation"], "Generalization selects, simplifies, aggregates, or displaces features so the map remains legible.", "medium"),
    caseStudy("A news map shades countries by total carbon emissions using Mercator and concludes that visually largest dark countries are the dominant per-person emitters. Which critique is strongest?", "The map combines area distortion with totals, so it cannot support a per-person conclusion.", ["Mercator is always invalid for thematic maps.", "Country data can never be compared.", "Dark colours necessarily reverse the data ranking."], "The projection enlarges high latitudes, while total emissions are not per-capita rates; both visual area and denominator undermine the claim.", "Recommend an equal-area view and a separate per-capita variable while noting that totals answer a different valid question."),
  ],
});

addLesson({
  id: "GEO_CART_002",
  name: "Latitude, longitude, and geodetic reference",
  domain: "Geography",
  subdomain: "Cartography",
  description: "Use latitude and longitude responsibly, convert coordinate formats, interpret datums, and estimate position and distance on Earth.",
  prerequisites: ["GEO_CART_001", "MATH_GEOM_003"],
  prerequisiteRefs: [{ subjectId: "SUBJECT_MATH", skillId: "MATH_GEOM_003" }],
  tags: ["latitude", "longitude", "coordinates", "datum", "geodesy", "gps"],
  theory: `Latitude and longitude form a global angular reference system. Latitude is the angle between the equatorial plane and a line defined by the chosen Earth model at a location. Longitude is the angle east or west from the prime meridian. In common notation, northern and eastern values are positive while southern and western values are negative, but datasets may use other conventions.

Coordinates can be written as degrees–minutes–seconds (DMS), degrees and decimal minutes, or decimal degrees. To convert DMS to decimal degrees, compute degrees + minutes/60 + seconds/3600, then apply the hemisphere sign. For example, 45°30′S becomes −45.5°. Never attach a negative sign and an S or W label simultaneously without clarifying convention.

Coordinate order is a frequent source of error. Geographic writing often says latitude, longitude; many GIS formats use x, y, which means longitude, latitude. A pair such as 45, 15 is plausible in either order. Metadata, valid ranges, and known location context are necessary to resolve it.

A coordinate reference system specifies more than units. A geodetic datum defines an Earth model and how its coordinate frame is anchored. WGS 84 is widely used by satellite navigation. A coordinate expressed in a different datum can refer to a measurably different ground position even when the numeric latitude and longitude look similar.

GPS and other global navigation satellite systems estimate position from timed radio signals and orbital information. Accuracy depends on satellite geometry, atmosphere, multipath reflections, receiver quality, correction services, and obstructions. A displayed coordinate should therefore be accompanied by an uncertainty appropriate to the device and method.

Longitude wraps at the antimeridian. Latitude does not wrap in the same way; it terminates at the poles, where all meridians meet and longitude becomes indeterminate. Geographic bounding boxes that cross the antimeridian require explicit handling because a minimum longitude may numerically exceed a maximum longitude.

Coordinates are not places by themselves. A useful geographic record also states datum/CRS, time, precision, collection method, and semantic meaning. Reporting twelve decimal places from a phone does not create millimetre accuracy; it only creates false precision.`,
  examples: [
    { prompt: "Convert 43°30′00″N to decimal degrees.", solution: "43.5", explanation: "30/60 = 0.5 and north is positive." },
    { prompt: "Convert 16°15′W to signed decimal degrees.", solution: "−16.25", explanation: "15/60 = 0.25 and west is negative in the common signed convention." },
    { prompt: "Interpret GIS x, y = 15.98, 45.81 in a geographic CRS.", solution: "Longitude 15.98°E, latitude 45.81°N", explanation: "In GIS coordinate order, x is longitude and y is latitude." },
    { prompt: "Why can two identical-looking coordinate pairs locate different ground points?", solution: "They may use different datums or coordinate reference systems.", explanation: "Numbers require a reference frame." },
  ],
  applications: [
    { title: "Field science", description: "Reliable observations record location, datum, time, method, and positional uncertainty." },
    { title: "Emergency dispatch", description: "Coordinate order, sign, and format errors can send responders many kilometres away." },
    { title: "Software interoperability", description: "APIs and GIS files differ in axis order and longitude convention, requiring explicit metadata." },
  ],
  questions: [
    num("Convert 48° 12′ 00″N to decimal degrees.", 48.2, "12/60 = 0.2, so the coordinate is 48.2°N.", "easy", 0.0001, ["dms_conversion"]),
    num("Convert 73° 30′ 00″W to signed decimal degrees.", -73.5, "30/60 = 0.5 and west is negative in the signed convention.", "easy", 0.0001, ["hemisphere_sign"]),
    mc("In the common GIS x, y order for unprojected geographic coordinates, what does x represent?", "Longitude", ["Latitude", "Elevation", "Time zone"], "Longitude measures east–west angular position and corresponds to the horizontal x-like coordinate.", "easy", ["axis_order"]),
    mc("What additional information is essential for interpreting a precise coordinate pair?", "Its coordinate reference system or datum", ["The map’s font", "The observer’s nationality", "The nearest time zone only"], "A datum defines the reference frame and Earth model behind the numbers.", "easy", ["datum_awareness"]),
    num("Find the smaller longitude separation between 179.2°E and 179.6°W.", 1.2, "Crossing the antimeridian gives 0.8° + 0.4° = 1.2°.", "medium", 0.001, ["antimeridian_wrap"]),
    mc("Why is longitude indeterminate exactly at a pole?", "All meridians converge there.", ["Latitude becomes zero there.", "The datum stops existing.", "Earth’s rotation is absent there."], "Every longitude line reaches the pole, so no unique meridian describes that point.", "medium", ["polar_coordinates"]),
    mc("A phone reports 45.812345678901°. What is the most responsible interpretation?", "The digits show numerical precision, not guaranteed positional accuracy.", ["The position is accurate to a fraction of a millimetre.", "The datum is necessarily WGS 84.", "The last six digits identify elevation."], "Receiver and environmental error usually exceed the implied resolution of many displayed decimals.", "medium", ["false_precision"]),
    mc("Which condition commonly degrades satellite-position accuracy in a city street canyon?", "Signal reflection and obstructed satellite geometry", ["The use of decimal degrees", "Crossing a postal boundary", "Map generalization alone"], "Buildings can block and reflect signals, producing multipath error and poor geometry.", "medium", ["gnss_error"]),
    text("Name the globally common geodetic datum used by GPS.", "WGS 84", ["WGS84", "World Geodetic System 1984"], "GPS coordinates are commonly referenced to the World Geodetic System 1984.", "easy"),
    caseStudy("A wildlife dataset mixes rows labelled ‘lat, lon’ with rows exported as GIS ‘x, y’; values are all within ±90°, so range checks do not expose every swap. What is the best response?", "Use metadata and known-location checks to standardize axis order before analysis, while flagging ambiguous records.", ["Assume the first value is always latitude.", "Delete every coordinate below zero.", "Average each pair so order no longer matters."], "Axis swaps can remain numerically plausible. Provenance, schema, mapped spot checks, and explicit transformation are required.", "Preserve an audit trail and avoid silently repairing records whose intended order cannot be established."),
  ],
});

addLesson({
  id: "GEO_GIS_001",
  name: "GIS layers, spatial data, and remote sensing",
  domain: "Geography",
  subdomain: "Geospatial Methods",
  description: "Distinguish vector and raster data, reason about resolution and uncertainty, and combine GIS and remote-sensing evidence without overclaiming.",
  prerequisites: ["GEO_CART_001", "GEO_CART_002"],
  tags: ["gis", "raster", "vector", "remote_sensing", "spatial_data", "resolution"],
  theory: `A geographic information system stores, analyzes, and displays data tied to location. Its power comes from relating layers: roads, elevation, land cover, parcels, census areas, observations, or model outputs. Overlay is not merely visual; it creates questions about intersection, distance, containment, connectivity, and change.

Vector data represent discrete features as points, lines, and polygons. A well, road, and protected area are typical examples. Raster data divide space into cells, each holding a value such as elevation, reflectance, rainfall, or category. The choice is conceptual: a river may be a line in a transport network, a polygon in habitat analysis, or a raster component in a flood model.

Spatial resolution is the size of the smallest represented unit, such as raster cell size. Temporal resolution is revisit frequency. Spectral resolution describes wavelength bands, and radiometric resolution describes sensitivity to differences in recorded energy. Higher resolution in one dimension can trade off against coverage, file size, noise, or revisit time.

Remote sensing measures reflected or emitted energy from a distance. Passive optical sensors depend largely on sunlight and can be blocked by cloud; thermal sensors measure emitted energy; active radar and lidar transmit energy and record its return. A sensor records a signal that must be interpreted, not a ready-made land-use fact.

Classification turns measurements into categories. Training data, algorithm choice, class definitions, season, atmosphere, and mixed pixels affect accuracy. An error matrix compares mapped classes with reference observations. Overall accuracy alone can hide poor performance for a rare but important class, so class-specific omission and commission errors matter.

GIS analysis must respect coordinate systems and scale. Distance or area calculated directly in geographic degrees is generally not a valid metric result. Layers must align in a suitable projected CRS or use geodesic methods. Resampling a coarse raster to smaller cells changes appearance, not underlying information.

Spatial data can carry social risk. Fine-grained health, mobility, or household data may reveal identities or enable surveillance. Responsible work minimizes data, aggregates where appropriate, protects sensitive locations, records lineage, and distinguishes observed values from modelled estimates.`,
  examples: [
    { prompt: "Choose vector or raster for a street network routing model.", solution: "Vector lines with network topology", explanation: "Connectivity between road segments is central to routing." },
    { prompt: "Choose a suitable model for continuous elevation.", solution: "Raster", explanation: "A regular grid can represent a continuous surface." },
    { prompt: "Does resampling a 1 km raster to 100 m create 100 m information?", solution: "No", explanation: "It interpolates additional cells but cannot recover missing detail." },
    { prompt: "Why might radar be useful during cloudy flooding?", solution: "It is active and can often observe through cloud.", explanation: "Microwave radar is less obstructed by cloud than passive visible imagery." },
  ],
  applications: [
    { title: "Disaster response", description: "Satellite change detection and GIS overlays support rapid flood, fire, and damage assessment." },
    { title: "Urban planning", description: "Network, parcel, population, heat, and service layers reveal accessibility and exposure." },
    { title: "Conservation", description: "Remote sensing tracks habitat extent while field observations validate classifications." },
  ],
  questions: [
    mc("Which representation is best for a road-routing network?", "Vector lines with explicit connectivity", ["An unreferenced image", "A table without coordinates", "A single coarse raster category"], "Routing depends on connected segments, direction, and cost attributes.", "easy", ["data_model"]),
    mc("Which statement about raster resolution is correct?", "Smaller cells can represent finer spatial variation but do not guarantee greater accuracy.", ["Smaller cells always make source measurements more accurate.", "Cell size and temporal resolution are identical.", "Raster cells cannot store categories."], "Resolution, accuracy, precision, and validity are related but distinct.", "medium", ["resolution_accuracy"]),
    mc("A satellite revisits the same place every two days. What type of resolution is described?", "Temporal resolution", ["Spatial resolution", "Spectral resolution", "Radiometric resolution"], "Revisit interval measures frequency through time.", "easy", ["resolution_type"]),
    mc("Which sensor is active?", "Radar", ["A natural-colour camera using sunlight", "A passive thermal radiometer", "The human eye"], "Radar transmits microwave energy and measures the return.", "easy", ["active_passive_sensor"]),
    mc("Why should a land-cover classification be checked with reference data?", "The sensor signal and algorithm can confuse classes, seasons, and mixed pixels.", ["Mapped classes are automatically true once coloured.", "Reference data change the satellite orbit.", "Validation removes all uncertainty."], "Classification is an inference whose errors must be measured.", "medium", ["classification_validation"]),
    mc("What is an omission error for the wetland class?", "A real wetland is mapped as another class.", ["A non-wetland is incorrectly mapped as wetland.", "A wetland polygon has too many vertices.", "The raster has no coordinate system."], "Omission means the target class was missed; commission means another class was wrongly included.", "hard", ["error_matrix"]),
    mc("What happens when a 1 km raster is resampled to 100 m cells?", "The grid looks finer, but its original information content does not increase.", ["The sensor’s original resolution becomes 100 m.", "All mixed pixels disappear.", "Classification accuracy becomes 100%."], "Resampling interpolates or reallocates existing values.", "medium", ["resampling"]),
    mc("Why is calculating kilometre distance directly from unprojected longitude–latitude differences unsafe?", "Degrees are angular units whose ground length varies by direction and latitude.", ["Longitude and latitude contain no numeric values.", "All projections use miles.", "GIS cannot calculate distance."], "Use a suitable projected CRS or geodesic calculation.", "medium", ["crs_distance"]),
    text("What GIS operation combines layers according to shared location?", "overlay", ["spatial overlay", "overlay analysis"], "Overlay relates features or cells that intersect or coincide spatially.", "easy"),
    caseStudy("A model maps informal settlements from 10 m imagery and publishes household-level polygons with health-risk scores. Which response is most responsible?", "Validate the classification, assess harm, and aggregate or protect sensitive outputs before release.", ["Publish immediately because satellite imagery is public.", "Increase colour contrast and keep household detail.", "Remove the coordinate system but retain identifiable shapes."], "Technical uncertainty and re-identification risk both matter; public imagery does not erase obligations around derived sensitive data.", "Address consent, purpose, access controls, aggregation, and the unequal consequences of false positives."),
  ],
});

addLesson({
  id: "GEO_PHYS_001",
  name: "Plate tectonics, rocks, and landform systems",
  domain: "Geography",
  subdomain: "Physical Geography",
  description: "Explain major landforms and hazards through plate motion, rock processes, uplift, weathering, erosion, and timescale.",
  prerequisites: ["GEO_FOUND_001"],
  tags: ["plate_tectonics", "landforms", "rocks", "weathering", "erosion", "hazards"],
  theory: `Earth’s lithosphere is divided into moving plates over a weaker asthenosphere. Plate motion is measured in centimetres per year, but over millions of years it reorganizes oceans and continents. Evidence includes the fit and geology of continents, fossil distributions, seafloor magnetic stripes, ocean-floor ages, earthquake belts, and direct geodetic measurement.

At divergent boundaries, plates separate and new crust forms, producing mid-ocean ridges or continental rifts. At convergent boundaries, one plate may subduct beneath another, generating trenches, volcanic arcs, and powerful earthquakes, or two continents may collide and thicken crust into high mountain belts. Transform boundaries accommodate lateral motion and commonly generate shallow earthquakes.

Boundary categories are models, not complete descriptions of every location. Plate interiors also deform, and triple junctions, microplates, oblique convergence, inherited faults, and mantle processes complicate patterns. A hazard map based only on a single boundary line can miss distributed risk.

The rock cycle links igneous, sedimentary, and metamorphic rocks through melting, cooling, weathering, transport, deposition, burial, heat, and pressure. It has no single starting point and no fixed sequence. Tectonic uplift exposes rock to surface processes, while erosion removes mass and redistributes sediment.

Weathering breaks down rock in place through physical, chemical, and biological processes. Erosion moves material by water, ice, wind, or gravity. Landforms emerge from the interaction of rock resistance, structure, climate, tectonics, organisms, and time. Similar-looking valleys can therefore have different histories.

Relative and absolute timescales matter. A flood can reshape a channel in hours; soil and slope recovery can take decades; mountain building spans millions of years. Present form may reflect inherited conditions no longer active. Physical geography reconstructs systems from multiple lines of evidence rather than attributing every feature to the process visible today.

Hazard is not synonymous with disaster. A tectonic event becomes disastrous through exposure and vulnerability—where people and assets are, how buildings are constructed, what warnings and institutions exist, and who has resources to recover.`,
  examples: [
    { prompt: "Explain paired trench and volcanic arc features.", solution: "They commonly indicate subduction.", explanation: "A descending plate forms a trench and contributes to melting that feeds an arc." },
    { prompt: "Distinguish weathering and erosion.", solution: "Weathering breaks material down in place; erosion transports it.", explanation: "The processes often act together but are not synonyms." },
    { prompt: "Why are ocean floors young compared with continents?", solution: "Oceanic crust is created at ridges and recycled at subduction zones.", explanation: "Continental crust is less readily subducted and can preserve older rocks." },
    { prompt: "Why can equal earthquakes produce unequal disasters?", solution: "Exposure, building quality, preparedness, and vulnerability differ.", explanation: "Magnitude alone does not determine social impact." },
  ],
  applications: [
    { title: "Infrastructure", description: "Engineering and land-use planning incorporate fault, slope, liquefaction, volcanic, and tsunami evidence." },
    { title: "Resources", description: "Ore bodies, geothermal fields, hydrocarbons, and building materials have geological distributions." },
    { title: "Landscape interpretation", description: "Field evidence links landform shape with rock structure, process, and timescale." },
  ],
  questions: [
    mc("Which evidence most directly records symmetrical seafloor spreading?", "Magnetic stripes of alternating polarity on both sides of a mid-ocean ridge", ["Daily tides", "Political boundaries", "River-meander direction"], "New basalt records magnetic polarity as it forms and moves away from the ridge.", "medium", ["tectonic_evidence"]),
    mc("Which setting commonly produces a deep-ocean trench and volcanic arc?", "Subduction at a convergent boundary", ["A passive continental margin", "A transform boundary only", "A stable craton"], "A descending oceanic plate bends into a trench and contributes to arc volcanism.", "easy", ["boundary_landform"]),
    mc("What motion dominates at a transform boundary?", "Horizontal sliding past", ["Crust creation by separation", "Continental collision only", "Vertical uplift without faulting"], "Transform faults accommodate lateral displacement.", "easy", ["plate_motion"]),
    mc("Which statement about the rock cycle is most accurate?", "Rocks can follow multiple pathways rather than one fixed circular sequence.", ["Every rock must become sedimentary next.", "Metamorphic rock forms only at the surface.", "Igneous rock cannot weather."], "The rock cycle is a network of transformations driven by different processes.", "medium", ["rock_cycle"]),
    mc("Which process is erosion rather than weathering?", "A river transports loosened sediment downstream.", ["Water freezes in a crack and widens it.", "Acid dissolves limestone in place.", "Roots pry apart bedrock."], "Transport distinguishes erosion from in-place breakdown.", "easy", ["weathering_erosion"]),
    mc("Why are plate-boundary maps insufficient as complete earthquake-risk maps?", "Deformation, exposure, vulnerability, and local ground conditions extend beyond a simple boundary line.", ["Earthquakes never occur near boundaries.", "Risk depends only on latitude.", "Boundaries move too quickly to map."], "Hazard processes and social risk are spatially distributed and multi-factor.", "hard", ["hazard_risk"]),
    mc("What does tectonic uplift commonly do to landscape systems?", "It increases relief and exposes rock to weathering and erosion.", ["It stops all river incision.", "It converts every rock to magma.", "It eliminates gravity-driven processes."], "Uplift creates potential energy and fresh relief that surface processes modify.", "medium", ["uplift_erosion"]),
    mc("Two earthquakes have equal magnitude but very different death tolls. Which explanation is strongest?", "Differences in exposure, construction, timing, preparedness, and response capacity", ["Magnitude contains no physical information.", "The lower toll proves the fault was imaginary.", "Longitude alone determines mortality."], "Disaster impact arises from the interaction of hazard with social vulnerability.", "medium", ["disaster_vulnerability"]),
    text("What term describes the breakdown of rock in place?", "weathering", ["rock weathering"], "Weathering alters or disintegrates material without requiring transport.", "easy"),
    caseStudy("A valley contains a U-shaped cross-section, striated bedrock, and unsorted sediment ridges, although no glacier is present today. Which explanation is strongest?", "The landform preserves evidence of past glaciation and inherited conditions.", ["The present river alone formed every feature.", "Plate tectonics cannot affect valleys.", "The evidence proves active glaciation today."], "The combined morphology, abrasion marks, and moraines support a former glacier; present process need not match formative process.", "Distinguish evidence for past process from present conditions and acknowledge that dating would refine the history."),
  ],
});

addLesson({
  id: "GEO_PHYS_002",
  name: "Weather, climate, and atmospheric circulation",
  domain: "Geography",
  subdomain: "Physical Geography",
  description: "Connect radiation, pressure, circulation, moisture, oceans, and topography to weather processes and climate patterns.",
  prerequisites: ["GEO_FOUND_001"],
  tags: ["weather", "climate", "atmosphere", "circulation", "precipitation", "climate_change"],
  theory: `Weather is the short-term state of the atmosphere; climate is the statistical character of weather over a sufficiently long period, including averages, variability, seasonality, and extremes. A cold day does not disprove long-term warming, and a rising mean can change the frequency of extremes even when individual events remain variable.

Solar energy drives the climate system, but it is unevenly distributed by latitude, season, cloud, surface reflectivity, and day length. Earth emits longwave radiation. Greenhouse gases absorb and re-emit part of this outgoing energy, keeping the surface warmer than it would otherwise be. Increasing greenhouse-gas concentrations alters the energy balance; feedbacks involving water vapour, ice, clouds, and carbon can amplify or moderate change.

Air pressure and wind reflect differences in heating and density. Air accelerates from higher toward lower pressure, while Earth’s rotation deflects large-scale motion through the Coriolis effect—rightward in the Northern Hemisphere and leftward in the Southern. Coriolis affects direction, not the initial creation of wind, and is negligible for water draining from a household sink.

Global circulation redistributes heat. Rising air near the equator, subsiding air in the subtropics, mid-latitude westerlies, and polar circulation produce broad climate tendencies, but continents, ocean currents, mountains, and seasonal migration of pressure belts create regional complexity. The jet stream helps organize mid-latitude weather systems.

Moisture changes phase and moves with air. Relative humidity depends on both water-vapour content and temperature. Rising air expands and cools, encouraging condensation if saturation is reached. Convection, fronts, and orographic uplift are major precipitation mechanisms. Descending air warms and dries, contributing to rain shadows and many subtropical dry zones.

Oceans store and transport large amounts of heat. Coastal locations often have smaller annual temperature ranges than continental interiors at the same latitude. Coupled ocean–atmosphere patterns such as El Niño–Southern Oscillation rearrange rainfall and temperature anomalies across distant regions; their effects vary by event and location.

Climate evidence combines instruments, satellites, ocean observations, ice, sediment, tree rings, and models. Models are simplified physical systems tested against observations. Uncertainty is not ignorance: ranges can reflect emissions choices, internal variability, model structure, and measurement limits. Decisions should consider both expected change and plausible high-impact outcomes.`,
  examples: [
    { prompt: "Why can relative humidity rise overnight without adding water vapour?", solution: "Cooling lowers the amount of vapour needed for saturation.", explanation: "Relative humidity is temperature-dependent." },
    { prompt: "Explain a leeward rain shadow.", solution: "Air loses moisture while rising windward, then descends, warms, and dries leeward.", explanation: "Topography forces vertical motion and changes saturation." },
    { prompt: "Why do coastal climates often have smaller annual temperature ranges?", solution: "Water heats and cools more slowly and mixes heat through depth.", explanation: "Ocean thermal inertia moderates nearby air temperatures." },
    { prompt: "Does one record snowstorm refute global warming?", solution: "No", explanation: "A single weather event does not determine a long-term global climate trend." },
  ],
  applications: [
    { title: "Agriculture", description: "Seasonality, moisture, heat stress, frost, and extremes shape crop choices and food risk." },
    { title: "Energy systems", description: "Heating demand, cooling demand, wind, solar, hydropower, and grid resilience depend on climate variability." },
    { title: "Adaptation planning", description: "Infrastructure design uses changing baselines, extremes, uncertainty, and asset lifetime." },
  ],
  questions: [
    mc("Which definition best distinguishes climate from weather?", "Climate describes the long-term distribution and variability of weather, not only its mean.", ["Climate is any event lasting more than one day.", "Weather applies only to precipitation.", "Climate has no extremes."], "Climate includes averages, seasonality, variability, and extremes over long periods.", "easy", ["weather_climate"]),
    mc("What is the primary energy source driving Earth’s atmosphere and surface climate?", "Solar radiation", ["Tidal friction", "Earth’s magnetic field", "Radio communication"], "Incoming solar energy powers temperature gradients, evaporation, and circulation.", "easy", ["energy_balance"]),
    mc("What does the Coriolis effect do to large-scale moving air in the Northern Hemisphere?", "Deflects it to the right of its motion", ["Creates wind from calm air by itself", "Always pushes it toward the equator", "Removes pressure gradients"], "Rotation changes the apparent direction of motion in Earth’s frame.", "medium", ["coriolis"]),
    mc("Why does rising unsaturated air tend to cool?", "Lower pressure allows it to expand, using internal energy.", ["It moves closer to the Sun.", "Gravity removes all water vapour.", "Coriolis reverses molecular motion."], "Expansion under decreasing pressure produces adiabatic cooling.", "medium", ["adiabatic_process"]),
    mc("Which process commonly produces a rain shadow?", "Orographic ascent on a windward slope followed by dry descending air leeward", ["Uniform heating over a flat ocean", "A stronger magnetic field", "Tides crossing a coastline"], "Uplift cools and condenses moisture; descent warms the depleted air.", "easy", ["orographic_precipitation"]),
    mc("Why can coastal temperatures be less seasonal than inland temperatures at the same latitude?", "Ocean heat capacity and mixing moderate temperature change.", ["Coasts receive no solar radiation in winter.", "Sea level fixes air temperature at 20°C.", "Longitude eliminates seasons."], "Water stores heat efficiently and exchanges it over time.", "medium", ["maritime_continental"]),
    mc("Which statement about greenhouse gases is accurate?", "They absorb and re-emit portions of outgoing longwave radiation.", ["They block all incoming sunlight.", "They create energy from nothing.", "They affect weather but cannot affect climate."], "The greenhouse effect changes the rate and altitude at which Earth loses heat to space.", "medium", ["greenhouse_effect"]),
    mc("A warmer climate shifts a temperature distribution upward. What can happen even if day-to-day variability remains?", "Previously rare hot extremes can become more frequent.", ["All cold days become physically impossible immediately.", "Weather variability must fall to zero.", "The climate mean cannot change."], "A shifted distribution changes threshold exceedance frequencies.", "medium", ["extreme_distribution"]),
    text("What term describes the boundary zone between contrasting air masses?", "front", ["weather front", "an atmospheric front"], "Fronts organize uplift, clouds, precipitation, and changing weather.", "easy"),
    caseStudy("A city updates flood design using only the twentieth-century rainfall average, despite evidence that short intense storms are becoming more frequent. Which approach is stronger?", "Use non-stationary risk estimates, multiple scenarios, and safety margins suited to infrastructure lifetime.", ["Keep the old mean because climate and weather are unrelated.", "Design only for the single largest storm ever recorded.", "Ignore uncertainty until projections agree exactly."], "Long-lived infrastructure should account for changing extremes and uncertainty, not assume the past distribution remains fixed.", "Explain how uncertainty can support robust design rather than justify inaction or false precision."),
  ],
});

addLesson({
  id: "GEO_PHYS_003",
  name: "Hydrology, rivers, and watershed processes",
  domain: "Geography",
  subdomain: "Physical Geography",
  description: "Trace water through catchments, interpret river response, and connect flooding, groundwater, sediment, and human modification.",
  prerequisites: ["GEO_PHYS_001", "GEO_PHYS_002"],
  tags: ["hydrology", "watershed", "river", "groundwater", "flood", "sediment"],
  theory: `The hydrologic cycle moves water among atmosphere, oceans, ice, soil, groundwater, rivers, lakes, organisms, and human systems. At watershed scale, a water balance can be expressed conceptually as precipitation inputs minus evapotranspiration and runoff, with the remainder changing storage. Every term varies through time and carries uncertainty.

A drainage basin or watershed is the area contributing surface flow to an outlet. Divides separate adjacent basins, though groundwater boundaries may not match surface topography. Basin shape, area, relief, geology, soils, vegetation, land cover, drainage density, and antecedent moisture affect how rainfall becomes streamflow.

Infiltration moves water into soil; percolation carries it deeper. When rainfall intensity exceeds infiltration capacity, or soil is already saturated, overland flow increases. Urban paving reduces infiltration and routes water quickly through drains, often creating a faster, higher discharge peak unless storage and green infrastructure compensate.

A hydrograph shows river discharge through time. Lag time is the delay between rainfall and peak discharge. A flashy response has a steep rising limb, high peak, and short lag; it may reflect intense rain, steep slopes, impermeable surfaces, saturated soil, or efficient channel routing. One storm does not define a basin’s permanent behaviour.

Rivers erode, transport, and deposit sediment. Capacity is the total load a flow can carry; competence is the largest particle it can move. Channel form reflects discharge and sediment regimes, bank material, vegetation, valley confinement, large wood, engineering, and history. Meanders migrate through outer-bank erosion and inner-bank deposition, but real channels are more complex than a single textbook rule.

Groundwater occupies pores and fractures below the water table. An aquifer stores and transmits usable water; an aquitard transmits it slowly. Pumping faster than recharge lowers head, can dry wells or streams, cause subsidence, and draw saline water into coastal aquifers. Groundwater moves slowly, so contamination can persist.

Flood risk management combines forecasts, warnings, land-use choices, building design, evacuation, insurance, channel and storage works, wetland/floodplain restoration, and social support. Levees can reduce frequent flooding locally while transferring risk or encouraging development behind them. A river is a connected system, so interventions must be evaluated upstream and downstream.`,
  examples: [
    { prompt: "Why does paving commonly shorten hydrograph lag time?", solution: "It reduces infiltration and speeds drainage to channels.", explanation: "More rainfall becomes rapid surface or pipe flow." },
    { prompt: "What is a watershed divide?", solution: "A topographic boundary separating surface drainage basins.", explanation: "Water on opposite sides flows toward different outlets." },
    { prompt: "Distinguish river competence and capacity.", solution: "Competence is maximum particle size; capacity is total sediment load.", explanation: "Both generally increase with flow energy but describe different properties." },
    { prompt: "Why can groundwater pumping reduce river flow?", solution: "Streams and aquifers may be hydraulically connected.", explanation: "Lower groundwater levels can reduce baseflow or induce stream leakage." },
  ],
  applications: [
    { title: "Urban drainage", description: "Detention, permeable surfaces, wetlands, and safe overflow paths reshape runoff timing and peaks." },
    { title: "Water supply", description: "Sustainable abstraction compares recharge, environmental flow, demand, drought, and water quality." },
    { title: "River restoration", description: "Restoring floodplain connection and sediment processes can improve habitat and reduce some risks." },
  ],
  questions: [
    mc("What defines a surface-water watershed?", "The area draining toward a specified outlet", ["Any region with the same annual rainfall", "The underground volume below sea level", "Only the river channel itself"], "A watershed is bounded by divides relative to a chosen outlet.", "easy", ["watershed_definition"]),
    mc("Which change most directly increases rapid runoff in an urban basin?", "Replacing permeable soil with connected pavement and storm drains", ["Restoring wetlands", "Increasing infiltration storage", "Disconnecting roof drains"], "Impervious connected surfaces route water quickly to channels.", "easy", ["urban_runoff"]),
    mc("A hydrograph with a short lag and steep rising limb is described as what?", "Flashy", ["Endorheic", "Perennial only", "Tectonic"], "A flashy catchment responds rapidly to rainfall.", "easy", ["hydrograph"]),
    mc("What happens when rainfall intensity exceeds infiltration capacity?", "Infiltration-excess overland flow can develop.", ["All rainfall becomes groundwater instantly.", "Evapotranspiration must exceed precipitation.", "The watershed divide disappears."], "Water arriving faster than soil can absorb it accumulates and flows overland.", "medium", ["infiltration_excess"]),
    mc("Which statement correctly distinguishes sediment competence and capacity?", "Competence is largest movable particle; capacity is total transportable load.", ["Competence is total load; capacity is channel width.", "Both mean dissolved concentration only.", "Capacity applies only to groundwater."], "The two measures respond differently to changing flow.", "medium", ["sediment_transport"]),
    mc("Why can a levee create risk beyond the defended reach?", "It can transfer water, raise levels, or encourage exposure without removing basin-wide flood processes.", ["Levees stop precipitation.", "It guarantees lower discharge everywhere.", "Levees make warnings unnecessary."], "Flood interventions redistribute flow and incentives across a connected system.", "hard", ["risk_transfer"]),
    num("A basin receives 900 mm of precipitation, loses 520 mm to evapotranspiration, and exports 310 mm as runoff in one year. What is the storage change in millimetres?", 70, "ΔS = P − ET − Q = 900 − 520 − 310 = 70 mm.", "medium", 0.001, ["water_balance"]),
    mc("What is a common consequence of pumping a coastal aquifer too heavily?", "Saltwater intrusion", ["A permanent increase in recharge", "Elimination of subsidence", "Conversion of longitude to latitude"], "Lower freshwater head can draw saline water inland.", "medium", ["groundwater_overdraft"]),
    text("What term names groundwater flow that sustains a river between storms?", "baseflow", ["base flow"], "Baseflow is the delayed groundwater contribution to stream discharge.", "easy"),
    caseStudy("A downstream district proposes higher flood walls after repeated floods; upstream wetlands have been drained and new suburbs rapidly route stormwater into the river. Which plan is most defensible?", "Combine targeted protection with upstream storage, wetland restoration, runoff controls, warnings, and exposure reduction.", ["Build only the highest possible downstream wall.", "Deepen every channel without assessing sediment or downstream effects.", "Ban rainfall forecasting because it is uncertain."], "The basin is connected; a portfolio can reduce hazard, exposure, and vulnerability while avoiding simple risk transfer.", "Compare distributional effects, failure modes, maintenance, ecological consequences, and residual risk."),
  ],
});

addLesson({
  id: "GEO_PHYS_004",
  name: "Biomes, soils, and ecosystem geography",
  domain: "Geography",
  subdomain: "Physical Geography",
  description: "Explain broad ecosystem patterns through climate, soils, disturbance, organisms, history, and human land use across scales.",
  prerequisites: ["GEO_PHYS_002", "GEO_PHYS_003"],
  tags: ["biomes", "soil", "ecosystem", "disturbance", "biodiversity", "land_use"],
  theory: `A biome is a broad ecological formation associated with climate and dominant vegetation structure, such as tropical rainforest, temperate grassland, desert, or tundra. Biome maps are useful generalizations, not sharp descriptions of every site. Elevation, soil, fire, hydrology, land use, and local history create mosaics and transition zones.

Temperature and water availability strongly constrain productivity and vegetation. Potential evapotranspiration expresses atmospheric demand for water; comparing it with precipitation helps explain moisture limitation. Seasonality matters as much as annual totals. The same annual rainfall can support different ecosystems when concentrated into a short wet season rather than distributed through the year.

Soils are dynamic bodies with mineral material, organic matter, water, air, and organisms arranged into horizons. Soil formation reflects parent material, climate, organisms, relief, and time. Texture influences water and nutrient behaviour; structure and organic matter affect infiltration, aeration, and erosion resistance. Soil fertility cannot be inferred from vegetation lushness alone.

Nutrients cycle through biomass, litter, soil, water, and atmosphere. In some warm wet forests, rapid decomposition and biological uptake keep much nutrient capital in living biomass rather than deep soil. Removing vegetation can therefore expose weathered soils to leaching and erosion. In grasslands, dense root systems can build organic-rich topsoil under suitable conditions.

Disturbance—including fire, flood, storm, drought, grazing, pests, and human clearing—can be integral to ecosystem dynamics. Frequency, intensity, timing, extent, and prior conditions determine effects. Suppressing every fire can sometimes increase fuel accumulation, while indiscriminate burning can simplify habitat and release carbon.

Biodiversity patterns reflect energy, water, habitat complexity, area, isolation, evolutionary history, and disturbance. Species richness is not the only concern; endemism, functional diversity, population viability, and connectivity matter. Protected areas can fail if they are isolated from migration routes or if local communities bear costs without authority or benefit.

Land-cover change is both ecological and political-economic. Agricultural demand, tenure, infrastructure, commodity markets, governance, fire, and livelihoods interact. Avoid blaming a single proximate actor without examining supply chains and institutions.`,
  examples: [
    { prompt: "Why can equal annual rainfall produce different vegetation?", solution: "Seasonality and evapotranspiration can differ.", explanation: "Water available during the growing season matters, not only the annual total." },
    { prompt: "Name the five classic soil-forming factors.", solution: "Parent material, climate, organisms, relief, and time", explanation: "They interact to produce soil properties and horizons." },
    { prompt: "Why might forest clearing quickly reduce fertility in a wet tropical setting?", solution: "Nutrients held in biomass are removed and exposed soil can leach or erode.", explanation: "Lush vegetation does not imply a deep store of soil nutrients." },
    { prompt: "Why are habitat corridors used?", solution: "They support movement and gene flow between habitat patches.", explanation: "Connectivity can reduce some effects of fragmentation." },
  ],
  applications: [
    { title: "Food systems", description: "Soil water, erosion, nutrients, salinity, biodiversity, and land tenure affect long-term production." },
    { title: "Conservation planning", description: "Priorities compare representation, connectivity, endemism, threats, governance, and community rights." },
    { title: "Carbon management", description: "Forests, peatlands, grasslands, and soils store carbon but respond differently to disturbance and recovery." },
  ],
  questions: [
    mc("Why should biome boundaries be interpreted cautiously?", "They generalize broad patterns while real ecosystems form mosaics and transition zones.", ["Biomes are political borders.", "Climate has no ecological influence.", "Every mapped biome has identical soil."], "Biomes summarize dominant relationships at broad scale.", "easy", ["biome_generalization"]),
    mc("Which pair most directly controls broad moisture availability for vegetation?", "Precipitation and evapotranspiration demand", ["Longitude and language", "Magnetic declination and tides", "Election boundaries and road names"], "Water input must be compared with atmospheric and plant demand.", "easy", ["water_balance_ecology"]),
    mc("Which list contains the classic soil-forming factors?", "Parent material, climate, organisms, relief, and time", ["Latitude, longitude, currency, law, and trade", "Sand, silt, clay, water, and nitrogen only", "Fire, flood, wind, roads, and cities only"], "The factors interact; none alone determines a soil.", "medium", ["soil_formation"]),
    mc("Why can a tropical forest have lush biomass above strongly weathered soil?", "Rapid cycling can hold much nutrient capital in living biomass and surface litter.", ["Tropical plants require no nutrients.", "All tropical soils are newly volcanic.", "Heavy rain prevents decomposition."], "High productivity does not guarantee large, stable soil nutrient reserves.", "medium", ["nutrient_cycle"]),
    mc("Which statement about disturbance is most accurate?", "Its ecological effect depends on regime, context, and prior conditions.", ["All disturbance is unnatural.", "Fire always increases biodiversity.", "Floods have identical effects in every ecosystem."], "Frequency, intensity, timing, extent, and adaptation shape outcomes.", "medium", ["disturbance_regime"]),
    mc("What is a primary ecological purpose of a habitat corridor?", "Facilitate movement and connectivity between patches", ["Guarantee zero human–wildlife conflict", "Increase edge effects everywhere", "Replace all core habitat"], "Corridors can support dispersal and gene flow, though design and species needs matter.", "easy", ["fragmentation"]),
    mc("Which property generally helps soil resist erosion and store water?", "Stable structure with organic matter and vegetation cover", ["Bare compacted surface", "Complete removal of roots", "Maximum downslope tillage"], "Aggregation, pores, roots, and cover reduce detachment and runoff.", "medium", ["soil_quality"]),
    mc("Why is a commodity supply-chain perspective useful in deforestation analysis?", "Demand, finance, infrastructure, tenure, and governance can drive land change far from consumers.", ["It proves local actors have no role.", "It converts every forest into a market.", "It eliminates the need for spatial data."], "Proximate clearing decisions are connected to wider institutions and flows.", "hard", ["land_change_driver"]),
    text("What term describes species found naturally in only one restricted geographic area?", "endemic", ["an endemic species", "endemism"], "Endemism makes some places irreplaceable for conservation.", "easy"),
    caseStudy("A government proposes planting one fast-growing tree species across diverse native grasslands and calls the programme universal ecosystem restoration. Which assessment is strongest?", "Carbon gains must be weighed against biome suitability, biodiversity, water, fire, livelihoods, and permanence.", ["Any tree cover is automatically restoration.", "Grasslands contain no carbon or biodiversity.", "A single species guarantees resilience."], "Restoration should recover appropriate ecosystem functions and rights, not use tree count as the only metric.", "Distinguish native grassland from degraded forest and identify who bears land and water trade-offs."),
  ],
});

addLesson({
  id: "GEO_HUMAN_001",
  name: "Population distribution and demographic change",
  domain: "Geography",
  subdomain: "Human Geography",
  description: "Interpret population structure, density, fertility, mortality, and demographic transition without treating averages as destiny.",
  prerequisites: ["GEO_FOUND_001"],
  tags: ["population", "demography", "density", "fertility", "mortality", "age_structure"],
  theory: `Population geography asks where people live, how populations change, and how demographic processes interact with economies, environments, policy, and culture. Distribution is uneven: settlement concentrates where accessibility, livelihoods, infrastructure, institutions, and historical pathways make residence possible or advantageous.

Density requires a denominator and purpose. Arithmetic density divides population by total land area. Physiological density divides population by arable land, emphasizing pressure on cultivable land. Agricultural density may compare farmers with arable land. National averages can obscure extreme urban concentration and sparsely settled regions.

Population change equals births minus deaths plus net migration. The crude birth and death rates use total population as denominator, so age structure can complicate comparison. Total fertility rate summarizes expected births per woman under current age-specific rates; life expectancy summarizes mortality conditions. Neither is a prediction of an individual life.

The demographic transition model describes a common historical shift from high birth and death rates to low rates, often through mortality decline followed by fertility decline. It is a heuristic, not a universal law. Timing and pathways depend on health, education, gender relations, urbanization, labour, welfare systems, conflict, policy, and historical position in the world economy.

Age–sex structures reveal demographic momentum. A large cohort entering reproductive ages can sustain growth after fertility falls. Population ageing results from lower fertility and longer survival, creating challenges and opportunities that depend on productivity, health, migration, care systems, retirement rules, and inequalities—not simply the ratio of age groups.

Rates and absolute numbers must be separated. A rapidly growing small city may add fewer people than a slowly growing megacity. Percentage change can be dramatic from a small base. Maps of counts, rates, and densities answer different questions.

Demographic data come from censuses, registration systems, surveys, and models. Undercount, outdated boundaries, displacement, informal residence, and political incentives can bias estimates. Population categories are governed and contested; good analysis reports definitions, dates, uncertainty, and who may be missing.`,
  examples: [
    { prompt: "Calculate arithmetic density for 2 million people on 10,000 km².", solution: "200 people/km²", explanation: "Divide population by total land area." },
    { prompt: "Why can crude death rate be higher in a healthy ageing society?", solution: "A larger elderly share raises deaths per total population.", explanation: "Age structure affects crude rates." },
    { prompt: "Explain demographic momentum.", solution: "Large young cohorts can sustain births even after fertility per woman declines.", explanation: "Population structure affects future totals." },
    { prompt: "Why is demographic transition not a rigid sequence?", solution: "Institutions, policy, conflict, migration, and history alter pathways.", explanation: "The model is comparative, not deterministic." },
  ],
  applications: [
    { title: "Service planning", description: "Schools, housing, transport, health, and care require age-specific local projections rather than national totals alone." },
    { title: "Labour markets", description: "Age structure, education, participation, migration, productivity, and care work shape economic capacity." },
    { title: "Representation", description: "Census quality and boundary design influence political voice and resource allocation." },
  ],
  questions: [
    num("A region has 3,600,000 residents and 12,000 km² of land. What is its arithmetic density in people per km²?", 300, "3,600,000 ÷ 12,000 = 300 people/km².", "easy", 0.001, ["density_calculation"]),
    mc("What does physiological density compare?", "Population with arable land area", ["Births with deaths", "Urban residents with total roads", "Migrants with border length"], "It emphasizes population relative to cultivable land.", "easy", ["density_type"]),
    mc("Which equation describes population change?", "Births − deaths + immigration − emigration", ["Births + deaths only", "Density × longitude", "Fertility − land area"], "Natural increase and net migration jointly change population.", "easy", ["population_balance"]),
    mc("Why can crude death rates mislead international health comparison?", "They are affected by population age structure.", ["They exclude all deaths.", "They are measured only in cities.", "They equal life expectancy."], "Older populations can have higher crude death rates despite low age-specific mortality.", "medium", ["crude_rate"]),
    mc("What is demographic momentum?", "Continued population change caused by age structure after rates shift", ["Immediate population decline whenever fertility falls", "Migration caused only by weather", "A map projection effect"], "Large cohorts moving through childbearing ages can sustain growth.", "medium", ["demographic_momentum"]),
    mc("Which statement treats demographic transition most responsibly?", "It is a comparative model whose timing and sequence vary by history and institutions.", ["Every country follows identical stages on a fixed schedule.", "Fertility falls automatically once density rises.", "Migration has no demographic effect."], "The model organizes patterns but does not override context.", "medium", ["transition_model"]),
    mc("A city grows from 10,000 to 15,000 while a metropolis grows from 5,000,000 to 5,200,000. Which statement is correct?", "The city grows faster by percentage, but the metropolis adds more people.", ["The city adds more people.", "Both grow by the same percentage.", "Percentage and absolute change are identical."], "The city grows 50% and adds 5,000; the metropolis grows 4% and adds 200,000.", "medium", ["rate_vs_count"]),
    mc("Which data issue most directly threatens a census of displaced populations?", "People may be mobile, hidden, excluded, or afraid to report.", ["Latitude becomes invalid during migration.", "All displaced people have identical households.", "Censuses never use boundaries."], "Displacement complicates enumeration and can interact with political exclusion.", "hard", ["population_data_quality"]),
    text("What term describes births minus deaths, excluding migration?", "natural increase", ["rate of natural increase", "natural population increase"], "Natural increase separates vital events from net migration.", "easy"),
    caseStudy("A national ministry sees population ageing and concludes that economic decline is inevitable. Which response is strongest?", "Outcomes depend on health, productivity, participation, migration, technology, care systems, and inequality—not age structure alone.", ["Ageing has no policy relevance.", "Every older person is economically inactive.", "Fertility must be forced upward immediately."], "Age structure creates planning needs, but institutions and capabilities mediate economic effects.", "Avoid reducing people to dependency ratios and identify distributional as well as aggregate consequences."),
  ],
});

addLesson({
  id: "GEO_HUMAN_002",
  name: "Migration, mobility, and borders",
  domain: "Geography",
  subdomain: "Human Geography",
  description: "Analyze migration as a selective, networked process shaped by opportunity, constraint, policy, identity, and unequal mobility.",
  prerequisites: ["GEO_HUMAN_001"],
  tags: ["migration", "mobility", "borders", "diaspora", "refugees", "remittances"],
  theory: `Migration is a change in usual residence across a meaningful boundary; mobility also includes commuting, circulation, seasonal movement, tourism, and forced displacement. Definitions vary by duration and boundary, so datasets that count ‘migrants’ may measure different populations.

Simple push–pull lists identify unfavourable and favourable conditions but can hide mechanisms. Movement depends on resources, legal status, information, networks, household strategy, recruitment, transport, borders, discrimination, and life course. Severe poverty can reduce long-distance migration because moving requires money and connections.

Migration is selective. Age, education, gender, class, ethnicity, citizenship, health, and family position affect who can move, where, and under what terms. This selection changes both origin and destination populations. Network effects can lower costs and risks for later migrants, making established corridors persist even when initial causes change.

Forced and voluntary are endpoints on a continuum rather than always clean opposites. Refugees cross an international border due to a well-founded fear of persecution under a specific legal framework; internally displaced people remain within their state. People moving after drought or disaster may face compulsion without fitting a single universal ‘climate refugee’ legal category.

Borders are institutions and practices, not just lines. Visa rules, carrier sanctions, detention, digital screening, labour permits, internal checkpoints, and access to rights make borders operate before and after a physical crossing. Borders filter movement unevenly: the same passport, income, profession, or identity can radically change mobility.

Migration affects places through labour, care, entrepreneurship, remittances, demographic change, culture, politics, and transnational ties. ‘Brain drain’ can coexist with skill circulation, education incentives, remittances, and return migration. Impacts depend on institutions and timescale; claims that migrants uniformly lower wages or solve ageing require evidence by sector and group.

Migration data are partial. Irregular status, short-term movement, multiple moves, return, mixed motives, and changing definitions complicate counts. Ethical analysis avoids treating people as flows without agency and distinguishes observed associations from causal effects.`,
  examples: [
    { prompt: "Why might the poorest households migrate less internationally?", solution: "Migration has financial, informational, and legal costs.", explanation: "Aspiration is not the same as capability." },
    { prompt: "Distinguish refugee and internally displaced person.", solution: "A refugee crosses an international border; an IDP remains within the state.", explanation: "The categories carry different legal arrangements." },
    { prompt: "How can networks shape migration corridors?", solution: "Earlier migrants reduce information, housing, and job-search costs for later movers.", explanation: "Cumulative causation can sustain routes." },
    { prompt: "Why is a border more than a map line?", solution: "Rules and screening operate across institutions, places, and time.", explanation: "Bordering can occur remotely and inside states." },
  ],
  applications: [
    { title: "Labour policy", description: "Recruitment, credential recognition, worker rights, sector demand, and family policy shape outcomes." },
    { title: "Humanitarian response", description: "Protection depends on legal category, route risk, housing, documentation, and access to services." },
    { title: "Urban planning", description: "Arrival and departure alter housing demand, schools, transport, language services, and social networks." },
  ],
  questions: [
    mc("Which statement best distinguishes migration from commuting?", "Migration changes usual residence; commuting is repeated mobility without that change.", ["Commuting always crosses a state border.", "Migration must be permanent for life.", "Only migration has a destination."], "Definitions use residence and duration, though thresholds vary.", "easy", ["migration_definition"]),
    mc("Why can very low income constrain international migration?", "Movement requires resources, documents, information, and networks.", ["Poor households never want to move.", "Borders are open only to rural people.", "Distance becomes physically longer for them."], "Capability conditions who can act on migration aspirations.", "medium", ["migration_capability"]),
    mc("What is a migration-network effect?", "Earlier migrants lower some costs and risks for later migrants through connections.", ["Every migrant chooses the nearest destination.", "Networks eliminate border policy.", "Migration stops when information grows."], "Social ties help transmit information, credit, housing, and jobs.", "easy", ["network_effect"]),
    mc("Which person is internally displaced?", "Someone forced from home by conflict who relocates elsewhere within the same country", ["A tourist staying abroad for a week", "A recognised refugee who crossed a border", "A daily commuter"], "Internal displacement does not cross an international border.", "easy", ["displacement_category"]),
    mc("Why is ‘voluntary versus forced’ often a continuum?", "Choices can occur under severe constraints, mixed motives, and unequal alternatives.", ["Coercion never affects migration.", "All legal migrants move freely.", "Voluntary movement has no economic cause."], "Agency and compulsion can coexist.", "medium", ["forced_voluntary"]),
    mc("Which example shows a border operating away from the territorial line?", "An airline must check visas before allowing boarding.", ["A river changes course naturally.", "A map shows a contour line.", "A city builds a park."], "Carrier rules externalize border enforcement to departure points.", "medium", ["border_practice"]),
    mc("Why is ‘brain drain’ alone an incomplete account of skilled migration?", "Return, remittances, networks, training incentives, and skill circulation may also occur.", ["Skilled people never emigrate.", "Every origin gains equally.", "Education has no cost."], "Net effects vary by sector, institutions, duration, and distribution.", "hard", ["migration_impact"]),
    mc("What makes irregular migration especially difficult to measure?", "People may avoid official systems and move through changing, repeated, or hidden pathways.", ["Irregular migrants have no location.", "Censuses count only citizens everywhere.", "Borders erase demographic data."], "Administrative records are shaped by legal categories and enforcement contact.", "medium", ["migration_data"]),
    text("What term describes money or resources migrants send to people in their place of origin?", "remittances", ["a remittance", "remittance"], "Remittances can support consumption, education, health, investment, and foreign exchange, with varied effects.", "easy"),
    caseStudy("A drought-affected region experiences rising out-migration mainly among households with land, savings, and relatives abroad; the poorest remain exposed. Which interpretation is strongest?", "Environmental stress interacts with migration capability, networks, and inequality rather than moving everyone uniformly.", ["Drought has no migration effect.", "The poorest are least affected by drought.", "Every migrant has refugee status."], "Stress can increase desire to move while costs determine who can do so; immobility may be involuntary.", "Identify trapped populations and avoid attributing a multi-causal movement to climate alone."),
  ],
});

addLesson({
  id: "GEO_URBAN_001",
  name: "Urban systems, land use, and spatial inequality",
  domain: "Geography",
  subdomain: "Urban Geography",
  description: "Analyze cities as networked systems shaped by land markets, planning, infrastructure, segregation, informality, and unequal access.",
  prerequisites: ["GEO_GIS_001", "GEO_HUMAN_001"],
  tags: ["urbanization", "land_use", "housing", "transport", "segregation", "inequality"],
  theory: `Urbanization is an increasing share of population living in settlements classified as urban; urban growth is an increase in the number of urban residents or built area. Definitions of ‘urban’ vary by country and may use population, density, administrative status, employment, or built form, so comparisons require consistent criteria.

A city is not isolated. It exchanges people, goods, capital, energy, water, waste, information, and political influence with a wider region. Urban systems form hierarchies and networks: some places specialize, some provide higher-order services, and flows can bypass nearby settlements. A metropolitan labour and housing market often crosses municipal boundaries.

Land use reflects accessibility, regulation, infrastructure, historical investment, environmental conditions, and competing ability to pay. Bid-rent reasoning suggests that activities trade land cost against accessibility, but real cities include zoning, public housing, informal tenure, discrimination, heritage, topography, path dependence, and multiple centres. Models are starting points, not universal blueprints.

Agglomeration can raise productivity by sharing infrastructure, matching specialized labour, and spreading knowledge. It can also produce congestion, pollution, high rents, and exposure. These effects are distributed unevenly. A project that raises average property values can displace renters or informal users who do not capture the gain.

Segregation is the uneven spatial distribution of social groups. It can reflect income, discrimination, migration networks, housing policy, credit, tenure, school systems, violence, and preference operating under constraint. Measuring segregation requires attention to spatial units: the same population can appear more or less separated when boundaries or scale change.

Informality is not simply disorder outside the city. Informal housing and work often provide access when formal systems exclude, while residents may lack secure tenure, services, safety, and political recognition. Upgrading that improves infrastructure without forced displacement can be more equitable than clearance, but outcomes depend on rights and participation.

Accessibility measures the opportunities reachable within a cost in time, money, effort, safety, or eligibility. Mobility measures movement. A fast road can increase mobility while reducing local accessibility for people without cars. Good urban analysis asks who can reach which opportunities, at what times, by what mode, and with what burden.

Urban resilience should not mean only rapid recovery to a previous unequal condition. Transformative resilience asks whether adaptation reduces vulnerability and improves systems. Heat, flood, housing, transit, energy, and public-space strategies can generate benefits but also green gentrification if displacement risk is ignored.`,
  examples: [
    { prompt: "Distinguish urbanization and urban growth.", solution: "Urbanization is a rising urban share; urban growth is increasing urban population or extent.", explanation: "A country can experience one without the same rate of the other." },
    { prompt: "Why can a metropolitan issue exceed city boundaries?", solution: "Housing, labour, transport, water, and pollution systems cross municipalities.", explanation: "Functional urban regions follow flows rather than one administrative line." },
    { prompt: "Distinguish accessibility and mobility.", solution: "Accessibility is ability to reach opportunities; mobility is movement.", explanation: "More travel is not automatically better access." },
    { prompt: "Why can park investment cause green gentrification?", solution: "Environmental improvement may increase rents and displace vulnerable residents.", explanation: "Benefits and property-market effects must be considered together." },
  ],
  applications: [
    { title: "Housing policy", description: "Affordability depends on income, land, finance, supply, tenure security, location, services, and displacement." },
    { title: "Transport planning", description: "Accessibility analysis compares reachable jobs and services across modes, times, costs, and populations." },
    { title: "Climate adaptation", description: "Heat and flood projects should reduce exposure without shifting risk or displacing intended beneficiaries." },
  ],
  questions: [
    mc("Which statement correctly distinguishes urbanization and urban growth?", "Urbanization is a rising urban share; urban growth is an increase in urban population or built extent.", ["They are exact synonyms in all statistics.", "Urbanization means only taller buildings.", "Urban growth excludes migration."], "The measures use different denominators and can proceed at different rates.", "easy", ["urbanization_definition"]),
    mc("Why is a functional metropolitan region often larger than the central municipality?", "Commuting, housing, services, and infrastructure flows cross administrative borders.", ["Municipal borders are never mapped.", "All suburbs are politically independent states.", "Latitude increases outside the centre."], "Urban systems are organized by interaction as well as government boundaries.", "easy", ["functional_urban_region"]),
    mc("What does agglomeration economy describe?", "Benefits firms and workers gain from spatial proximity, sharing, matching, and learning", ["A guarantee that large cities have no congestion", "The conversion of rural land to a projection", "A policy banning specialization"], "Proximity can create productivity advantages alongside costs.", "medium", ["agglomeration"]),
    mc("Why is the simple bid-rent model insufficient as a full explanation of land use?", "Regulation, discrimination, multiple centres, history, tenure, and public investment also shape location.", ["Accessibility has no effect on land value.", "All land users pay identical rent.", "Cities have no path dependence."], "The model isolates one mechanism and must be contextualized.", "hard", ["urban_model_limits"]),
    mc("Which example improves mobility but may reduce accessibility for non-drivers?", "A high-speed road that severs walking routes and bus access", ["A frequent accessible bus connecting homes to jobs", "A nearby mixed-use clinic", "A safe pedestrian crossing"], "Faster vehicle movement does not guarantee that all people can reach opportunities.", "medium", ["mobility_accessibility"]),
    mc("What is spatial segregation?", "Uneven distribution of social groups across urban space", ["Any difference in building height", "The existence of neighbourhood names", "A temporary traffic closure"], "Segregation is measured across groups and spatial units and can arise through multiple institutions.", "easy", ["segregation"]),
    mc("Why can forced clearance of an informal settlement deepen disadvantage?", "It can remove social networks and access to jobs while relocating residents without secure alternatives.", ["Informal residents never work.", "Clearance automatically grants tenure.", "Distance has no livelihood effect."], "Housing quality must be considered with rights, location, services, and social infrastructure.", "medium", ["informality"]),
    mc("What is green gentrification?", "Environmental improvement contributes to rising costs and displacement of vulnerable residents.", ["Any planting of trees downtown", "A fall in land values after pollution", "A projection used for park maps"], "A benefit can be captured unevenly through housing markets.", "medium", ["green_gentrification"]),
    text("What term describes the number or quality of opportunities reachable within a given travel burden?", "accessibility", ["spatial accessibility"], "Accessibility focuses on reaching valued destinations, not movement for its own sake.", "easy"),
    caseStudy("A transit line cuts average commute time, but fares rise and station-area rents displace low-income households to poorly served outskirts. Which evaluation is strongest?", "Assess travel gains together with affordability, displacement, fare burden, and who retains access to stations.", ["The project is equitable because the citywide mean improved.", "Transit cannot affect housing markets.", "Displacement is irrelevant to accessibility."], "Average time obscures distribution; land and fare effects can move intended beneficiaries away from the improvement.", "Use disaggregated accessibility outcomes and identify anti-displacement or fare measures rather than treating them as external issues."),
  ],
});

addLesson({
  id: "GEO_ECON_001",
  name: "Resources, trade, and global production networks",
  domain: "Geography",
  subdomain: "Economic Geography",
  description: "Trace production through places and networks, distinguish comparative advantage from power, and evaluate resource and trade dependencies.",
  prerequisites: ["GEO_HUMAN_001", "GEO_HUMAN_002", "GEO_CART_001"],
  tags: ["economic_geography", "trade", "resources", "supply_chain", "development", "globalization"],
  theory: `Economic geography examines where production, work, investment, consumption, and infrastructure are located and how places are linked. Location reflects transport cost, labour, skills, energy, land, markets, institutions, taxes, risk, knowledge, and historical concentration. Digital exchange changes some constraints but still relies on material data centres, cables, electricity, devices, and labour.

Comparative advantage shows how specialization can create mutual gains when opportunity costs differ. It does not prove that every trade pattern is fair, stable, environmentally sustainable, or beneficial to every group. Market power, adjustment costs, labour rights, subsidies, exchange rates, strategic policy, and unequal ownership shape distribution.

Production is organized through global production networks rather than simple country-to-country exchange. Design, finance, inputs, assembly, logistics, marketing, repair, and disposal may occur in different places under firms with unequal control. Value captured in a place depends on capabilities, contracts, ownership, standards, bargaining, and the ability to upgrade.

Transport networks create corridors, hubs, chokepoints, and hinterlands. Containerization lowered handling cost and changed port geography, but shipping remains sensitive to canals, straits, port capacity, fuel, labour, security, and weather. Redundancy increases resilience but can reduce short-term efficiency.

Resources are not merely natural endowments. A material becomes a resource through technology, demand, knowledge, institutions, and price. Reserve estimates change with feasibility. Extractive regions may gain revenue and infrastructure yet face volatility, ecological damage, displacement, corruption, or weak linkages—the so-called resource curse is a risk pattern, not an inevitable law.

Development should not be reduced to GDP. Income, health, education, security, freedom, environmental quality, unpaid care, distribution, and resilience matter. Purchasing-power adjustments aid comparison but do not erase inequality or non-market life. Composite indices clarify some dimensions while embedding choices about indicators and weights.

Supply-chain analysis should follow material, value, risk, and responsibility. A low consumer price may depend on externalized pollution or precarious work elsewhere. Conversely, abrupt divestment can harm workers it aims to protect. Effective change often combines standards, enforcement, worker voice, transparency, remediation, and feasible transition pathways.`,
  examples: [
    { prompt: "Why can two countries gain from trade even if one is more productive in everything?", solution: "Opportunity costs can differ, creating comparative advantage.", explanation: "Relative, not only absolute, productivity matters in the model." },
    { prompt: "Name a supply-chain chokepoint.", solution: "A canal, strait, port, pipeline junction, or critical supplier", explanation: "Concentrated flow creates systemic exposure." },
    { prompt: "Why is a mineral not automatically an economic resource?", solution: "Technology, demand, access, institutions, and price determine feasibility.", explanation: "Resource status is historically and socially produced." },
    { prompt: "Why can GDP growth coexist with worsening welfare for some groups?", solution: "Distribution, costs, unpaid work, health, or environment may change differently.", explanation: "An aggregate output measure does not capture every outcome." },
  ],
  applications: [
    { title: "Supply-chain resilience", description: "Firms and governments map tiered suppliers, chokepoints, inventories, substitutes, and recovery options." },
    { title: "Industrial policy", description: "Skills, infrastructure, finance, standards, research, and procurement can influence where value is captured." },
    { title: "Responsible sourcing", description: "Traceability is paired with worker rights, environmental monitoring, remedy, and transition support." },
  ],
  questions: [
    mc("What is comparative advantage based on?", "Differences in opportunity cost", ["Absolute population size only", "Having no imports", "Equal wages everywhere"], "Specialization can be advantageous according to what each producer gives up.", "easy", ["comparative_advantage"]),
    mc("Why does comparative advantage not settle whether trade is fair?", "The model does not determine bargaining power, distribution, labour standards, adjustment, or environmental cost.", ["Opportunity cost cannot be calculated.", "Trade has no geographic effects.", "All gains are necessarily equal."], "Efficiency gains and distributional outcomes are separate questions.", "hard", ["model_limits"]),
    mc("What is a global production network?", "A geographically distributed system linking activities, firms, institutions, and value capture", ["Only the route of a finished export", "A world map of currencies", "A single factory with no suppliers"], "Production involves coordinated stages and governance across places.", "easy", ["production_network"]),
    mc("Why can a transport chokepoint create global risk?", "A large share of flow depends on a narrow route or facility with limited substitutes.", ["Chokepoints make goods weightless.", "They guarantee low freight prices.", "They affect only nearby consumers."], "Concentration turns local disruption into network-wide delay and shortage.", "medium", ["chokepoint"]),
    mc("Which strategy usually increases supply-chain redundancy?", "Maintaining qualified suppliers or routes in more than one location", ["Removing all inventories", "Relying on one port", "Hiding supplier information"], "Redundancy creates alternatives, though it carries cost.", "easy", ["resilience_efficiency"]),
    mc("Why are resource reserves not fixed physical totals?", "Economic feasibility changes with technology, price, access, and regulation.", ["Minerals reproduce annually.", "Geology changes when markets open.", "Reserve means every atom in the crust."], "A reserve is the recoverable portion under defined conditions.", "medium", ["resource_definition"]),
    mc("Which statement treats the resource curse carefully?", "Resource dependence can create governance and volatility risks, but outcomes vary with institutions and policy.", ["Natural resources inevitably cause poverty.", "Extraction always guarantees development.", "Institutions have no effect on revenue."], "The concept identifies mechanisms and recurring risks, not destiny.", "medium", ["resource_curse"]),
    mc("Why is GDP per person an incomplete measure of development?", "It omits distribution and many health, freedom, care, security, and environmental outcomes.", ["GDP contains no economic information.", "Population cannot be counted.", "Development is only climate."], "GDP is useful for output but not a comprehensive welfare measure.", "easy", ["development_measure"]),
    text("What term describes the geographic area connected economically to a transport hub or port?", "hinterland", ["the hinterland"], "A hub’s hinterland supplies and receives flows through its inland connections.", "easy"),
    caseStudy("A company responds to documented labour abuse by immediately cancelling every supplier in one low-income region, with no remediation or worker consultation. Which assessment is strongest?", "Accountability is necessary, but abrupt exit can shift harm to workers; remediation, worker voice, enforcement, and responsible transition should be assessed.", ["Labour abuse should be ignored to preserve jobs.", "Cancellation always improves worker welfare.", "Consumers have no connection to production conditions."], "Responsible sourcing should change harmful conditions without treating affected workers as disposable.", "Identify power asymmetries and require measurable remedy rather than substituting public-relations action for due diligence."),
  ],
});

addLesson({
  id: "GEO_POL_001",
  name: "States, nations, territory, and geopolitics",
  domain: "Geography",
  subdomain: "Political Geography",
  description: "Distinguish state, nation, sovereignty, borders, and territory while analyzing geopolitical claims across scales and perspectives.",
  prerequisites: ["GEO_HUMAN_002", "GEO_ECON_001"],
  tags: ["political_geography", "state", "nation", "territory", "borders", "geopolitics"],
  theory: `A state is a political organization claiming authority over a territory and population and participating in an international system. A nation is a community imagined through shared identity, history, culture, language, political project, or belonging. Nation and state do not map neatly onto each other: states can be multinational, nations can span states, and stateless nations can pursue autonomy or recognition.

Sovereignty is the claim to supreme authority within a territory and recognition of external independence, but in practice it is negotiated and uneven. Treaties, federations, supranational institutions, occupation, contested legitimacy, debt, corporate power, and interdependence complicate an image of perfectly sealed states.

Territory is space organized through power, law, identity, and control. Territoriality occurs at many scales: household, neighbourhood, Indigenous homeland, municipality, state, maritime zone, or digital infrastructure. A boundary is a legal or administrative division; a frontier is often a zone of interaction and changing control. Boundaries can be delimited in text, demarcated on the ground, administered, and disputed.

Border effects are selective. Borders can impede some people or goods while facilitating others through trade agreements, visas, customs, infrastructure, or special zones. Borderlands develop cross-border livelihoods and identities that a centre-focused map may miss. Hardening a border can redirect movement and risk rather than end it.

Geopolitics examines how power, strategy, resources, identity, and geographic imaginations shape international relations. Classical geopolitical claims sometimes treated location as destiny and were used to legitimize expansion. Critical geopolitics studies how leaders, media, experts, and maps construct regions, threats, and ‘natural’ interests.

Maritime claims use legal concepts such as territorial seas and exclusive economic zones, but overlapping coastlines, islands, historical claims, fisheries, navigation, and resources generate disputes. A map of a claim is not evidence that the claim is accepted. Source, legal basis, recognition, and competing representations must be stated.

Scale changes political interpretation. A dam may be national development, regional displacement, local livelihood loss, and transboundary water leverage at the same time. Good political geography compares actors, evidence, jurisdiction, historical context, and who has the power to define the map.`,
  examples: [
    { prompt: "Distinguish state and nation.", solution: "A state is a territorial political organization; a nation is a community of collective identity or political belonging.", explanation: "They overlap in some cases but are not synonyms." },
    { prompt: "Why is sovereignty not absolute in practice?", solution: "Authority is shaped by recognition, law, interdependence, internal contestation, and unequal power.", explanation: "Formal claims and effective control can differ." },
    { prompt: "How can a border both block and enable?", solution: "Rules selectively restrict some flows while facilitating authorized trade or mobility.", explanation: "Border effects differ by person, commodity, and status." },
    { prompt: "Why is a claim map not neutral proof?", solution: "It visualizes one actor’s asserted territory and may omit legal dispute or competing claims.", explanation: "Map source and status matter." },
  ],
  applications: [
    { title: "Conflict analysis", description: "Territorial claims are assessed through history, law, identity, resources, security, and local populations." },
    { title: "Cross-border planning", description: "Transport, watersheds, pollution, trade, and communities require coordination across jurisdictions." },
    { title: "Map literacy", description: "Political maps should distinguish effective control, legal claim, recognition, and disputed boundaries." },
  ],
  questions: [
    mc("Which statement best distinguishes a state from a nation?", "A state is a territorial political organization; a nation is a community of collective identity or political project.", ["They are exact synonyms.", "A nation must have internationally recognized borders.", "A state is only a cultural group."], "Political authority and collective identity may overlap but do not always coincide.", "easy", ["state_nation"]),
    mc("What does sovereignty describe?", "A claim to supreme territorial authority and external independence", ["A guarantee of equal power among states", "A type of map projection", "Any cross-border cultural identity"], "Sovereignty is a legal-political claim whose practical exercise varies.", "easy", ["sovereignty"]),
    mc("Which term best describes a broad zone of interaction and shifting control rather than a precisely delimited line?", "Frontier", ["Datum", "Isoline", "Census tract"], "Frontiers are often zones; boundaries are formal divisions.", "easy", ["boundary_frontier"]),
    mc("Why can stronger border enforcement redirect rather than eliminate movement?", "People and networks adapt routes, timing, intermediaries, and risk.", ["Borders have no legal effect.", "Every traveller has the same passport.", "Distance disappears near borders."], "Control reshapes spatial strategies and may increase danger.", "medium", ["border_effect"]),
    mc("What does critical geopolitics examine?", "How discourse, media, expertise, and maps construct geopolitical regions and threats", ["Only the physical size of armies", "The claim that location mechanically determines policy", "Weather forecasts for capitals"], "Geopolitical ideas are produced and used, not merely read from terrain.", "medium", ["critical_geopolitics"]),
    mc("Which statement about a map of a disputed maritime claim is most responsible?", "It should identify the claimant, legal status, and competing claims.", ["The drawn line proves universal recognition.", "All maritime claims extend without limit.", "Map scale resolves legal validity."], "Visualization of an assertion must not be confused with settled jurisdiction.", "medium", ["claim_map"]),
    mc("How can borders be selective institutions?", "They facilitate some authorized flows while restricting others by status and category.", ["They affect every person and good identically.", "They exist only at physical checkpoints.", "They cannot influence trade."], "Visa, customs, trade, and security regimes filter movement unevenly.", "easy", ["selective_border"]),
    mc("Why can one dam generate conflicting geographic narratives?", "Benefits and costs differ by scale, jurisdiction, livelihood, and power.", ["Water flows in only one direction.", "National maps contain no rivers.", "Infrastructure has no local effects."], "National energy, downstream water, local displacement, and transboundary relations can coexist.", "hard", ["scale_politics"]),
    text("What term describes a political community whose claimed national identity lacks its own sovereign state?", "stateless nation", ["a stateless nation"], "Stateless nations may be divided among states or seek autonomy, recognition, or statehood.", "medium"),
    caseStudy("A viral map shows a disputed border as an uncontested solid line and cites no source. Which response is strongest?", "Treat it as a political representation; verify source, effective control, legal positions, recognition, and local perspectives.", ["Accept it because maps are objective records.", "Reject all maps of disputed places.", "Use colour intensity to decide sovereignty."], "Cartographic certainty can erase contestation. Verification requires multiple types of evidence and explicit status.", "Separate describing claims from endorsing them and avoid exposing vulnerable local people through careless data."),
  ],
});

addLesson({
  id: "GEO_RISK_001",
  name: "Hazard, vulnerability, resilience, and climate adaptation",
  domain: "Geography",
  subdomain: "Risk and Environment",
  description: "Treat disaster risk as an interaction among hazard, exposure, vulnerability, capacity, and decision-making under uncertainty.",
  prerequisites: ["GEO_GIS_001", "GEO_PHYS_003", "GEO_PHYS_004", "GEO_URBAN_001"],
  tags: ["hazard", "risk", "vulnerability", "resilience", "adaptation", "justice"],
  theory: `A hazard is a potentially damaging physical event or process. Exposure describes people, ecosystems, infrastructure, or assets located where they may be affected. Vulnerability is susceptibility to harm, shaped by sensitivity and the ability to anticipate, cope, recover, or transform. Disaster risk emerges from their interaction; a hazard without exposure need not become a disaster.

Vulnerability is produced historically. Income, housing, health, disability, age, discrimination, tenure, infrastructure, political voice, colonial legacies, and access to warnings or insurance influence harm. Calling a disaster ‘natural’ can hide the decisions that placed people in danger or denied them protection.

Risk can be represented as probability and consequence, but both are distributions rather than single certain values. Return period is often misunderstood: a ‘100-year flood’ has about a 1% chance in any given year under the estimated stationary distribution, not a guarantee of one event per century. Multiple such floods can occur close together, and climate or land-use change can make historical probabilities obsolete.

Risk perception differs with experience, trust, culture, dread, control, memory, and communication. People may rationally remain in exposed places because of livelihoods, family, housing constraints, identity, or weak alternatives. Effective warning must be trusted, understood, actionable, accessible, and connected to safe options.

Risk reduction includes avoiding new exposure, reducing existing exposure, lowering vulnerability, protecting critical systems, preparing response, financing recovery, and restoring protective ecosystems. Structural measures such as dams and barriers can help but have design limits, maintenance needs, ecological effects, and residual failure risk. Non-structural measures include land-use planning, codes, education, warnings, evacuation, insurance, and social protection.

Resilience can mean the ability to absorb disruption, recover, adapt, or transform. ‘Bouncing back’ is inadequate when the previous state was unsafe or unjust. Transformative resilience changes institutions and spatial arrangements that reproduce risk. Yet resilience language can be abused to shift responsibility from governments and firms onto households expected to endure harm.

Climate adaptation responds to actual or expected climate effects. Maladaptation reduces risk for one group or timescale while increasing it elsewhere—for example, a seawall that transfers erosion, excludes access, or encourages more exposure behind it. Just adaptation examines distribution, recognition, participation, responsibility, and capacity across generations and places.

Good decisions under uncertainty use robust strategies, scenarios, monitoring, flexible pathways, and explicit thresholds for changing course. Waiting for perfect prediction is itself a decision with consequences.`,
  examples: [
    { prompt: "Why can equal storms produce unequal disasters?", solution: "Exposure, vulnerability, capacity, and prior conditions differ.", explanation: "Physical magnitude is only one component of risk." },
    { prompt: "Interpret a 100-year flood.", solution: "Approximately 1% annual exceedance probability under stated assumptions.", explanation: "It is not a schedule." },
    { prompt: "Give an example of maladaptation.", solution: "Protection that shifts flooding downstream or encourages unsafe development.", explanation: "Risk is reduced for one group while increased elsewhere or later." },
    { prompt: "What makes a warning effective?", solution: "It must be timely, trusted, understood, accessible, and actionable.", explanation: "Information alone is insufficient without feasible protective action." },
  ],
  applications: [
    { title: "Emergency management", description: "Preparedness connects monitoring, communication, evacuation, shelter, continuity, and recovery support." },
    { title: "Infrastructure pathways", description: "Flexible designs use triggers and staged investment as conditions and knowledge change." },
    { title: "Climate justice", description: "Adaptation planning examines who caused, experiences, decides, pays for, and benefits from interventions." },
  ],
  questions: [
    mc("Which statement best distinguishes hazard and disaster?", "A hazard is a potentially damaging process; disaster results when it interacts with exposed and vulnerable systems.", ["Every hazard is automatically a disaster.", "Disasters have no physical component.", "Hazard means financial loss only."], "Risk arises through interaction, not physical process alone.", "easy", ["hazard_disaster"]),
    mc("Which factor is an example of vulnerability rather than hazard intensity?", "Insecure housing with no safe evacuation option", ["Peak wind speed", "Earthquake magnitude", "Rainfall intensity"], "Housing and options shape susceptibility and coping capacity.", "easy", ["vulnerability_component"]),
    mc("What does a ‘100-year flood’ usually mean?", "About a 1% annual exceedance probability under the estimated conditions", ["Exactly one flood every 100 years", "No flood risk for 99 years after an event", "A flood lasting 100 years"], "Return period is the inverse of annual exceedance probability, not a schedule.", "medium", ["return_period"]),
    num("Assuming independent stationary years and a 1% annual flood probability, what is the approximate probability of at least one such flood over 30 years? Enter a decimal.", 0.2603, "1 − (0.99)^30 ≈ 0.2603, or about 26%.", "hard", 0.005, ["cumulative_probability"]),
    mc("Why might a person remain in a high-risk floodplain?", "Livelihood, kin, identity, housing constraints, and inadequate alternatives may outweigh feasible choices.", ["Risk information never matters.", "People always prefer danger.", "Floodplains have no economic value."], "Risk behaviour is shaped by options and social context, not ignorance alone.", "medium", ["risk_perception"]),
    mc("Which feature is necessary for an effective warning?", "Recipients can understand it and take a feasible protective action.", ["It uses technical language only.", "It maximizes alarm regardless of evidence.", "It arrives after impact."], "Warnings require communication, trust, access, and capability.", "easy", ["warning_effectiveness"]),
    mc("Which intervention is potentially maladaptive?", "A flood barrier that transfers water downstream and stimulates dense development behind it", ["A monitored evacuation plan with accessible transport", "Restoring upstream storage after consultation", "Updating building codes for changing extremes"], "Local short-term protection can increase wider or future exposure.", "medium", ["maladaptation"]),
    mc("What distinguishes transformative resilience from simple recovery?", "It changes structures that repeatedly produce vulnerability and risk.", ["It restores every pre-disaster condition unchanged.", "It shifts all responsibility to households.", "It eliminates uncertainty."], "Transformation asks whether returning to the prior state would reproduce harm.", "medium", ["transformative_resilience"]),
    text("What term describes people, infrastructure, or assets located where a hazard may affect them?", "exposure", ["hazard exposure"], "Exposure concerns presence in the affected area; vulnerability concerns susceptibility and capacity.", "easy"),
    caseStudy("A coastal adaptation plan protects a wealthy business district with a wall that redirects surge toward lower-income neighbourhoods excluded from planning. Which judgment is strongest?", "The plan is unjust and potentially maladaptive because it redistributes risk without inclusive decision-making.", ["It is successful because protected property value is high.", "Surge direction is not geographic.", "Participation is irrelevant when engineering works."], "Risk reduction for one group cannot be evaluated without transferred hazard, unequal vulnerability, and procedural justice.", "Propose alternatives or compensation and identify distribution, recognition, participation, and long-term residual risk."),
  ],
});

addLesson({
  id: "GEO_SYNTH_001",
  name: "Regional synthesis: evidence, scale, and place",
  domain: "Geography",
  subdomain: "Regional Synthesis",
  description: "Build a defensible regional explanation by integrating physical systems, population, economy, politics, risk, maps, and uncertainty.",
  prerequisites: ["GEO_CART_002", "GEO_GIS_001", "GEO_PHYS_004", "GEO_URBAN_001", "GEO_ECON_001", "GEO_POL_001", "GEO_RISK_001"],
  tags: ["regional_geography", "synthesis", "evidence", "scale", "comparison", "causal_reasoning"],
  mastery: { review_after_days_if_mastered: 14, review_after_days_if_learning: 4 },
  theory: `Regional geography synthesizes processes in a particular spatial context. It does not treat regions as sealed containers with one essence. A region is selected for a question and connected to wider networks, histories, and environments. The same place can belong to climatic, economic, linguistic, watershed, and political regions with different boundaries.

A strong regional study begins with a question, not a catalogue of facts. ‘Why has flood risk increased unevenly across this metropolitan delta?’ is more productive than ‘Describe the delta.’ The question identifies an outcome, a spatial pattern, a timescale, and a need to compare mechanisms.

Build an evidence architecture. Reference maps establish location and boundaries. Thematic maps show distributions. Time series establish change. Remote sensing can reveal land cover; censuses and surveys describe populations; fieldwork and interviews reveal practices and meanings; policy and historical records identify institutions. Each source has coverage, scale, definitions, uncertainty, and power relations.

Triangulation compares independent evidence. Agreement can strengthen an interpretation; disagreement can reveal scale mismatch, measurement error, temporal change, or competing meanings. More data do not automatically produce better explanation if sources reproduce the same bias.

Causal reasoning requires mechanisms and comparison. Spatial correlation can suggest hypotheses but neighbouring values may be similar because of shared context, diffusion, selection, or data construction. Ask what evidence would be expected if each proposed mechanism were true, and seek cases or times where alternatives diverge.

Scale and connection prevent container thinking. A factory district is shaped by local zoning and labour, national policy, global demand, finance, migration networks, and physical infrastructure. A drought’s effect depends on household assets, water governance, markets, conflict, and mobility—not precipitation alone.

Regional narratives must represent people without freezing cultures or presenting one voice as the whole place. Identify who produces knowledge, whose categories are used, and who is absent. Indigenous, local, administrative, scientific, and corporate spatial understandings may overlap or conflict.

Communicate conclusions with calibrated confidence. Separate observation, inference, and value judgment. State what is well supported, what remains uncertain, what scale the claim applies to, and which evidence could change it. A useful synthesis closes with implications and trade-offs rather than pretending complex systems have one inevitable future.`,
  examples: [
    { prompt: "Improve the question ‘Describe the coast.’", solution: "Why has erosion risk shifted among settlements since harbour construction, and who bears the consequences?", explanation: "The revision defines pattern, time, mechanism, and distribution." },
    { prompt: "What is triangulation?", solution: "Comparing evidence from different methods or sources to test an interpretation.", explanation: "Agreement and disagreement both provide information." },
    { prompt: "Why does correlation between poverty and flood exposure not by itself establish cause?", solution: "Selection, housing markets, policy, history, and measurement may produce the association.", explanation: "A mechanism and comparison are required." },
    { prompt: "How should uncertainty appear in a conclusion?", solution: "As a calibrated statement of confidence, limits, and evidence that could alter the claim.", explanation: "Uncertainty is part of the result, not a reason to hide the analysis." },
  ],
  applications: [
    { title: "Regional briefing", description: "Decision-makers need integrated explanations linking maps, trends, mechanisms, affected groups, and uncertainty." },
    { title: "Field research", description: "Sampling, observation, interviews, ethics, and positionality connect lived place with spatial datasets." },
    { title: "Agent-assisted learning", description: "A tutor can challenge causal claims, request scale checks, compare sources, and review a transparent synthesis." },
  ],
  questions: [
    mc("What makes a regional research question analytically strong?", "It defines an outcome, spatial pattern, timescale, and mechanisms to investigate.", ["It asks for every fact about a place.", "It assumes the region is isolated.", "It avoids comparison."], "A focused question structures evidence and explanation.", "easy", ["research_question"]),
    mc("What is triangulation?", "Comparing evidence from different sources or methods to test an interpretation", ["Using three colours on a map", "Averaging all values regardless of definition", "Selecting only sources that agree"], "Independent strengths and weaknesses help assess robustness.", "easy", ["triangulation"]),
    mc("Two datasets disagree about urban population. What is the best first response?", "Compare definitions, dates, boundaries, methods, and uncertainty.", ["Choose the larger value automatically.", "Assume one author acted dishonestly.", "Average them before checking metadata."], "Apparent conflict often reflects measurement frames rather than simple error.", "medium", ["source_comparison"]),
    mc("Why is spatial correlation insufficient for causal explanation?", "Shared context, selection, diffusion, autocorrelation, or data construction may produce association.", ["Spatial data cannot show patterns.", "Causation never has a location.", "Every correlation is random."], "A mechanism and discriminating evidence are needed.", "hard", ["causal_inference"]),
    mc("Which statement avoids treating a region as a sealed container?", "Local outcomes are linked to multi-scalar flows, institutions, histories, and environments.", ["Every outcome originates inside the boundary.", "Regional culture is uniform and timeless.", "External networks are irrelevant."], "Places are constituted through connections as well as local conditions.", "medium", ["container_thinking"]),
    mc("What does positionality ask a researcher to examine?", "How their social position, relationships, assumptions, and power shape knowledge production", ["Only the latitude of field sites", "Whether all interviews use identical words", "How to remove all interpretation from research"], "Research relationships influence access, categories, interpretation, and ethics.", "medium", ["positionality"]),
    mc("Which sentence properly separates observation from inference?", "Observed flood claims rose after 2015; land-cover change is one plausible contributor requiring further testing.", ["Flood claims rose, proving one new road caused climate change.", "The map speaks for itself and needs no interpretation.", "No conclusion is possible whenever uncertainty exists."], "The statement reports evidence and calibrates the proposed mechanism.", "medium", ["claim_calibration"]),
    mc("Why can disagreement among sources be analytically useful?", "It may reveal scale mismatch, changing conditions, different definitions, or competing perspectives.", ["It proves data collection is pointless.", "Only the oldest source should remain.", "Disagreement always cancels both sources."], "Conflict can direct attention to how knowledge and categories are produced.", "medium", ["evidence_disagreement"]),
    text("What term describes comparing multiple independent methods or sources to strengthen an interpretation?", "triangulation", ["evidence triangulation", "methodological triangulation"], "Triangulation tests whether a conclusion survives different evidence limitations.", "easy"),
    caseStudy("A regional report attributes declining farm income entirely to lower rainfall because the two trends coincide. It ignores crop prices, debt, irrigation access, land tenure, and policy changes. Which revision is strongest?", "Treat rainfall as one hypothesis and compare climatic, market, institutional, and household mechanisms across places and time.", ["Keep the single cause because physical data are objective.", "Remove rainfall because social causes are always stronger.", "Replace the report with a descriptive map only."], "Coincident trends do not identify a sole cause; interacting biophysical and political-economic processes require discriminating evidence.", "Specify comparisons or counterfactual evidence, acknowledge interaction, and state the scale and confidence of any conclusion."),
  ],
});

const geographySubject = {
  id: "SUBJECT_GEOGRAPHY",
  name: "Geography",
  short_name: "Geography",
  icon: "◎",
  description: "Spatial inquiry across Earth systems, cartography, population, cities, economies, territory, and risk.",
  theme: {
    paper: "#eef3f2",
    paperDeep: "#dce7e4",
    paperLight: "#fbfdfc",
    ink: "#172521",
    muted: "#61706b",
    line: "#c5d4d0",
    primary: "#164d58",
    primaryAlt: "#237080",
    tint: "#afd8d4",
    highlight: "#f0d98a",
    accent: "#d66b47",
  },
};

const mathSkillIds = lessons.filter((lesson) => lesson.subjectId === "SUBJECT_MATH").map((lesson) => lesson.id);
const geographySkillIds = lessons.filter((lesson) => lesson.subjectId === "SUBJECT_GEOGRAPHY").map((lesson) => lesson.id);
if (mathSkillIds.length !== 3) throw new Error(`Expected 3 Mathematics bridge lessons, found ${mathSkillIds.length}.`);
if (geographySkillIds.length !== 15) throw new Error(`Expected 15 Geography lessons, found ${geographySkillIds.length}.`);

const allSkillIds = new Set(lessons.map((lesson) => lesson.id));
for (const lesson of lessons) {
  for (const prerequisite of lesson.prerequisites) {
    if (!allSkillIds.has(prerequisite) && !prerequisite.startsWith("MATH_")) throw new Error(`${lesson.id} has unknown prerequisite ${prerequisite}.`);
  }
}

const payload = {
  format: "quickmaths.built-in-curriculum",
  schema_version: "1.0",
  subjects: [geographySubject],
  track: {
    skills: [...mathSkillIds, ...geographySkillIds],
    entry_skills: ["GEO_FOUND_001"],
    exit_skills: ["MATH_GEOM_003", "GEO_SYNTH_001"],
  },
  skills: lessons.map(({ questions, ...lesson }) => lesson),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath} with ${geographySkillIds.length} Geography lessons, ${mathSkillIds.length} Mathematics bridge lessons, and ${lessons.reduce((count, lesson) => count + lesson.problems.length, 0)} questions.`);
