import { collectProjectUrls, parseSecuritySummary } from "../lib/parsers.js";
import { makeDebugLogger } from "./debug.js";
import { getActiveTab, navigateTab } from "./navigation.js";
import { collectOverviewAndQueueProjects } from "./overview.js";
import { makeProgressReporter } from "./progress.js";
import {
  createPublishUpdateStats,
  createTryFixAllStats,
  maybeHandleProjectFixAll,
  maybeHandleProjectPublishUpdate
} from "./project-fix.js";
import { createUrlQueue } from "./queue.js";
import { scrapeCurrentPage } from "./scrape/index.js";
import {
  MAX_PAGES,
  SECURITY_SECTIONS,
  isLovableProjectPage,
  isLovableUrl,
  normalizeUrl,
  nowIso,
  resolveSectionKey,
  sleep,
  toAbsoluteLovableUrl
} from "./shared.js";

export { createUrlQueue } from "./queue.js";

const RUN_CONTROL_POLL_MS = 400;

let activeRun = null;

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

export async function runLovableAudit(options = {}) {
  if (activeRun) {
    throw new Error("Audit is already running");
  }

  const patchMode = options.patchMode === true;
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
  const sectionResults = {
    overview: null,
    supplyChain: null,
    secrets: null
  };
  const fixAllStats = createTryFixAllStats();
  const publishUpdateStats = createPublishUpdateStats();
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
    patchMode
  });

    const activeUrl = normalizeUrl(activeTab.url || "");
    if (activeUrl && isLovableUrl(activeUrl)) {
      queue.enqueue(activeUrl);
    } else {
      queue.enqueue(toAbsoluteLovableUrl("/projects"));
    }

    queue.enqueue(toAbsoluteLovableUrl("/projects"));
    for (const section of SECURITY_SECTIONS) {
      queue.enqueue(toAbsoluteLovableUrl(section.path));
    }
    pushDebug("seed_queue_ready", { queuedCount: queue.size() });

    try {
      while (queue.size() > 0 && visited.size < MAX_PAGES) {
      if ((await checkpoint(run, "loop_start")) === "stop") {
        stoppedByUser = true;
        break;
      }

      const targetUrl = queue.dequeue();
      if (!targetUrl || visited.has(targetUrl)) {
        continue;
      }

      visited.add(targetUrl);
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

      try {
        if ((await checkpoint(run, "before_navigate")) === "stop") {
          stoppedByUser = true;
          break;
        }

        await navigateTab(tabId, targetUrl);
        const scraped = await scrapeCurrentPage(tabId);
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
          textLength: scraped.text.length
        };
        crawledPages.push(pageRecord);

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
          waitForUpdateMs: 45000
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
          if (
            normalizedAnchor &&
            isLovableProjectPage(normalizedAnchor) &&
            !visited.has(normalizedAnchor)
          ) {
            queue.enqueue(normalizedAnchor);
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
            progress,
            visitedCount: visited.size,
            queue,
            sectionResults,
            artifacts,
            pushDebug
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
          error: message
        });
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

    const output = {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    runOptions: {
      patchMode
    },
    runState: {
      stoppedByUser
    },
    projectActions: {
      tryFixAll: fixAllStats,
      publishUpdate: publishUpdateStats
    },
    limits: {
      maxPages: MAX_PAGES,
      crawledPages: crawledPages.length
    },
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
    queuedCount: queue.size()
  });

    pushDebug(stoppedByUser ? "run_stopped" : "run_completed", {
    crawledPages: crawledPages.length,
    projectPages: projectUrls.projectPages.length,
    publishedUrls: projectUrls.publishedUrls.length
  });

    return output;
  } finally {
    activeRun = null;
  }
}
