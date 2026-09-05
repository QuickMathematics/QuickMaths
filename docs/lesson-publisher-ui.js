import { createLessonPublisher, PUBLISH_LICENSES, PUBLISH_TOKEN_URL } from "./lesson-publisher.js?v=20260905-publisher-v1";
import { readFileTextLimited } from "./safe-fetch.js";

const PREFERENCES_KEY = "quickmaths.lesson-publisher.preferences.v1";
const PUBLICATIONS_KEY = "quickmaths.lesson-publisher.publications.v1";
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const safeLink = (url) => {
  try { const parsed = new URL(url); return parsed.protocol === "https:" && ["github.com", "raw.githubusercontent.com"].includes(parsed.hostname) && !parsed.username && !parsed.password ? parsed.href : ""; } catch { return ""; }
};

export function createLessonPublisherDialog({ curriculum, getDraft, download, storage = globalThis.localStorage, documentImpl = globalThis.document, client = createLessonPublisher({ curriculum }) } = {}) {
  const readSaved = (key, fallback) => { try { return JSON.parse(storage?.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Publishing works without local preferences. */ } };
  const preferences = readSaved(PREFERENCES_KEY, {});
  let publications = readSaved(PUBLICATIONS_KEY, []);
  if (!Array.isArray(publications)) publications = [];
  publications = publications.filter((item) => item && typeof item.repository === "string" && typeof item.id === "string" && safeLink(item.catalogUrl) && safeLink(item.discussionUrl)).slice(0, 10);
  const dialog = documentImpl.createElement("dialog");
  dialog.className = "lesson-publisher-dialog";
  dialog.setAttribute("aria-labelledby", "publisher-title");
  documentImpl.body.append(dialog);
  let pack = null;
  let repo = typeof preferences.repo === "string" ? preferences.repo : "quickmaths-lessons";
  let license = PUBLISH_LICENSES.includes(preferences.license) ? preferences.license : PUBLISH_LICENSES[0];
  let version = "";
  let review = null;
  let result = null;
  let status = null;
  let busy = false;
  let message = "";
  let error = "";
  let returnFocus = null;
  const selectPack = (value) => {
    pack = typeof value === "string" ? JSON.parse(value) : structuredClone(value);
    if (pack?.format !== "quickmaths.lesson-set" || !Array.isArray(pack.skills)) { pack = null; throw new Error("Choose a QuickMaths lesson-set JSON file, or open your Lesson Studio draft."); }
    version = pack.version || "1.0.0";
    review = null; result = null; status = null;
  };
  const links = (publication) => `<a href="${esc(safeLink(publication.discussionUrl))}" target="_blank" rel="noopener noreferrer">Submission on GitHub ↗</a><a href="${esc(safeLink(publication.catalogUrl))}" target="_blank" rel="noopener noreferrer">Public registry ↗</a>`;
  const render = () => {
    const connection = client.snapshot();
    dialog.innerHTML = `<header class="publisher-heading"><div><p class="eyebrow">Lesson Depot</p><h2 id="publisher-title">Publish a lesson for everyone</h2></div><button type="button" class="quiet-button" data-publisher-action="close" aria-label="Close publisher" ${busy ? "disabled" : ""}>Close ×</button></header>
      <p>Publish from your own public GitHub repository. QuickMaths handles the lesson upload, registry and community submission.</p>
      ${error ? `<p class="publisher-error" role="alert">${esc(error)}</p>` : ""}
      ${busy ? `<p class="publisher-progress" role="status" aria-live="polite">${esc(message)}</p>` : ""}
      <fieldset ${busy ? "disabled" : ""}>
      ${result ? `<section class="publisher-success"><h3>${status?.phase === "listed" ? "Your lesson is in the Depot" : status?.phase === "rejected" ? "The registry needs a correction" : "Uploaded and submitted"}</h3><p class="publisher-status-text" role="status">${esc(status?.message || "The public catalog will list your release after automated validation. Each user chooses whether to install it.")}</p><p><strong>${esc(result.id)} · ${esc(result.version)}</strong></p><div class="publisher-actions">${links(result)}<button class="button button-secondary" data-publisher-action="status" type="button">Check publication status</button><button class="button button-outline" data-publisher-action="edit" type="button">Publish another release</button></div></section>` : `
      <section class="publisher-section"><h3>1. Choose a lesson package</h3><div class="publisher-actions"><label class="button button-outline publisher-file-label">Open lesson JSON<input type="file" accept=".json,application/json" data-publisher-file aria-label="Open lesson JSON"></label><button class="button button-outline" type="button" data-publisher-action="draft">Use Lesson Studio draft</button></div>${pack ? `<p><strong>${esc(pack.name)}</strong> · ${pack.skills.length} lesson${pack.skills.length === 1 ? "" : "s"}</p><label>Release version<input data-publisher-field="version" value="${esc(version)}" maxlength="40" required placeholder="1.0.0"></label>` : `<p>Only the selected lesson package is published. Workspace backups and learner progress are excluded.</p>`}</section>
      <section class="publisher-section"><h3>2. Connect your publishing account</h3>${connection.connected ? `<p>Connected as <strong>${esc(connection.login)}</strong> <button type="button" class="quiet-button" data-publisher-action="disconnect">Disconnect publishing</button></p>` : `<p>Create a GitHub personal access token (classic) with <code>public_repo</code> and <code>write:discussion</code>. This one-time GitHub setup lets the app create your public repository, upload lessons and submit them.</p><p><a href="${PUBLISH_TOKEN_URL}" target="_blank" rel="noopener noreferrer">Create publishing token on GitHub ↗</a></p><label>Publishing token<input type="password" id="publisher-token" autocomplete="off" spellcheck="false" maxlength="500" placeholder="Paste your GitHub token"></label><button class="button button-secondary" type="button" data-publisher-action="connect">Connect publishing</button><small>The token stays in memory until this page closes or you disconnect. It is separate from Workspace Storage and community sign-in. Its scopes allow changes to public repositories you can access.</small>`}</section>
      <section class="publisher-section"><h3>3. Choose where to publish</h3><div class="publisher-fields"><label>Public repository name<input data-publisher-field="repo" value="${esc(repo)}" maxlength="80" required></label><label>License<select data-publisher-field="license">${PUBLISH_LICENSES.map((item) => `<option ${license === item ? "selected" : ""}>${item}</option>`).join("")}</select></label></div><p>The app can create this repository under your account. An existing repository must be public and owned by you.</p><button class="button button-secondary" type="button" data-publisher-action="review" ${!connection.connected || !pack ? "disabled" : ""}>Validate and review publication</button></section>
      ${review ? `<section class="publisher-section publisher-review"><h3>4. Review the public release</h3><dl><div><dt>Repository</dt><dd>${esc(review.repository)}${review.createRepository ? " (will be created publicly)" : ""}</dd></div><div><dt>Lesson</dt><dd>${esc(review.name)} · ${esc(review.version)}</dd></div><div><dt>Contents</dt><dd>${review.skills} lesson${review.skills === 1 ? "" : "s"} · ${review.problems} question${review.problems === 1 ? "" : "s"} · ${esc(review.subject)}</dd></div><div><dt>Author and license</dt><dd>${esc(review.author)} · ${esc(review.license)}</dd></div><div><dt>Public package ID</dt><dd>${esc(review.id)}</dd></div></dl>${review.mode === "override" ? `<p>This is a native lesson improvement. Installing it replaces the original lesson content until the user restores it.</p>` : ""}<details><summary>Files and exact lesson JSON</summary><p>${esc(review.packagePath)}<br>${esc(review.catalogPath)}</p><pre>${esc(review.text)}</pre></details><button type="button" class="quiet-button" data-publisher-action="download">Download reviewed JSON</button><label class="publisher-consent"><input type="checkbox" id="publisher-consent"><span>I have the right to publish this lesson, including its questions, answer keys and solutions, publicly under ${esc(review.license)}. Submit its registry to the QuickMaths community.</span></label><button class="button button-primary" type="button" data-publisher-action="publish" disabled>Publish and submit to Depot</button></section>` : ""}
      ${publications.length ? `<details class="publisher-section"><summary>Recent publications</summary>${publications.map((item, index) => `<article class="publisher-history"><strong>${esc(item.id)} · ${esc(item.version)}</strong><small>${esc(item.repository)}</small><div class="publisher-actions">${links(item)}<button class="quiet-button" type="button" data-publisher-action="history" data-index="${index}">Check status</button></div></article>`).join("")}</details>` : ""}`}
      </fieldset>`;
  };
  const run = async (progress, action) => {
    if (busy) return;
    busy = true; error = ""; message = progress; render();
    try { await action(); } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); review = null; }
    finally { busy = false; message = ""; render(); }
  };
  const close = () => { if (busy) return; dialog.close(); returnFocus?.focus?.(); };
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  dialog.addEventListener("input", (event) => {
    const field = event.target.dataset.publisherField;
    if (field) {
      if (field === "repo") repo = event.target.value;
      if (field === "license") license = event.target.value;
      if (field === "version") version = event.target.value;
      review = null;
      // Do not replace the form while the user is typing. Invalidate the review
      // immediately so no stale consent or package can be published.
      dialog.querySelector(".publisher-review")?.remove();
    }
    if (event.target.id === "publisher-consent") dialog.querySelector('[data-publisher-action="publish"]').disabled = !event.target.checked;
  });
  dialog.addEventListener("change", async (event) => {
    if (!event.target.matches("[data-publisher-file]") || busy) return;
    const file = event.target.files?.[0];
    if (file) await run("Reading your lesson package…", async () => selectPack(await readFileTextLimited(file, 2_000_000, { label: "Lesson package" })));
  });
  dialog.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-publisher-action]");
    if (!action || busy) return;
    const name = action.dataset.publisherAction;
    if (name === "close") return close();
    if (name === "connect") {
      const tokenInput = dialog.querySelector("#publisher-token");
      const credential = tokenInput.value; tokenInput.value = "";
      return run("Connecting your GitHub publishing account…", async () => { await client.connect(credential); review = null; });
    }
    if (name === "disconnect") return run("Disconnecting…", async () => { client.disconnect(); review = null; });
    if (name === "draft") return run("Opening your lesson draft…", async () => selectPack(getDraft()));
    if (name === "review") return run("Validating the lesson and checking your public registry…", async () => {
      review = await client.prepare({ pack: { ...pack, version: version.trim() }, repo, license });
      save(PREFERENCES_KEY, { repo, license });
    });
    if (name === "download" && review) return download(`${review.id.toLowerCase()}.json`, review.text, "application/json");
    if (name === "publish" && review) {
      const consent = dialog.querySelector("#publisher-consent")?.checked === true;
      const approved = review;
      return run("Starting publication…", async () => {
        result = await client.publish(approved, { consent, onProgress: (text) => { message = text; const node = dialog.querySelector(".publisher-progress"); if (node) node.textContent = text; } });
        review = null; status = null;
        publications = [result, ...publications.filter((item) => !(item.repository === result.repository && item.id === result.id && item.version === result.version))].slice(0, 10);
        save(PUBLICATIONS_KEY, publications);
      });
    }
    if (name === "status" && result) return run("Checking the public Depot…", async () => { status = await client.checkStatus(result); });
    if (name === "history") return run("Checking the public Depot…", async () => { result = publications[Number(action.dataset.index)]; status = await client.checkStatus(result); });
    if (name === "edit") { result = null; status = null; review = null; render(); }
  });
  return {
    open(input = null) {
      if (busy) return;
      returnFocus = documentImpl.activeElement;
      error = "";
      if (input) { try { selectPack(input); } catch (failure) { error = failure.message; } }
      render();
      if (!dialog.open) dialog.showModal();
    },
    clearDraft() { if (busy) return; pack = null; review = null; result = null; status = null; render(); },
  };
}
