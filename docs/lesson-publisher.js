import { normalizeLessonPack } from "./challenge-core.js";
import { compareVersions, DEFAULT_DEPOT_FEDERATION, normalizeDepotCatalog } from "./lesson-depot.js";
import { registryUrlFromBody, validateFederatedNamespace, validateFederatedReleases } from "./depot-validation.js";
import { fetchTextLimited, readTextLimited } from "./safe-fetch.js";

const API = "https://api.github.com";
const COMMUNITY = { owner: "QuickMathematics", name: "QuickMaths" };
const MAX_PACK_BYTES = 2_000_000;
const MAX_CATALOG_BYTES = 500_000;
const CATALOG_PATH = "quickmaths-depot.json";
export const PUBLISH_TOKEN_URL = "https://github.com/settings/tokens/new?description=QuickMaths%20lesson%20publishing&scopes=public_repo,write:discussion";
export const PUBLISH_LICENSES = ["CC BY 4.0", "CC BY-SA 4.0", "CC0 1.0", "MIT"];
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const bytes = (value) => new TextEncoder().encode(value);
const encodedPath = (path) => path.split("/").map(encodeURIComponent).join("/");
const rawUrl = (repository, sha, path) => `https://raw.githubusercontent.com/${repository}/${sha}/${encodedPath(path)}`;
const isSha = (value) => /^[a-f0-9]{40}$/i.test(value ?? "");
const repoFromUrl = (url) => new URL(url).pathname.split("/").filter(Boolean).slice(0, 2).join("/").toLowerCase();

