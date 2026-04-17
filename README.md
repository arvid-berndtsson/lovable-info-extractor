# Lovable Info Extractor (Chromium Extension)

Chromium extension for gathering Lovable project URLs and security-center signals when API access is unavailable.

## What It Collects

- Lovable project pages: `https://lovable.dev/projects/...`
- Published project URLs/custom domains
- Security center snapshots from:
1. `https://lovable.dev/settings/security-center`
2. `https://lovable.dev/settings/security-center?section=supply-chain`
3. `https://lovable.dev/settings/security-center?section=secrets`
- Full project table traversal on Security Center overview (scrolls virtualized table, collects all `View` links, then visits each project)
- Pagination-aware traversal (`Page X of Y`) and automatic attempt to set `Rows per page` to `100`
- Visits both base project pages and `?view=security` pages when discovered
- On project security pages, extension attempts to click `Try to fix all` when available and enabled
- After project fixes in patch mode, extension opens project Publish menu and clicks `Update` once it becomes available
- Overview stat cards from Security Center (`Total projects`, `With errors`, `With warnings`, `Scanned`)
- Live run progress + debug log entries in exported JSON

## Install (Unpacked)

1. Open `chrome://extensions` (or Edge/Brave equivalent).
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this repository folder: `lovable-info-extractor`.

## Run Audit

1. Open a logged-in `https://lovable.dev` tab.
2. Click extension icon: `Lovable Info Extractor`.
3. Click `Run Audit`.
4. Download:
- `lovable-info-extractor-<timestamp>.json` (full crawl + security summary)
- `targets.txt` (published URLs only, one per line)

Optional:
- Enable `Patch mode` in the popup to let the extension:
1. Click eligible `Scan` buttons on Security Center overview.
2. Click `Try to fix all` on project security pages when the button is enabled.
3. Open project Publish flow and click `Update` after `Up to date` changes.
- In patch mode, `Scan` clicks can skip projects that were scanned recently (default: under `3` hours).
- Leave `Patch mode` off for passive collection only.
- Open `Options` from the popup for advanced settings:
1. `Parallel project inspections`
2. Worker count (`1` to `8`)
3. Tab grouping (tab folder)
4. Skip recently scanned projects + threshold in hours
5. Page load timeout override in seconds (`0` keeps built-in defaults)
- During long runs, use `Pause`, `Resume`, and `Stop` in the popup.

## Feed Into `lovable-security`

Use the public audit project: [lovable-security-audit](https://github.com/arvid-berndtsson/lovable-security-audit)

Example:

```bash
git clone https://github.com/arvid-berndtsson/lovable-security-audit.git
cd lovable-security-audit
bun run audit --targets-file targets.txt
```

## Notes

- Crawl limit is currently `500` pages.
- Scope is restricted to `https://lovable.dev/*`.
- Security section parsing is text-based signal extraction and should be validated manually for final audit decisions.

## Development

```bash
npm test
```

## Code Layout

- `src/background/runner.js`: main crawl loop orchestration
- `src/background/options.js`: run-option normalization (patch mode, parallel workers, grouping)
- `src/background/navigation.js`: tab navigation + page-load waiting logic
- `src/settings.js`: shared persisted setting keys/defaults
- `src/background/queue.js`: URL queue dedupe and normalization
- `src/background/overview.js`: security-center overview table collection and project queue expansion
- `src/background/project-workers.js`: parallel project inspection workers and tab-group lifecycle
- `src/background/project-fix.js`: project-level `Try to fix all` and publish/update action handling
- `src/background/scrape/`: split scraping modules:
  - `current-page.js`
  - `publish-update.js`
  - `security-table.js`
  - `scan-trigger.js`
  - `try-fix-all.js`
- `src/popup.js`: popup controller
- `src/popup/`: popup UI modules (`elements`, `progress-view`, `summary-view`, `downloads`)
- `src/options.html`, `src/options.js`, `src/options.css`: advanced settings page

## Timing Data in Logs

- Exported JSON now includes run timing insights in `timings`:
1. Average/max/min total page processing time
2. Average/max/min navigation wait
3. Average/max/min scrape time
4. Slowest pages (top 10)
- Each crawled page entry in `crawledPages` includes `timings` (when available), plus debug log events such as `page_timing` and `parallel_page_timing`.
