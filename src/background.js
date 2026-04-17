import { publishFailureProgress } from "./background/progress.js";
import {
  getAuditRunState,
  requestPauseAudit,
  requestResumeAudit,
  requestStopAudit,
  runLovableAudit
} from "./background/runner.js";
import { downloadLatestAuditJson, downloadLatestTargets } from "./background/downloads.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "runAudit") {
    runLovableAudit(message?.options || {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        publishFailureProgress(error).catch(() => {});
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return true;
  }

  if (message?.type === "pauseAudit") {
    requestPauseAudit()
      .then((response) => sendResponse(response))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          state: getAuditRunState()
        })
      );
    return true;
  }

  if (message?.type === "resumeAudit") {
    requestResumeAudit()
      .then((response) => sendResponse(response))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          state: getAuditRunState()
        })
      );
    return true;
  }

  if (message?.type === "stopAudit") {
    requestStopAudit()
      .then((response) => sendResponse(response))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          state: getAuditRunState()
        })
      );
    return true;
  }

  if (message?.type === "getAuditState") {
    sendResponse({ ok: true, state: getAuditRunState() });
    return false;
  }

  if (message?.type === "downloadLatestAuditJson") {
    downloadLatestAuditJson()
      .then((response) => sendResponse({ ok: true, ...response }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message?.type === "downloadLatestTargets") {
    downloadLatestTargets()
      .then((response) => sendResponse({ ok: true, ...response }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  return undefined;
});
