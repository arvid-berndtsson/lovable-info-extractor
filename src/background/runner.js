import { collectProjectUrls, parseSecuritySummary } from "../lib/parsers.js";
import { makeDebugLogger } from "./debug.js";
import { getActiveTab, navigateTab } from "./navigation.js";
import { resolveRunOptions } from "./options.js";
import { collectOverviewAndQueueProjects } from "./overview.js";
import { processProjectInspectionsInParallel } from "./project-workers.js";
import {
  createPublishUpdateStats,
  createTryFixAllStats,
  maybeHandleProjectFixAll,
  maybeHandleProjectPublishUpdate
} from "./project-fix.js";
import { makeProgressReporter } from "./progress.js";
import { createUrlQueue } from "./queue.js";
import { scrapeCurrentPage } from "./scrape/index.js";
import { recoverProjectSecurityView } from "./security-view.js";
import {
  LOVABLE_ORIGIN,
  MAX_PAGES,
  SECURITY_SECTIONS,
  ensureProjectSecurityViewUrl,
  isLovableProjectPage,
  isProjectSecurityViewUrl,
  isLovableUrl,
  normalizeUrl,
  nowIso,
  resolveSectionKey,
  sleep,
  stripProjectSecurityViewUrl,
  toAbsoluteLovableUrl
} from "./shared.js";

export { createUrlQueue } from "./queue.js";

const RUN_CONTROL_POLL_MS = 400;

let activeRun = null;

function toNumberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function summarizeTimingMetric(values) {
  if (!values.length) {
    return {
      count: 0,
      averageMs: 0,
      maxMs: 0,
      minMs: 0,
      totalMs: 0
    };
  }

  let totalMs = 0;
  let maxMs = Number.NEGATIVE_INFINITY;
  let minMs = Number.POSITIVE_INFINITY;

  for (const value of values) {
    totalMs += value;
    if (value > maxMs) {
      maxMs = value;
    }
    if (value < minMs) {
      minMs = value;
    }
  }

  return {
    count: values.length,
    averageMs: Math.round(totalMs / values.length),
    maxMs: Math.round(maxMs),
    minMs: Math.round(minMs),
    totalMs: Math.round(totalMs)
  };
}

function buildTimingInsights(crawledPages) {
  const timedPages = crawledPages
    .filter((page) => page?.timings && Number.isFinite(page.timings.totalMs))
    .map((page) => ({
      url: page.url,
      totalMs: toNumberOrZero(page.timings.totalMs),
      navigateMs: toNumberOrZero(page.timings.navigateMs),
      scrapeMs: toNumberOrZero(page.timings.scrapeMs),
      configuredLoadTimeoutMs: toNumberOrZero(page.timings.configuredLoadTimeoutMs),
      skippedNavigation: page.timings.skippedNavigation === true
    }));

  const totalDurations = timedPages.map((page) => page.totalMs);
  const navigateDurations = timedPages.map((page) => page.navigateMs);
  const scrapeDurations = timedPages.map((page) => page.scrapeMs);

  const slowestPages = [...timedPages]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10);

  return {
    pagesWithTimings: timedPages.length,
    total: summarizeTimingMetric(totalDurations),
    navigation: summarizeTimingMetric(navigateDurations),
    scrape: summarizeTimingMetric(scrapeDurations),
    slowestPages
  };
}

function getControlStateSnapshot() {
  return {
    running: Boolean(activeRun),
    paused: Boolean(activeRun?.control?.paused),
    stopRequested: Boolean(activeRun?.control?.stopRequested),
    startedAt: activeRun?.startedAt || null
  };
}

async function publishControlStatus(run, phase, message) {
  await run.progress.publish({
    phase,
    message,
    visitedCount: run.visited.size,
    queuedCount: run.queue.size()
  });
}

async function checkpoint(run, location) {
  const { control, pushDebug } = run;

  if (control.stopRequested) {
    pushDebug("stop_acknowledged", { location });
    return "stop";
  }

  if (!control.paused) {
    return "continue";
  }

  pushDebug("pause_enter", { location });
  await publishControlStatus(run, "paused", "Paused by user. Click Resume to continue.");

  while (control.paused && !control.stopRequested) {
    await sleep(RUN_CONTROL_POLL_MS);
  }

  if (control.stopRequested) {
    pushDebug("stop_acknowledged", { location });
    return "stop";
  }

  pushDebug("pause_exit", { location });
  await publishControlStatus(run, "resuming", "Resuming audit");
  return "continue";
}

