import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createQuickMathsStore } from "./challenge-core.js";
import { createLessonStudio } from "./lesson-creator.js";
import { lessonIllustrations, illustrationAssets, includeLessonIllustrations } from "./lesson-illustrations.js";
import { LESSON_ILLUSTRATIONS } from "./lesson-illustration-data.js";
import { loadLessonAsset, normalizeLessonAssets, normalizeLessonMedia } from "./lesson-media.js";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const curriculum = read("./curriculum-data.json");
const folder = new URL("./lesson-depot/lessons/", import.meta.url);
const packs = readdirSync(folder).map(name => {
  const versions = readdirSync(new URL(name + "/", folder)).filter(v => /^\d+\.\d+\.\d+$/.test(v));
  versions.sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
  return read(`./lesson-depot/lessons/${name}/${versions.at(-1)}/lesson-set.json`);
});
const storeFor = () => createQuickMathsStore({ curriculum, now: () => new Date("2026-09-06T12:00:00Z"), storage: { getItem: () => null, setItem() {} } });

test("all 107 shipped lessons have teaching figures, including the 91 previously empty lessons", async () => {
  const lessons = [...curriculum.skills, ...packs.flatMap(p => p.skills)];
  assert.equal(lessons.length, 107);
  assert.equal(Object.keys(LESSON_ILLUSTRATIONS).length, 97);
  let count = 0;
  for (const skill of lessons) {
    const library = lessonIllustrations(skill);
    const authored = [skill, ...skill.examples, ...skill.applications].some(row => row.media?.length);
    assert.ok(authored || library, skill.id);
    if (!library) continue;
    normalizeLessonAssets(library.assets);
    normalizeLessonMedia(library.media);
    assert.equal(illustrationAssets(library.packId).asset_base_url, library.asset_base_url);
    for (const item of library.media) {
      count++;
      const asset = library.assets.find(a => a.path === item.src);
      assert.ok(asset && item.alt && item.caption && item.width && item.height, skill.id);
      const bytes = readFileSync(new URL("./assets/" + asset.path, import.meta.url));
      assert.equal(bytes.length, asset.bytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
      const loaded = await loadLessonAsset(asset, library.asset_base_url, {
        fetchImpl: async (url, options) => {
          assert.equal(String(url), library.asset_base_url + asset.path);
          assert.equal(options.credentials, "omit");
          return new Response(bytes);
        },
      });
      assert.deepEqual(Buffer.from(loaded), bytes);
    }
  }
  assert.equal(count, 109);
});

test("installed Programming lessons gain matched figures without rewriting packages or saved state", () => {
  const store = storeFor(); store.createProfile("Illustration reader");
  for (const pack of packs.filter(p => p.skills.some(s => s.id.startsWith("CUSTOM_PROG")))) store.importLessonPack(pack);
  const before = store.exportSyncState();
  for (const skill of Object.values(store.skillsById).filter(s => s.id.startsWith("CUSTOM_PROG"))) {
    assert.ok(lessonIllustrations(skill), skill.id);
  }
  assert.equal(store.exportSyncState(), before);
  const skill = curriculum.skills.find(s => s.id === "MATH_ARITH_003");
  for (const edited of [
    { ...skill, overridden: true }, { ...skill, name: "My fractions" },
    { ...skill, theory: skill.theory + " New approach." },
    { ...skill, examples: skill.examples.map((e,i) => i ? e : { ...e, solution: "A different solution" }) },
  ]) assert.equal(lessonIllustrations(edited), null);
  assert.equal(lessonIllustrations({ ...skill, id: "CUSTOM_OTHER" }), null);
  assert.equal(illustrationAssets("unknown-pack"), null);
});

test("Studio copies carry ordinary media assets and preserve source packages through export and backup", () => {
  const store = storeFor(); store.createProfile("Illustration author");
  const recipient = storeFor(); recipient.createProfile("Reader of exported lessons");
  const studio = createLessonStudio({ store, getSnapshot: () => store.snapshot(), download() {}, showToast() {}, openFilePicker() {} });
  for (const pack of packs.filter(p => p.skills.some(s => s.id.startsWith("CUSTOM_PROG")))) {
    const original = structuredClone(pack);
    const augmented = includeLessonIllustrations(pack);
    assert.deepEqual(pack, original);
    assert.deepEqual(includeLessonIllustrations(augmented), augmented, "opening twice must not duplicate assets");
    store.importLessonPack(pack);
    assert.equal(studio.loadRaw(JSON.stringify(pack)), true);
    const exported = studio.buildPack();
    assert.deepEqual(new Set(exported.assets.map(a => a.path)), new Set(augmented.assets.map(a => a.path)));
    assert.equal(exported.asset_base_url, augmented.asset_base_url);
    recipient.importLessonPack(exported);
    for (const skill of exported.skills) assert.equal(lessonIllustrations(skill), null, "exported figures must not be displayed twice");
    const restored = storeFor(); restored.importBackup(recipient.exportBackup());
    assert.deepEqual(restored.getLessonMediaAssets(exported.id).assets, exported.assets);
  }
  const hosted = { ...packs[0], asset_base_url: "https://example.github.io/custom/" };
  assert.deepEqual(includeLessonIllustrations(hosted), hosted, "never rebase another publisher's media");
});
