export const GITHUB_REACTIONS = Object.freeze([
  { content: "THUMBS_UP", emoji: "👍", label: "Thumbs up" },
  { content: "THUMBS_DOWN", emoji: "👎", label: "Thumbs down" },
  { content: "LAUGH", emoji: "😄", lessonEmoji: "😁", label: "Laugh" },
  { content: "HOORAY", emoji: "🎉", label: "Hooray" },
  { content: "CONFUSED", emoji: "😕", label: "Confused" },
  { content: "HEART", emoji: "❤️", label: "Heart" },
  { content: "ROCKET", emoji: "🚀", label: "Rocket" },
  { content: "EYES", emoji: "👀", label: "Eyes" },
].map(Object.freeze));

export const LESSON_REACTION_GROUPS = Object.freeze([
  { key: "votes", label: "Upvotes", effect: "counts as an upvote", contents: ["HEART", "ROCKET", "HOORAY", "THUMBS_UP"] },
  { key: "downvotes", label: "Downvotes", effect: "counts as a downvote", contents: ["THUMBS_DOWN"] },
  { key: "neutral", label: "Neutral", effect: "does not affect ranking", contents: ["EYES", "LAUGH", "CONFUSED"] },
].map((group) => Object.freeze({ ...group, contents: Object.freeze(group.contents) })));

const REACTION_PAGE_FIELDS = "nodes{content user{id}}pageInfo{hasNextPage endCursor}";
export class ReactionVotesError extends Error {}
// The first page travels with each subject; only larger discussions need more reads.
export const REACTION_FIELDS = `reactionGroups{content viewerHasReacted reactors{totalCount}}reactions(first:100,orderBy:{field:CREATED_AT,direction:ASC}){${REACTION_PAGE_FIELDS}}`;

export async function loadReactionGroups(subject, graphql) {
  const users = new Map(GITHUB_REACTIONS.map(({ content }) => [content, new Set()]));
  const cursors = new Set();
  let page = subject?.reactions;
  while (true) {
    if (!Array.isArray(page?.nodes) || typeof page?.pageInfo?.hasNextPage !== "boolean") {
      throw new ReactionVotesError("GitHub did not return the accounts needed to count reaction votes.");
    }
    for (const reaction of page.nodes) {
      const id = reaction?.user?.id;
      // Deleted or unavailable accounts cannot be identified and do not cast votes.
      if (typeof id === "string" && id) users.get(reaction?.content)?.add(id);
    }
    if (!page.pageInfo.hasNextPage) break;
    const after = page.pageInfo.endCursor;
    if (!subject?.id || typeof after !== "string" || !after || cursors.has(after)) {
      throw new ReactionVotesError("GitHub returned incomplete reaction pages; vote totals could not be verified.");
    }
    cursors.add(after);
    try {
      const data = await graphql(`query QuickMathsReactionAccounts($id:ID!,$after:String!){node(id:$id){... on Reactable{reactions(first:100,after:$after,orderBy:{field:CREATED_AT,direction:ASC}){${REACTION_PAGE_FIELDS}}}}}`, { id: subject.id, after });
      page = data?.node?.reactions;
    } catch (error) {
      throw new ReactionVotesError(`Could not finish reading reaction votes: ${error.message}`, { cause: error });
    }
  }
  return normalizeReactions(subject.reactionGroups).map((group) => ({ ...group, userIds: [...users.get(group.content)] }));
}

function count(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

// Accept either GitHub's reactionGroups or the normalized browser reactions.
export function normalizeReactions(groups) {
  return GITHUB_REACTIONS.map(({ content }) => {
    const group = Array.isArray(groups) ? groups.find((item) => item?.content === content) : null;
    const userIds = Array.isArray(group?.userIds) ? [...new Set(group.userIds.filter((id) => typeof id === "string" && id))] : [];
    return { content, count: count(group?.count ?? group?.reactors?.totalCount ?? group?.users?.totalCount), viewerHasReacted: group?.viewerHasReacted === true, userIds };
  });
}

export function lessonReactionTotals(groups) {
  const reactions = normalizeReactions(groups);
  const accounts = Object.fromEntries(LESSON_REACTION_GROUPS.map(({ key, contents }) => [key, new Set(reactions.filter((reaction) => contents.includes(reaction.content)).flatMap((reaction) => reaction.userIds))]));
  const votes = [...accounts.votes].filter((id) => !accounts.downvotes.has(id)).length;
  const downvotes = [...accounts.downvotes].filter((id) => !accounts.votes.has(id)).length;
  return { votes, downvotes, neutral: accounts.neutral.size, score: votes - downvotes };
}
