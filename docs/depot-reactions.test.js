import test from "node:test";
import assert from "node:assert/strict";
import { GITHUB_REACTIONS, LESSON_REACTION_GROUPS, normalizeReactions, lessonReactionTotals, loadReactionGroups } from "./depot-reactions.js";

const group = (content, ...userIds) => ({ content, count: userIds.length, userIds });
const page = (nodes, hasNextPage = false, endCursor = null) => ({ nodes, pageInfo: { hasNextPage, endCursor } });
const reaction = (content, id) => ({ content, user: id ? { id } : null });

test("every GitHub reaction belongs to exactly one requested voting group", () => {
  const contents = LESSON_REACTION_GROUPS.flatMap((group) => group.contents);
  assert.equal(new Set(contents).size, 8);
  assert.deepEqual([...contents].sort(), GITHUB_REACTIONS.map((reaction) => reaction.content).sort());
  for (const content of ["HEART", "ROCKET", "HOORAY", "THUMBS_UP"]) {
    assert.deepEqual(lessonReactionTotals([group(content, "A", "B")]), { votes: 2, downvotes: 0, neutral: 0, score: 2 });
  }
  for (const content of ["THUMBS_DOWN", "CONFUSED"]) {
    assert.deepEqual(lessonReactionTotals([group(content, "A", "B")]), { votes: 0, downvotes: 2, neutral: 0, score: -2 });
  }
  for (const content of ["EYES", "LAUGH"]) {
    assert.deepEqual(lessonReactionTotals([group(content, "A", "B")]), { votes: 0, downvotes: 0, neutral: 2, score: 0 });
  }
});

test("multiple positive or negative emojis count only once per GitHub account", () => {
  assert.deepEqual(lessonReactionTotals([group("HEART", "A", "B"), group("ROCKET", "A"), group("HOORAY", "A"), group("THUMBS_UP", "A"), group("THUMBS_DOWN", "C"), group("CONFUSED", "C")]), { votes: 2, downvotes: 1, neutral: 0, score: 1 });
});

test("mixed positive and negative reactions exclude the account from both vote totals", () => {
  const mixed = [group("HEART", "A", "B"), group("ROCKET", "A"), group("THUMBS_DOWN", "A", "C"), group("CONFUSED", "A"), group("EYES", "A", "B"), group("LAUGH", "B")];
  assert.deepEqual(lessonReactionTotals(mixed), { votes: 1, downvotes: 1, neutral: 2, score: 0 });
  assert.deepEqual(lessonReactionTotals([group("HEART", "A"), group("THUMBS_DOWN", "A")]), { votes: 0, downvotes: 0, neutral: 0, score: 0 });
  assert.equal(lessonReactionTotals(mixed.filter((item) => item.content !== "ROCKET")).downvotes, 1);
  assert.equal(lessonReactionTotals(mixed.filter((item) => !["ROCKET", "HEART"].includes(item.content))).downvotes, 2);
});

test("anonymous counts, missing identities, duplicates and viewer state cannot inflate votes", () => {
  const groups = [null, { content: "HEART", count: 900, userIds: ["A", "A", "", null] }, { content: "ROCKET", count: 100 }, { content: "UNKNOWN", userIds: ["X"] }, { content: "THUMBS_UP", count: Infinity, viewerHasReacted: true }];
  assert.deepEqual(lessonReactionTotals(groups), { votes: 1, downvotes: 0, neutral: 0, score: 1 });
  assert.deepEqual(lessonReactionTotals(normalizeReactions(groups)), lessonReactionTotals(groups));
  assert.deepEqual(lessonReactionTotals(null), { votes: 0, downvotes: 0, neutral: 0, score: 0 });
});

for (const id of ["D_lesson", "DC_comment"]) {
  test(`${id}: votes include later pages and deduplicate accounts across page boundaries`, async () => {
    const first = Array.from({ length: 100 }, (_, i) => reaction("HEART", `USER_${i}`));
    const subject = { id, reactionGroups: [{ content: "HEART", reactors: { totalCount: 100 } }, { content: "ROCKET", reactors: { totalCount: 1 } }, { content: "CONFUSED", reactors: { totalCount: 1 } }], reactions: page(first, true, "PAGE_1") };
    const calls = [];
    const groups = await loadReactionGroups(subject, async (query, variables) => {
      calls.push(variables);
      assert.match(query, /on Reactable/);
      return { node: { reactions: page([reaction("ROCKET", "USER_0"), reaction("CONFUSED", "USER_1"), reaction("HEART", null), reaction("HEART", "USER_2")]) } };
    });
    assert.deepEqual(calls, [{ id, after: "PAGE_1" }]);
    assert.deepEqual(lessonReactionTotals(groups), { votes: 99, downvotes: 0, neutral: 0, score: 99 });
    assert.equal(groups.find((item) => item.content === "HEART").count, 100);
  });
}

test("missing and failed pagination never silently publish partial totals", async () => {
  await assert.rejects(loadReactionGroups({ reactionGroups: [] }, async () => ({})), /accounts/);
  const subject = { id: "D_1", reactionGroups: [], reactions: page([reaction("HEART", "A")], true, "NEXT") };
  await assert.rejects(loadReactionGroups(subject, async () => { throw new Error("Rate limit"); }), /Rate limit/);
  await assert.rejects(loadReactionGroups(subject, async () => ({ node: { reactions: page([], true, "NEXT") } })), /incomplete/);
  await assert.rejects(loadReactionGroups({ ...subject, reactions: page([], true) }, async () => ({})), /incomplete/);
});