function base64(value) {
  let binary = "";
  for (const byte of bytes(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function repositoryName(value) {
  const result = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(result) || result.endsWith(".git")) throw new Error("Enter a repository name using letters, numbers, dots, underscores or hyphens.");
  if (result.toLowerCase() === "quickmaths") throw new Error("Choose a separate public lesson repository, such as quickmaths-lessons.");
  return result;
}

async function sha256(value, cryptoImpl) {
  return [...new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes(value)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function catalogWithRelease(catalog, review, pack, namespace, lessonUrl, date) {
  const entry = { id: review.id, version: review.version, slug: review.id.toLowerCase().replaceAll("_", "-"), name: review.name, description: pack.description, author: review.author, license: review.license, subject_id: pack.subject.id, subject_name: review.subject, subject_theme: pack.subject.theme, tags: [...new Set(pack.skills.flatMap((skill) => skill.tags))].slice(0, 20), skills: review.skills, problems: review.problems, availability: "published", published_at: date, updated_at: date, lesson_url: lessonUrl, sha256: review.sha256 };
  return { ...(catalog ?? { format: "quickmaths.lesson-depot.catalog", schema_version: "1.0", registry: { id: review.repository.toLowerCase(), name: `${review.repository.split("/")[0]}'s lessons`, namespace, homepage_url: `https://github.com/${review.repository}` } }), packages: [...(catalog?.packages ?? []), entry] };
}

// Serialize only the validated lesson schema, never a workspace, installed-at
// metadata, authoring draft state, or arbitrary keys from an imported JSON file.
export async function preparePublicLesson(input, { namespace, curriculum, author, publishedSkills = [], cryptoImpl = globalThis.crypto } = {}) {
  const source = typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  if (bytes(json(source)).length > MAX_PACK_BYTES) throw new Error("Lesson package is larger than 2 MB.");
  const validated = normalizeLessonPack(source, { nativeSkills: curriculum.skills, allowMissingReferences: true });
  if (!/^[A-Z0-9]{2,24}$/.test(namespace)) throw new Error("Invalid publisher namespace.");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(validated.version)) throw new Error("Use a release version such as 1.0.0 or 1.1.0-beta.1.");
  const namespaced = async (id, kind, limit = 60) => {
    const prefix = `${kind}_${namespace}_`;
    if (id.startsWith(prefix)) return id;
    const tail = id.replace(new RegExp(`^${kind}_`), "");
    const proposed = `${prefix}${tail}`;
    return proposed.length <= limit ? proposed : `${proposed.slice(0, limit - 9)}_${(await sha256(id, cryptoImpl)).slice(0, 8).toUpperCase()}`;
  };
  const pack = validated;
  delete pack.importedAt;
  pack.id = await namespaced(pack.id, "PACK");
  if (!source.author?.trim() || pack.author === "Unknown author") pack.author = author;
  const subjectId = pack.subject.id;
  const nativeSubjects = new Set(["SUBJECT_MATH", ...(curriculum.subjects ?? []).map((subject) => subject.id), ...curriculum.skills.map((skill) => skill.subjectId ?? skill.subject_id ?? "SUBJECT_MATH")]);
  if (!nativeSubjects.has(subjectId)) pack.subject.id = await namespaced(subjectId, "SUBJECT");
  const ids = new Map();
  for (const skill of pack.skills) ids.set(skill.id, pack.mode === "override" ? skill.id : await namespaced(skill.id, "CUSTOM"));
  const published = new Map(publishedSkills.map((skill) => [skill.id, skill]));
  for (const ref of pack.skills.flatMap((skill) => skill.prerequisiteRefs)) {
    if (ids.has(ref.skillId) || !ref.skillId.startsWith("CUSTOM_")) continue;
    const publicId = await namespaced(ref.skillId, "CUSTOM");
    if (published.has(publicId)) {
      ids.set(ref.skillId, publicId);
      if (ref.subjectId) ref.subjectId = published.get(publicId).subjectId;
    }
  }
  const remap = (id) => ids.get(id) ?? id;
  for (const skill of pack.skills) {
    skill.id = remap(skill.id);
    for (const key of ["packId", "custom", "native", "overridden", "subjectId"]) delete skill[key];
    skill.prerequisites = skill.prerequisiteRefs.map((ref) => ({
      skill_id: remap(ref.skillId),
      ...(ref.subjectId ? { subject_id: ref.subjectId === subjectId ? pack.subject.id : ref.subjectId } : {}),
    }));
    delete skill.prerequisiteRefs;
    skill.unlocks = skill.unlocks.map(remap);
    for (const problem of skill.problems) problem.skill_id = skill.id;
  }
  pack.track.id = `TRACK_${pack.id}`;
  pack.track.subject_id = pack.subject.id;
  for (const key of ["skills", "entry_skills", "exit_skills"]) pack.track[key] = pack.track[key].map(remap);
  const text = json(pack);
  if (bytes(text).length > MAX_PACK_BYTES) throw new Error("Published lesson package is larger than 2 MB.");
  return { pack, text, sha256: await sha256(text, cryptoImpl) };
}

export function createLessonPublisher({ curriculum, fetchImpl = globalThis.fetch?.bind(globalThis), cryptoImpl = globalThis.crypto, now = () => new Date() } = {}) {
  let token = "";
  let viewer = null;
  let community = null;
  let generation = 0;
  let busy = false;
  const plans = new WeakMap();

  const request = async (path, { method = "GET", body, missing = false, raw = false, maximumBytes = 2_800_000 } = {}) => {
    if (!token) throw new Error("Connect a GitHub publishing token first.");
    // Credentials go only to GitHub's API. Public package downloads use a
    // separate unauthenticated fetch and never follow an authenticated redirect.
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        method, redirect: "error", signal: AbortSignal.timeout(30_000), cache: "no-store",
        headers: { authorization: `Bearer ${token}`, accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "content-type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error("GitHub could not be reached. If publishing was interrupted, review and retry; completed uploads will be reused.");
    }
    if (missing && [404, 409].includes(response.status)) return null;
    if (!response.ok) {
      const error = new Error(response.status === 401 ? "Your publishing token expired or is invalid. Reconnect GitHub."
        : response.status === 403 ? "GitHub denied access. Check the token’s public_repo and write:discussion scopes, repository rules, and GitHub rate limits."
          : [409, 422].includes(response.status) ? "The repository changed or GitHub rejected the release. Review again before retrying; existing files will not be overwritten."
            : `GitHub request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    if (path === "/user" && response.headers.get("x-oauth-scopes")) {
      const scopes = response.headers.get("x-oauth-scopes").split(",").map((scope) => scope.trim());
      if ((!scopes.includes("public_repo") && !scopes.includes("repo")) || (!scopes.includes("write:discussion") && !scopes.includes("repo"))) throw new Error("Create a publishing token with both public_repo and write:discussion scopes.");
    }
    const text = await readTextLimited(response, maximumBytes, { label: "GitHub response" });
    return raw ? text : JSON.parse(text);
  };
  const graphql = async (query, variables = {}) => {
    const result = await request("/graphql", { method: "POST", body: { query, variables }, maximumBytes: 5_000_000 });
    if (result.errors?.length) throw new Error(`GitHub Discussions: ${result.errors.map((error) => error.message).join("; ").slice(0, 500)}`);
    return result.data;
  };
  const connect = async (candidate) => {
    if (busy) throw new Error("Wait for publishing to finish before changing accounts.");
    token = String(candidate ?? "").trim(); viewer = null; community = null; generation += 1;
    if (!token || token.length > 500 || /\s/.test(token)) { token = ""; throw new Error("Paste a valid GitHub publishing token."); }
    try {
      const user = await request("/user");
      if (!/^[a-z0-9][a-z0-9-]{0,38}$/i.test(user.login ?? "")) throw new Error("GitHub did not return a valid user account.");
      const data = await graphql(`query PublisherConnection($owner:String!,$name:String!){repository(owner:$owner,name:$name){id hasDiscussionsEnabled discussionCategories(first:100){nodes{id name isAnswerable}}}}`, COMMUNITY);
      const repo = data?.repository;
      const categories = repo?.discussionCategories?.nodes ?? [];
      const category = categories.find((item) => item.name.toLowerCase() === "show and tell") ?? categories.find((item) => item.name.toLowerCase() === "general") ?? categories.find((item) => !item.isAnswerable);
      if (!repo?.hasDiscussionsEnabled || !category?.id) throw new Error("QuickMaths registry submissions are unavailable to this token.");
      viewer = user.login;
      community = { id: repo.id, categoryId: category.id };
      return { login: viewer };
    } catch (error) { token = ""; throw error; }
  };
  const disconnect = () => {
    if (busy) throw new Error("Wait for publishing to finish before disconnecting.");
    token = ""; viewer = null; community = null; generation += 1;
  };
  const ensureRepository = (repo, repository) => {
    if (repo.private !== false || repo.visibility === "internal") throw new Error("Publishing requires a public repository. Private workspace storage cannot be used or made public here.");
    if (repo.full_name?.toLowerCase() !== repository.toLowerCase() || repo.owner?.login?.toLowerCase() !== viewer.toLowerCase()) throw new Error("Choose a public repository owned by your connected GitHub account.");
    if (repo.archived || repo.disabled || repo.permissions?.push !== true) throw new Error("This repository is archived, disabled, or not writable by your account.");
    return repo;
  };
  const getRepository = async (repository) => {
    const repo = await request(`/repos/${repository}`, { missing: true });
    return repo ? ensureRepository(repo, repository) : null;
  };
  const head = async (repository, repo) => {
    const commit = await request(`/repos/${repository}/commits/${encodeURIComponent(repo.default_branch || "main")}`, { missing: true });
    if (commit && !isSha(commit.sha)) throw new Error("GitHub returned an invalid repository revision.");
    return commit?.sha ?? null;
  };
  const contents = (repository, path, ref, options = {}) => request(`/repos/${repository}/contents/${encodedPath(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`, { missing: true, ...options });
  const write = async (repository, path, text, { sha, branch, message }) => {
    const result = await request(`/repos/${repository}/contents/${encodedPath(path)}`, { method: "PUT", body: { message, content: base64(text), ...(sha ? { sha } : {}), ...(branch ? { branch } : {}) } });
    if (!isSha(result?.commit?.sha)) throw new Error("GitHub did not confirm the upload revision. Review and retry to recover it.");
    return result.commit.sha;
  };
  const findSubmission = async (repository) => {
    let after = null;
    let found = null;
    do {
      const data = await graphql(`query PublisherSubmissions($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){discussions(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id number title body url author{login}}}}}`, { ...COMMUNITY, after });
      const page = data?.repository?.discussions;
      if (!page) throw new Error("Could not check existing registry submissions.");
      for (const discussion of page.nodes) {
        if (!/^\[Registry\]\s+/i.test(discussion.title)) continue;
        let url;
        try { url = registryUrlFromBody(discussion.body); } catch { continue; }
        if (repoFromUrl(url) !== repository.toLowerCase()) continue;
        if (discussion.author?.login?.toLowerCase() !== viewer.toLowerCase()) throw new Error("This repository already has a registry submission by another account. Resolve that submission before publishing here.");
        if (found) throw new Error("This repository has duplicate registry submissions. Keep one submission before publishing an update.");
        found = { ...discussion, catalogUrl: url };
      }
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
      if (page.pageInfo.hasNextPage && !after) throw new Error("GitHub did not return the next submissions page.");
    } while (after);
    return found;
  };

  const prepare = async ({ pack: input, repo: name, license }) => {
    if (!viewer || !community) throw new Error("Connect GitHub before reviewing a publication.");
    if (busy) throw new Error("Publishing is already in progress.");
    if (!PUBLISH_LICENSES.includes(license)) throw new Error("Choose a publication license.");
    const session = generation;
    const repository = `${viewer}/${repositoryName(name)}`;
    if (repository.length > 100) throw new Error("Choose a shorter repository name; the account and repository together must fit within 100 characters.");
    const repo = await getRepository(repository);
    const submission = await findSubmission(repository);
    const catalogPath = submission ? new URL(submission.catalogUrl).pathname.split("/").slice(4).map(decodeURIComponent).join("/") : CATALOG_PATH;
    if (!catalogPath.endsWith(".json") || catalogPath.split("/").some((part) => !part || part === "." || part === "..") || catalogPath.startsWith(".github/")) throw new Error("The existing registry file path is not supported.");
    const revision = repo ? await head(repository, repo) : null;
    const catalogFile = revision ? await contents(repository, catalogPath, revision, { maximumBytes: 750_000 }) : null;
    let catalog = null;
    if (catalogFile) {
      if (catalogFile.type !== "file" || catalogFile.encoding !== "base64" || catalogFile.size > MAX_CATALOG_BYTES) throw new Error("The existing registry is not a JSON file under 500 KB.");
      catalog = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(catalogFile.content.replace(/\s/g, "")), (character) => character.charCodeAt(0))));
      if (catalog.registry?.id?.toLowerCase() !== repository.toLowerCase()) throw new Error("The existing registry belongs to a different publisher. No files were changed.");
    } else if (submission) throw new Error("The submitted registry is missing from the repository’s default branch. Restore it before publishing an update.");
    const namespace = catalog?.registry?.namespace ?? `QM${(await sha256(repository.toLowerCase(), cryptoImpl)).slice(0, 12).toUpperCase()}`;
    const placeholderUrl = rawUrl(repository, revision ?? "0".repeat(40), catalogPath);
    const source = { id: repository.toLowerCase(), name: catalog?.registry?.name || `${viewer}'s lessons`, trust: "new" };
    const releases = [];
    if (catalog) {
      const normalized = normalizeDepotCatalog(catalog, { catalogUrl: placeholderUrl, source, requireHashes: true });
      for (const item of normalized.packages) {
        if (item.availability !== "published") throw new Error("A public registry cannot contain unpublished concept cards.");
        const { text } = await fetchTextLimited(fetchImpl, item.lessonUrl, { maximumBytes: MAX_PACK_BYTES, label: item.name });
        if (await sha256(text, cryptoImpl) !== item.sha256) throw new Error(`The existing release ${item.id}@${item.version} failed its hash check.`);
        const payload = JSON.parse(text);
        validateFederatedNamespace(repository, item.id, payload, namespace);
        releases.push({ pack: item, raw: payload });
      }
    }
    const publishedSkills = releases.flatMap(({ raw }) => raw.skills.map((skill) => ({ id: skill.id, subjectId: raw.subject.id })));
    const prepared = await preparePublicLesson(input, { namespace, curriculum, author: viewer, publishedSkills, cryptoImpl });
    const same = catalog?.packages.find((item) => item.id === prepared.pack.id && item.version === prepared.pack.version);
    if (same && (same.sha256 !== prepared.sha256 || same.license !== license)) throw new Error("This version is already published with different content or a different license. Increase the lesson version before publishing changes.");
    if (!same && releases.some(({ pack }) => pack.id === prepared.pack.id && compareVersions(pack.version, prepared.pack.version) >= 0)) throw new Error("Choose a version newer than this package’s latest published release.");
    validateFederatedNamespace(repository, prepared.pack.id, prepared.pack, namespace);
    if (!same) releases.push({ pack: { id: prepared.pack.id, version: prepared.pack.version }, raw: prepared.pack });
    try { validateFederatedReleases(releases, curriculum); }
    catch (error) { throw new Error(`Public lesson validation failed: ${error.message} Include prerequisite packages in this public registry before publishing dependent lessons.`); }
    const packagePath = `lessons/${prepared.pack.id.toLowerCase()}/${prepared.pack.version}/lesson-set.json`;
    if (!same && revision) {
      const existing = await contents(repository, packagePath, revision, { raw: true, maximumBytes: MAX_PACK_BYTES });
      if (existing !== null && await sha256(existing, cryptoImpl) !== prepared.sha256) throw new Error("This release path already contains different content. Increase the version; published lesson files are never overwritten.");
    }
    if (generation !== session) throw new Error("The connected GitHub account changed. Review the publication again.");
    const review = Object.freeze({ repository, createRepository: !repo, name: prepared.pack.name, id: prepared.pack.id, version: prepared.pack.version, license, author: prepared.pack.author, subject: prepared.pack.subject.name, skills: prepared.pack.skills.length, problems: prepared.pack.skills.reduce((sum, skill) => sum + skill.problems.length, 0), mode: prepared.pack.mode, packagePath, catalogPath, text: prepared.text, sha256: prepared.sha256 });
    if (!same) {
      const proposed = catalogWithRelease(catalog, review, prepared.pack, namespace, rawUrl(repository, "0".repeat(40), packagePath), now().toISOString().slice(0, 10));
      if (bytes(json(proposed)).length > MAX_CATALOG_BYTES) throw new Error("The registry would exceed 500 KB. Choose a separate public repository for further lessons.");
      normalizeDepotCatalog(proposed, { catalogUrl: placeholderUrl, source, requireHashes: true });
    }
    plans.set(review, { ...prepared, repo, catalog, catalogFile, namespace, same, session });
    return review;
  };

  const publish = async (review, { consent = false, onProgress = () => {} } = {}) => {
    const plan = plans.get(review);
    if (!plan || plan.session !== generation || !viewer) throw new Error("Review the publication with the current GitHub connection first.");
    if (!consent) throw new Error("Confirm that the reviewed lesson and answer keys may be published under the selected license.");
    if (busy) throw new Error("Publishing is already in progress.");
    busy = true;
    try {
      const repository = review.repository;
      onProgress("Checking the public repository…");
      let repo = await getRepository(repository);
      if (plan.repo && !repo) throw new Error("The reviewed repository is no longer available. Review again before publishing.");
      if (!repo) {
        await request("/user/repos", { method: "POST", body: { name: repository.split("/")[1], description: "Lessons published from QuickMaths", private: false, auto_init: false } });
        repo = await getRepository(repository);
        if (!repo) throw new Error("GitHub created the repository but it is not readable yet. Review and retry in a moment.");
      }
      let revision = await head(repository, repo);
      const currentCatalog = revision ? await contents(repository, review.catalogPath, revision, { maximumBytes: 750_000 }) : null;
      if ((currentCatalog?.sha ?? null) !== (plan.catalogFile?.sha ?? null)) throw new Error("The registry changed since your review. Review again so another publication is preserved.");
      onProgress("Uploading the lesson release…");
      let lessonUrl = plan.same?.lesson_url || plan.same?.lesson_path;
      if (!plan.same) {
        const existing = revision ? await contents(repository, review.packagePath, revision, { raw: true, maximumBytes: MAX_PACK_BYTES }) : null;
        if (existing !== null && await sha256(existing, cryptoImpl) !== review.sha256) throw new Error("The release changed since your review. Increase the version instead of overwriting it.");
        if (existing === null) revision = await write(repository, review.packagePath, review.text, { branch: revision ? repo.default_branch : undefined, message: `Publish ${review.id} v${review.version}` });
        lessonUrl = rawUrl(repository, revision, review.packagePath);
      }
      onProgress("Updating the public registry…");
      let catalog = plan.catalog;
      if (!plan.same) {
        const date = now().toISOString().slice(0, 10);
        catalog = catalogWithRelease(catalog, review, plan.pack, plan.namespace, lessonUrl, date);
        const catalogText = json(catalog);
        if (bytes(catalogText).length > MAX_CATALOG_BYTES) throw new Error("The registry exceeds 500 KB. Start a separate public repository for further lessons.");
        revision = await write(repository, review.catalogPath, catalogText, { sha: currentCatalog?.sha, branch: revision ? repo.default_branch : undefined, message: `List ${review.id} v${review.version} in the Lesson Depot` });
      }
      const catalogUrl = rawUrl(repository, revision, review.catalogPath);
      onProgress("Submitting to the QuickMaths Lesson Depot…");
      // Re-read instead of blindly retrying a possibly successful mutation.
      const prior = await findSubmission(repository);
      const marker = `<!-- quickmaths-registry\n${JSON.stringify({ catalog_url: catalogUrl }, null, 2)}\n-->`;
      let discussion = prior;
      if (!prior || prior.catalogUrl !== catalogUrl) {
        const body = prior ? (/<!--\s*quickmaths-registry\s*\n[\s\S]*?\n-->/i.test(prior.body) ? prior.body.replace(/<!--\s*quickmaths-registry\s*\n[\s\S]*?\n-->/i, marker) : `${marker}\n\n${prior.body}`) : `${marker}\n\nPublic lesson registry published from QuickMaths.\n\nRepository: https://github.com/${repository}`;
        const data = prior
          ? await graphql(`mutation PublisherUpdate($id:ID!,$body:String!){updateDiscussion(input:{discussionId:$id,body:$body}){discussion{id number url}}}`, { id: prior.id, body })
          : await graphql(`mutation PublisherSubmit($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!){createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body}){discussion{id number url}}}`, { repositoryId: community.id, categoryId: community.categoryId, title: `[Registry] ${repository}`, body });
        discussion = prior ? data?.updateDiscussion?.discussion : data?.createDiscussion?.discussion;
        if (!discussion?.id) throw new Error("GitHub did not confirm the submission. Review and retry to check whether it was saved.");
      }
      const result = { repository, id: review.id, version: review.version, sha256: review.sha256, catalogUrl, lessonUrl, discussionUrl: discussion.url, discussionNumber: discussion.number };
      plans.delete(review);
      return result;
    } finally { busy = false; }
  };

  const checkStatus = async (publication) => {
    const { text } = await fetchTextLimited(fetchImpl, DEFAULT_DEPOT_FEDERATION, { maximumBytes: MAX_CATALOG_BYTES, label: "Depot publication status", request: { cache: "no-store" } });
    const registry = JSON.parse(text).registries?.find((item) => item.id === publication.repository.toLowerCase());
    const listed = registry?.packages?.find((item) => item.id === publication.id && item.version === publication.version && item.sha256 === publication.sha256);
    if (listed) {
      const message = registry.status === "contested" || listed.status === "contested" ? "Your release passed validation, but community flags marked it Contested. It is hidden unless users include contested sources. Open the submission to review feedback."
        : registry.packages.some((item) => item.id === publication.id && compareVersions(item.version, publication.version) > 0) ? "This release passed validation. The Depot now displays a newer version of this package; this version remains in the public registry."
          : "Your release is listed in the public Lesson Depot. Users can refresh their catalog to find and install it.";
      return { phase: "listed", message };
    }
    if (token && publication.discussionNumber) {
      const data = await graphql(`query PublisherStatus($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){discussion(number:$number){comments(last:100){nodes{body author{login}}}}}}`, { ...COMMUNITY, number: publication.discussionNumber });
      const status = data?.repository?.discussion?.comments?.nodes?.find((comment) => comment.author?.login === "github-actions[bot]" && comment.body.includes("<!-- quickmaths-federation-status -->") && comment.body.includes(publication.catalogUrl) && comment.body.includes("❌ **Registry not listed.**"));
      if (status) return { phase: "rejected", message: status.body.replace(/<!--[\s\S]*?-->/g, "").trim() };
    }
    return { phase: "pending", message: "Submitted. GitHub is validating the registry and updating the public catalog. Check again in a few minutes." };
  };
  return { connect, disconnect, prepare, publish, checkStatus, snapshot: () => ({ connected: Boolean(viewer), login: viewer, busy }) };
}
