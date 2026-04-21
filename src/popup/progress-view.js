export function renderProgress(progress, { progressNode, setStatus }) {
  if (!progress) {
    progressNode.textContent = "No live progress yet.";
    return;
  }

  const lines = [];
  lines.push(`Phase: ${progress.phase || "unknown"}`);
  lines.push(`Message: ${progress.message || "-"}`);

  if (typeof progress.visitedCount === "number") {
    lines.push(`Visited pages: ${progress.visitedCount}`);
  }
  if (typeof progress.queuedCount === "number") {
    lines.push(`Queue size: ${progress.queuedCount}`);
  }
  if (typeof progress.tableRowsFound === "number" && progress.tableRowsFound > 0) {
    lines.push(`Security rows found: ${progress.tableRowsFound}`);
  }
  if (typeof progress.expectedTotalProjects === "number" && progress.expectedTotalProjects > 0) {
    lines.push(`Expected projects: ${progress.expectedTotalProjects}`);
  }
  if (progress.updatedAt) {
    lines.push(`Updated: ${progress.updatedAt}`);
  }

  progressNode.textContent = lines.join("\n");
  if (progress.message) {
    setStatus(progress.message);
  }
}
