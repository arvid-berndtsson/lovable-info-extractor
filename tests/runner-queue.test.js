import test from "node:test";
import assert from "node:assert/strict";

import { createUrlQueue } from "../src/background/runner.js";

test("createUrlQueue deduplicates equivalent URLs before processing", () => {
  const queue = createUrlQueue();

  assert.equal(queue.enqueue("https://lovable.dev/projects/abc"), true);
  assert.equal(queue.enqueue("https://lovable.dev/projects/abc/"), false);
  assert.equal(queue.enqueue("https://lovable.dev/projects/abc#main-content"), false);
  assert.equal(queue.size(), 1);
});

test("createUrlQueue skips already visited URLs", () => {
  const visited = new Set(["https://lovable.dev/projects/already-seen?view=security"]);
  const queue = createUrlQueue(visited);

  assert.equal(queue.enqueue("https://lovable.dev/projects/already-seen?view=security"), false);
  assert.equal(queue.enqueue("https://lovable.dev/projects/already-seen"), true);
  assert.equal(queue.enqueue("https://lovable.dev/projects/new-one"), true);
  assert.equal(queue.size(), 2);
});

test("createUrlQueue allows re-enqueue after dequeue when still unvisited", () => {
  const queue = createUrlQueue();
  assert.equal(queue.enqueue("https://lovable.dev/projects/retry-me"), true);

  const first = queue.dequeue();
  assert.equal(first, "https://lovable.dev/projects/retry-me");
  assert.equal(queue.size(), 0);

  assert.equal(queue.enqueue("https://lovable.dev/projects/retry-me"), true);
  assert.equal(queue.size(), 1);
});

test("createUrlQueue treats base and security view URLs as distinct", () => {
  const queue = createUrlQueue();

  assert.equal(queue.enqueue("https://lovable.dev/projects/abc"), true);
  assert.equal(queue.enqueue("https://lovable.dev/projects/abc?view=security"), true);
  assert.equal(queue.size(), 2);
});
