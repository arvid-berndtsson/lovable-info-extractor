import { nowIso } from "./shared.js";

export function makeProgressReporter() {
  const state = {
    phase: "idle",
    message: "Idle",
    startedAt: null,
    updatedAt: nowIso(),
    visitedCount: 0,
    queuedCount: 0,
    tableRowsFound: 0,
    expectedTotalProjects: null
  };

  async function publish(patch) {
    Object.assign(state, patch || {});
    state.updatedAt = nowIso();
    await chrome.storage.local.set({ auditProgress: { ...state } });
  }

  return { publish };
}

export async function publishFailureProgress(error) {
  await chrome.storage.local.set({
    auditProgress: {
      phase: "failed",
      message: `Audit failed: ${error instanceof Error ? error.message : String(error)}`,
      updatedAt: nowIso()
    }
  });
}
