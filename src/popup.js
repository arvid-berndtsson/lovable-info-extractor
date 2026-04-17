import {
  SETTINGS_KEY,
  downloadJsonButton,
  downloadTargetsButton,
  openOptionsButton,
  patchModeToggle,
  pauseAuditButton,
  progressNode,
  resumeAuditButton,
  runtimeControls,
  runAuditButton,
  statusNode,
  stopAuditButton,
  summaryNode
} from "./popup/elements.js";
import { downloadAuditJson, downloadTargets } from "./popup/downloads.js";
import { renderProgress } from "./popup/progress-view.js";
import { updateSummary } from "./popup/summary-view.js";
import { DEFAULT_AUDIT_SETTINGS } from "./settings.js";

let latestResult = null;
let currentSettings = { ...DEFAULT_AUDIT_SETTINGS };

function setStatus(message) {
  statusNode.textContent = message;
}

function setDownloadButtonsEnabled(enabled) {
  downloadJsonButton.disabled = !enabled;
  downloadTargetsButton.disabled = !enabled;
}

function setRunControlButtons({ running, paused }) {
  runAuditButton.disabled = running;
  runtimeControls.hidden = !running;

  const showPause = running && !paused;
  const showResume = running && paused;
  const showStop = running;

  pauseAuditButton.hidden = !showPause;
  resumeAuditButton.hidden = !showResume;
  stopAuditButton.hidden = !showStop;

  pauseAuditButton.disabled = !showPause;
  resumeAuditButton.disabled = !showResume;
  stopAuditButton.disabled = !showStop;
}

function inferRunStateFromProgress(progress) {
  const phase = progress?.phase || "idle";
  if (["completed", "failed", "stopped", "idle"].includes(phase)) {
    return { running: false, paused: false };
  }
  if (phase === "paused" || phase === "pausing") {
    return { running: true, paused: true };
  }
  return { running: true, paused: false };
}

function readSettingsFromUI() {
  return {
    ...currentSettings,
    patchMode: patchModeToggle.checked
  };
}

async function saveSettings() {
  currentSettings = readSettingsFromUI();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: currentSettings
  });
}

function applySettingsToUI(settings = {}) {
  currentSettings = {
    ...DEFAULT_AUDIT_SETTINGS,
    ...settings
  };
  patchModeToggle.checked = currentSettings.patchMode === true;
}

async function refreshRunState() {
  const response = await chrome.runtime.sendMessage({ type: "getAuditState" });
  if (!response?.ok) {
    setRunControlButtons({ running: false, paused: false });
    return;
  }
  setRunControlButtons({
    running: response.state?.running === true,
    paused: response.state?.paused === true
  });
}

async function sendControlAction(type, fallbackMessage) {
  const response = await chrome.runtime.sendMessage({ type });
  if (!response?.ok) {
    setStatus(response?.error || fallbackMessage);
  }

  const running = response?.state?.running === true;
  const paused = response?.state?.paused === true;
  setRunControlButtons({ running, paused });
}

async function runAudit() {
  setStatus("Running...");
  renderProgress(
    {
      phase: "starting",
      message: "Starting audit...",
      updatedAt: new Date().toISOString()
    },
    { progressNode, setStatus }
  );

  setRunControlButtons({ running: true, paused: false });
  setDownloadButtonsEnabled(false);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "runAudit",
      options: readSettingsFromUI()
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Audit failed");
    }

    latestResult = response.result;
    updateSummary(latestResult, summaryNode);
    setStatus(latestResult?.runState?.stoppedByUser ? "Stopped" : "Done");
    renderProgress(
      {
        phase: latestResult?.runState?.stoppedByUser ? "stopped" : "completed",
        message: latestResult?.runState?.stoppedByUser ? "Audit stopped" : "Audit completed",
        updatedAt: new Date().toISOString()
      },
      { progressNode, setStatus }
    );
    setDownloadButtonsEnabled(true);
  } catch (error) {
    const message = `Error: ${error instanceof Error ? error.message : String(error)}`;
    setStatus(message);
    renderProgress(
      {
        phase: "failed",
        message,
        updatedAt: new Date().toISOString()
      },
      { progressNode, setStatus }
    );
  } finally {
    await refreshRunState();
  }
}

runAuditButton.addEventListener("click", runAudit);

pauseAuditButton.addEventListener("click", async () => {
  await sendControlAction("pauseAudit", "Failed to pause audit");
});

resumeAuditButton.addEventListener("click", async () => {
  await sendControlAction("resumeAudit", "Failed to resume audit");
});

stopAuditButton.addEventListener("click", async () => {
  await sendControlAction("stopAudit", "Failed to stop audit");
});

patchModeToggle.addEventListener("change", saveSettings);
openOptionsButton.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

async function handleDownload(kind) {
  if (!latestResult) {
    setStatus("No audit data available. Run an audit first.");
    return;
  }

  setStatus("Preparing download...");
  const targetButton = kind === "json" ? downloadJsonButton : downloadTargetsButton;
  targetButton.disabled = true;
  try {
    const response = kind === "json" ? await downloadAuditJson() : await downloadTargets();
    if (response?.fallbackOpened) {
      setStatus(
        `Download API failed (${response.fallbackReason || "unknown"}). Opened manual export tab.`
      );
    } else {
      setStatus(`Download started: ${response.filename || "file"}`);
    }
  } catch (error) {
    setStatus(`Download failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    targetButton.disabled = false;
  }
}

downloadJsonButton.addEventListener("click", async () => {
  await handleDownload("json");
});

downloadTargetsButton.addEventListener("click", async () => {
  await handleDownload("targets");
});

(async () => {
  const data = await chrome.storage.local.get(["latestAudit", "auditProgress", SETTINGS_KEY]);
  applySettingsToUI(data?.[SETTINGS_KEY] || {});

  if (!data.latestAudit) {
    renderProgress(data.auditProgress || null, { progressNode, setStatus });
  } else {
    latestResult = data.latestAudit;
    updateSummary(latestResult, summaryNode);
    setStatus("Loaded last run");
    setDownloadButtonsEnabled(true);
    renderProgress(data.auditProgress || null, { progressNode, setStatus });
  }

  await refreshRunState();
})();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.auditProgress) {
    const progress = changes.auditProgress.newValue || null;
    renderProgress(progress, { progressNode, setStatus });
    setRunControlButtons(inferRunStateFromProgress(progress));
  }
  if (areaName === "local" && changes[SETTINGS_KEY]) {
    applySettingsToUI(changes[SETTINGS_KEY].newValue || {});
  }
});
