import { githubFileRawUrl } from "./safe-fetch.js";
import { normalizeLessonPack, normalizeLessonPackCollection } from "./challenge-core.js";
import { compareVersions } from "./lesson-depot.js";

export function validateFederatedReleases(releases, curriculum) {
  const parsed = releases.map(({ pack, raw }) => {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (payload?.id !== pack.id || payload?.version !== pack.version) {
      throw new Error(`${pack.id}@${pack.version} lesson file identity does not match its registry listing.`);
    }
    return payload;
  });
  const latest = new Map();
  const identities = new Set();
  for (const payload of parsed) {
    const identity = `${payload.id}@${payload.version}`;
    if (identities.has(identity)) throw new Error(`Duplicate package release: ${identity}.`);
    identities.add(identity);
    const prior = latest.get(payload.id);
    if (!prior || compareVersions(payload.version, prior.version) > 0) latest.set(payload.id, payload);
  }
  // Historical releases remain schema-checked with their published references,
  // but two versions of one package never occupy the same curriculum graph.
  for (const payload of parsed) {
    const knownSkillIds = [
      ...curriculum.skills.map((skill) => skill.id),
      ...parsed.filter((other) => other.id !== payload.id).flatMap((other) => (other.skills ?? []).map((skill) => skill?.id)),
    ];
    normalizeLessonPack(payload, { knownSkillIds, nativeSkills: curriculum.skills });
  }
  return normalizeLessonPackCollection([...latest.values()], curriculum);
}

const FIRST_PARTY_EXTERNAL_PACKS = new Map([
  ["quickmathematics/qm_dev_depot", new Map([
    ["PACK_GEOGRAPHY", "GEO_"],
    ["PACK_PROGRAMMING_FUNDAMENTALS", "CUSTOM_PROG_"],
  ])],
]);

export function federatedPackagePolicy(registryId, packId, namespace) {
  const firstPartyPrefix = FIRST_PARTY_EXTERNAL_PACKS.get(String(registryId).toLowerCase())?.get(packId);
  if (firstPartyPrefix) return { allowed: true, skillPrefix: firstPartyPrefix, firstParty: true };
  return {
    allowed: String(packId).startsWith(`PACK_${namespace}_`),
    skillPrefix: `CUSTOM_${namespace}_`,
    firstParty: false,
  };
}

export function validateFederatedNamespace(registryId, packId, payload, namespace) {
  const policy = federatedPackagePolicy(registryId, packId, namespace);
  if (!policy.allowed) throw new Error(`${packId} must use registry namespace PACK_${namespace}_.`);
  // Overrides retain native IDs; normalizeLessonPack verifies their native identity,
  // subject and full graph before the registry can be accepted.
  if (payload.mode === "override") return;
  for (const skill of payload.skills ?? []) {
    if (!String(skill?.id ?? "").startsWith(policy.skillPrefix)) {
      throw new Error(`${skill?.id || "A skill"} does not belong to the ${packId} registry namespace.`);
    }
  }
}

export function pinnedRegistryUrl(value) {
  const raw = githubFileRawUrl(value);
  const url = new URL(raw);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 4 || !/^[a-f0-9]{40}$/i.test(parts[2])) {
    throw new Error("Registry links must be pinned to a complete 40-character Git commit SHA.");
  }
  return url.href;
}

export function registryUrlFromBody(body) {
  const machine = String(body ?? "").match(/<!--\s*quickmaths-registry\s*\n([\s\S]{1,3000}?)\n-->/i);
  if (machine) {
    const value = JSON.parse(machine[1]);
    return pinnedRegistryUrl(value?.catalog_url);
  }
  const field = String(body ?? "").match(/###\s+Registry manifest URL\s*\n+\s*(https:\/\/\S+)/i);
  if (field) return pinnedRegistryUrl(field[1]);
  throw new Error("Add a quickmaths-registry machine block or the Registry manifest URL form field.");
}

export function moderationStatus(votes, downvotes = 0) {
  const safeVotes = Math.max(0, Math.floor(Number(votes) || 0));
  const safeDownvotes = Math.max(0, Math.floor(Number(downvotes) || 0));
  return safeVotes - safeDownvotes >= 3 ? "recommended" : "new";
}

export function packageDiscussionTitle(registryId, pack) {
  return `[Lesson] ${registryId}/${pack.id}@${pack.version}#${pack.sha256.slice(0, 12)}`;
}
