import test from "node:test";
import assert from "node:assert/strict";

import { asTargetsFile } from "../src/lib/targets.js";

test("asTargetsFile serializes published URLs as newline-delimited text", () => {
  const result = {
    projectUrls: {
      publishedUrls: ["https://a.example.com", "https://b.example.com"]
    }
  };

  assert.equal(asTargetsFile(result), "https://a.example.com\nhttps://b.example.com\n");
});

test("asTargetsFile tolerates missing or malformed payload shape", () => {
  assert.equal(asTargetsFile(null), "");
  assert.equal(asTargetsFile({}), "");
  assert.equal(asTargetsFile({ projectUrls: {} }), "");
  assert.equal(asTargetsFile({ projectUrls: { publishedUrls: "not-an-array" } }), "");
});
