import { DEFAULT_AUDIT_SETTINGS } from "../settings.js";

const DEFAULT_PROJECT_WORKER_COUNT = 3;
const MIN_PROJECT_WORKER_COUNT = 1;
const MAX_PROJECT_WORKER_COUNT = 8;
const MIN_RECENT_SCAN_SKIP_HOURS = 1;
const MAX_RECENT_SCAN_SKIP_HOURS = 168;
const MIN_PAGE_LOAD_TIMEOUT_SEC = 0;
const MAX_PAGE_LOAD_TIMEOUT_SEC = 600;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toWorkerCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PROJECT_WORKER_COUNT;
  }
  return clamp(parsed, MIN_PROJECT_WORKER_COUNT, MAX_PROJECT_WORKER_COUNT);
}

function toRecentScanSkipHours(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUDIT_SETTINGS.recentScanSkipHours;
  }
  return clamp(parsed, MIN_RECENT_SCAN_SKIP_HOURS, MAX_RECENT_SCAN_SKIP_HOURS);
}

function toPageLoadTimeoutSec(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AUDIT_SETTINGS.pageLoadTimeoutSec;
  }
  return clamp(parsed, MIN_PAGE_LOAD_TIMEOUT_SEC, MAX_PAGE_LOAD_TIMEOUT_SEC);
}

export function resolveRunOptions(options = {}) {
  const merged = {
    ...DEFAULT_AUDIT_SETTINGS,
    ...options
  };
  const pageLoadTimeoutSec = toPageLoadTimeoutSec(merged.pageLoadTimeoutSec);

  return {
    patchMode: merged.patchMode === true,
    parallelProjectInspections: merged.parallelProjectInspections === true,
    groupProjectTabs: merged.groupProjectTabs === true,
    projectWorkerCount: toWorkerCount(merged.projectWorkerCount),
    skipRecentScans: merged.skipRecentScans === true,
    recentScanSkipHours: toRecentScanSkipHours(merged.recentScanSkipHours),
    waitForPublishUpdateCompletion: merged.waitForPublishUpdateCompletion !== false,
    pageLoadTimeoutSec,
    pageLoadTimeoutMs: pageLoadTimeoutSec > 0 ? pageLoadTimeoutSec * 1000 : null
  };
}

export const projectWorkerCountLimits = {
  min: MIN_PROJECT_WORKER_COUNT,
  max: MAX_PROJECT_WORKER_COUNT,
  default: DEFAULT_PROJECT_WORKER_COUNT
};

export const recentScanSkipHoursLimits = {
  min: MIN_RECENT_SCAN_SKIP_HOURS,
  max: MAX_RECENT_SCAN_SKIP_HOURS,
  default: DEFAULT_AUDIT_SETTINGS.recentScanSkipHours
};

export const pageLoadTimeoutSecLimits = {
  min: MIN_PAGE_LOAD_TIMEOUT_SEC,
  max: MAX_PAGE_LOAD_TIMEOUT_SEC,
  default: DEFAULT_AUDIT_SETTINGS.pageLoadTimeoutSec
};
