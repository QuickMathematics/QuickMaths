export const GITHUB_REACTIONS = Object.freeze([
  { content: "THUMBS_UP", emoji: "👍", label: "Thumbs up" },
  { content: "THUMBS_DOWN", emoji: "👎", label: "Thumbs down" },
  { content: "LAUGH", emoji: "😄", lessonEmoji: "😁", label: "Laugh" },
  { content: "HOORAY", emoji: "🎉", label: "Hooray" },
  { content: "CONFUSED", emoji: "😕", lessonEmoji: "🙁", label: "Confused" },
  { content: "HEART", emoji: "❤️", label: "Heart" },
  { content: "ROCKET", emoji: "🚀", label: "Rocket" },
  { content: "EYES", emoji: "👀", label: "Eyes" },
].map(Object.freeze));

export const LESSON_REACTION_GROUPS = Object.freeze([
  { key: "votes", label: "Upvotes", effect: "counts as an upvote", contents: ["HEART", "ROCKET", "HOORAY", "THUMBS_UP"] },
  { key: "downvotes", label: "Downvotes", effect: "counts as a downvote", contents: ["THUMBS_DOWN", "CONFUSED"] },
  { key: "neutral", label: "Neutral", effect: "does not affect ranking", contents: ["EYES", "LAUGH"] },
].map((group) => Object.freeze({ ...group, contents: Object.freeze(group.contents) })));

function count(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

// Accept either GitHub's reactionGroups or the normalized browser reactions.
export function normalizeReactions(groups) {
  return GITHUB_REACTIONS.map(({ content }) => {
    const group = Array.isArray(groups) ? groups.find((item) => item?.content === content) : null;
    return { content, count: count(group?.count ?? group?.users?.totalCount), viewerHasReacted: group?.viewerHasReacted === true };
  });
}

export function lessonReactionTotals(groups) {
  const reactions = normalizeReactions(groups);
  const totals = Object.fromEntries(LESSON_REACTION_GROUPS.map(({ key, contents }) => [key, reactions.filter((reaction) => contents.includes(reaction.content)).reduce((sum, reaction) => sum + reaction.count, 0)]));
  return { ...totals, score: totals.votes - totals.downvotes };
}
