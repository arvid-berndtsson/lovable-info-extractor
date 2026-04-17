import { asTargetsFile } from "../lib/targets.js";

const EXPORT_KIND_AUDIT_JSON = "audit-json";
const EXPORT_KIND_TARGETS = "targets";

function nowIsoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function buildAuditJsonFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `lovable-info-extractor-${stamp}.json`;
}

export function buildDownloadDataUrl(content, mimeType = "text/plain") {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

function downloadsApiDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const lastError = chrome.runtime?.lastError;
      if (lastError?.message) {
        reject(new Error(lastError.message));
        return;
      }

      if (!Number.isFinite(downloadId)) {
        reject(new Error("Download did not start"));
        return;
      }

      resolve(downloadId);
    });
  });
}

async function openManualExportFallbackTab({ kind, filename, reason }) {
  const url = new URL(chrome.runtime.getURL("src/export.html"));
  url.searchParams.set("kind", kind);
  url.searchParams.set("filename", filename);
  url.searchParams.set("at", nowIsoStamp());
  if (reason) {
    url.searchParams.set("reason", reason);
  }

  await chrome.tabs.create({ url: url.toString() });
}

async function startDownloadWithFallback({ content, filename, mimeType, kind }) {
  try {
    const dataUrl = buildDownloadDataUrl(content, mimeType);
    const downloadId = await downloadsApiDownload({
      url: dataUrl,
      filename,
      saveAs: true
    });

    return {
      filename,
      downloadId,
      fallbackOpened: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await openManualExportFallbackTab({
      kind,
      filename,
      reason: message
    });

    return {
      filename,
      fallbackOpened: true,
      fallbackReason: message
    };
  }
}

async function getLatestAuditOrThrow() {
  const stored = await chrome.storage.local.get(["latestAudit"]);
  const latestAudit = stored?.latestAudit || null;
  if (!latestAudit) {
    throw new Error("No audit data available. Run an audit first.");
  }
  return latestAudit;
}

export async function downloadLatestAuditJson() {
  const latestAudit = await getLatestAuditOrThrow();
  const content = JSON.stringify(latestAudit, null, 2);
  const filename = buildAuditJsonFilename();
  return startDownloadWithFallback({
    content,
    filename,
    mimeType: "application/json",
    kind: EXPORT_KIND_AUDIT_JSON
  });
}

export async function downloadLatestTargets() {
  const latestAudit = await getLatestAuditOrThrow();
  const content = asTargetsFile(latestAudit);
  const filename = "targets.txt";
  return startDownloadWithFallback({
    content,
    filename,
    mimeType: "text/plain",
    kind: EXPORT_KIND_TARGETS
  });
}
