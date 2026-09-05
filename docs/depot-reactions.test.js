import test from "node:test";
import assert from "node:assert/strict";
import { GITHUB_REACTIONS, LESSON_REACTION_GROUPS, normalizeReactions, lessonReactionTotals } from "./depot-reactions.js";

test("every GitHub reaction belongs to exactly one requested voting group", () => {
  const contents = LESSON_REACTION_GROUPS.flatMap((group) => group.contents);
  assert.equal(new Set(contents).size, 8);
  assert.deepEqual([...contents].sort(), GITHUB_REACTIONS.map((reaction) => reaction.content).sort());
  for (const content of ["HEART", "ROCKET", "HOORAY", "THUMBS_UP"]) {
    assert.deepEqual(lessonReactionTotals([{ content, count: 2 }]), { votes: 2, downvotes: 0, neutral: 0, score: 2 });
  }
  for (const content of ["THUMBS_DOWN", "CONFUSED"]) {
    assert.deepEqual(lessonReactionTotals([{ content, count: 2 }]), { votes: 0, downvotes: 2, neutral: 0, score: -2 });
  }
  for (const content of ["EYES", "LAUGH"]) {
    assert.deepEqual(lessonReactionTotals([{ content, count: 200 }]), { votes: 0, downvotes: 0, neutral: 200, score: 0 });
  }
});

test("browser and index workers use identical totals across all reactions", () => {
  const raw = GITHUB_REACTIONS.map(({ content }, index) => ({ content, users: { totalCount: index + 1 }, viewerHasReacted: index % 2 === 0 }));
  const normalized = normalizeReactions(raw);
  const expected = { votes: 18, downvotes: 7, neutral: 11, score: 11 };
  assert.deepEqual(lessonReactionTotals(raw), expected);
  assert.deepEqual(lessonReactionTotals(normalized), expected);
  assert.deepEqual(lessonReactionTotals(normalized.map((reaction) => ({ ...reaction, viewerHasReacted: false }))), expected);
});

test("missing, unknown, duplicate, and invalid reaction counts cannot inflate rankings", () => {
  assert.deepEqual(lessonReactionTotals(null), { votes: 0, downvotes: 0, neutral: 0, score: 0 });
  const groups = [null, { content: "HEART", count: 2.9 }, { content: "HEART", count: 100 }, { content: "UNKNOWN", count: 1000 }, { content: "THUMBS_UP", count: Infinity }, { content: "THUMBS_DOWN", count: -5 }, { content: "ROCKET", count: "invalid" }];
  assert.deepEqual(lessonReactionTotals(groups), { votes: 2, downvotes: 0, neutral: 0, score: 2 });
  assert.equal(normalizeReactions(groups).length, 8);
});
