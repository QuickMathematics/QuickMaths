import { readFile } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLessonPackCollection } from "../docs/challenge-core.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.argv[2] || "docs/lesson-depot");
const catalog = JSON.parse(await readFile(resolve(root, "catalog.json"), "utf8"));
const curriculum = JSON.parse(await readFile(resolve(repositoryRoot, "docs/curriculum-data.json"), "utf8"));

if (catalog.format !== "quickmaths.lesson-depot.catalog" || catalog.schema_version !== "1.0" || !Array.isArray(catalog.packages)) {
  throw new Error("Generated Lesson Depot catalog is invalid.");
}

const rawPackages = [];
for (const entry of catalog.packages) {
  const lessonPath = resolve(root, String(entry.lesson_path || ""));
  const rel = relative(root, lessonPath);
  if (!rel || rel.startsWith(`..${sep}`) || rel === "..") throw new Error(`Catalog path escapes the Depot: ${entry.lesson_path}`);
  const raw = await readFile(lessonPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.id !== entry.id || parsed.version !== entry.version) throw new Error(`${entry.slug} metadata does not match its lesson-set identity.`);
  rawPackages.push(raw);
}

const normalized = normalizeLessonPackCollection(rawPackages, curriculum);
console.log(`validated ${normalized.length} complete Depot package(s) and their combined prerequisite graph`);
