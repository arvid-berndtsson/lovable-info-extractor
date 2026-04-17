import { asTargetsFile } from "./lib/targets.js";

const statusNode = document.getElementById("status");
const reasonNode = document.getElementById("reason");
const contentNode = document.getElementById("content");
const downloadButton = document.getElementById("downloadButton");
const copyButton = document.getElementById("copyButton");

let exportFilename = "export.txt";
let exportMimeType = "text/plain;charset=utf-8";
let exportContent = "";

function setStatus(text) {
  statusNode.textContent = text;
}

function parseQuery() {
  const params = new URLSearchParams(location.search);
  return {
    kind: params.get("kind") || "",
    filename: params.get("filename") || "",
    reason: params.get("reason") || ""
  };
}

function resolveExportPayload(kind, latestAudit) {
  if (kind === "audit-json") {
    return {
      mimeType: "application/json;charset=utf-8",
      content: JSON.stringify(latestAudit, null, 2)
    };
  }

  if (kind === "targets") {
    return {
      mimeType: "text/plain;charset=utf-8",
      content: asTargetsFile(latestAudit)
    };
  }

  throw new Error(`Unknown export kind: ${kind || "missing"}`);
}

function updateButtonsEnabled(enabled) {
  downloadButton.disabled = !enabled;
  copyButton.disabled = !enabled;
}

function triggerDownload() {
  const blob = new Blob([exportContent], { type: exportMimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exportFilename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyContent() {
  await navigator.clipboard.writeText(exportContent);
}

async function init() {
  updateButtonsEnabled(false);

  const { kind, filename, reason } = parseQuery();
  if (reason) {
    reasonNode.hidden = false;
    reasonNode.textContent = `Automatic download failed: ${reason}`;
  }

  if (!kind) {
    setStatus("Missing export kind.");
    return;
  }

  const stored = await chrome.storage.local.get(["latestAudit"]);
  const latestAudit = stored?.latestAudit || null;
  if (!latestAudit) {
    setStatus("No audit data available. Run an audit first.");
    return;
  }

  const payload = resolveExportPayload(kind, latestAudit);
  exportFilename = filename || (kind === "audit-json" ? "audit.json" : "targets.txt");
  exportMimeType = payload.mimeType;
  exportContent = payload.content;

  contentNode.value = exportContent;
  updateButtonsEnabled(true);
  setStatus(`Ready. Use Download or Copy for ${exportFilename}.`);
}

downloadButton.addEventListener("click", () => {
  triggerDownload();
  setStatus(`Download triggered: ${exportFilename}`);
});

copyButton.addEventListener("click", async () => {
  try {
    await copyContent();
    setStatus("Copied export content to clipboard.");
  } catch (error) {
    setStatus(`Copy failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

init().catch((error) => {
  setStatus(`Failed to load export: ${error instanceof Error ? error.message : String(error)}`);
});
