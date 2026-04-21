import {
  pageLoadTimeoutSecLimits,
  projectWorkerCountLimits,
  recentScanSkipHoursLimits
} from "./background/options.js";
import { DEFAULT_AUDIT_SETTINGS, SETTINGS_KEY } from "./settings.js";

const elements = {
  parallelProjectInspections: document.getElementById("parallelProjectInspections"),
  parallelSettings: document.getElementById("parallelSettings"),
  projectWorkerCount: document.getElementById("projectWorkerCount"),
  groupProjectTabs: document.getElementById("groupProjectTabs"),
  skipRecentScans: document.getElementById("skipRecentScans"),
  skipRecentSettings: document.getElementById("skipRecentSettings"),
  recentScanSkipHours: document.getElementById("recentScanSkipHours"),
  pageLoadTimeoutSec: document.getElementById("pageLoadTimeoutSec"),
  saveState: document.getElementById("saveState")
};

let currentSettings = { ...DEFAULT_AUDIT_SETTINGS };

function clamp(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeSettings(input = {}) {
  return {
    ...DEFAULT_AUDIT_SETTINGS,
    ...input,
    patchMode: input.patchMode === true,
    parallelProjectInspections: input.parallelProjectInspections === true,
    groupProjectTabs: input.groupProjectTabs === true,
    projectWorkerCount: clamp(
      input.projectWorkerCount,
      projectWorkerCountLimits.min,
      projectWorkerCountLimits.max,
      projectWorkerCountLimits.default
    ),
    skipRecentScans: input.skipRecentScans !== false,
    recentScanSkipHours: clamp(
      input.recentScanSkipHours,
      recentScanSkipHoursLimits.min,
      recentScanSkipHoursLimits.max,
      recentScanSkipHoursLimits.default
    ),
    pageLoadTimeoutSec: clamp(
      input.pageLoadTimeoutSec,
      pageLoadTimeoutSecLimits.min,
      pageLoadTimeoutSecLimits.max,
      pageLoadTimeoutSecLimits.default
    )
  };
}

function render() {
  elements.parallelProjectInspections.checked = currentSettings.parallelProjectInspections;
  elements.projectWorkerCount.value = String(currentSettings.projectWorkerCount);
  elements.groupProjectTabs.checked = currentSettings.groupProjectTabs;
  elements.skipRecentScans.checked = currentSettings.skipRecentScans;
  elements.recentScanSkipHours.value = String(currentSettings.recentScanSkipHours);
  elements.pageLoadTimeoutSec.value = String(currentSettings.pageLoadTimeoutSec);

  elements.parallelSettings.hidden = !currentSettings.parallelProjectInspections;
  elements.skipRecentSettings.hidden = !currentSettings.skipRecentScans;
}

function readFromForm() {
  return normalizeSettings({
    ...currentSettings,
    parallelProjectInspections: elements.parallelProjectInspections.checked,
    projectWorkerCount: elements.projectWorkerCount.value,
    groupProjectTabs: elements.groupProjectTabs.checked,
    skipRecentScans: elements.skipRecentScans.checked,
    recentScanSkipHours: elements.recentScanSkipHours.value,
    pageLoadTimeoutSec: elements.pageLoadTimeoutSec.value
  });
}

let saveStateTimer = null;
function showSavedState(message) {
  elements.saveState.textContent = message;
  if (saveStateTimer) {
    clearTimeout(saveStateTimer);
  }
  if (message !== "Saved") {
    saveStateTimer = setTimeout(() => {
      elements.saveState.textContent = "Saved";
      saveStateTimer = null;
    }, 900);
  }
}

async function save() {
  currentSettings = readFromForm();
  render();
  await chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings });
  showSavedState("Saved");
}

function onFieldInput() {
  currentSettings = readFromForm();
  render();
  showSavedState("Saving...");
  save().catch((error) => {
    showSavedState(error instanceof Error ? `Save failed: ${error.message}` : "Save failed");
  });
}

async function init() {
  elements.projectWorkerCount.min = String(projectWorkerCountLimits.min);
  elements.projectWorkerCount.max = String(projectWorkerCountLimits.max);
  elements.recentScanSkipHours.min = String(recentScanSkipHoursLimits.min);
  elements.recentScanSkipHours.max = String(recentScanSkipHoursLimits.max);
  elements.pageLoadTimeoutSec.min = String(pageLoadTimeoutSecLimits.min);
  elements.pageLoadTimeoutSec.max = String(pageLoadTimeoutSecLimits.max);

  const stored = await chrome.storage.local.get([SETTINGS_KEY]);
  currentSettings = normalizeSettings(stored?.[SETTINGS_KEY] || {});
  render();
  showSavedState("Saved");

  elements.parallelProjectInspections.addEventListener("change", onFieldInput);
  elements.projectWorkerCount.addEventListener("change", onFieldInput);
  elements.groupProjectTabs.addEventListener("change", onFieldInput);
  elements.skipRecentScans.addEventListener("change", onFieldInput);
  elements.recentScanSkipHours.addEventListener("change", onFieldInput);
  elements.pageLoadTimeoutSec.addEventListener("change", onFieldInput);
}

init().catch((error) => {
  showSavedState(error instanceof Error ? `Load failed: ${error.message}` : "Load failed");
});
