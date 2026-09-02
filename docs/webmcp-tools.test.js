import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

import { DEFAULT_SUBJECT, LESSON_SET_FORMAT, createQuickMathsStore } from "./challenge-core.js";
import { buildToolDefinitions, registerWebMcpTools, TOOL_NAMES } from "./webmcp-tools.js";

const curriculum = JSON.parse(readFileSync(new URL("./curriculum-data.json", import.meta.url), "utf8"));
const agentManifest = JSON.parse(readFileSync(new URL("./agent-manifest.json", import.meta.url), "utf8"));
const educatorManifest = JSON.parse(readFileSync(new URL("./educator-agent-manifest.json", import.meta.url), "utf8"));
const geographyLessonSet = readFileSync(new URL("./lesson-depot/lessons/geography/1.0.0/lesson-set.json", import.meta.url), "utf8");

function createStore({ profile = true } = {}) {
  const values = new Map();
  const store = createQuickMathsStore({
    storage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
    },
    curriculum,
    now: () => new Date("2026-09-01T09:42:00.000Z"),
  });
  if (profile) store.createProfile("Agent Learner");
  return store;
}

function toolsFor(store) {
  return Object.fromEntries(buildToolDefinitions(store, agentManifest, null, null, educatorManifest).map((tool) => [tool.name, tool]));
}

function nativeImprovement(store) {
  const source = structuredClone(store.skillsById.MATH_ARITH_001);
  return {
    format: LESSON_SET_FORMAT, schema_version: "2.0", mode: "override",
    id: "PACK_IMPROVE_MATH_ARITH_001", name: "Improved integer operations",
    description: "A reversible native lesson improvement.", author: "Agent author", version: "1.0.0",
    subject: { ...structuredClone(DEFAULT_SUBJECT), short_name: DEFAULT_SUBJECT.shortName },
    track: { skills: [source.id] },
    skills: [{ ...source, name: "Integer operations · improved" }],
  };
}

