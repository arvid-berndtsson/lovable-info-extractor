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

export async function navigateTab(tabId, url, options = {}) {
  const start = Date.now();
  const targetUrl = normalizeUrl(url);
  const current = await chrome.tabs.get(tabId);
  const configuredTimeoutMs =
    Number.isFinite(options?.loadTimeoutMs) && options.loadTimeoutMs > 0
      ? options.loadTimeoutMs
      : getPageLoadTimeoutMs(url);
  const postLoadDelayMs = getPostLoadDelayMs(url);

  if (targetUrl && normalizeUrl(current.url || "") === targetUrl && current.status === "complete") {
    return {
      skippedNavigation: true,
      configuredTimeoutMs,
      postLoadDelayMs,
      waitMs: 0,
      elapsedMs: Date.now() - start
    };
  }

  const waitStart = Date.now();
  const loadPromise = waitForTabComplete(tabId, configuredTimeoutMs);
  await chrome.tabs.update(tabId, { url });
  await loadPromise;
  const waitMs = Date.now() - waitStart;
  await sleep(postLoadDelayMs);

  return {
    skippedNavigation: false,
    configuredTimeoutMs,
    postLoadDelayMs,
    waitMs,
    elapsedMs: Date.now() - start
  };
}

export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found");
  }
  return tab;
}
