export async function triggerScansForAllProjects(tabId, options = {}) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [
      {
        skipRecentScans: options?.skipRecentScans === true,
        recentScanSkipHours: Math.max(
          1,
          Number.parseInt(String(options?.recentScanSkipHours ?? "3"), 10) || 3
        )
      }
    ],
    func: async (triggerOptions) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      function readText(node) {
        return (node?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function readCount(node) {
        const text = readText(node);
        if (!text || text === "-") {
          return 0;
        }
        const parsed = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
        return Number.isFinite(parsed) ? parsed : 0;
      }

      function readOverviewStatsCards() {
        const cardsRoot = document.querySelector(".grid.grid-cols-2.gap-4.md\\:grid-cols-4");
        if (!cardsRoot) {
          return null;
        }

        const stats = {
          totalProjects: null,
          withErrors: null,
          withWarnings: null,
          scanned: null
        };

        const cards = Array.from(cardsRoot.children || []);
        for (const card of cards) {
          const label = readText(card.querySelector("span.text-sm")).toLowerCase();
          const value = readCount(card.querySelector("span.text-2xl"));
          if (label.includes("total projects")) {
            stats.totalProjects = value;
          } else if (label.includes("with errors")) {
            stats.withErrors = value;
          } else if (label.includes("with warnings")) {
            stats.withWarnings = value;
          } else if (label.includes("scanned")) {
            stats.scanned = value;
          }
        }

        return stats;
      }

      function getRowsPerPageCombobox() {
        const combos = Array.from(document.querySelectorAll("button[role='combobox']"));
        return (
          combos.find((button) => {
            const regionText = readText(button.parentElement);
            return regionText.toLowerCase().includes("rows per page");
          }) || combos[0] || null
        );
      }

      function parseButtonNumericValue(button) {
        const labelText = readText(button);
        const match = labelText.match(/\b(\d+)\b/);
        return match ? Number.parseInt(match[1], 10) : null;
      }

      async function setRowsPerPage(target = 100) {
        const combobox = getRowsPerPageCombobox();
        if (!combobox) {
          return { attempted: false, selected: null };
        }

        const before = parseButtonNumericValue(combobox);
        combobox.click();
        await sleep(120);

        const options = Array.from(document.querySelectorAll("[role='option']"))
          .map((option) => ({
            node: option,
            value: Number.parseInt(readText(option).replace(/[^\d]/g, ""), 10)
          }))
          .filter((option) => Number.isFinite(option.value));

        if (options.length === 0) {
          return { attempted: true, selected: before };
        }

        let selectedOption = options.find((option) => option.value === target);
        if (!selectedOption) {
          selectedOption = options.sort((a, b) => b.value - a.value)[0];
        }

        selectedOption.node.click();
        await sleep(260);

        const after = parseButtonNumericValue(getRowsPerPageCombobox() || combobox);
        return {
          attempted: true,
          selected: after || selectedOption.value || before || null
        };
      }

      function readPaginationInfo() {
        const pageTextNode = Array.from(document.querySelectorAll("div, span")).find((node) =>
          /page\s+\d+\s+of\s+\d+/i.test(readText(node))
        );
        const pageText = pageTextNode ? readText(pageTextNode) : "";
        const pageMatch = pageText.match(/page\s+(\d+)\s+of\s+(\d+)/i);
        const nextButton = document.querySelector("button[aria-label='Next page']");

        return {
          currentPage: pageMatch ? Number.parseInt(pageMatch[1], 10) : null,
          totalPages: pageMatch ? Number.parseInt(pageMatch[2], 10) : null,
          canNext: Boolean(nextButton && !nextButton.disabled),
          nextButton
        };
      }

      async function goToNextPage() {
        const pagination = readPaginationInfo();
        if (!pagination.canNext || !pagination.nextButton) {
          return false;
        }
        pagination.nextButton.click();
        await sleep(300);
        return true;
      }

      function getViewport() {
        const viewports = Array.from(document.querySelectorAll("[data-radix-scroll-area-viewport]"));
        return (
          viewports.find((element) => element.querySelector("table tbody")) ||
          viewports[0] ||
          null
        );
      }

      function getScanButton(row) {
        const buttons = Array.from(row.querySelectorAll("button[type='button']"));
        return (
          buttons.find((button) => {
            const label = readText(button).toLowerCase();
            return label === "scan" || label.endsWith(" scan") || label.includes("scan");
          }) || null
        );
      }

      function isLastScanRunning(row) {
        const cells = Array.from(row.querySelectorAll("td"));
        const lastScanCell = cells[4] || null;
        if (!lastScanCell) {
          return false;
        }

        const text = readText(lastScanCell).toLowerCase();
        if (text.includes("scanning")) {
          return true;
        }

        return Boolean(lastScanCell.querySelector(".animate-spin"));
      }

      function parseLastScanAgeHours(row) {
        const cells = Array.from(row.querySelectorAll("td"));
        const lastScanCell = cells[4] || null;
        if (!lastScanCell) {
          return null;
        }

        const text = readText(lastScanCell).toLowerCase();
        if (!text || text === "-" || text.includes("never")) {
          return null;
        }
        if (text.includes("scanning")) {
          return null;
        }
        if (text.includes("just now")) {
          return 0;
        }
        if (text.includes("yesterday")) {
          return 24;
        }

        const unitMatch = text.match(
          /(?:about\s+)?(\d+|an?|one)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago/
        );

        if (!unitMatch) {
          return null;
        }

        const rawValue = unitMatch[1];
        const value =
          rawValue === "a" || rawValue === "an" || rawValue === "one"
            ? 1
            : Number.parseInt(rawValue, 10);
        if (!Number.isFinite(value)) {
          return null;
        }

        const unit = unitMatch[2];
        if (unit.startsWith("minute")) {
          return value / 60;
        }
        if (unit.startsWith("hour")) {
          return value;
        }
        if (unit.startsWith("day")) {
          return value * 24;
        }
        if (unit.startsWith("week")) {
          return value * 24 * 7;
        }
        if (unit.startsWith("month")) {
          return value * 24 * 30;
        }
        if (unit.startsWith("year")) {
          return value * 24 * 365;
        }
        return null;
      }

      async function processScrollableTableOnCurrentPage(onRow) {
        const viewport = getViewport();
        await onRow();
        if (!viewport) {
          return;
        }

        let stagnantIterations = 0;
        for (let i = 0; i < 700; i += 1) {
          const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
          const previousTop = viewport.scrollTop;
          const nextTop = Math.min(
            maxScrollTop,
            viewport.scrollTop + Math.max(220, viewport.clientHeight * 0.8)
          );

          viewport.scrollTop = nextTop;
          viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
          await sleep(120);
          const newRows = await onRow();

          const atBottom = maxScrollTop - viewport.scrollTop < 2;
          if (newRows === 0 && atBottom && Math.abs(previousTop - nextTop) < 2) {
            stagnantIterations += 1;
          } else {
            stagnantIterations = 0;
          }

          if (stagnantIterations >= 10) {
            break;
          }
        }
      }

      const statsCards = readOverviewStatsCards();
      const expectedTotalProjects = statsCards?.totalProjects || null;
      const rowsPerPage = await setRowsPerPage(100);

      const seenKeys = new Set();
      let clickedCount = 0;
      let skippedRecentCount = 0;
      let alreadyScanningCount = 0;
      let disabledCount = 0;
      let missingButtonCount = 0;
      let pagesVisited = 0;
      let paginationPasses = 0;

      async function processVisibleRows() {
        const rows = document.querySelectorAll("table tbody tr");
        let newRows = 0;

        for (const row of rows) {
          const projectName = readText(row.querySelector("th[scope='row']"));
          const viewAnchor = row.querySelector("a[href*='/projects/'][href*='view=security']");
          const href = viewAnchor
            ? (viewAnchor.getAttribute("href") || viewAnchor.href || "").trim()
            : "";
          const key = href || projectName;

          if (!key || seenKeys.has(key)) {
            continue;
          }

          seenKeys.add(key);
          newRows += 1;

          const scanButton = getScanButton(row);
          if (!scanButton) {
            missingButtonCount += 1;
            continue;
          }

          if (isLastScanRunning(row)) {
            alreadyScanningCount += 1;
            continue;
          }

          if (triggerOptions.skipRecentScans) {
            const lastScanAgeHours = parseLastScanAgeHours(row);
            if (
              Number.isFinite(lastScanAgeHours) &&
              lastScanAgeHours < triggerOptions.recentScanSkipHours
            ) {
              skippedRecentCount += 1;
              continue;
            }
          }

          if (scanButton.disabled) {
            disabledCount += 1;
            continue;
          }

          scanButton.click();
          clickedCount += 1;
          await sleep(120);
        }

        return newRows;
      }

      for (let pageLoop = 0; pageLoop < 100; pageLoop += 1) {
        pagesVisited += 1;
        await processScrollableTableOnCurrentPage(processVisibleRows);

        if (expectedTotalProjects && seenKeys.size >= expectedTotalProjects) {
          break;
        }

        const moved = await goToNextPage();
        if (!moved) {
          break;
        }
        paginationPasses += 1;
      }

      return {
        expectedTotalProjects,
        rowsPerPage,
        pagesVisited,
        paginationPasses,
        processedRows: seenKeys.size,
        clickedCount,
        skippedRecentCount,
        alreadyScanningCount,
        disabledCount,
        missingButtonCount,
        skipRecentScans: triggerOptions.skipRecentScans,
        recentScanSkipHours: triggerOptions.recentScanSkipHours
      };
    }
  });

  return result;
}
