import { navigateTab } from "./navigation.js";
import { clickPublishUpdate, tryClickTryFixAll } from "./scrape/index.js";
import { isProjectSecurityViewUrl, stripProjectSecurityViewUrl } from "./shared.js";

function normalizeVisibility(value) {
  const text = String(value || "").trim();
  return text || null;
}

function isDraftVisibility(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "draft" || normalized.includes("draft");
}

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
    upToDateNoUpdate: 0,
    missingUpdate: 0,
    unexpectedMissingUpdate: 0,
    draftWithoutUpdate: 0,
    clicked: 0,
    clickedSettledUpToDate: 0,
    clickedStillUpdating: 0,
    clickedUnconfirmed: 0,
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
  projectOverview = null,
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
  const overviewVisibility = normalizeVisibility(projectOverview?.visibility);

  try {
    await navigateTabFn(tabId, projectUrl, { loadTimeoutMs: pageLoadTimeoutMs });
    publishStats.navigated += 1;

    const publishResult = await clickPublishUpdateFn(tabId, waitForUpdateMs);
    const upToDateNoUpdate =
      publishResult.reason === "still_up_to_date" ||
      (publishResult.sawUpToDate === true && publishResult.sawUpdate !== true);
    const missingUpdate = publishResult.sawUpdate !== true && !upToDateNoUpdate;
    const draftVisibility = isDraftVisibility(overviewVisibility);
    const visibilityKnown = Boolean(overviewVisibility);
    const unexpectedMissingUpdate = missingUpdate && visibilityKnown && !draftVisibility;

    pageRecord.publishUpdate = {
      projectUrl,
      overviewVisibility,
      upToDateNoUpdate,
      missingUpdate,
      unexpectedMissingUpdate,
      ...publishResult
    };

    pushDebug("project_publish_update", {
      url: resolvedUrl,
      projectUrl,
      overviewVisibility,
      upToDateNoUpdate,
      missingUpdate,
      unexpectedMissingUpdate,
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
    if (upToDateNoUpdate) {
      publishStats.upToDateNoUpdate += 1;
    }
    if (missingUpdate) {
      publishStats.missingUpdate += 1;
      if (draftVisibility) {
        publishStats.draftWithoutUpdate += 1;
      } else if (unexpectedMissingUpdate) {
        publishStats.unexpectedMissingUpdate += 1;
      }
    }
    if (publishResult.clicked) {
      publishStats.clicked += 1;
      if (publishResult.postClick?.lifecycle === "up_to_date") {
        publishStats.clickedSettledUpToDate += 1;
      } else if (publishResult.postClick?.lifecycle === "updating") {
        publishStats.clickedStillUpdating += 1;
      } else {
        publishStats.clickedUnconfirmed += 1;
      }
    }

    if (unexpectedMissingUpdate) {
      pushDebug("project_publish_update_unexpected_missing_update", {
        url: resolvedUrl,
        projectUrl,
        overviewProject: projectOverview || null,
        publishResult,
        tryFixAll: pageRecord.tryFixAll || null,
        reason:
          "No Update button found for non-draft project based on Security Center overview visibility"
      });
    }

    if (publishResult.clicked && publishResult.postClick?.lifecycle === "updating") {
      pushDebug("project_publish_update_still_updating", {
        url: resolvedUrl,
        projectUrl,
        overviewProject: projectOverview || null,
        postClick: publishResult.postClick
      });
    }
  } catch (error) {
    publishStats.errors += 1;
    const message = error instanceof Error ? error.message : String(error);
    pageRecord.publishUpdate = {
      projectUrl,
      overviewVisibility,
      upToDateNoUpdate: false,
      missingUpdate: false,
      unexpectedMissingUpdate: false,
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