test("browser shell exposes Settings, Lesson Depot, map zoom, prompt copy, and persistent Agent Studio controls", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./challenge.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("./challenge.css", import.meta.url), "utf8");
  const community = readFileSync(new URL("./github-community.js", import.meta.url), "utf8");
  const communityCallback = readFileSync(new URL("./community-auth.html", import.meta.url), "utf8");
  const educatorGuideSource = readFileSync(new URL("./EDUCATOR_GUIDE.md", import.meta.url), "utf8");
  const educatorPdfUrl = new URL("./QuickMaths-Educator-Guide.pdf", import.meta.url);
  assert.match(html, /data-route="settings"/);
  assert.match(html, /data-route="depot"/);
  assert.match(js, /renderLessonDepot/);
  assert.match(js, /renderLessonHubTabs/);
  assert.match(js, /button\.closest\("\.mobile-nav"\) && route === "creator"/);
  assert.doesNotMatch(html, /class="mode-switch"|id="replay-tutorial"/);
  assert.match(js, /data-action="map-zoom-in"/);
  assert.match(js, /data-map-scope="all"/);
  assert.match(js, /map-subject-lane/);
  assert.match(js, /map-node-status-dot/);
  assert.match(js, /What your proof must cover/);
  assert.match(js, /workResponsePlaceholder/);
  assert.match(js, /review-question-select/);
  assert.match(js, /attempt\.results\.findIndex\(\(item\) => item\.questionId === result\.questionId\) \+ 1/);
  assert.match(js, /resultReviewGuide/);
  assert.match(js, /MAP_ZOOM_MIN = 0\.1/);
  assert.doesNotMatch(js, /Math\.min\(5/);
  assert.match(js, /authored scenarios are included/);
  assert.match(js, /addEventListener\("pointermove"/);
  assert.match(js, /startDistance/);
  assert.match(js, /data-tutorial-action="copy-agent-prompt"/);
  assert.match(html, /id="welcome-lesson-count">…<\/strong> connected lessons/);
  assert.doesNotMatch(html, /<strong>25<\/strong> connected skills/);
  assert.match(html, /Local-first mastery learning/);
  assert.match(html, /id="welcome-storage-restore"/);
  assert.match(html, /id="welcome-educator-path"/);
  assert.match(html, /id="educator-welcome-root"/);
  assert.match(html, /QuickMaths-Educator-Guide\.pdf/);
  assert.match(html, /educator-agent-manifest\.json/);
  assert.match(html, /id="welcome-curriculum-url-form"/);
  assert.match(html, /data-route="curriculum"/);
  assert.match(css, /\.welcome-storage-restore \{[^}]*border-radius: 14px;[^}]*background:/);
  assert.match(css, /\.welcome-storage-restore > summary strong \{ font-size: 15px/);
  assert.match(js, /QuickMaths is for learning and practice/);
  assert.match(js, /get_educator_agent_manifest/);
  assert.match(js, /data-action="copy-educator-prompt"/);
  assert.match(js, /data-action="dismiss-educator-welcome"/);
  assert.match(js, /completeEducatorWelcome/);
  assert.doesNotMatch(js, /Attempts per lesson/);
  assert.match(html, /id="app-shell" class="app-shell agent-collapsed"/);
  assert.match(html, /id="agent-dock" class="agent-dock is-closed"/);
  assert.doesNotMatch(html, /QuickMaths turns \d+ connected lessons across \d+ installed subjects/);
  assert.match(js, /snapshot\.curriculum\.allSkills\.length/);
  assert.match(js, /Get the QuickMaths agent guide summary/);
  assert.match(js, /visual: "depot"/);
  assert.match(js, /GitHub Bridge/);
  assert.match(css, /\.tour-depot-preview/);
  assert.match(js, /Subject selector/);
  assert.match(js, /Changes the visible curriculum, mastery map, and color theme/);
  assert.match(js, /Native improvements are reversible from Settings without erasing progress/);
  assert.match(js, /Create \/ improve/);
  assert.match(css, /\.welcome-brand \{[^}]*"Times New Roman"/);
  assert.match(css, /\.sidebar-brand strong \{[^}]*"Times New Roman"/);
  assert.match(css, /touch-action: none/);
  assert.match(css, /\.map-scope-control/);
  assert.match(css, /\.map-edges \.is-cross-subject/);
  assert.match(css, /\.map-node \.map-node-subject-accent/);
  assert.match(css, /\.studio-student-preview/);
  assert.match(css, /\.lesson-hub-tabs/);
  assert.match(css, /\.studio-question-roadmap/);
  assert.match(css, /\.studio-response-picker/);
  assert.match(css, /\.studio-proof-anatomy/);
  assert.match(css, /\.studio-proof-contrast/);
  assert.match(css, /\.studio-native-picker/);
  assert.match(css, /\.studio-override-note/);
  assert.match(css, /tool-failed/);
  assert.match(js, /restore-native-lessons/);
  assert.match(js, /Lesson sets and native improvements/);
  assert.match(css, /\.studio-help\[aria-expanded="true"\]/);
  assert.match(css, /\.result-review-guide/);
  assert.match(css, /\.map-layout \{[^}]*align-items: start;[^}]*min-height: 0;/);
  assert.match(css, /\.map-scroll \{[^}]*width: 100%;[^}]*height: clamp\(420px, 62svh, 560px\);[^}]*contain: layout paint;/);
  assert.match(css, /height: clamp\(300px, 60svh, 540px\); max-height: none; contain: layout paint/);
  assert.match(js, /scroller\.scrollLeft = gesture\.startScrollLeft - deltaX;\s+scroller\.scrollTop = gesture\.startScrollTop - deltaY;/);
  assert.match(js, /pressedSkillId/);
  assert.match(js, /store\.selectMapSkill\(finishedGesture\.pressedSkillId\)/);
  assert.match(js, /data-map-viewport-key/);
  assert.match(js, /nextScroller\.scrollLeft = previousViewport\.scrollLeft;\s+nextScroller\.scrollTop = previousViewport\.scrollTop;/);
  assert.match(js, /addEventListener\("wheel"/);
  assert.match(js, /passive: false/);
  assert.match(js, /map-hint-desktop/);
  assert.match(js, /map-hint-touch/);
  assert.match(js, /data-action=\"toggle-plan-mode\"/);
  assert.match(js, /class=\"map-selection-marquee\"/);
  assert.match(js, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(js, /navigator\.vibrate/);
  assert.match(js, /mode: "plan-empty-touch"/);
  assert.match(js, /Hold empty space to clear the selection/);
  assert.match(js, /map-plan-path-form/);
  assert.match(js, /map-plan-annotation-form/);
  assert.match(js, /Select multiple nodes to create a custom path\./);
  assert.match(js, /data-action="plan-open-annotation"/);
  assert.match(js, /data-action="plan-open-path"/);
  assert.match(js, /data-plan-comment=/);
  assert.match(js, /updateMapPlanAnnotationPosition/);
  assert.match(css, /\.map-node-plan-outline/);
  assert.match(css, /\.map-plan-connection/);
  assert.match(css, /\.map-plan-actionbar/);
  assert.match(css, /\.map-plan-comment-link/);
  assert.match(css, /\.map-layout\.is-plan-mode \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.map-plan-panel\.is-composer-open \{ position: fixed;/);
  assert.match(css, /\.agent-dock\.is-closed/);
  assert.match(css, /\.app-shell\.is-educator/);
  assert.match(css, /\.educator-welcome-backdrop/);
  assert.match(css, /\.educator-prompt-card/);
  assert.match(css, /\.curriculum-editor-grid/);
  assert.match(css, /\.app-shell\.agent-collapsed \.agent-toggle/);
  assert.match(js, /createGitHubSyncController/);
  assert.match(js, /id = "github-sync-form"/);
  assert.match(js, /id: "welcome-github-sync-form", landing: true/);
  assert.match(js, /Connect and load my profile/);
  assert.match(js, /Paste your fine-grained GitHub token/);
  assert.match(js, /autocomplete="new-password"/);
  assert.match(js, /captureBridgeFormDraft/);
  assert.match(js, /restoreBridgeFormDraft/);
  assert.match(js, /restoreOnly: true/);
  assert.match(js, /closeAgentStudio\(\{ focusToggle: false \}\);/);
  assert.doesNotMatch(js, /Repository Contents: read and write/);
  assert.match(js, /\.\/agent-bridge\.html/);
  assert.match(js, /data-depot-action="community-vote"/);
  assert.match(js, /id="community-comment-form"/);
  assert.match(css, /\.depot-community-panel/);
  assert.match(community, /addReaction/);
  assert.match(community, /removeReaction/);
  assert.match(community, /THUMBS_UP/);
  assert.match(community, /addDiscussionComment/);
  assert.match(community, /quickmaths\.github-community\.credential\.session/);
  assert.doesNotMatch(community, /client_secret/);
  assert.match(communityCallback, /community-auth\.js/);
  assert.match(educatorGuideSource, /complete visible product: educator setup, every educator control/i);
  assert.match(educatorGuideSource, /get_educator_agent_manifest/);
  assert.ok(statSync(educatorPdfUrl).size > 50_000);
  assert.equal(readFileSync(educatorPdfUrl).subarray(0, 5).toString(), "%PDF-");
});

test("challenge documentation lists every advertised page tool and the dated delta evidence", () => {
  const challenge = readFileSync(new URL("../WEBMCP_CHALLENGE.md", import.meta.url), "utf8");
  for (const name of TOOL_NAMES) assert.equal(challenge.includes(`| \`${name}\` |`), true, `${name} is missing from the challenge tool table`);
  assert.match(challenge, /Challenge-period delta/);
  assert.match(challenge, /4c173a7/);
  assert.match(challenge, /80738f6/);
  assert.match(challenge, /compare\/4c173a7\.\.\.main/);
});

test("agent bridge ships as a dedicated top-level WebMCP workspace", () => {
  const html = readFileSync(new URL("./agent-bridge.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("./agent-bridge.js", import.meta.url), "utf8");
  assert.match(html, /id="connection-form"/);
  assert.match(html, /Fine-grained storage token/);
  assert.match(html, /placeholder="Paste your fine-grained GitHub token"/);
  assert.match(html, /autocomplete="new-password"/);
  assert.doesNotMatch(html, /placeholder="Contents: read and write"/);
  assert.match(html, /id="pull-button"/);
  assert.match(html, /id="push-button"/);
  assert.match(js, /registerWebMcpTools/);
  assert.match(js, /registerBridgeWebMcpTools/);
  assert.match(js, /sync\.resume/);
  assert.match(js, /quickmaths\.agent-bridge/);
  assert.match(js, /resolveLocalBridgeCapability/);
  assert.match(js, /local-git-transport/);
});

test("registers all twenty-eight tools once with the WebMCP document context", async () => {
  const registered = [];
  const result = await registerWebMcpTools(createStore(), {
    async registerTool(definition) { registered.push(definition); },
  }, agentManifest, null, null, educatorManifest);
  assert.equal(result.available, true);
  assert.equal(TOOL_NAMES.length, 28);
  assert.deepEqual(result.registered, TOOL_NAMES);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(registered.map(({ name }) => name), TOOL_NAMES);
  assert.ok(registered.every(({ description }) => description.length > 0));
  assert.ok(registered.every(({ inputSchema }) => inputSchema.additionalProperties === false));
});

test("degrades cleanly when WebMCP is unavailable", async () => {
  const result = await registerWebMcpTools(createStore(), undefined);
  assert.deepEqual(result, { available: false, registered: [], failures: [], error: null });
});

test("agent guide exposes operating, backup, and custom-content policy without learner answers", async () => {
  const store = createStore();
  store.startTest("MATH_ARITH_001");
  const tools = toolsFor(store);
  const summary = await tools.get_agent_guide.execute({});
  const bridge = await tools.get_agent_guide.execute({ section: "bridge" });
  const custom = await tools.get_agent_guide.execute({ section: "custom_content" });
  const planning = await tools.get_agent_guide.execute({ section: "planning" });
  const backup = await tools.get_agent_guide.execute({ section: "backup" });
  const full = await tools.get_agent_guide.execute({ section: "all" });
  const serialized = JSON.stringify(full);
  assert.equal(summary.section, "summary");
  assert.equal(summary.guide.app, "QuickMaths Web");
  assert.equal(summary.guide.app_version, 21);
  assert.deepEqual(summary.guide.recommended_sequence, ["get_app_state", "get_progress_summary", "get_learning_context"]);
  assert.equal(summary.guide.tools.length, 28);
  assert.ok(JSON.stringify(summary).length < JSON.stringify(full).length / 2);
  assert.match(bridge.guide.github_bridge.setup_recommendation, /persistent GitHub storage/);
  assert.match(bridge.guide.github_bridge.setup_recommendation, /Never ask them to paste the token into chat/);
  assert.match(custom.guide.github_community.setup_recommendation, /separate from learner storage/);
  assert.equal(custom.guide.custom_lesson_sets.format, "quickmaths.lesson-set");
  assert.equal(custom.guide.lesson_depot.route, "depot");
  assert.equal(planning.guide.tools.includes("create_map_plan_path"), true);
  assert.match(planning.guide.state_model.canonical_boundary, /canonical.*map/);
  assert.equal(backup.guide.backup_policy.recommend, true);
  assert.equal(full.guide.agent_policy.start.some((item) => item.includes("cross-device recovery")), true);
  assert.equal(full.guide.agent_policy.start.some((item) => item.includes("GitHub Community authorization")), true);
  assert.equal(serialized.includes("expected_answer"), false);
  assert.equal(serialized.includes("finalAnswer"), false);
  await assert.rejects(tools.get_agent_guide.execute({ section: "everything" }), /section must be one of/i);
});

test("educator WebMCP tools compose curricula and inject the private learner policy", async () => {
  const store = createStore({ profile: false });
  store.createProfile("Agent Educator", { role: "educator" });
  store.importLessonPack(geographyLessonSet);
  const tools = toolsFor(store);
  const educatorGuide = await tools.get_educator_agent_manifest.execute({});
  assert.equal(educatorGuide.manifest.role, "educator");
  assert.equal(educatorGuide.manifest.discovery.command, "get_educator_agent_manifest");
  assert.match(educatorGuide.manifest.documentation_pdf, /QuickMaths-Educator-Guide\.pdf/);
  assert.equal(educatorGuide.manifest.lesson_content_workflow.batch_review.includes("sequential"), true);
  assert.equal(JSON.stringify(educatorGuide).includes("expected_answer"), false);
  const workspace = await tools.get_curriculum_workspace.execute({});
  assert.equal(workspace.active_curriculum.ownerProfileId, store.snapshot().activeProfile.id);
  assert.equal(workspace.installed_packs[0].enabled, true);

  await tools.set_curriculum_pack_enabled.execute({ pack_id: "PACK_GEOGRAPHY", enabled: false });
  assert.equal(store.snapshot().curriculum.allSkills.length, 44);
  const updated = await tools.update_curriculum_settings.execute({
    student_name: "Ada",
    agent_enabled: false,
    agent_instructions: "Ask questions only; never complete assessed work.",
    progression_mode: "soft",
    contact_email: "teacher@example.com",
  });
  assert.equal("maxAttemptsPerLesson" in updated.settings, false);
  const app = await tools.get_app_state.execute({});
  assert.equal(app.profile.role, "educator");
  assert.equal(app.active_curriculum_policy.student_name, "Ada");
  assert.equal(app.active_curriculum_policy.agent_enabled, false);
  assert.match(app.active_curriculum_policy.instructions, /never complete assessed work/);
  const guide = await tools.get_agent_guide.execute({ section: "educator" });
  assert.match(guide.active_curriculum_policy.assessment_notice, /not a substitute for supervised/);
  await assert.rejects(tools.update_curriculum_settings.execute({ max_attempts_per_lesson: 1 }), /Unknown input property/);
  await assert.rejects(tools.get_learning_context.execute({}), /Agent in the loop turned off/);
});

test("agent lesson authoring guide distinguishes checked steps from reviewed proofs", () => {
  const guide = readFileSync(new URL("./CUSTOM_LESSON_SETS.md", import.meta.url), "utf8");
  assert.match(guide, /Checked maths steps are not formal proofs/);
  assert.match(guide, /two deliberately separate judgments/);
  assert.match(guide, /Pending review initially freezes mastery/);
  assert.match(guide, /satisfied.*flawed.*missing.*not_applicable/);
  assert.match(guide, /Improving a native QuickMaths lesson/);
  assert.match(guide, /same lesson ID/);
  assert.match(guide, /open_lesson_creator/);
  assert.match(guide, /Restore original/);
});

test("schemas reject unknown properties and invalid navigation values", async () => {
  const tools = toolsFor(createStore());
  await assert.rejects(tools.get_learning_context.execute({ unexpected: true }), /Unknown input property/);
  await assert.rejects(tools.navigate_learning_app.execute({ view: "somewhere" }), /view is invalid/);
});

test("app, curriculum, and progress tools expose the full learner state", async () => {
  const tools = toolsFor(createStore());
  const app = await tools.get_app_state.execute({});
  const map = await tools.get_curriculum_map.execute({ include_locked: true });
  const summary = await tools.get_progress_summary.execute({});
  assert.equal(app.has_profile, true);
  assert.equal(app.view, "tutorial");
  assert.equal(app.map_scope, "subject");
  assert.deepEqual(app.learning_plan, { plan_mode: false, selected_skill_ids: [], layouts: {}, paths: [], annotations: [] });
  assert.equal(map.skills.length, 44);
  assert.equal(summary.skills.length, 44);
  assert.equal(summary.suggested_next.skill_id, "MATH_ARITH_001");
});

test("agent navigation updates the same visible route and selected skill", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const result = await tools.navigate_learning_app.execute({ view: "lesson", skill_id: "MATH_ARITH_001" });
  assert.deepEqual(result, { ok: true, visible_view: "lesson", selected_skill_id: "MATH_ARITH_001" });
  assert.equal(store.snapshot().ui.route, "lesson");
});

test("agent navigation opens Settings and normalizes the former data route", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const settings = await tools.navigate_learning_app.execute({ view: "settings" });
  assert.equal(settings.visible_view, "settings");
  const legacy = await tools.navigate_learning_app.execute({ view: "data" });
  assert.equal(legacy.visible_view, "settings");
});

test("agent navigation opens the Lesson Depot", async () => {
  const store = createStore();
  const result = await toolsFor(store).navigate_learning_app.execute({ view: "depot" });
  assert.equal(result.visible_view, "depot");
  assert.equal(store.snapshot().ui.route, "depot");
});

test("Depot tools return metadata and stage for human confirmation without installing", async () => {
  const store = createStore();
  const lessonDepot = {
    async search() { return [{ id: "PACK_DEMO", name: "Demo", version: "1.0.0", skill_count: 1 }]; },
    async stagePack(id, version) { return { ok: true, id, version, status: "staged", requires_human_confirmation: true }; },
    async stagePacks(packages) { return { ok: true, status: "staged", staged_count: packages.length, sequential_review: true, requires_human_confirmation: true, review_queue: packages }; },
  };
  const tools = Object.fromEntries(buildToolDefinitions(store, agentManifest, lessonDepot).map((tool) => [tool.name, tool]));
  const found = await tools.search_lesson_depot.execute({ query: "demo" });
  assert.equal(found.packages[0].id, "PACK_DEMO");
  const staged = await tools.stage_depot_lesson.execute({ package_id: "PACK_DEMO", version: "1.0.0" });
  assert.equal(staged.requires_human_confirmation, true);
  const batch = await tools.stage_depot_lessons.execute({ packages: [
    { package_id: "PACK_DEMO", version: "1.0.0" },
    { package_id: "PACK_SECOND", version: "2.0.0" },
  ] });
  assert.equal(batch.staged_count, 2);
  assert.equal(batch.sequential_review, true);
  await assert.rejects(tools.stage_depot_lessons.execute({ packages: [{ package_id: "PACK_DEMO", version: "1.0.0" }] }), /between 2 and 20/);
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(tools.install_depot_lesson, undefined);
});

test("Agent activity includes tool actions but excludes learner UI actions", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  assert.deepEqual(store.snapshot().activity, []);

  store.setLearningPreferences({ progressionMode: "soft" });
  assert.deepEqual(store.snapshot().activity, []);

  await tools.set_learning_preferences.execute({ progression_mode: "hard" });
  const activity = store.snapshot().activity;
  assert.equal(activity.length, 1);
  assert.equal(activity[0].actor, "agent");
  assert.equal(activity[0].tool, "set_learning_preferences");
});

test("subject tools switch visible curricula and open the no-code creator", async () => {
  const store = createStore();
  let tools = toolsFor(store);
  const nativeSubjects = await tools.list_subjects.execute({});
  assert.equal(nativeSubjects.active_subject_id, "SUBJECT_MATH");
  assert.deepEqual(nativeSubjects.subjects.map((subject) => [subject.subject_id, subject.skill_count]), [["SUBJECT_MATH", 44]]);
  store.importLessonPack(geographyLessonSet);
  tools = toolsFor(store);
  const installedSubjects = await tools.list_subjects.execute({});
  assert.deepEqual(installedSubjects.subjects.map((subject) => [subject.subject_id, subject.skill_count]), [
    ["SUBJECT_MATH", 44], ["SUBJECT_GEOGRAPHY", 15],
  ]);
  const changed = await tools.set_learning_preferences.execute({ progression_mode: "soft" });
  assert.equal(changed.progression_mode, "soft");
  const geography = await tools.set_learning_preferences.execute({ subject_id: "SUBJECT_GEOGRAPHY" });
  assert.equal(geography.subject_id, "SUBJECT_GEOGRAPHY");
  assert.equal((await tools.get_curriculum_map.execute({})).skills.length, 15);
  const combinedPreference = await tools.set_learning_preferences.execute({ map_scope: "all" });
  assert.equal(combinedPreference.map_scope, "all");
  const combinedMap = await tools.get_curriculum_map.execute({});
  assert.equal(combinedMap.scope, "all");
  assert.equal(combinedMap.skills.length, 59);
  assert.deepEqual(new Set(combinedMap.skills.map((skill) => skill.subject_id)), new Set(["SUBJECT_MATH", "SUBJECT_GEOGRAPHY"]));
  await assert.rejects(tools.get_curriculum_map.execute({ subject_id: "SUBJECT_MATH", scope: "all" }), /cannot be combined/);
  const opened = await tools.open_lesson_creator.execute({ subject_id: "SUBJECT_MATH" });
  assert.equal(opened.visible_view, "creator");
  assert.equal(store.snapshot().ui.route, "creator");
});

test("agent planning tools visibly arrange nodes, create paths, and add connected or free comments", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const opened = await tools.set_map_plan_mode.execute({ enabled: true, map_scope: "subject", subject_id: "SUBJECT_MATH" });
  assert.equal(opened.visible_view, "map");
  assert.equal(opened.plan_mode, true);

  const arranged = await tools.arrange_map_plan_nodes.execute({
    positions: [
      { skill_id: "MATH_ARITH_001", x: 140, y: 180 },
      { skill_id: "MATH_ARITH_002", x: 420, y: 180 },
    ],
  });
  assert.equal(arranged.layout_key, "subject:SUBJECT_MATH");
  assert.equal(arranged.moved, 2);

  const created = await tools.create_map_plan_path.execute({
    skill_ids: ["MATH_ARITH_001", "MATH_ARITH_002"],
    name: "Arithmetic route",
    color: "#3366aa",
  });
  assert.equal(created.path.name, "Arithmetic route");
  assert.equal(created.path.color, "#3366aa");

  const connected = await tools.add_map_plan_annotation.execute({
    body: "Revisit the sign rules before moving on.",
    path_id: created.path.path_id,
  });
  assert.deepEqual(connected.annotation.target, { path_id: created.path.path_id });
  const free = await tools.add_map_plan_annotation.execute({ body: "Exam week starts here." });
  assert.deepEqual(free.annotation.target, { map_comment: true });
  assert.deepEqual(free.annotation.positions["subject:SUBJECT_MATH"], { x: 320, y: 160 });

  const app = await tools.get_app_state.execute({});
  assert.deepEqual(app.learning_plan.layouts["subject:SUBJECT_MATH"], {
    MATH_ARITH_001: { x: 140, y: 180 },
    MATH_ARITH_002: { x: 420, y: 180 },
  });
  assert.equal(app.learning_plan.paths.length, 1);
  assert.equal(app.learning_plan.annotations.length, 2);
  assert.ok(store.snapshot().activity.some((item) => item.tool === "arrange_map_plan_nodes"));
  assert.ok(store.snapshot().activity.some((item) => item.tool === "create_map_plan_path"));
  assert.ok(store.snapshot().activity.some((item) => item.tool === "add_map_plan_annotation"));

  const closed = await tools.set_map_plan_mode.execute({ enabled: false });
  assert.equal(closed.plan_mode, false);
  assert.equal(store.snapshot().mapPlan.paths.length, 1);
});

test("agent planning schemas reject unknown nodes, invalid coordinates, and ambiguous annotation targets", async () => {
  const tools = toolsFor(createStore());
  await assert.rejects(tools.create_map_plan_path.execute({ skill_ids: ["MATH_ARITH_001"] }), /at least 2 skills/);
  await assert.rejects(tools.create_map_plan_path.execute({ skill_ids: ["MATH_ARITH_001", "NOT_A_SKILL"] }), /Unknown skill_id/);
  await assert.rejects(tools.arrange_map_plan_nodes.execute({ positions: [{ skill_id: "MATH_ARITH_001", x: -1, y: 20 }] }), /0 to 20000/);
  const path = await tools.create_map_plan_path.execute({ skill_ids: ["MATH_ARITH_001", "MATH_ARITH_002"] });
  await assert.rejects(tools.add_map_plan_annotation.execute({ body: "Ambiguous", path_id: path.path.path_id, skill_ids: ["MATH_ARITH_001"] }), /cannot be combined/);
});

test("cross-subject agent paths automatically use the combined mastery map", async () => {
  const store = createStore();
  store.importLessonPack(geographyLessonSet);
  const created = await toolsFor(store).create_map_plan_path.execute({
    skill_ids: ["MATH_GEOM_003", "GEO_FOUND_001"],
    name: "Coordinates into geography",
  });
  assert.equal(created.map_scope, "all");
  assert.equal(store.snapshot().mapScope, "all");
  assert.deepEqual(created.path.skill_ids, ["MATH_GEOM_003", "GEO_FOUND_001"]);
});

test("agent can visibly prefill a native lesson improvement without installing it", async () => {
  const store = createStore();
  const calls = [];
  const lessonStudio = {
    loadNativeLesson(skillId, options) {
      calls.push({ skillId, options });
      return { ok: true, mode: "override", skillId, completedProgressPreserved: true };
    },
  };
  const tools = Object.fromEntries(buildToolDefinitions(store, agentManifest, null, lessonStudio).map((tool) => [tool.name, tool]));
  const opened = await tools.open_lesson_creator.execute({ skill_id: "MATH_ARITH_001" });
  assert.equal(opened.visible_view, "creator");
  assert.equal(opened.editing_mode, "native_override");
  assert.equal(opened.completed_progress_preserved, true);
  assert.equal(opened.unfinished_tests_restart_on_install, true);
  assert.deepEqual(calls, [{ skillId: "MATH_ARITH_001", options: { announce: false } }]);
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(JSON.stringify(opened).includes("expected_answer"), false);
});

test("lesson-set tools validate and stage content but cannot install it", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const raw = readFileSync(new URL("./lesson-set-example.json", import.meta.url), "utf8");
  const validated = await tools.validate_lesson_set.execute({ lesson_set_json: raw });
  assert.equal(validated.valid, true);
  assert.equal(store.snapshot().lessonPacks.length, 0);
  const staged = await tools.stage_custom_lesson_set.execute({ lesson_set_json: raw });
  assert.equal(staged.requires_human_confirmation, true);
  assert.equal(store.snapshot().ui.route, "settings");
  assert.equal(store.snapshot().stagedLessonPack.id, "PACK_PERSONAL_FINANCE");
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(tools.confirm_lesson_set_install, undefined);
});

