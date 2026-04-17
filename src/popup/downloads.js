async function requestDownload(type) {
  const response = await chrome.runtime.sendMessage({ type });
  if (!response?.ok) {
    throw new Error(response?.error || "Download failed");
  }
  return response;
}

export async function downloadAuditJson() {
  return requestDownload("downloadLatestAuditJson");
}

export async function downloadTargets() {
  return requestDownload("downloadLatestTargets");
}
