import { navigateTab } from "./navigation.js";
import {
  maybeHandleProjectFixAll,
  maybeHandleProjectPublishUpdate
} from "./project-fix.js";
import { scrapeCurrentPage } from "./scrape/index.js";
import { recoverProjectSecurityView } from "./security-view.js";
import {
  ensureProjectSecurityViewUrl,
  isLovableProjectPage,
  isProjectSecurityViewUrl,
  normalizeUrl,
  stripProjectSecurityViewUrl
} from "./shared.js";

const WORKER_PLACEHOLDER_URL = "about:blank";

function uniqueProjectUrls(urls) {
  const unique = new Set();
  for (const raw of urls || []) {
    const normalized = normalizeUrl(raw || "");
    if (!normalized || !isLovableProjectPage(normalized)) {
      continue;
    }
    unique.add(ensureProjectSecurityViewUrl(normalized));
  }
  return [...unique];
}

function resolveProjectOverviewForUrl(url, projectOverviewByUrl) {
  if (!projectOverviewByUrl || projectOverviewByUrl.size === 0) {
    return null;
  }

  const normalized = normalizeUrl(url || "");
  if (!normalized) {
    return null;
  }

  if (projectOverviewByUrl.has(normalized)) {
    return projectOverviewByUrl.get(normalized);
  }

  if (isProjectSecurityViewUrl(normalized)) {
    const baseUrl = normalizeUrl(stripProjectSecurityViewUrl(normalized));
    if (baseUrl && projectOverviewByUrl.has(baseUrl)) {
      return projectOverviewByUrl.get(baseUrl);
    }
    return null;
  }

  const securityUrl = normalizeUrl(ensureProjectSecurityViewUrl(normalized));
  if (securityUrl && projectOverviewByUrl.has(securityUrl)) {
    return projectOverviewByUrl.get(securityUrl);
  }
  return null;
}

function withCallbackOrPromise(invoker) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      fn(value);
    };

    try {
      const maybePromise = invoker((result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          finish(reject, new Error(err.message));
          return;
        }
        finish(resolve, result);
      });

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error)
        );
      }
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function createTab(params) {
  return withCallbackOrPromise((callback) => chrome.tabs.create(params, callback));
}

async function removeTab(tabId) {
  return withCallbackOrPromise((callback) => chrome.tabs.remove(tabId, callback));
}

async function groupTabs(tabIds) {
  return withCallbackOrPromise((callback) => chrome.tabs.group({ tabIds }, callback));
}

async function updateTabGroup(groupId, params) {
  return withCallbackOrPromise((callback) => chrome.tabGroups.update(groupId, params, callback));
}

async function createWorkerTabs({ windowId, index, workerCount, initialUrls = [] }) {
  const workerAssignments = [];
  for (let i = 0; i < workerCount; i += 1) {
    const initialUrl = initialUrls[i] || WORKER_PLACEHOLDER_URL;
    const created = await createTab({
      windowId,
      index: index + i + 1,
      active: false,
      url: initialUrl
    });
    if (typeof created.id === "number") {
      workerAssignments.push({
        tabId: created.id,
        initialUrl: initialUrls[i] || null
      });
    }
  }
  return workerAssignments;
}

