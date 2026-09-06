const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const title = (key) => String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
const display = (value) => value === undefined ? "Not present" : value === null ? "None" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

function differences(local, remote, path = [], depth = 0) {
  if (JSON.stringify(local) === JSON.stringify(remote)) return [];
  if (depth < 3 && local && remote && typeof local === "object" && typeof remote === "object" && !Array.isArray(local) && !Array.isArray(remote)) {
    return [...new Set([...Object.keys(local), ...Object.keys(remote)])].flatMap((key) => differences(local[key], remote[key], [...path, title(key)], depth + 1));
  }
  return [{ label: path.join(" · ") || "Saved content", local, remote }];
}

export function openWorkspaceMerge({ review, onApply, onRefresh, onClose }) {
  const previousFocus = document.activeElement;
  const backdrop = document.createElement("section");
  backdrop.className = "action-confirm-backdrop bridge-source-backdrop";
  const choices = Object.fromEntries(review.rows.filter((r) => r.suggested).map((r) => [r.id, r.suggested]));
  let busy = false;
  let shown = 0;
  backdrop.innerHTML = `
    <article class="action-confirm-dialog bridge-source-dialog workspace-merge-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-merge-title" aria-describedby="workspace-merge-copy">
      <p class="eyebrow">Workspace Storage · review changes</p>
      <h2 id="workspace-merge-title">Keep the changes you want</h2>
      <p id="workspace-merge-copy">Compare this device with ${escape(review.remoteLabel || "GitHub")}. Choose a version for each changed item, then save the merged workspace to this device and GitHub.</p>
      ${review.taskStartedAt ? `<p class="merge-start-time">Agent started: <time datetime="${escape(review.taskStartedAt)}">${escape(new Date(review.taskStartedAt).toLocaleString())}</time></p>` : ""}
      <p>${review.hasBase ? "Changes made on only one side are selected for you. Items changed on both sides need your choice." : "The starting copy is unavailable. Choose explicitly for each difference; no changes have been discarded."}</p>
      <div class="merge-bulk"><button class="button button-outline" data-merge-all="local">Select all from this device</button><button class="button button-outline" data-merge-all="remote">Select all from GitHub</button></div>
      <p data-merge-count aria-live="polite"></p>
      <div data-merge-rows></div>
      <button class="button button-outline" data-merge-more>Show more changes</button>
      <p class="merge-error" role="alert" data-merge-error></p>
      <div class="action-confirm-actions bridge-source-actions merge-footer">
        <button class="button button-outline" data-merge-close>Not now</button>
        <button class="button button-secondary" data-merge-refresh>Refresh comparison</button>
        <button class="button button-primary" data-merge-save>Save merged workspace</button>
      </div>
    </article>`;
  const buttons = () => [...backdrop.querySelectorAll("button, input")];
  function update() {
    const remaining = review.rows.filter((row) => !choices[row.id]).length;
    backdrop.querySelector("[data-merge-count]").textContent = `${review.rows.length} changed item${review.rows.length === 1 ? "" : "s"} · ${remaining} still need a choice`;
    backdrop.querySelector("[data-merge-save]").disabled = busy || remaining > 0;
    backdrop.querySelectorAll("input[type=radio]").forEach((input) => { input.checked = choices[input.dataset.row] === input.value; });
    backdrop.querySelectorAll("[data-merge-selection]").forEach((element) => {
      const choice = choices[element.dataset.mergeSelection];
      element.textContent = choice ? `Keeping ${choice === "local" ? "this device" : "GitHub"}` : "Choose a version";
    });
  }
  function showMore() {
    const container = backdrop.querySelector("[data-merge-rows]");
    for (const row of review.rows.slice(shown, shown + 30)) {
      const article = document.createElement("details");
      article.className = "merge-item";
      article.open = review.rows.length < 8;
      article.innerHTML = `<summary>${escape(row.label)} <small data-merge-selection="${row.id}"></small></summary>
        <fieldset class="merge-version-choices"><legend>Keep for ${escape(row.label)}</legend>${["local", "remote"].map((side) => `<label><input type="radio" name="merge-${row.id}" data-row="${row.id}" value="${side}"><span>${side === "local" ? "This device" : "GitHub"}${!row[`${side}Exists`] ? " · remove item" : ""}</span></label>`).join("")}</fieldset>
        <div class="merge-values"><div class="merge-value-head"><span>Changed field</span><strong>This device</strong><strong>GitHub</strong></div>${differences(row.local, row.remote).map((field) => `<div class="merge-value-row"><span>${escape(field.label)}</span><pre>${escape(display(field.local))}</pre><pre>${escape(display(field.remote))}</pre></div>`).join("")}</div>`;
      container.append(article);
    }
    shown = Math.min(shown + 30, review.rows.length);
    backdrop.querySelector("[data-merge-more]").hidden = shown >= review.rows.length;
    update();
  }
  function close() {
    if (busy) return;
    document.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
    previousFocus?.focus?.({ preventScroll: true });
    onClose?.();
  }
  function onKeyDown(event) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = [...backdrop.querySelectorAll("button, input, summary")].filter((el) => !el.disabled && el.getClientRects().length);
    const index = focusable.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
    else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) { event.preventDefault(); focusable[0]?.focus(); }
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    buttons().forEach((el) => { el.disabled = true; });
    backdrop.querySelector("[data-merge-error]").textContent = "";
    try { await action(); busy = false; close(); }
    catch (error) { backdrop.querySelector("[data-merge-error]").textContent = error.message || String(error); }
    finally { busy = false; buttons().forEach((el) => { el.disabled = false; }); update(); }
  }
  backdrop.addEventListener("change", (event) => {
    if (event.target.matches("input[data-row]")) { choices[event.target.dataset.row] = event.target.value; update(); }
  });
  backdrop.querySelectorAll("[data-merge-all]").forEach((button) => button.addEventListener("click", () => { for (const row of review.rows) choices[row.id] = button.dataset.mergeAll; update(); }));
  backdrop.querySelector("[data-merge-more]").addEventListener("click", showMore);
  backdrop.querySelector("[data-merge-close]").addEventListener("click", close);
  backdrop.querySelector("[data-merge-save]").addEventListener("click", () => void run(() => onApply({ reviewId: review.id, choices })));
  backdrop.querySelector("[data-merge-refresh]").addEventListener("click", () => void run(onRefresh));
  document.addEventListener("keydown", onKeyDown);
  document.body.append(backdrop);
  showMore();
  backdrop.querySelector("[data-merge-close]").focus();
  return { close, backdrop };
}