export async function requestPauseAudit() {
  if (!activeRun) {
    return {
      ok: false,
      error: "No active audit run",
      state: getControlStateSnapshot()
    };
  }

  activeRun.control.paused = true;
  activeRun.pushDebug("pause_requested", {});
  await publishControlStatus(activeRun, "pausing", "Pause requested. Waiting for safe checkpoint.");

  return {
    ok: true,
    state: getControlStateSnapshot()
  };
}

export async function requestResumeAudit() {
  if (!activeRun) {
    return {
      ok: false,
      error: "No active audit run",
      state: getControlStateSnapshot()
    };
  }

  activeRun.control.paused = false;
  activeRun.pushDebug("resume_requested", {});
  await publishControlStatus(activeRun, "resuming", "Resume requested.");

  return {
    ok: true,
    state: getControlStateSnapshot()
  };
}

export async function requestStopAudit() {
  if (!activeRun) {
    return {
      ok: false,
      error: "No active audit run",
      state: getControlStateSnapshot()
    };
  }

  activeRun.control.stopRequested = true;
  activeRun.control.paused = false;
  activeRun.pushDebug("stop_requested", {});
  await publishControlStatus(activeRun, "stopping", "Stop requested. Ending at next safe checkpoint.");

  return {
    ok: true,
    state: getControlStateSnapshot()
  };
}

export function getAuditRunState() {
  return getControlStateSnapshot();
}

export function buildSeedUrls(activeTabUrl) {
  const seeds = [];
  const overviewUrl = toAbsoluteLovableUrl("/settings/security-center");
  seeds.push(overviewUrl);

  const activeUrl = normalizeUrl(activeTabUrl || "");
  const projectsIndexUrl = toAbsoluteLovableUrl("/projects");

  if (
    activeUrl &&
    isLovableUrl(activeUrl) &&
    activeUrl !== projectsIndexUrl &&
    activeUrl !== overviewUrl
  ) {
    seeds.push(activeUrl);
  }

  for (const section of SECURITY_SECTIONS) {
    seeds.push(toAbsoluteLovableUrl(section.path));
  }

  return [...new Set(seeds)];
}

function indexOverviewProjectsByUrl(rows, projectOverviewByUrl) {
  if (!Array.isArray(rows) || !rows.length) {
    return 0;
  }

  let indexed = 0;
  for (const row of rows) {
    const visibility = String(row?.visibility || "").trim();
    const projectName = String(row?.projectName || "").trim();
    const rawSecurityHref = String(row?.securityViewHref || "").trim();
    if (!rawSecurityHref) {
      continue;
    }

    let absoluteSecurityUrl = null;
    try {
      absoluteSecurityUrl = normalizeUrl(new URL(rawSecurityHref, LOVABLE_ORIGIN).toString());
    } catch {
      absoluteSecurityUrl = null;
    }
    if (!absoluteSecurityUrl) {
      continue;
    }

    const baseUrl = normalizeUrl(stripProjectSecurityViewUrl(absoluteSecurityUrl));
    const record = {
      projectName: projectName || null,
      visibility: visibility || null,
      securityViewHref: absoluteSecurityUrl
    };

    projectOverviewByUrl.set(absoluteSecurityUrl, record);
    if (baseUrl) {
      projectOverviewByUrl.set(baseUrl, record);
    }
    indexed += 1;
  }

  return indexed;
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
  } else {
    const securityUrl = normalizeUrl(ensureProjectSecurityViewUrl(normalized));
    if (securityUrl && projectOverviewByUrl.has(securityUrl)) {
      return projectOverviewByUrl.get(securityUrl);
    }
  }

  return null;
}

