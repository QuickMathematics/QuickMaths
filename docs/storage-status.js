export function storageStatus(status = {}, { needsReview = false, now = Date.now() } = {}) {
  const busy = ["connecting", "checking", "pulling", "pushing", "merging", "deleting"].includes(status.phase);
  const review = needsReview || ["conflict", "reviewing"].includes(status.phase);
  const label = review ? "Review changes" : status.error ? "Sync problem" : busy ? "Syncing" : status.connected ? (status.dirty ? "Save pending" : "Connected") : "Local only";
  const tone = review || status.error ? "error" : busy || (status.connected && status.dirty) ? "pending" : status.connected ? "connected" : "idle";
  const saved = Date.parse(status.lastPushedAt);
  const seconds = Number.isFinite(saved) ? Math.max(0, Math.floor((now - saved) / 1000)) : null;
  const age = seconds === null ? "No GitHub save yet" : seconds < 60 ? "GitHub · just now" : seconds < 3600 ? `GitHub · ${Math.floor(seconds / 60)}m ago` : seconds < 86400 ? `GitHub · ${Math.floor(seconds / 3600)}h ago` : `GitHub · ${Math.floor(seconds / 86400)}d ago`;
  return { label, tone, age, title: `${label}. ${seconds === null ? age : `Last save to GitHub: ${new Date(saved).toLocaleString()}`}. Open storage settings.` };
}