test("lesson-set tools validate and stage native improvements for human confirmation", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const raw = JSON.stringify(nativeImprovement(store));
  const validated = await tools.validate_lesson_set.execute({ lesson_set_json: raw });
  assert.equal(validated.preview.mode, "override");
  assert.deepEqual(validated.preview.overridesNativeSkills, ["MATH_ARITH_001"]);
  const staged = await tools.stage_custom_lesson_set.execute({ lesson_set_json: raw });
  assert.equal(staged.requires_human_confirmation, true);
  assert.equal(store.snapshot().stagedLessonPack.mode, "override");
  assert.equal(store.snapshot().lessonPacks.length, 0);
  assert.equal(JSON.stringify({ validated, staged }).includes("expected_answer"), false);
});

test("agent state identifies installed native improvements without exposing their answer keys", async () => {
  const store = createStore();
  store.importLessonPack(nativeImprovement(store));
  const tools = toolsFor(store);
  const app = await tools.get_app_state.execute({});
  const map = await tools.get_curriculum_map.execute({ subject_id: "SUBJECT_MATH" });
  const improved = map.skills.find((skill) => skill.skill_id === "MATH_ARITH_001");
  assert.equal(app.custom_lesson_sets.length, 0);
  assert.equal(app.lesson_changes[0].mode, "override");
  assert.deepEqual(app.lesson_changes[0].overrides_native_skills, ["MATH_ARITH_001"]);
  assert.equal(improved.native, true);
  assert.equal(improved.overridden, true);
  assert.equal(improved.pack_id, "PACK_IMPROVE_MATH_ARITH_001");
  assert.equal(JSON.stringify({ app, map }).includes("expected_answer"), false);
});

