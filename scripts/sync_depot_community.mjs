import { lessonReactionTotals, REACTION_FIELDS, loadReactionGroups } from "../docs/depot-reactions.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository?.includes("/")) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
const [owner, name] = repository.split("/");
const depotRoot = resolve(process.argv[2] || "docs/lesson-depot");
const catalog = JSON.parse(await readFile(resolve(depotRoot, "catalog.json"), "utf8"));

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "quickmaths-lesson-depot" },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL request failed (${response.status}).`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  return payload.data;
}

const discussions = [];
let repositoryId = "";
let categories = [];
let after = null;
do {
  const query = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){id hasDiscussionsEnabled discussionCategories(first:25){nodes{id name isAnswerable}}discussions(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id title url comments{totalCount}${REACTION_FIELDS}}}}}`;
  const repositoryData = (await graphql(query, { owner, name, after }))?.repository;
  if (repositoryData?.hasDiscussionsEnabled === false) {
    console.log("GitHub Discussions is not enabled; keeping the checked-in community totals unchanged.");
    process.exit(0);
  }
  const connection = repositoryData?.discussions;
  if (!connection) throw new Error("GitHub Discussions is not enabled or could not be read.");
  repositoryId = repositoryData.id;
  categories = repositoryData.discussionCategories.nodes;
  discussions.push(...connection.nodes);
  after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
} while (after);

const category = categories.find((item) => item.name.toLowerCase() === "general")
  ?? categories.find((item) => !item.isAnswerable)
  ?? categories[0];
if (!category) throw new Error("GitHub Discussions has no category available for lesson threads.");

for (const entry of catalog.packages.filter((item) => item.availability !== "preview")) {
  const title = `[Lesson] ${entry.id}`;
  if (discussions.some((item) => item.title.trim().toUpperCase() === title.toUpperCase())) continue;
  const body = `# ${entry.name}\n\n**Version:** ${entry.version}  \n**Author:** ${entry.author}  \n**Subject:** ${entry.subject_name}  \n**License:** ${entry.license}\n\n${entry.description}\n\nLesson reactions determine Depot ranking: ❤️ 🚀 🎉 👍 count as upvotes; 👎 counts as a downvote; 👀 😄 😕 are neutral. Each GitHub account contributes at most one upvote or one downvote, even with multiple emojis. Accounts with both positive and negative reactions count toward neither total. Comments use the same voting system. Score is upvotes minus downvotes. Native GitHub upvotes and all comment feedback do not change lesson rankings. Add comments for questions, corrections, teaching notes, and update requests. Report licensing, safety, or correctness concerns through the repository's Depot report form.\n\n[View the reviewed package](https://github.com/${repository}/tree/main/docs/lesson-depot/lessons/${entry.slug}/${entry.version}) · [Open QuickMaths](https://${owner.toLowerCase()}.github.io/${name}/#/depot)`;
  const mutation = `mutation($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!){createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body}){discussion{id title url comments{totalCount}${REACTION_FIELDS}}}}`;
  const created = (await graphql(mutation, { repositoryId, categoryId: category.id, title, body }))?.createDiscussion?.discussion;
  if (!created) throw new Error(`Could not create the discussion for ${entry.id}.`);
  discussions.push(created);
}

const packages = {};
for (const entry of catalog.packages.filter((item) => item.availability !== "preview")) {
  const discussion = discussions.find((item) => item.title.trim().toUpperCase() === `[LESSON] ${entry.id}`);
  if (!discussion) continue;
  const { votes, downvotes } = lessonReactionTotals(await loadReactionGroups(discussion, graphql));
  packages[entry.id] = {
    votes,
    downvotes,
    comments: discussion.comments.totalCount,
    discussion_url: discussion.url,
  };
}

const output = { format: "quickmaths.lesson-depot.community", schema_version: "1.0", packages };
await writeFile(resolve(depotRoot, "community.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`materialized community totals for ${Object.keys(packages).length} package discussion(s)`);
