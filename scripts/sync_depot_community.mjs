import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository?.includes("/")) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
const [owner, name] = repository.split("/");
const depotRoot = resolve(process.argv[2] || "docs/lesson-depot");
const catalog = JSON.parse(await readFile(resolve(depotRoot, "catalog.json"), "utf8"));

const discussions = [];
let after = null;
do {
  const query = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){discussions(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{title url comments{totalCount}reactions(content:THUMBS_UP){totalCount}}}}}`;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "quickmaths-lesson-depot" },
    body: JSON.stringify({ query, variables: { owner, name, after } }),
  });
  if (!response.ok) throw new Error(`GitHub GraphQL request failed (${response.status}).`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "));
  const connection = payload.data?.repository?.discussions;
  if (!connection) throw new Error("GitHub Discussions is not enabled or could not be read.");
  discussions.push(...connection.nodes);
  after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
} while (after);

const packages = {};
for (const entry of catalog.packages) {
  const discussion = discussions.find((item) => item.title.trim().toUpperCase() === `[LESSON] ${entry.id}`);
  if (!discussion) continue;
  packages[entry.id] = {
    votes: discussion.reactions.totalCount,
    comments: discussion.comments.totalCount,
    discussion_url: discussion.url,
  };
}

const output = { format: "quickmaths.lesson-depot.community", schema_version: "1.0", packages };
await writeFile(resolve(depotRoot, "community.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`materialized community totals for ${Object.keys(packages).length} package discussion(s)`);
