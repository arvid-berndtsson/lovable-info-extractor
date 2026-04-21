import { asTargetsFile } from "../lib/targets.js";

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    URL.revokeObjectURL(url);
  });
}

export function downloadAuditJson(result) {
  if (!result) {
    return;
  }

  const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadTextFile(
    `lovable-info-extractor-${dateStamp}.json`,
    JSON.stringify(result, null, 2)
  );
}

export function downloadTargets(result) {
  if (!result) {
    return;
  }

  downloadTextFile("targets.txt", asTargetsFile(result));
}
