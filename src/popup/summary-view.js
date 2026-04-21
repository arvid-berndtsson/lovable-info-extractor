function formatSecuritySummary(name, section) {
  if (!section || !section.summary) {
    return `${name}: unavailable`;
  }
  const { critical, high, medium, low, total } = section.summary;
  return `${name}: total=${total}, critical=${critical}, high=${high}, medium=${medium}, low=${low}`;
}

export function updateSummary(result, summaryNode) {
  const lines = [];
  const tableRows = result.securityCenter?.overview?.table?.rowCount || 0;
  const overviewStats = result.securityCenter?.overview?.statsCards || null;
  const expectedRows =
    result.securityCenter?.overview?.table?.expectedTotalProjects ||
    overviewStats?.totalProjects ||
    0;

  lines.push(`Generated: ${result.generatedAt}`);
  if (typeof result.runOptions?.patchMode === "boolean") {
    lines.push(`Patch mode: ${result.runOptions.patchMode ? "on" : "off"}`);
  }
  if (typeof result.durationMs === "number") {
    lines.push(`Duration: ${Math.round(result.durationMs / 1000)}s`);
  }

  lines.push(`Crawled pages: ${result.limits.crawledPages}/${result.limits.maxPages}`);
  lines.push(`Security table rows: ${tableRows}`);

  if (expectedRows > 0) {
    lines.push(`Expected total projects: ${expectedRows}`);
    lines.push(`Coverage: ${tableRows}/${expectedRows}`);
  }

  const tableMeta = result.securityCenter?.overview?.table || null;
  if (tableMeta?.rowsPerPage?.selected || tableMeta?.pagesVisited) {
    lines.push(
      `Table traversal: rows/page=${tableMeta?.rowsPerPage?.selected ?? "n/a"}, pages=${tableMeta?.pagesVisited ?? "n/a"}`
    );
  }

  lines.push(`Project pages: ${result.projectUrls.projectPages.length}`);
  lines.push(`Published URLs: ${result.projectUrls.publishedUrls.length}`);
  lines.push("");

  const tryFixAll = result.projectActions?.tryFixAll || null;
  if (tryFixAll) {
    lines.push("Project fix pass (Try to fix all):");
    lines.push(
      `- attempted=${tryFixAll.attempted ?? 0}, found=${tryFixAll.found ?? 0}, clicked=${tryFixAll.clicked ?? 0}, disabled=${tryFixAll.disabled ?? 0}, not-found=${tryFixAll.notFound ?? 0}, errors=${tryFixAll.errors ?? 0}`
    );
    lines.push("");
  }

  const publishUpdate = result.projectActions?.publishUpdate || null;
  if (publishUpdate) {
    lines.push("Project publish pass (Update):");
    lines.push(
      `- attempted=${publishUpdate.attempted ?? 0}, navigated=${publishUpdate.navigated ?? 0}, found-publish-menu=${publishUpdate.foundPublishMenu ?? 0}, saw-up-to-date=${publishUpdate.sawUpToDate ?? 0}, saw-update=${publishUpdate.sawUpdate ?? 0}, clicked=${publishUpdate.clicked ?? 0}, errors=${publishUpdate.errors ?? 0}`
    );
    lines.push("");
  }

  if (overviewStats) {
    lines.push("Overview stats cards:");
    lines.push(
      `- total=${overviewStats.totalProjects ?? "n/a"}, errors=${overviewStats.withErrors ?? "n/a"}, warnings=${overviewStats.withWarnings ?? "n/a"}, scanned=${overviewStats.scanned ?? "n/a"}`
    );
    lines.push("");
  }

  const scanTrigger = result.securityCenter?.overview?.scanTrigger || null;
  if (scanTrigger) {
    lines.push("Scan trigger pass:");
    lines.push(
      `- processed=${scanTrigger.processedRows ?? "n/a"}, clicked=${scanTrigger.clickedCount ?? 0}, already-scanning=${scanTrigger.alreadyScanningCount ?? 0}, disabled=${scanTrigger.disabledCount ?? 0}, missing-button=${scanTrigger.missingButtonCount ?? 0}`
    );
    lines.push(
      `- rows-per-page=${scanTrigger.rowsPerPage?.selected ?? "n/a"}, pages-visited=${scanTrigger.pagesVisited ?? "n/a"}`
    );
    lines.push("");
  }

  lines.push("Security Center:");
  lines.push(formatSecuritySummary("Overview", result.securityCenter.overview));
  lines.push(formatSecuritySummary("Supply Chain", result.securityCenter.supplyChain));
  lines.push(formatSecuritySummary("Secrets", result.securityCenter.secrets));
  lines.push("");
  lines.push("Published URLs:");

  for (const url of result.projectUrls.publishedUrls.slice(0, 20)) {
    lines.push(`- ${url}`);
  }
  if (result.projectUrls.publishedUrls.length > 20) {
    lines.push(`...and ${result.projectUrls.publishedUrls.length - 20} more`);
  }

  summaryNode.textContent = lines.join("\n");
}
