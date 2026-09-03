import test from "node:test";
import assert from "node:assert/strict";

import {
  federatedPackagePolicy,
  moderationStatus,
  packageDiscussionTitle,
  pinnedRegistryUrl,
  registryUrlFromBody,
} from "../scripts/federated_depot_core.mjs";

test("only the external QuickMaths fixture repository can retain legacy first-party identities", () => {
  assert.deepEqual(federatedPackagePolicy("quickmathematics/qm_dev_depot", "PACK_GEOGRAPHY", "QMDEV"), {
    allowed: true,
    skillPrefix: "GEO_",
    firstParty: true,
  });
  assert.deepEqual(federatedPackagePolicy("quickmathematics/qm_dev_depot", "PACK_PROGRAMMING_FUNDAMENTALS", "QMDEV"), {
    allowed: true,
    skillPrefix: "CUSTOM_PROG_",
    firstParty: true,
  });
  assert.equal(federatedPackagePolicy("quickmathematics/qm_dev_depot", "PACK_QMDEV_SOMETHING_ELSE", "QMDEV").allowed, true);
  assert.equal(federatedPackagePolicy("quickmathematics/qm_dev_depot", "PACK_SOMETHING_ELSE", "QMDEV").allowed, false);
  assert.equal(federatedPackagePolicy("someone/fork", "PACK_GEOGRAPHY", "QMDEV").allowed, false);
});

const commit = "a".repeat(40);

test("federation submissions accept pinned GitHub form and machine-block links", () => {
  const blob = `https://github.com/alice/lessons/blob/${commit}/quickmaths-registry.json`;
  const raw = `https://raw.githubusercontent.com/alice/lessons/${commit}/quickmaths-registry.json`;
  assert.equal(pinnedRegistryUrl(blob), raw);
  assert.equal(registryUrlFromBody(`### Registry manifest URL\n\n${blob}\n`), raw);
  assert.equal(registryUrlFromBody(`<!-- quickmaths-registry\n{"catalog_url":"${blob}"}\n-->`), raw);
  assert.throws(() => pinnedRegistryUrl("https://github.com/alice/lessons/blob/main/quickmaths-registry.json"), /40-character/);
});

test("community moderation is deterministic and resistant to a lone flag", () => {
  assert.equal(moderationStatus(0, 0), "new");
  assert.equal(moderationStatus(3, 0), "recommended");
  assert.equal(moderationStatus(8, 2), "recommended");
  assert.equal(moderationStatus(1, 1), "new");
  assert.equal(moderationStatus(2, 2), "contested");
  assert.equal(moderationStatus(20, 2), "recommended");
});

test("package discussion identity binds registry, version, and digest", () => {
  assert.equal(
    packageDiscussionTitle("alice/lessons", { id: "PACK_ALICE_LOGIC", version: "1.2.0", sha256: "b".repeat(64) }),
    "[Lesson] alice/lessons/PACK_ALICE_LOGIC@1.2.0#bbbbbbbbbbbb",
  );
});
