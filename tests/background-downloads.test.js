import test from "node:test";
import assert from "node:assert/strict";

import { buildAuditJsonFilename, buildDownloadDataUrl } from "../src/background/downloads.js";

test("buildAuditJsonFilename uses sanitized ISO timestamp", () => {
  const fixedDate = new Date("2026-04-22T10:11:12.345Z");
  const filename = buildAuditJsonFilename(fixedDate);
  assert.equal(filename, "lovable-info-extractor-2026-04-22T10-11-12-345Z.json");
});

test("buildDownloadDataUrl encodes content safely", () => {
  const content = "line 1\\nline 2 with % and ? and =";
  const url = buildDownloadDataUrl(content, "text/plain");
  assert.equal(
    url,
    "data:text/plain;charset=utf-8,line%201%5Cnline%202%20with%20%25%20and%20%3F%20and%20%3D"
  );
});
