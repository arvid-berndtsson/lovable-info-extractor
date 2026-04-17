import { navigateTab } from "./navigation.js";
import { clickPublishUpdate, tryClickTryFixAll } from "./scrape/index.js";
import { isProjectSecurityViewUrl, stripProjectSecurityViewUrl } from "./shared.js";

export function createTryFixAllStats() {
  return {
    attempted: 0,
    found: 0,
    clicked: 0,
    disabled: 0,
    notFound: 0,
    errors: 0
  };
}

export function createPublishUpdateStats() {
  return {
    attempted: 0,
    navigated: 0,
    foundPublishMenu: 0,
    sawUpToDate: 0,
    sawUpdate: 0,
    clicked: 0,
    errors: 0
  };
}

export async function maybeHandleProjectFixAll({
  enabled = true,
  tabId,
  resolvedUrl,
  pageRecord,
  fixAllStats,
  pushDebug,
  waitForEnabledMs = 8000
}) {
  if (!enabled) {
    return;
  }

  if (!isProjectSecurityViewUrl(resolvedUrl)) {
    return;
  }

  fixAllStats.attempted += 1;

  try {
    const fixAllResult = await tryClickTryFixAll(tabId, waitForEnabledMs);
    pageRecord.tryFixAll = fixAllResult;

    pushDebug("project_try_fix_all", {
      url: resolvedUrl,
      ...fixAllResult
    });

    if (fixAllResult.found) {
      fixAllStats.found += 1;
    } else {
      fixAllStats.notFound += 1;
    }

    if (fixAllResult.clicked) {
      fixAllStats.clicked += 1;
    }

    if (fixAllResult.disabled) {
      fixAllStats.disabled += 1;
    }
  } catch (error) {
    fixAllStats.errors += 1;
    const message = error instanceof Error ? error.message : String(error);
    pageRecord.tryFixAll = {
      found: false,
      clicked: false,
      disabled: false,
      waitedMs: 0,
      reason: "error",
      error: message
    };

    pushDebug("project_try_fix_all_error", {
      url: resolvedUrl,
      error: message
    });
  }
}

export async function maybeHandleProjectPublishUpdate({
  enabled = true,
  tabId,
  resolvedUrl,
  pageRecord,
  publishStats,
  pushDebug,
  waitForUpdateMs = 30000,
  pageLoadTimeoutMs = null,
  navigateTabFn = navigateTab,
  clickPublishUpdateFn = clickPublishUpdate
}) {
  if (!enabled) {
    return;
  }

  if (!isProjectSecurityViewUrl(resolvedUrl)) {
    return;
  }

  publishStats.attempted += 1;
  const projectUrl = stripProjectSecurityViewUrl(resolvedUrl);

  try {
    await navigateTabFn(tabId, projectUrl, { loadTimeoutMs: pageLoadTimeoutMs });
    publishStats.navigated += 1;

    const publishResult = await clickPublishUpdateFn(tabId, waitForUpdateMs);
    pageRecord.publishUpdate = {
      projectUrl,
      ...publishResult
    };

    pushDebug("project_publish_update", {
      url: resolvedUrl,
      projectUrl,
      ...publishResult
    });

    if (publishResult.foundPublishMenu) {
      publishStats.foundPublishMenu += 1;
    }
    if (publishResult.sawUpToDate) {
      publishStats.sawUpToDate += 1;
    }
    if (publishResult.sawUpdate) {
      publishStats.sawUpdate += 1;
    }
    if (publishResult.clicked) {
      publishStats.clicked += 1;
    }
  } catch (error) {
    publishStats.errors += 1;
    const message = error instanceof Error ? error.message : String(error);
    pageRecord.publishUpdate = {
      projectUrl,
      foundPublishMenu: false,
      sawUpToDate: false,
      sawUpdate: false,
      clicked: false,
      waitedMs: 0,
      reason: "error",
      error: message
    };

    pushDebug("project_publish_update_error", {
      url: resolvedUrl,
      projectUrl,
      error: message
    });
  }
}
