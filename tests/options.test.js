import test from "node:test";
import assert from "node:assert/strict";

import { resolveRunOptions } from "../src/background/options.js";

test("resolveRunOptions uses safe defaults", () => {
  const options = resolveRunOptions();

  assert.equal(options.patchMode, false);
  assert.equal(options.parallelProjectInspections, false);
  assert.equal(options.groupProjectTabs, false);
  assert.equal(options.projectWorkerCount, 3);
  assert.equal(options.skipRecentScans, true);
  assert.equal(options.recentScanSkipHours, 3);
  assert.equal(options.pageLoadTimeoutSec, 0);
  assert.equal(options.pageLoadTimeoutMs, null);
});

test("resolveRunOptions clamps worker count range", () => {
  assert.equal(resolveRunOptions({ projectWorkerCount: 0 }).projectWorkerCount, 1);
  assert.equal(resolveRunOptions({ projectWorkerCount: 100 }).projectWorkerCount, 8);
  assert.equal(resolveRunOptions({ projectWorkerCount: "5" }).projectWorkerCount, 5);
});

test("resolveRunOptions reads booleans explicitly", () => {
  const options = resolveRunOptions({
    patchMode: true,
    parallelProjectInspections: true,
    groupProjectTabs: true,
    projectWorkerCount: 4,
    skipRecentScans: false,
    recentScanSkipHours: 6,
    pageLoadTimeoutSec: 45
  });

  assert.equal(options.patchMode, true);
  assert.equal(options.parallelProjectInspections, true);
  assert.equal(options.groupProjectTabs, true);
  assert.equal(options.projectWorkerCount, 4);
  assert.equal(options.skipRecentScans, false);
  assert.equal(options.recentScanSkipHours, 6);
  assert.equal(options.pageLoadTimeoutSec, 45);
  assert.equal(options.pageLoadTimeoutMs, 45000);
});

test("resolveRunOptions clamps recent scan skip hours", () => {
  assert.equal(resolveRunOptions({ recentScanSkipHours: 0 }).recentScanSkipHours, 1);
  assert.equal(resolveRunOptions({ recentScanSkipHours: 999 }).recentScanSkipHours, 168);
  assert.equal(resolveRunOptions({ recentScanSkipHours: "5" }).recentScanSkipHours, 5);
});

test("resolveRunOptions clamps page load timeout", () => {
  assert.equal(resolveRunOptions({ pageLoadTimeoutSec: -1 }).pageLoadTimeoutSec, 0);
  assert.equal(resolveRunOptions({ pageLoadTimeoutSec: 9999 }).pageLoadTimeoutSec, 600);
  assert.equal(resolveRunOptions({ pageLoadTimeoutSec: "12" }).pageLoadTimeoutSec, 12);
  assert.equal(resolveRunOptions({ pageLoadTimeoutSec: 0 }).pageLoadTimeoutMs, null);
  assert.equal(resolveRunOptions({ pageLoadTimeoutSec: 12 }).pageLoadTimeoutMs, 12000);
});
