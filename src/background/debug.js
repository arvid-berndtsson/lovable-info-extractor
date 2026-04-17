import { nowIso } from "./shared.js";

export function makeDebugLogger(limit = 1000) {
  const debugLog = [];

  function pushDebug(event, data = {}) {
    const entry = {
      at: nowIso(),
      event,
      ...data
    };

    debugLog.push(entry);
    if (debugLog.length > limit) {
      debugLog.shift();
    }

    console.log("[lovable-info-extractor]", event, data);
  }

  return {
    debugLog,
    pushDebug
  };
}
