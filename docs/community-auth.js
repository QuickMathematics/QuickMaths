import {
  createGitHubCommunityClient,
  createGitHubCommunityCredentialStore,
} from "./github-community.js?v=20260902-community-vote";

const title = document.querySelector("#community-auth-title");
const message = document.querySelector("#community-auth-message");
const spinner = document.querySelector("#community-auth-spinner");
const returnLink = document.querySelector("#community-auth-return");

function fail(error) {
  title.textContent = "GitHub did not connect.";
  message.textContent = error instanceof Error ? error.message : "The authorization could not be completed.";
  spinner.hidden = true;
  returnLink.hidden = false;
}

async function complete() {
  const response = await fetch("./github-community-config.json", { cache: "no-store" });
  if (!response.ok) throw new Error("QuickMaths community configuration is unavailable.");
  const config = await response.json();
  const credentialStore = createGitHubCommunityCredentialStore({ sessionStorage: window.sessionStorage, persistentStorage: window.localStorage });
  const client = createGitHubCommunityClient({ config, credentialStore, transactionStorage: window.sessionStorage });
  if (!client.configured) throw new Error("In-app GitHub community access is not enabled yet.");
  const parameters = new URLSearchParams(window.location.search);
  if (parameters.get("error")) throw new Error("GitHub authorization was cancelled.");
  await client.completeAuthorization({ code: parameters.get("code"), state: parameters.get("state") });
  title.textContent = "GitHub connected.";
  message.textContent = "Returning to the Lesson Depot…";
  window.location.replace("./index.html?community=connected#/depot");
}

complete().catch(fail);
