import { buildProjectVisitUrls } from "../lib/parsers.js";
import { scrapeSecurityCenterProjectTable, triggerScansForAllProjects } from "./scrape/index.js";

function makeDefaultScanTrigger() {
  return {
    enabled: false,
    skippedReason: "disabled_by_option",
    skipRecentScans: false,
    recentScanSkipHours: null,
    processedRows: 0,
    clickedCount: 0,
    skippedRecentCount: 0,
    alreadyScanningCount: 0,
    disabledCount: 0,
    missingButtonCount: 0
  };
}

export async function collectOverviewAndQueueProjects({
  tabId,
  patchMode,
  skipRecentScans,
  recentScanSkipHours,
  progress,
  visitedCount,
  queue,
  sectionResults,
  artifacts,
  pushDebug
}) {
  let scanTrigger = makeDefaultScanTrigger();

  if (patchMode) {
    await progress.publish({
      phase: "triggering_scans",
      message: "Triggering scan buttons across Security Center projects",
      visitedCount,
      queuedCount: queue.size()
    });

    scanTrigger = {
      ...(await triggerScansForAllProjects(tabId, {
        skipRecentScans,
        recentScanSkipHours
      })),
      enabled: true
    };
    pushDebug("overview_scan_trigger", scanTrigger);
  } else {
    pushDebug("overview_scan_trigger_skipped", scanTrigger);
  }

  await progress.publish({
    phase: "collecting_overview_table",
    message: "Collecting full Security Center project table",
    tableRowsFound: scanTrigger.processedRows || 0,
    expectedTotalProjects: scanTrigger.expectedTotalProjects || null,
    visitedCount,
    queuedCount: queue.size()
  });

  const tableData = await scrapeSecurityCenterProjectTable(tabId);
  const projectTargets = buildProjectVisitUrls(tableData.viewLinks);

  pushDebug("overview_table_collected", {
    rowCount: tableData.rowCount,
    expectedTotalProjects: tableData.expectedTotalProjects,
    rowsPerPage: tableData.rowsPerPage,
    pagesVisited: tableData.pagesVisited,
    projectPageTargets: projectTargets.projectPageUrls.length,
    securityViewTargets: projectTargets.securityViewUrls.length
  });

  sectionResults.overview = {
    ...sectionResults.overview,
    statsCards: tableData.statsCards,
    scanTrigger,
    table: {
      rowCount: tableData.rowCount,
      expectedTotalProjects: tableData.expectedTotalProjects,
      rowsPerPage: tableData.rowsPerPage,
      pagesVisited: tableData.pagesVisited,
      paginationPasses: tableData.paginationPasses,
      projects: tableData.rows
    }
  };

  artifacts.push(JSON.stringify(tableData.rows));
  if (tableData.statsCards) {
    artifacts.push(JSON.stringify(tableData.statsCards));
  }

  await progress.publish({
    phase: "queueing_projects",
    message: `Queued ${projectTargets.projectPageUrls.length} project pages from overview table`,
    tableRowsFound: tableData.rowCount,
    expectedTotalProjects: tableData.expectedTotalProjects,
    visitedCount,
    queuedCount: queue.size()
  });

  for (const projectUrl of projectTargets.projectPageUrls) {
    queue.enqueue(projectUrl);
  }
  for (const securityUrl of projectTargets.securityViewUrls) {
    queue.enqueue(securityUrl);
  }

  pushDebug("queue_after_overview", {
    queuedCount: queue.size(),
    visitedCount
  });
}
