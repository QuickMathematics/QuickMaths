import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeLessonAssets, normalizeLessonMedia, mediaPath, mediaBaseUrl, mediaDigest, loadLessonAsset, encodeMediaData, renderLessonMedia } from "./lesson-media.js";
import { parseLessonManifest, readLessonFolder } from "./lesson-folder.js";
import { normalizeLessonPack, createQuickMathsStore } from "./challenge-core.js";

const curriculum = JSON.parse(await readFile(new URL("./curriculum-data.json", import.meta.url)));
const fixture = JSON.parse(await readFile(new URL("./lesson-set-example.json", import.meta.url)));
const data = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>');
const asset = { path: "media/triangle.svg", mime_type: "image/svg+xml", bytes: data.length, sha256: await mediaDigest(data) };
const item = { src: asset.path, alt: "Triangle", width: 800, height: 500 };
const portable = () => {
  const pack = structuredClone(fixture);
  pack.schema_version = "2.1";
  pack.assets = [{ ...asset, data_base64: encodeMediaData(data) }];
  pack.skills[0].media = [item]; pack.skills[0].problems[0].media = [item];
  return pack;
};
const file = (path, bytes) => {
  const value = new File([bytes], path.split("/").at(-1));
  Object.defineProperty(value, "webkitRelativePath", { value: path });
  return value;
};

test("media accepts browser formats and rejects executable, absolute and escaping paths", () => {
  for (const ext of ["png", "jpg", "jpeg", "webp", "avif", "svg", "gif", "apng", "webm", "mp4", "ogv", "mp3", "wav", "flac", "opus"]) assert.equal(mediaPath(`media/image.${ext}`), `media/image.${ext}`);
  for (const path of ["../secret.png", "a/../b.png", "/file.png", "a\\b.png", "https://evil.test/x.png", "x.html", "x.js", "a/%2e%2e/x.png", "a//x.png"]) assert.throws(() => mediaPath(path));
  for (const url of ["https://evil.test/", "https://token@raw.githubusercontent.com/a/", "http://raw.githubusercontent.com/a/", "https://raw.githubusercontent.com/a/?key=123"]) assert.throws(() => mediaBaseUrl(url));
});

test("dimensions, accessibility and fallback files are checked", () => {
  assert.equal(normalizeLessonMedia([item])[0].type, "image");
  for (const bad of [{ ...item, alt: "" }, { ...item, width: Infinity }, { ...item, height: 0 }, { ...item, sources: [] }, { ...item, type: "video" }]) assert.throws(() => normalizeLessonMedia([bad]));
  assert.equal(normalizeLessonMedia([{ src: "x.webm", alt: "Animated triangle", sources: ["x.mp4"], poster: "x.png" }])[0].type, "video");
  assert.throws(() => normalizeLessonMedia([{ src: "x.webm", alt: "x", sources: ["x.mp3"] }]));
  assert.throws(() => normalizeLessonAssets([{ ...asset, mime_type: "text/html" }]));
  assert.throws(() => normalizeLessonAssets([asset, asset]), /Duplicate/);
  const html = renderLessonMedia([{ ...item, caption: '<img onerror="bad">' }]);
  assert.doesNotMatch(html, /<img/); assert.match(html, /&lt;img/);
});

test("portable size limit works at the boundary without regex stack overflow", () => {
  const bytes = new Uint8Array(1_000_000);
  assert.equal(normalizeLessonAssets([{ ...asset, bytes: bytes.length, data_base64: encodeMediaData(bytes) }])[0].bytes, bytes.length);
  assert.throws(() => normalizeLessonAssets([{ ...asset, bytes: bytes.length + 1, data_base64: encodeMediaData(new Uint8Array(bytes.length + 1)) }]), /Portable|invalid embedded/);
});

