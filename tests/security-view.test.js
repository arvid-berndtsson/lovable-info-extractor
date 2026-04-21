import test from "node:test";
import assert from "node:assert/strict";

import { recoverProjectSecurityView } from "../src/background/security-view.js";

test("recoverProjectSecurityView skips when intended URL is not security view", async () => {
  const initialScraped = { url: "https://lovable.dev/projects/abc" };

  const result = await recoverProjectSecurityView({
    tabId: 1,
    intendedUrl: "https://lovable.dev/projects/abc",
    initialScraped,
    scrapeFn: async () => ({ url: "https://lovable.dev/projects/abc" }),
    getTabFn: async () => ({ url: "https://lovable.dev/projects/abc" }),
    navigateTabFn: async () => {
      throw new Error("should not navigate");
    },
    settleBeforeRetryMs: 0
  });

  assert.equal(result.scraped, initialScraped);
  assert.equal(result.recovery.attempted, false);
  assert.equal(result.recovery.reason, "intended_not_security_view");
});

test("recoverProjectSecurityView skips when initial page is already security view", async () => {
  const initialScraped = { url: "https://lovable.dev/projects/abc?view=security" };

  const result = await recoverProjectSecurityView({
    tabId: 1,
    intendedUrl: "https://lovable.dev/projects/abc?view=security",
    initialScraped,
    scrapeFn: async () => ({ url: "https://lovable.dev/projects/abc?view=security" }),
    getTabFn: async () => ({ url: "https://lovable.dev/projects/abc?view=security" }),
    navigateTabFn: async () => {
      throw new Error("should not navigate");
    },
    settleBeforeRetryMs: 0
  });

  assert.equal(result.scraped, initialScraped);
  assert.equal(result.recovery.attempted, false);
  assert.equal(result.recovery.matched, true);
  assert.equal(result.recovery.reason, "already_on_security_view");
});

test("recoverProjectSecurityView recovers passively when tab settles on security view", async () => {
  const calls = {
    navigated: 0,
    scraped: 0
  };

  const result = await recoverProjectSecurityView({
    tabId: 22,
    intendedUrl: "https://lovable.dev/projects/abc?view=security",
    initialScraped: { url: "https://lovable.dev/projects/abc" },
    scrapeFn: async () => {
      calls.scraped += 1;
      return { url: "https://lovable.dev/projects/abc?view=security" };
    },
    getTabFn: async () => ({ url: "https://lovable.dev/projects/abc?view=security" }),
    navigateTabFn: async () => {
      calls.navigated += 1;
    },
    settleBeforeRetryMs: 0
  });

  assert.equal(calls.navigated, 0);
  assert.equal(calls.scraped, 1);
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.matched, true);
  assert.equal(result.recovery.reason, "passive_settle");
  assert.equal(result.scraped.url, "https://lovable.dev/projects/abc?view=security");
});

test("recoverProjectSecurityView renavigates when tab stays on base project URL", async () => {
  const calls = {
    navigated: 0,
    scraped: 0
  };

  const result = await recoverProjectSecurityView({
    tabId: 33,
    intendedUrl: "https://lovable.dev/projects/abc?view=security",
    initialScraped: { url: "https://lovable.dev/projects/abc" },
    scrapeFn: async () => {
      calls.scraped += 1;
      return {
        url:
          calls.scraped === 1
            ? "https://lovable.dev/projects/abc?view=security"
            : "https://lovable.dev/projects/abc?view=security"
      };
    },
    getTabFn: async () => ({ url: "https://lovable.dev/projects/abc" }),
    navigateTabFn: async () => {
      calls.navigated += 1;
    },
    settleBeforeRetryMs: 0
  });

  assert.equal(calls.navigated, 1);
  assert.equal(calls.scraped, 1);
  assert.equal(result.recovery.attempted, true);
  assert.equal(result.recovery.matched, true);
  assert.equal(result.recovery.reason, "renavigate");
  assert.equal(result.scraped.url, "https://lovable.dev/projects/abc?view=security");
});