async function maybeCreateTabGroup(tabIds, pushDebug) {
  const diagnostics = {
    tabsGroupAvailable: typeof chrome.tabs.group === "function",
    tabGroupsUpdateAvailable: Boolean(chrome.tabGroups?.update),
    userAgent: typeof navigator?.userAgent === "string" ? navigator.userAgent : "unknown"
  };

  if (!tabIds.length || typeof chrome.tabs.group !== "function") {
    pushDebug("parallel_tabs_group_unavailable", {
      reason: "tabs.group_unavailable",
      diagnostics
    });
    return {
      grouped: false,
      groupId: null,
      error: "tabs.group_unavailable",
      diagnostics
    };
  }

  try {
    const groupId = await groupTabs(tabIds);
    if (chrome.tabGroups?.update) {
      await updateTabGroup(groupId, {
        title: "Lovable Audit",
        color: "blue",
        collapsed: false
      });
    }
    pushDebug("parallel_tabs_grouped", { groupId, tabCount: tabIds.length, diagnostics });
    return { grouped: true, groupId, error: null, diagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushDebug("parallel_tabs_group_failed", {
      error: message,
      diagnostics
    });
    return {
      grouped: false,
      groupId: null,
      error: message,
      diagnostics
    };
  }
}

export async function processProjectInspectionsInParallel({
  run,
  projectUrls,
  patchMode,
  projectWorkerCount,
  groupProjectTabs,
  pageLoadTimeoutMs,
  windowId,
  tabInsertIndex,
  artifacts,
  crawledPages,
  fixAllStats,
  publishUpdateStats,
  projectOverviewByUrl,
  pushDebug,
  checkpointFn
}) {
  const urls = uniqueProjectUrls(projectUrls);
  if (urls.length === 0) {
    return {
      enabled: true,
      used: false,
      totalProjects: 0,
      processedProjects: 0,
      workerCount: 0,
      createdTabs: 0,
      grouped: false,
      groupId: null,
      groupError: null,
      errors: 0,
      stoppedEarly: false
    };
  }

  const workerCount = Math.max(1, Math.min(projectWorkerCount || 1, urls.length));
  const initialWorkerUrls = urls.slice(0, workerCount);
  const workerAssignments = await createWorkerTabs({
    windowId,
    index: tabInsertIndex,
    workerCount,
    initialUrls: initialWorkerUrls
  });

  if (workerAssignments.length === 0) {
    throw new Error("Failed to create worker tabs for parallel project inspections");
  }
  const tabIds = workerAssignments.map((assignment) => assignment.tabId);
  const activeWorkerCount = workerAssignments.length;

  let grouped = false;
  let groupId = null;
  let groupError = null;
  let groupDiagnostics = null;
  if (groupProjectTabs) {
    const grouping = await maybeCreateTabGroup(tabIds, pushDebug);
    grouped = grouping.grouped;
    groupId = grouping.groupId;
    groupError = grouping.error || null;
    groupDiagnostics = grouping.diagnostics || null;
  }

  await run.progress.publish({
    phase: "parallel_project_setup",
    message: grouped
      ? `Opened ${tabIds.length} worker tabs in a tab group`
      : `Opened ${tabIds.length} worker tabs${groupProjectTabs ? " (group unavailable)" : ""}`,
    visitedCount: run.visited.size,
    queuedCount: run.queue.size(),
    parallelProjectProcessed: 0,
    parallelProjectTotal: urls.length,
    parallelWorkers: activeWorkerCount
  });

  const assignedInitialUrls = new Set(
    workerAssignments.map((assignment) => assignment.initialUrl).filter(Boolean)
  );
  let cursor = 0;
  let processedProjects = 0;
  let errorCount = 0;
  let stoppedEarly = false;

  function takeNextUrl() {
    while (cursor < urls.length) {
      const next = urls[cursor];
      cursor += 1;
      if (assignedInitialUrls.has(next)) {
        assignedInitialUrls.delete(next);
        continue;
      }
      return next;
    }
    return null;
  }

  async function inspectProjectOnTab(workerTabId, workerIndex, initialUrl = null) {
    let nextAssignedUrl = initialUrl;
    while (true) {
      if ((await checkpointFn(`parallel_worker_${workerIndex}_loop`)) === "stop") {
        stoppedEarly = true;
        return;
      }

      const targetUrl = nextAssignedUrl || takeNextUrl();
      nextAssignedUrl = null;
      if (!targetUrl) {
        return;
      }

      processedProjects += 1;
      await run.progress.publish({
        phase: "parallel_project_inspections",
        message: `Parallel project inspections ${processedProjects}/${urls.length}`,
        visitedCount: run.visited.size,
        queuedCount: run.queue.size(),
        parallelProjectProcessed: processedProjects,
        parallelProjectTotal: urls.length,
        parallelWorkers: activeWorkerCount
      });

      pushDebug("parallel_project_visit", {
        workerIndex,
        tabId: workerTabId,
        url: targetUrl,
        processedProjects,
        totalProjects: urls.length
      });

      const inspectStartedAt = Date.now();
      try {
        const pageStart = Date.now();
        const navigationTiming = await navigateTab(workerTabId, targetUrl, {
          loadTimeoutMs: pageLoadTimeoutMs
        });
        const scrapeStart = Date.now();
        let scraped = await scrapeCurrentPage(workerTabId);
        const scrapeMs = Date.now() - scrapeStart;

        const securityRecoveryResult = await recoverProjectSecurityView({
          tabId: workerTabId,
          intendedUrl: targetUrl,
          initialScraped: scraped,
          scrapeFn: scrapeCurrentPage,
          pushDebug,
          loadTimeoutMs: pageLoadTimeoutMs
        });
        scraped = securityRecoveryResult.scraped;

        if (!scraped || !scraped.url) {
          continue;
        }

        const resolvedUrl = normalizeUrl(scraped.url || targetUrl) || targetUrl;

        const pageRecord = {
          url: resolvedUrl,
          title: scraped.title,
          textLength: scraped.text.length,
          securityViewRecovery: securityRecoveryResult.recovery,
          timings: {
            navigateMs: navigationTiming?.elapsedMs || 0,
            waitForLoadMs: navigationTiming?.waitMs || 0,
            scrapeMs,
            totalMs: Date.now() - pageStart,
            configuredLoadTimeoutMs: navigationTiming?.configuredTimeoutMs || pageLoadTimeoutMs || null,
            skippedNavigation: navigationTiming?.skippedNavigation === true
          }
        };
        crawledPages.push(pageRecord);

        pushDebug("parallel_page_timing", {
          workerIndex,
          tabId: workerTabId,
          url: resolvedUrl,
          timings: pageRecord.timings
        });

        await maybeHandleProjectFixAll({
          enabled: patchMode,
          tabId: workerTabId,
          resolvedUrl,
          pageRecord,
          fixAllStats,
          pushDebug,
          waitForEnabledMs: 8000
        });

        await maybeHandleProjectPublishUpdate({
          enabled: patchMode,
          tabId: workerTabId,
          resolvedUrl,
          pageRecord,
          publishStats: publishUpdateStats,
          pushDebug,
          projectOverview: resolveProjectOverviewForUrl(resolvedUrl, projectOverviewByUrl),
          waitForUpdateMs: 45000,
          pageLoadTimeoutMs
        });

        artifacts.push(scraped.text);
        artifacts.push(scraped.title);
        for (const anchor of scraped.anchors) {
          if (anchor.href) {
            artifacts.push(anchor.href);
          }
          if (anchor.text) {
            artifacts.push(anchor.text);
          }
        }
      } catch (error) {
        errorCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        pushDebug("parallel_project_error", {
          workerIndex,
          tabId: workerTabId,
          url: targetUrl,
          error: message
        });
        crawledPages.push({
          url: targetUrl,
          title: "",
          textLength: 0,
          timings: {
            totalMs: Date.now() - inspectStartedAt,
            configuredLoadTimeoutMs: pageLoadTimeoutMs || null
          },
          error: message
        });
      }
    }
  }

  try {
    await Promise.all(
      workerAssignments.map((assignment, index) =>
        inspectProjectOnTab(assignment.tabId, index + 1, assignment.initialUrl)
      )
    );
  } finally {
    await Promise.allSettled(tabIds.map((tabId) => removeTab(tabId)));
  }

  return {
    enabled: true,
    used: true,
    totalProjects: urls.length,
    processedProjects,
    workerCount: activeWorkerCount,
    createdTabs: tabIds.length,
    grouped,
    groupId,
    groupError,
    groupDiagnostics,
    errors: errorCount,
    stoppedEarly
  };
}
