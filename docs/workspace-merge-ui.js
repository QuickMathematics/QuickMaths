const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function openWorkspaceMerge({ review, onApply, onRefresh, onClose }) {
  const previousFocus = document.activeElement;
  const backdrop = document.createElement("section");
  backdrop.className = "action-confirm-backdrop bridge-source-backdrop";
  const choices = Object.fromEntries(review.rows.filter((r) => r.suggested).map((r) => [r.id, r.suggested]));
  let busy = false;
  let shown = 0;
  backdrop.innerHTML = `
    <article class="action-confirm-dialog bridge-source-dialog workspace-merge-dialog" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="workspace-merge-title" aria-describedby="workspace-merge-copy">
      <p class="eyebrow">Workspace Storage · review changes</p>
      <h2 id="workspace-merge-title">Keep the changes you want</h2>
      <p id="workspace-merge-copy">${review.hasBase ? "Independent changes are checked for you. Uncheck a change to keep its starting value." : "The starting copy is unavailable. Compare the two current copies and choose one version for each difference."}</p>
      <div class="merge-overview" data-merge-overview></div>
      <details class="merge-options"><summary>Selection and sync details</summary>
      ${review.taskStartedAt ? `<p class="merge-start-time">Agent started: <time datetime="${escape(review.taskStartedAt)}">${escape(new Date(review.taskStartedAt).toLocaleString())}</time></p>` : ""}
      ${review.hasBase ? `<div class="merge-bulk"><button class="button button-outline" data-merge-all="keep">Keep all independent changes</button><button class="button button-outline" data-merge-all="skip">Uncheck independent changes</button></div>` : ""}
      <p class="merge-history-note">Activity history from both copies is combined automatically. Device settings and session time stay on this device. Saving writes the selected combination to this device and GitHub.</p></details>
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
    const kept = review.rows.filter((row) => choices[row.id] && choices[row.id] !== "base").length;
    backdrop.querySelector("[data-merge-count]").textContent = `${kept} of ${review.rows.length} changes selected${remaining ? ` · ${remaining} overlapping edit${remaining === 1 ? " needs" : "s need"} a choice` : " · ready to save"}`;
    backdrop.querySelector("[data-merge-save]").disabled = busy || remaining > 0;
    backdrop.querySelectorAll("input[data-row]").forEach((input) => { input.checked = choices[input.dataset.row] === input.value; });
  }
  const sourceName = (source) => source === "local" ? "This device" : source === "remote" ? "GitHub" : "Both copies";
  const counts = new Map();
  for (const row of review.rows) for (const change of row.changes) counts.set(change.source, (counts.get(change.source) || 0) + 1);
  backdrop.querySelector("[data-merge-overview]").innerHTML = [...counts].map(([source, count]) => `<span><strong>${sourceName(source)}</strong> ${count} change${count === 1 ? "" : "s"}</span>`).join("");
  function showMore() {
    const container = backdrop.querySelector("[data-merge-rows]");
    for (const row of review.rows.slice(shown, shown + 30)) {
      const article = document.createElement("fieldset");
      article.className = "merge-item";
      article.innerHTML = `${row.conflict ? `<legend>${review.hasBase ? "Overlapping edits · choose one" : "Different copies · choose one"}</legend>` : `<legend class="sr-only">${escape(row.label)}</legend>`}
        ${row.changes.map((change) => `<div class="merge-change">
          <label class="merge-change-choice"><input type="checkbox" data-row="${row.id}" value="${change.side}"><span><small class="merge-source">${sourceName(change.source)}</small><strong>${escape(change.title)}</strong><small>${escape(change.context)}</small></span></label>
          <div class="merge-change-details">${change.preview ? `<p>${escape(change.preview)}</p>` : ""}${change.details.length > 3 ? `<details><summary>See ${change.details.length} changed fields</summary>` : ""}<dl>${change.details.map((detail) => `<div><dt>${escape(detail.label)}</dt><dd><span class="merge-before">${escape(detail.before)}</span><span aria-label="becomes"> → </span><span>${escape(detail.after)}</span></dd></div>`).join("")}</dl>${change.details.length > 3 ? "</details>" : ""}</div>
        </div>`).join("")}
        ${row.conflict && review.hasBase ? `<label class="merge-keep-base"><input type="checkbox" data-row="${row.id}" value="base"><span>Keep the starting value · skip both edits</span></label>` : ""}`;
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
    if (!document.querySelector(".workspace-merge-dialog")) previousFocus?.focus?.({ preventScroll: true });
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
    if (event.target.matches("input[data-row]")) {
      const input = event.target;
      const row = review.rows.find((item) => item.id === input.dataset.row);
      choices[row.id] = input.checked ? input.value : row.conflict ? null : "base";
      update();
    }
  });
  backdrop.querySelectorAll("[data-merge-all]").forEach((button) => button.addEventListener("click", () => { for (const row of review.rows) if (!row.conflict) choices[row.id] = button.dataset.mergeAll === "keep" ? row.suggested : "base"; update(); }));
  backdrop.querySelector("[data-merge-more]").addEventListener("click", showMore);
  backdrop.querySelector("[data-merge-close]").addEventListener("click", close);
  backdrop.querySelector("[data-merge-save]").addEventListener("click", () => void run(() => onApply({ reviewId: review.id, choices })));
  backdrop.querySelector("[data-merge-refresh]").addEventListener("click", () => void run(onRefresh));
  document.addEventListener("keydown", onKeyDown);
  document.body.append(backdrop);
  showMore();
  backdrop.querySelector("[role=dialog]").focus({ preventScroll: true });
  return { close, backdrop };
}
