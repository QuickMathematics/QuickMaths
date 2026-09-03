import { githubFileRawUrl } from "../docs/safe-fetch.js";

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

export function moderationStatus(votes, flags) {
  const safeVotes = Math.max(0, Math.floor(Number(votes) || 0));
  const safeFlags = Math.max(0, Math.floor(Number(flags) || 0));
  if (safeFlags >= 2 && safeFlags >= Math.max(2, Math.ceil(safeVotes / 2))) return "contested";
  if (safeVotes >= 3 && safeVotes >= safeFlags * 4) return "recommended";
  return "new";
}

export function packageDiscussionTitle(registryId, pack) {
  return `[Lesson] ${registryId}/${pack.id}@${pack.version}#${pack.sha256.slice(0, 12)}`;
}