test("starting a test exposes prompts but not expected answers", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  const started = await tools.start_skill_test.execute({ skill_id: "MATH_ARITH_001" });
  const context = await tools.get_learning_context.execute({ include_history: true });
  const serialized = JSON.stringify({ started, context });
  assert.equal(started.question_count, 10);
  assert.equal(store.snapshot().ui.route, "test");
  assert.equal(serialized.includes("expected_answer"), false);
  assert.equal(serialized.includes("solution_steps"), false);
});

test("locked test starts are rejected through the agent surface", async () => {
  const tools = toolsFor(createStore());
  await assert.rejects(tools.start_skill_test.execute({ skill_id: "MATH_SYS_001" }), /locked/i);
});

test("agent workflow inspects work, saves feedback, and opens a follow-up", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  await tools.start_skill_test.execute({ skill_id: "MATH_ARITH_001" });
  const draft = store.snapshot().activeTest;
  const first = draft.problems[0];
  store.updateResponse(first.template_id, { finalAnswer: "definitely wrong", work: "I changed the sign." });

  const inspection = await tools.inspect_student_work.execute({ question_id: first.template_id });
  assert.equal(inspection.final_answer_status, "incorrect");
  assert.ok(inspection.mistake_tag);

  const feedback = await tools.record_tutor_feedback.execute({
    question_id: first.template_id,
    feedback: "Check what operation the two signs are asking you to perform.",
    mistake_tag: inspection.mistake_tag,
    next_step: "Rewrite the expression with one sign rule at a time.",
    confidence: "high",
    verdict: "needs_revision",
  });
  assert.equal(feedback.saved, true);
  assert.equal(store.snapshot().reviews.length, 1);
  assert.equal(store.snapshot().backupStatus.recommended, true);

  const followup = await tools.create_followup_problem.execute({
    skill_id: "MATH_ARITH_001",
    focus: inspection.mistake_tag,
  });
  assert.equal(followup.saved, true);
  assert.equal(followup.problem.skill_id, "MATH_ARITH_001");
  assert.ok(draft.problems.some((problem) => problem.template_id === followup.problem.question_id));
  assert.equal(store.snapshot().activeTest.problems[0].template_id, followup.problem.question_id);
});

