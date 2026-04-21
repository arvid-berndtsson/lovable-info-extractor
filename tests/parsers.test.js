import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProjectVisitUrls,
  collectProjectUrls,
  parseSecuritySummary
} from "../src/lib/parsers.js";

test("collectProjectUrls extracts Lovable project pages and published URLs", () => {
  const input = [
    "Visit https://lovable.dev/projects/alpha",
    "Published at https://alpha.example.com and https://beta.lovable.app",
    "Noise https://lovable.dev/settings/security-center"
  ];

  const result = collectProjectUrls(input);

  assert.deepEqual(result.projectPages, ["https://lovable.dev/projects/alpha"]);
  assert.deepEqual(result.publishedUrls, [
    "https://alpha.example.com",
    "https://beta.lovable.app"
  ]);
});

test("parseSecuritySummary extracts severity counts", () => {
  const text = "Critical 2 High 5 Medium 1 Low 0";
  const summary = parseSecuritySummary(text);

  assert.equal(summary.total, 8);
  assert.equal(summary.critical, 2);
  assert.equal(summary.high, 5);
  assert.equal(summary.medium, 1);
  assert.equal(summary.low, 0);
});

test("parseSecuritySummary handles missing counts", () => {
  const text = "No vulnerabilities found";
  const summary = parseSecuritySummary(text);

  assert.equal(summary.total, 0);
  assert.equal(summary.critical, 0);
  assert.equal(summary.high, 0);
  assert.equal(summary.medium, 0);
  assert.equal(summary.low, 0);
});

test("buildProjectVisitUrls expands security view links into project pages", () => {
  const projectA = `project-${Date.now()}-a`;
  const projectB = `project-${Date.now()}-b`;

  const urls = buildProjectVisitUrls([
    `/projects/${projectA}?view=security`,
    `https://lovable.dev/projects/${projectB}?view=security`,
    `/projects/${projectB}?view=security`,
    "/settings/security-center"
  ]);

  assert.deepEqual(urls.securityViewUrls, [
    `https://lovable.dev/projects/${projectA}?view=security`,
    `https://lovable.dev/projects/${projectB}?view=security`
  ]);
  assert.deepEqual(urls.projectPageUrls, [
    `https://lovable.dev/projects/${projectA}`,
    `https://lovable.dev/projects/${projectB}`
  ]);
});
