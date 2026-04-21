import test from "node:test";
import assert from "node:assert/strict";

import { buildSeedUrls } from "../src/background/runner.js";

test("buildSeedUrls includes active lovable URL and security section seeds", () => {
  const activeUrl = "https://lovable.dev/projects/abc123";
  const urls = buildSeedUrls(activeUrl);

  assert.equal(urls[0], "https://lovable.dev/settings/security-center");
  assert.ok(urls.includes(activeUrl));
  assert.ok(urls.includes("https://lovable.dev/settings/security-center"));
  assert.ok(urls.includes("https://lovable.dev/settings/security-center?section=supply-chain"));
  assert.ok(urls.includes("https://lovable.dev/settings/security-center?section=secrets"));
});

test("buildSeedUrls excludes non-lovable active URL", () => {
  const urls = buildSeedUrls("https://example.com");

  assert.equal(urls.includes("https://example.com"), false);
  assert.ok(urls.includes("https://lovable.dev/settings/security-center"));
});

test("buildSeedUrls never seeds the projects index URL", () => {
  const urls = buildSeedUrls("https://lovable.dev/projects");
  assert.equal(urls.includes("https://lovable.dev/projects"), false);
});

test("buildSeedUrls deduplicates active URL if it matches a security section", () => {
  const urls = buildSeedUrls("https://lovable.dev/settings/security-center");
  const count = urls.filter((url) => url === "https://lovable.dev/settings/security-center").length;
  assert.equal(count, 1);
});
