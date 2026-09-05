import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeDepotCatalog } from "../docs/lesson-depot.js";
import { fetchTextLimited } from "../docs/safe-fetch.js";
import {
  validateFederatedNamespace,
  moderationStatus,
  packageDiscussionTitle,
  pinnedRegistryUrl,
  registryUrlFromBody,
  validateFederatedReleases,
} from "./federated_depot_core.mjs";

const FEDERATION_FORMAT = "quickmaths.lesson-depot.federation";
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository?.includes("/")) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
const [owner, name] = repository.split("/");
const depotRoot = resolve(process.argv[2] || "docs/lesson-depot");
const curriculum = JSON.parse(await readFile(resolve("docs/curriculum-data.json"), "utf8"));
const officialCatalog = JSON.parse(await readFile(resolve(depotRoot, "catalog.json"), "utf8"));

async function graphql(query, variables = {}) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "quickmaths-federated-depot" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL request failed (${response.status}).`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload.data;
}

async function createDiscussion(repositoryId, categoryId, title, body) {
  const mutation = `mutation($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!){createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body}){discussion{id number title url body author{login} upvoteCount comments{totalCount}}}}`;
  const discussion = (await graphql(mutation, { repositoryId, categoryId, title, body }))?.createDiscussion?.discussion;
  if (!discussion?.id) throw new Error(`Could not create community discussion ${title}.`);
  return discussion;
}

async function publishStatus(discussion, message) {
  const marker = "<!-- quickmaths-federation-status -->";
  let revision = "";
  try { revision = `\n\nRegistry revision: ${registryUrlFromBody(discussion.body)}`; } catch { /* Invalid submission URL is explained in the status. */ }
  const body = `${marker}\n${message}${revision}`;
  const prior = discussion.comments?.nodes?.find((comment) => comment.viewerDidAuthor && String(comment.body ?? "").includes(marker));
  if (prior?.body === body) return;
  if (prior) {
    await graphql(`mutation($id:ID!,$body:String!){updateDiscussionComment(input:{commentId:$id,body:$body}){comment{id}}}`, { id: prior.id, body });
    return;
  }
  await graphql(`mutation($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{id}}}`, { id: discussion.id, body });
}

const discussions = [];
let repositoryId = "";
let categories = [];
let after = null;
do {
  const query = `query($owner:String!,$name:String!,$after:String){viewer{login}repository(owner:$owner,name:$name){id hasDiscussionsEnabled discussionCategories(first:25){nodes{id name isAnswerable}}discussions(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id number title url body author{login} upvoteCount comments(first:100){totalCount nodes{id body viewerDidAuthor}}}}}}`;
  const data = await graphql(query, { owner, name, after });
  const repositoryData = data?.repository;
  if (!repositoryData?.hasDiscussionsEnabled) throw new Error("GitHub Discussions must be enabled for federated discovery.");
  repositoryId = repositoryData.id;
  categories = repositoryData.discussionCategories.nodes;
  discussions.push(...repositoryData.discussions.nodes);
  after = repositoryData.discussions.pageInfo.hasNextPage ? repositoryData.discussions.pageInfo.endCursor : null;
} while (after);

const category = categories.find((item) => item.name.toLowerCase() === "general")
  ?? categories.find((item) => !item.isAnswerable)
  ?? categories[0];
if (!category) throw new Error("GitHub Discussions has no category available for registry submissions.");

const submissions = discussions.filter((discussion) => /^\[Registry\]\s+/i.test(discussion.title));
const registries = [];
const seenRegistryIds = new Set();
const seenPackageIds = new Set((officialCatalog.packages ?? []).filter((pack) => pack.availability !== "preview").map((pack) => pack.id));

for (const submission of submissions) {
  try {
    const catalogUrl = registryUrlFromBody(submission.body);
    const { text: catalogRaw } = await fetchTextLimited(fetch, catalogUrl, { maximumBytes: 500_000, label: "Federated registry" });
    const candidate = JSON.parse(catalogRaw);
    const registry = candidate?.registry;
    if (!registry || typeof registry !== "object") throw new Error("The catalog must contain a registry object.");
    const registryId = String(registry.id ?? "").trim().toLowerCase();
    const registryName = String(registry.name ?? "").trim();
    const namespace = String(registry.namespace ?? "").trim().toUpperCase();
    if (!/^[a-z0-9][a-z0-9._/-]{2,99}$/.test(registryId)) throw new Error("registry.id is invalid.");
    const sourceParts = new URL(catalogUrl).pathname.split("/").filter(Boolean);
    const sourceRepository = `${sourceParts[0]}/${sourceParts[1]}`.toLowerCase();
    if (registryId !== sourceRepository) throw new Error(`registry.id must match its GitHub repository: ${sourceRepository}.`);
    if (!registryName || registryName.length > 160) throw new Error("registry.name is invalid.");
    if (!/^[A-Z0-9]{2,24}$/.test(namespace)) throw new Error("registry.namespace must contain 2–24 uppercase letters or digits.");
    if (seenRegistryIds.has(registryId)) throw new Error(`Registry identity ${registryId} was already submitted.`);

    const source = { id: registryId, name: registryName, catalogUrl, homepageUrl: registry.homepage_url, discussionUrl: submission.url, trust: "new", packages: [] };
    const normalized = normalizeDepotCatalog(candidate, { catalogUrl, baseUrl: catalogUrl, source, requireHashes: true });
    if (!normalized.packages.length) throw new Error("A federated registry must publish at least one package.");
    const packageFiles = [];
    for (const pack of normalized.packages) {
      if (pack.availability !== "published") throw new Error("Federated registries cannot publish metadata-only concept cards.");
      if (seenPackageIds.has(pack.id)) throw new Error(`${pack.id} is already claimed by another federated registry.`);
      const packageUrl = pinnedRegistryUrl(pack.lessonUrl);
      const { text: raw } = await fetchTextLimited(fetch, packageUrl, { maximumBytes: 2_000_000, label: `${pack.name} lesson file` });
      const digest = createHash("sha256").update(raw).digest("hex");
      if (digest !== pack.sha256) throw new Error(`${pack.id} does not match its declared SHA-256 digest.`);
      const payload = JSON.parse(raw);
      validateFederatedNamespace(registryId, pack.id, payload, namespace);
      packageFiles.push({ pack, packageUrl, raw });
    }
    validateFederatedReleases(packageFiles, curriculum);

    const packageModeration = [];
    for (const { pack, packageUrl } of packageFiles) {
      const title = packageDiscussionTitle(registryId, pack);
      let discussion = discussions.find((item) => item.title === title);
      if (!discussion) {
        discussion = await createDiscussion(repositoryId, category.id, title, `# ${pack.name}\n\n**Registry:** ${registryName} (${registryId})  \n**Version:** ${pack.version}  \n**Author:** ${pack.author}  \n**Subject:** ${pack.subjectName}  \n**License:** ${pack.license}  \n**SHA-256:** \`${pack.sha256}\`\n\n${pack.description}\n\nUse GitHub's Upvote button to recommend this exact version. Emoji reactions and comment upvotes do not affect lesson rankings. Add comments for questions, corrections, and teaching notes.\n\n[Registry](${catalogUrl}) · [Immutable lesson file](${packageUrl}) · [Open QuickMaths](https://${owner.toLowerCase()}.github.io/${name}/#/depot)`);
        discussions.push(discussion);
      }
      const votes = Math.max(0, Number(discussion.upvoteCount) || 0);
      packageModeration.push({
        id: pack.id,
        version: pack.version,
        sha256: pack.sha256,
        status: moderationStatus(votes),
        votes,
        flags: 0,
        comments: Math.max(0, Number(discussion.comments?.totalCount) || 0),
        discussion_url: discussion.url,
      });
      seenPackageIds.add(pack.id);
    }

    const submissionVotes = Math.max(0, Number(submission.upvoteCount) || 0);
    seenRegistryIds.add(registryId);
    registries.push({
      id: registryId,
      name: registryName,
      catalog_url: catalogUrl,
      homepage_url: String(registry.homepage_url ?? ""),
      discussion_url: submission.url,
      submitted_by: String(submission.author?.login ?? "unknown"),
      status: moderationStatus(submissionVotes),
      packages: packageModeration,
    });
    await publishStatus(submission, `✅ **Registry validated and federated.**\n\n${packageModeration.length} package${packageModeration.length === 1 ? "" : "s"} passed immutable URL, SHA-256, schema, namespace, and combined prerequisite-graph checks. Community status refreshes automatically.`);
  } catch (error) {
    await publishStatus(submission, `❌ **Registry not listed.**\n\n${error instanceof Error ? error.message : String(error)}\n\nFix the public registry and edit this discussion to run validation again.`);
  }
}

registries.sort((left, right) => left.id.localeCompare(right.id));
let prior = null;
try { prior = JSON.parse(await readFile(resolve(depotRoot, "federation.json"), "utf8")); } catch { prior = null; }
const unchanged = prior?.format === FEDERATION_FORMAT
  && prior?.schema_version === "1.0"
  && JSON.stringify(prior.registries ?? []) === JSON.stringify(registries);
const output = {
  format: FEDERATION_FORMAT,
  schema_version: "1.0",
  generated_at: unchanged ? prior.generated_at : new Date().toISOString(),
  registries,
};
await writeFile(resolve(depotRoot, "federation.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`federated ${registries.length} registr${registries.length === 1 ? "y" : "ies"} from ${submissions.length} submission discussion${submissions.length === 1 ? "" : "s"}`);