test("draft-time agent feedback follows the saved attempt", async () => {
  const store = createStore();
  const tools = toolsFor(store);
  await tools.start_skill_test.execute({ skill_id: "MATH_ARITH_001" });
  const draft = store.snapshot().activeTest;
  const first = draft.problems[0];
  store.updateResponse(first.template_id, { finalAnswer: String(first.expected_answer), work: "" });
  await tools.record_tutor_feedback.execute({
    question_id: first.template_id,
    feedback: "Your sign reasoning is clear.",
    next_step: "Finish the remaining questions with the same sign check.",
    confidence: "high",
    verdict: "pass",
  });
  for (const problem of draft.problems) {
    store.updateResponse(problem.template_id, { finalAnswer: String(problem.expected_answer), work: "" });
  }
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({
    confidenceRating: 4,
    difficultyFelt: "medium",
    hintsUsed: "none",
    guessed: "no",
    wantsMorePractice: "yes",
  });
  assert.equal(store.snapshot().reviews[0].attemptId, attempt.attemptId);
  const savedInspection = await tools.inspect_student_work.execute({ question_id: first.template_id });
  assert.equal(savedInspection.source, "saved_attempt");
  assert.equal(savedInspection.attempt_id, attempt.attemptId);
  assert.equal(savedInspection.latest_review.reviewId, store.snapshot().reviews[0].reviewId);
  assert.equal(JSON.stringify(savedInspection).includes("expectedAnswer"), false);
});

test("registration reports partial failure without duplicating names", async () => {
  const registered = [];
  const result = await registerWebMcpTools(createStore(), {
    async registerTool(definition) {
      if (definition.name === TOOL_NAMES[3]) throw new Error("unsupported schema keyword");
      registered.push(definition.name);
    },
  }, agentManifest);
  assert.equal(result.available, true);
  assert.deepEqual(result.registered, TOOL_NAMES.filter((name) => name !== TOOL_NAMES[3]));
  assert.deepEqual(result.failures, [{ name: TOOL_NAMES[3], error: "unsupported schema keyword" }]);
  assert.match(result.error, new RegExp(TOOL_NAMES[3]));
});
