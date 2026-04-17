import test from "node:test";
import assert from "node:assert/strict";

import {
  createPublishUpdateStats,
  maybeHandleProjectPublishUpdate
} from "../src/background/project-fix.js";

test("maybeHandleProjectPublishUpdate skips when disabled", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};

  await maybeHandleProjectPublishUpdate({
    enabled: false,
    tabId: 1,
    resolvedUrl: "https://lovable.dev/projects/abc?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: () => {}
  });

  assert.equal(stats.attempted, 0);
  assert.equal(pageRecord.publishUpdate, undefined);
});

test("maybeHandleProjectPublishUpdate skips non-security project pages", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 1,
    resolvedUrl: "https://lovable.dev/projects/abc",
    pageRecord,
    publishStats: stats,
    pushDebug: () => {}
  });

  assert.equal(stats.attempted, 0);
  assert.equal(pageRecord.publishUpdate, undefined);
});

test("maybeHandleProjectPublishUpdate navigates to stripped URL and clicks update", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};
  const calls = {
    navigatedTo: null,
    clicked: false
  };

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 123,
    resolvedUrl: "https://lovable.dev/projects/abc?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: () => {},
    waitForUpdateMs: 5000,
    navigateTabFn: async (_tabId, url) => {
      calls.navigatedTo = url;
    },
    clickPublishUpdateFn: async () => {
      calls.clicked = true;
      return {
        foundPublishMenu: true,
        sawUpToDate: true,
        sawUpdate: true,
        clicked: true,
        waitedMs: 1200,
        reason: "clicked_update"
      };
    }
  });

  assert.equal(calls.navigatedTo, "https://lovable.dev/projects/abc");
  assert.equal(calls.clicked, true);
  assert.equal(stats.attempted, 1);
  assert.equal(stats.navigated, 1);
  assert.equal(stats.foundPublishMenu, 1);
  assert.equal(stats.sawUpToDate, 1);
  assert.equal(stats.sawUpdate, 1);
  assert.equal(stats.clicked, 1);
  assert.equal(stats.errors, 0);
  assert.equal(pageRecord.publishUpdate?.reason, "clicked_update");
});

test("maybeHandleProjectPublishUpdate records errors", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 123,
    resolvedUrl: "https://lovable.dev/projects/abc?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: () => {},
    navigateTabFn: async () => {
      throw new Error("navigation failed");
    },
    clickPublishUpdateFn: async () => ({
      foundPublishMenu: false,
      sawUpToDate: false,
      sawUpdate: false,
      clicked: false,
      waitedMs: 0,
      reason: "not_reached"
    })
  });

  assert.equal(stats.attempted, 1);
  assert.equal(stats.errors, 1);
  assert.equal(pageRecord.publishUpdate?.reason, "error");
});