export async function runLovableAudit(options = {}) {
  if (activeRun) {
    throw new Error("Audit is already running");
  }

  const runOptions = resolveRunOptions(options);
  const {
    patchMode,
    parallelProjectInspections,
    groupProjectTabs,
    projectWorkerCount,
    skipRecentScans,
    recentScanSkipHours,
    waitForPublishUpdateCompletion,
    pageLoadTimeoutMs
  } = runOptions;

  const startedAt = Date.now();
  const progress = makeProgressReporter();
  const { debugLog, pushDebug } = makeDebugLogger();

  const activeTab = await getActiveTab();
  const tabId = activeTab.id;
  const originalUrl = activeTab.url || null;

  const visited = new Set();
  const queue = createUrlQueue(visited);
  const artifacts = [];
  const crawledPages = [];
  const deferredProjectUrls = new Set();
  const sectionResults = {
    overview: null,
    supplyChain: null,
    secrets: null
  };
  const projectOverviewByUrl = new Map();

  const fixAllStats = createTryFixAllStats();
  const publishUpdateStats = createPublishUpdateStats();
  const parallelInspectionStats = {
    enabled: parallelProjectInspections,
    used: false,
    totalProjects: 0,
    processedProjects: 0,
    workerCount: 0,
    createdTabs: 0,
    grouped: false,
    groupId: null,
    groupError: null,
    groupDiagnostics: null,
    errors: 0,
    stoppedEarly: false
  };

  let overviewTableCollected = false;
  let stoppedByUser = false;

  const run = {
    startedAt: nowIso(),
    progress,
    pushDebug,
    visited,
    queue,
    control: {
      paused: false,
      stopRequested: false
    }
  };
  activeRun = run;

  try {
    await progress.publish({
      phase: "initializing",
      message: "Starting audit",
      startedAt: run.startedAt
    });

    pushDebug("run_started", {
      tabId,
      originalUrl: originalUrl || null,
      ...runOptions
    });

    for (const seedUrl of buildSeedUrls(activeTab.url || "")) {
      queue.enqueue(seedUrl);
    }
    pushDebug("seed_queue_ready", { queuedCount: queue.size() });

    try {
      while (queue.size() > 0 && visited.size < MAX_PAGES) {
        if ((await checkpoint(run, "loop_start")) === "stop") {
          stoppedByUser = true;
          break;
        }

        const dequeuedUrl = queue.dequeue();
        const targetUrl =
          dequeuedUrl && isLovableProjectPage(dequeuedUrl)
            ? ensureProjectSecurityViewUrl(dequeuedUrl)
            : dequeuedUrl;
        if (!targetUrl || visited.has(targetUrl)) {
          continue;
        }

        visited.add(targetUrl);

        if (parallelProjectInspections && isLovableProjectPage(targetUrl)) {
          deferredProjectUrls.add(ensureProjectSecurityViewUrl(targetUrl));
          pushDebug("deferred_project_url", {
            url: targetUrl,
            deferredCount: deferredProjectUrls.size
          });
          continue;
        }

        await progress.publish({
          phase: "navigating",
          message: `Visiting ${targetUrl}`,
          visitedCount: visited.size,
          queuedCount: queue.size()
        });
        pushDebug("visiting_url", {
          url: targetUrl,
          visitedCount: visited.size,
          queuedCount: queue.size()
        });

        const pageLoopStartedAt = Date.now();
        try {
          if ((await checkpoint(run, "before_navigate")) === "stop") {
            stoppedByUser = true;
            break;
          }

          const pageStart = Date.now();
          const navigationTiming = await navigateTab(tabId, targetUrl, { loadTimeoutMs: pageLoadTimeoutMs });
          const scrapeStartedAt = Date.now();
          let scraped = await scrapeCurrentPage(tabId);
          const scrapeMs = Date.now() - scrapeStartedAt;

          const securityRecoveryResult = await recoverProjectSecurityView({
            tabId,
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
          const sectionKey = resolveSectionKey(resolvedUrl);
          const parsedSecurity = sectionKey ? parseSecuritySummary(scraped.text) : null;

          pushDebug("page_scraped", {
            url: resolvedUrl,
            sectionKey,
            textLength: scraped.text.length,
            anchors: scraped.anchors.length
          });

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

          pushDebug("page_timing", {
            url: resolvedUrl,
            timings: pageRecord.timings
          });

          if ((await checkpoint(run, "before_project_fix")) === "stop") {
            stoppedByUser = true;
            break;
          }

          await maybeHandleProjectFixAll({
            enabled: patchMode,
            tabId,
            resolvedUrl,
            pageRecord,
            fixAllStats,
            pushDebug,
            waitForEnabledMs: 8000
          });

          if ((await checkpoint(run, "before_project_publish_update")) === "stop") {
            stoppedByUser = true;
            break;
          }

          await maybeHandleProjectPublishUpdate({
            enabled: patchMode,
            tabId,
            resolvedUrl,
            pageRecord,
            publishStats: publishUpdateStats,
            pushDebug,
            projectOverview: resolveProjectOverviewForUrl(resolvedUrl, projectOverviewByUrl),
            waitForUpdateMs: 45000,
            waitForPublishUpdateCompletion,
            pageLoadTimeoutMs
          });

          artifacts.push(scraped.text);
          artifacts.push(scraped.title);

          for (const anchor of scraped.anchors) {
            if (!anchor.href) {
              continue;
            }

            artifacts.push(anchor.href);
            if (anchor.text) {
              artifacts.push(anchor.text);
            }

            const normalizedAnchor = normalizeUrl(anchor.href);
            if (!normalizedAnchor || !isLovableProjectPage(normalizedAnchor)) {
              continue;
            }

            const securityProjectUrl = ensureProjectSecurityViewUrl(normalizedAnchor);
            if (parallelProjectInspections) {
              if (!visited.has(securityProjectUrl)) {
                deferredProjectUrls.add(securityProjectUrl);
              }
            } else if (!visited.has(securityProjectUrl)) {
              queue.enqueue(securityProjectUrl);
            }
          }

          if (sectionKey) {
            const existing = sectionResults[sectionKey] || {};
            sectionResults[sectionKey] = {
              ...existing,
              url: resolvedUrl,
              summary: parsedSecurity,
              textPreview: scraped.text.slice(0, 1200)
            };
          }

          if (sectionKey === "overview" && !overviewTableCollected) {
            if ((await checkpoint(run, "before_overview_collect")) === "stop") {
              stoppedByUser = true;
              break;
            }

            overviewTableCollected = true;

            await collectOverviewAndQueueProjects({
              tabId,
              patchMode,
              skipRecentScans,
              recentScanSkipHours,
              progress,
              visitedCount: visited.size,
              queue,
              sectionResults,
              artifacts,
              pushDebug
            });

            const overviewProjects = sectionResults.overview?.table?.projects || [];
            const indexedProjects = indexOverviewProjectsByUrl(overviewProjects, projectOverviewByUrl);
            pushDebug("overview_projects_indexed", {
              indexedProjects,
              indexSize: projectOverviewByUrl.size
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          pushDebug("page_error", {
            url: targetUrl,
            error: message
          });
          crawledPages.push({
            url: targetUrl,
            title: "",
            textLength: 0,
            timings: {
              totalMs: Date.now() - pageLoopStartedAt,
              configuredLoadTimeoutMs: pageLoadTimeoutMs || null
            },
            error: message
          });
        }
      }

      if (!stoppedByUser && parallelProjectInspections && deferredProjectUrls.size > 0) {
        if ((await checkpoint(run, "before_parallel_project_inspections")) === "stop") {
          stoppedByUser = true;
        } else {
          const parallelResult = await processProjectInspectionsInParallel({
            run,
            projectUrls: [...deferredProjectUrls],
            patchMode,
            projectWorkerCount,
            groupProjectTabs,
            waitForPublishUpdateCompletion,
            pageLoadTimeoutMs,
            windowId: activeTab.windowId,
            tabInsertIndex: activeTab.index,
            artifacts,
            crawledPages,
            fixAllStats,
            publishUpdateStats,
            projectOverviewByUrl,
            pushDebug,
            checkpointFn: (location) => checkpoint(run, location)
          });
          Object.assign(parallelInspectionStats, parallelResult);
          if (parallelResult.stoppedEarly) {
            stoppedByUser = true;
          }
        }
      }
    } finally {
      if (originalUrl && /^https?:\/\//i.test(originalUrl)) {
        try {
          await chrome.tabs.update(tabId, { url: originalUrl });
          pushDebug("restored_original_tab", { url: originalUrl });
        } catch {
          pushDebug("restore_original_tab_failed", { url: originalUrl });
        }
      }
    }

    const projectUrls = collectProjectUrls(artifacts);
    for (const page of crawledPages) {
      if (isLovableProjectPage(page.url)) {
        projectUrls.projectPages.push(page.url);
      }
    }
    projectUrls.projectPages = [...new Set(projectUrls.projectPages)].sort();
    const timingInsights = buildTimingInsights(crawledPages);

    const output = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      runOptions,
      runState: {
        stoppedByUser
      },
      projectActions: {
        tryFixAll: fixAllStats,
        publishUpdate: publishUpdateStats,
        parallelInspection: parallelInspectionStats
      },
      limits: {
        maxPages: MAX_PAGES,
        crawledPages: crawledPages.length
      },
      timings: timingInsights,
      projectUrls,
      securityCenter: sectionResults,
      crawledPages,
      debugLog
    };

    await chrome.storage.local.set({ latestAudit: output });
    await progress.publish({
      phase: stoppedByUser ? "stopped" : "completed",
      message: stoppedByUser
        ? `Stopped. Crawled ${crawledPages.length} pages so far.`
        : `Completed. Crawled ${crawledPages.length} pages, found ${projectUrls.publishedUrls.length} published URLs`,
      visitedCount: visited.size,
      queuedCount: queue.size(),
      parallelProjectProcessed: parallelInspectionStats.processedProjects,
      parallelProjectTotal: parallelInspectionStats.totalProjects,
      parallelWorkers: parallelInspectionStats.workerCount
    });

    pushDebug(stoppedByUser ? "run_stopped" : "run_completed", {
      crawledPages: crawledPages.length,
      projectPages: projectUrls.projectPages.length,
      publishedUrls: projectUrls.publishedUrls.length,
      parallelInspection: parallelInspectionStats,
      timings: timingInsights
    });

    return output;
  } finally {
    activeRun = null;
  }
}
