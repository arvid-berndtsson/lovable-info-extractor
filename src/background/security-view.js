import {
  isProjectSecurityViewUrl,
  normalizeUrl,
  sleep
} from "./shared.js";
import { navigateTab } from "./navigation.js";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_SETTLE_BEFORE_RETRY_MS = 500;

function toNormalized(url) {
  return normalizeUrl(url || "");
}

export async function recoverProjectSecurityView({
  tabId,
  intendedUrl,
  initialScraped,
  scrapeFn,
  pushDebug = () => {},
  loadTimeoutMs = null,
  maxRetries = DEFAULT_MAX_RETRIES,
  settleBeforeRetryMs = DEFAULT_SETTLE_BEFORE_RETRY_MS,
  navigateTabFn = navigateTab,
  getTabFn = (id) => chrome.tabs.get(id)
}) {
  const intendedNormalized = toNormalized(intendedUrl);
  const initialUrl = toNormalized(initialScraped?.url || "");

  if (!intendedNormalized || !isProjectSecurityViewUrl(intendedNormalized)) {
    return {
      scraped: initialScraped,
      recovery: {
        attempted: false,
        retries: 0,
        matched: false,
        intendedUrl: intendedNormalized,
        initialUrl,
        finalUrl: initialUrl,
        reason: "intended_not_security_view"
      }
    };
  }

  if (initialUrl && isProjectSecurityViewUrl(initialUrl)) {
    return {
      scraped: initialScraped,
      recovery: {
        attempted: false,
        retries: 0,
        matched: true,
        intendedUrl: intendedNormalized,
        initialUrl,
        finalUrl: initialUrl,
        reason: "already_on_security_view"
      }
    };
  }

  pushDebug("project_security_view_mismatch", {
    tabId,
    intendedUrl: intendedNormalized,
    actualUrl: initialUrl || null
  });

  let currentScraped = initialScraped;
  let currentUrl = initialUrl;
  const retries = Math.max(1, Number.parseInt(String(maxRetries || 0), 10) || DEFAULT_MAX_RETRIES);
  const baseSettleMs = Math.max(0, settleBeforeRetryMs);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const settleMs = baseSettleMs * attempt;
    await sleep(settleMs);

    const tab = await getTabFn(tabId);
    const observedUrl = toNormalized(tab?.url || "");

    pushDebug("project_security_view_probe", {
      tabId,
      attempt,
      settleMs,
      intendedUrl: intendedNormalized,
      observedUrl: observedUrl || null
    });

    if (observedUrl && isProjectSecurityViewUrl(observedUrl)) {
      currentScraped = await scrapeFn(tabId);
      currentUrl = toNormalized(currentScraped?.url || observedUrl);
      pushDebug("project_security_view_recovered", {
        tabId,
        attempt,
        intendedUrl: intendedNormalized,
        actualUrl: currentUrl || observedUrl,
        mode: "passive_settle"
      });
      return {
        scraped: currentScraped,
        recovery: {
          attempted: true,
          retries: attempt,
          matched: true,
          intendedUrl: intendedNormalized,
          initialUrl,
          finalUrl: currentUrl || observedUrl,
          reason: "passive_settle"
        }
      };
    }

    await navigateTabFn(tabId, intendedNormalized, { loadTimeoutMs });
    currentScraped = await scrapeFn(tabId);
    currentUrl = toNormalized(currentScraped?.url || "");

    pushDebug("project_security_view_retry", {
      tabId,
      attempt,
      intendedUrl: intendedNormalized,
      actualUrl: currentUrl || null
    });

    if (currentUrl && isProjectSecurityViewUrl(currentUrl)) {
      pushDebug("project_security_view_recovered", {
        tabId,
        attempt,
        intendedUrl: intendedNormalized,
        actualUrl: currentUrl,
        mode: "renavigate"
      });
      return {
        scraped: currentScraped,
        recovery: {
          attempted: true,
          retries: attempt,
          matched: true,
          intendedUrl: intendedNormalized,
          initialUrl,
          finalUrl: currentUrl,
          reason: "renavigate"
        }
      };
    }
  }

  pushDebug("project_security_view_unresolved", {
    tabId,
    intendedUrl: intendedNormalized,
    actualUrl: currentUrl || null,
    attempts: retries
  });

  return {
    scraped: currentScraped,
    recovery: {
      attempted: true,
      retries,
      matched: false,
      intendedUrl: intendedNormalized,
      initialUrl,
      finalUrl: currentUrl || null,
      reason: "unresolved_after_retries"
    }
  };
}
