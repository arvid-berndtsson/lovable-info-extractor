import {
  LOAD_TIMEOUT_MS,
  getPageLoadTimeoutMs,
  getPostLoadDelayMs,
  normalizeUrl,
  sleep
} from "./shared.js";

export function waitForTabComplete(tabId, timeoutMs = LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while waiting for page load"));
    }, timeoutMs);

    function cleanup() {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }

    function onUpdated(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

export async function navigateTab(tabId, url) {
  const targetUrl = normalizeUrl(url);
  const current = await chrome.tabs.get(tabId);
  if (targetUrl && normalizeUrl(current.url || "") === targetUrl && current.status === "complete") {
    return;
  }

  const loadPromise = waitForTabComplete(tabId, getPageLoadTimeoutMs(url));
  await chrome.tabs.update(tabId, { url });
  await loadPromise;
  await sleep(getPostLoadDelayMs(url));
}

export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found");
  }
  return tab;
}