test("downloads carry no credentials and must match size and hash", async () => {
  const loaded = await loadLessonAsset(asset, "https://raw.githubusercontent.com/owner/repo/abcdef/", { fetchImpl: async (url, options) => {
    assert.match(url, /\/media\/triangle.svg$/);
    assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error"); assert.equal(options.referrerPolicy, "no-referrer"); assert.equal(options.headers, undefined);
    return new Response(data);
  }});
  assert.deepEqual(loaded, data);
  await assert.rejects(loadLessonAsset({ ...asset, sha256: "0".repeat(64), data_base64: encodeMediaData(data) }), /digest/);
  await assert.rejects(loadLessonAsset(asset, "https://quickmathematics.github.io/QuickMaths/", { fetchImpl: async () => new Response(new Uint8Array(data.length + 1)) }), /size/);
});

test("YAML manifests reject aliases, duplicate keys and custom executable tags", async () => {
  assert.equal((await parseLessonManifest('format: quickmaths.lesson-set\nschema_version: 2.1\nskills: []', 'lesson-set.yaml')).schema_version, "2.1");
  for (const raw of ['a: &x [1]\nb: *x', 'a: 1\na: 2', 'a: !!js/function function(){}']) await assert.rejects(parseLessonManifest(raw, "lesson-set.yaml"));
  await assert.rejects(parseLessonManifest(JSON.stringify({ ...fixture, matplotlib_figures: [{}] })), /Build the Matplotlib/);
});

test("folder import reads only referenced attachments, verifies metadata and supports portable export", async () => {
  const pack = portable(); delete pack.assets;
  const manifest = file("pack/lesson-set.json", JSON.stringify(pack));
  const unrelated = file("pack/private.txt", "private"); unrelated.arrayBuffer = () => { throw Error("Must not read unrelated files"); };
  const result = await readLessonFolder([manifest, file(`pack/${asset.path}`, data), unrelated]);
  assert.equal(result.pack.assets[0].sha256, asset.sha256); assert.ok(result.pack.assets[0].data_base64);
  const large = await readLessonFolder([manifest, file(`pack/${asset.path}`, data)], { portable: false });
  assert.equal(large.pack.assets[0].data_base64, undefined); assert.deepEqual(large.attachments.get(asset.path), data);
  await assert.rejects(readLessonFolder([manifest]), /Missing/);
  await assert.rejects(readLessonFolder([file("pack/lesson-set.json", JSON.stringify(portable())), file(`pack/${asset.path}`, new Uint8Array(data.length))]), /changed/);
});

test("lesson media survives import, backup restoration and Studio-compatible exports", () => {
  const pack = portable(); pack.skills[0].prerequisites = [];
  pack.skills[0].problems = [{ ...pack.skills[0].problems[0], answer_mode: "final_only", work: { mode: "none" }, review_policy: { work_review: "none" } }];
  const normalized = normalizeLessonPack(pack, { nativeSkills: curriculum.skills, knownSkillIds: curriculum.skills.map(s => s.id) });
  assert.equal(normalized.assets[0].sha256, asset.sha256);
  const bad = portable(); bad.assets = []; bad.skills[0].prerequisites = []; assert.throws(() => normalizeLessonPack(bad, { nativeSkills: curriculum.skills }), /not listed/);
  const storage = { getItem: () => null, setItem() {} };
  const store = createQuickMathsStore({ curriculum, storage }); store.createProfile("Media learner"); store.completeTutorial();
  store.importLessonPack(JSON.stringify(pack));
  const draft = store.startTest(pack.skills[0].id, { force: true });
  for (const question of draft.problems) store.updateResponse(question.template_id, { finalAnswer: String(question.expected_answer), work: "I checked the calculation." });
  assert.equal(store.submitTest().ok, true);
  const attempt = store.saveReflection({ confidenceRating: 4, guessed: "no" });
  assert.ok(attempt.results.some(result => result.media?.[0].src === asset.path));
  const restored = createQuickMathsStore({ curriculum, storage }); restored.importBackup(store.exportBackup()); restored.selectProfile(restored.snapshot().profiles[0].id);
  assert.ok(restored.snapshot().attempts[0].results.some(result => result.media?.[0].src === asset.path));
  assert.deepEqual(restored.getLessonMediaAssets(pack.id), store.getLessonMediaAssets(pack.id));
  assert.deepEqual(JSON.parse(restored.exportLessonPack(pack.id)).skills[0].problems[0].media, normalized.skills[0].problems[0].media);
});
