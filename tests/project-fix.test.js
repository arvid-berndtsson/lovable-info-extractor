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
        reason: "clicked_update",
        postClick: {
          lifecycle: "up_to_date",
          settled: true,
          observedUpdating: true,
          observedUpToDate: true,
          polls: 3,
          waitedMs: 2100
        }
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
  assert.equal(stats.clickedSettledUpToDate, 1);
  assert.equal(stats.clickedStillUpdating, 0);
  assert.equal(stats.clickedUnconfirmed, 0);
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

test("maybeHandleProjectPublishUpdate treats still_up_to_date as expected for non-draft projects", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};
  const debugEvents = [];

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 7,
    resolvedUrl: "https://lovable.dev/projects/abc?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: (event, payload) => {
      debugEvents.push({ event, payload });
    },
    projectOverview: {
      visibility: "Public",
      projectName: "Project ABC",
      securityViewHref: "https://lovable.dev/projects/abc?view=security"
    },
    navigateTabFn: async () => {},
    clickPublishUpdateFn: async () => ({
      foundPublishMenu: true,
      sawUpToDate: true,
      sawUpdate: false,
      clicked: false,
      waitedMs: 1800,
      reason: "still_up_to_date",
      diagnostics: {
        actions: [{ text: "Up to date" }, { text: "Publish" }]
      }
    })
  });

  assert.equal(stats.attempted, 1);
  assert.equal(stats.upToDateNoUpdate, 1);
  assert.equal(stats.missingUpdate, 0);
  assert.equal(stats.unexpectedMissingUpdate, 0);
  assert.equal(stats.draftWithoutUpdate, 0);
  assert.equal(pageRecord.publishUpdate?.upToDateNoUpdate, true);
  assert.equal(pageRecord.publishUpdate?.missingUpdate, false);
  assert.equal(pageRecord.publishUpdate?.unexpectedMissingUpdate, false);
  assert.equal(pageRecord.publishUpdate?.overviewVisibility, "Public");
  assert.equal(
    debugEvents.some((entry) => entry.event === "project_publish_update_unexpected_missing_update"),
    false
  );
});

test("maybeHandleProjectPublishUpdate does not flag missing update as unexpected for draft projects", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 8,
    resolvedUrl: "https://lovable.dev/projects/draft-one?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: () => {},
    projectOverview: {
      visibility: "Draft",
      projectName: "Draft Project"
    },
    navigateTabFn: async () => {},
    clickPublishUpdateFn: async () => ({
      foundPublishMenu: true,
      sawUpToDate: true,
      sawUpdate: false,
      clicked: false,
      waitedMs: 900,
      reason: "still_up_to_date"
    })
  });

  assert.equal(stats.attempted, 1);
  assert.equal(stats.upToDateNoUpdate, 1);
  assert.equal(stats.missingUpdate, 0);
  assert.equal(stats.unexpectedMissingUpdate, 0);
  assert.equal(stats.draftWithoutUpdate, 0);
  assert.equal(pageRecord.publishUpdate?.unexpectedMissingUpdate, false);
});

test("maybeHandleProjectPublishUpdate flags update_not_ready as unexpected for non-draft projects", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};
  const debugEvents = [];

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 9,
    resolvedUrl: "https://lovable.dev/projects/public-one?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: (event, payload) => {
      debugEvents.push({ event, payload });
    },
    projectOverview: {
      visibility: "Public",
      projectName: "Public Project"
    },
    navigateTabFn: async () => {},
    clickPublishUpdateFn: async () => ({
      foundPublishMenu: true,
      sawUpToDate: false,
      sawUpdate: false,
      clicked: false,
      waitedMs: 1900,
      reason: "update_not_ready"
    })
  });

  assert.equal(stats.attempted, 1);
  assert.equal(stats.upToDateNoUpdate, 0);
  assert.equal(stats.missingUpdate, 1);
  assert.equal(stats.unexpectedMissingUpdate, 1);
  assert.equal(stats.draftWithoutUpdate, 0);
  assert.equal(pageRecord.publishUpdate?.missingUpdate, true);
  assert.equal(pageRecord.publishUpdate?.unexpectedMissingUpdate, true);
  assert.equal(
    debugEvents.some((entry) => entry.event === "project_publish_update_unexpected_missing_update"),
    true
  );
});

test("maybeHandleProjectPublishUpdate tracks clicked updates that remain in updating state", async () => {
  const stats = createPublishUpdateStats();
  const pageRecord = {};
  const debugEvents = [];

  await maybeHandleProjectPublishUpdate({
    enabled: true,
    tabId: 10,
    resolvedUrl: "https://lovable.dev/projects/public-two?view=security",
    pageRecord,
    publishStats: stats,
    pushDebug: (event, payload) => {
      debugEvents.push({ event, payload });
    },
    projectOverview: {
      visibility: "Public",
      projectName: "Public Two"
    },
    navigateTabFn: async () => {},
    clickPublishUpdateFn: async () => ({
      foundPublishMenu: true,
      sawUpToDate: false,
      sawUpdate: true,
      clicked: true,
      waitedMs: 2300,
      reason: "clicked_update",
      postClick: {
        lifecycle: "updating",
        settled: false,
        observedUpdating: true,
        observedUpToDate: false,
        polls: 12,
        waitedMs: 12000
      }
    })
  });

  assert.equal(stats.clicked, 1);
  assert.equal(stats.clickedSettledUpToDate, 0);
  assert.equal(stats.clickedStillUpdating, 1);
  assert.equal(stats.clickedUnconfirmed, 0);
  assert.equal(
    debugEvents.some((entry) => entry.event === "project_publish_update_still_updating"),
    true
  );
  assert.equal(pageRecord.publishUpdate?.postClick?.lifecycle, "updating");
});
