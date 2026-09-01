const button = document.querySelector("#copy-bridge-prompt");
const status = document.querySelector("#copy-status");

button.addEventListener("click", async () => {
  const prompt = document.querySelector("#bridge-prompt").textContent.trim();
  try {
    await navigator.clipboard.writeText(prompt);
    status.textContent = "Copied.";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("#bridge-prompt"));
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = "Select and copy the highlighted prompt.";
  }
});
