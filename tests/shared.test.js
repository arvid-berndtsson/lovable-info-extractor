import test from "node:test";
import assert from "node:assert/strict";

import {
  LOAD_TIMEOUT_MS,
  POST_LOAD_DELAY_MS,
  ensureProjectSecurityViewUrl,
  getPageLoadTimeoutMs,
  getPostLoadDelayMs,
  isProjectSecurityViewUrl,
  stripProjectSecurityViewUrl
} from "../src/background/shared.js";

test("getPageLoadTimeoutMs returns longer timeout for Lovable project pages", () => {
  const projectUrl = "https://lovable.dev/projects/abc123";
  const securityCenterUrl = "https://lovable.dev/settings/security-center";

  assert.ok(getPageLoadTimeoutMs(projectUrl) > LOAD_TIMEOUT_MS);
  assert.equal(getPageLoadTimeoutMs(securityCenterUrl), LOAD_TIMEOUT_MS);
});

test("getPostLoadDelayMs returns longer post-load delay for Lovable project pages", () => {
  const projectUrl = "https://lovable.dev/projects/abc123?view=security";
  const nonProjectUrl = "https://lovable.dev/projects";

  assert.ok(getPostLoadDelayMs(projectUrl) > POST_LOAD_DELAY_MS);
  assert.equal(getPostLoadDelayMs(nonProjectUrl), POST_LOAD_DELAY_MS);
});

test("ensureProjectSecurityViewUrl appends or replaces view=security for project URLs", () => {
  assert.equal(
    ensureProjectSecurityViewUrl("https://lovable.dev/projects/abc123"),
    "https://lovable.dev/projects/abc123?view=security"
  );
  assert.equal(
    ensureProjectSecurityViewUrl("https://lovable.dev/projects/abc123?view=code"),
    "https://lovable.dev/projects/abc123?view=security"
  );
  assert.equal(
    ensureProjectSecurityViewUrl("https://lovable.dev/settings/security-center"),
    "https://lovable.dev/settings/security-center"
  );
});

test("isProjectSecurityViewUrl identifies only project security view URLs", () => {
  assert.equal(isProjectSecurityViewUrl("https://lovable.dev/projects/abc123?view=security"), true);
  assert.equal(isProjectSecurityViewUrl("https://lovable.dev/projects/abc123?view=code"), false);
  assert.equal(isProjectSecurityViewUrl("https://lovable.dev/settings/security-center"), false);
});

test("stripProjectSecurityViewUrl removes only view=security from project URLs", () => {
  assert.equal(
    stripProjectSecurityViewUrl("https://lovable.dev/projects/abc123?view=security"),
    "https://lovable.dev/projects/abc123"
  );
  assert.equal(
    stripProjectSecurityViewUrl("https://lovable.dev/projects/abc123?view=security&foo=bar"),
    "https://lovable.dev/projects/abc123?foo=bar"
  );
  assert.equal(
    stripProjectSecurityViewUrl("https://lovable.dev/projects/abc123?view=code"),
    "https://lovable.dev/projects/abc123?view=code"
  );
  assert.equal(
    stripProjectSecurityViewUrl("https://lovable.dev/settings/security-center?view=security"),
    "https://lovable.dev/settings/security-center?view=security"
  );
});
