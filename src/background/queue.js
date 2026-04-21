import { normalizeUrl } from "./shared.js";

export function createUrlQueue(visited = new Set()) {
  const queue = [];
  const enqueued = new Set();
  const normalizedVisited = new Set();

  for (const url of visited) {
    const normalized = normalizeUrl(url || "");
    if (normalized) {
      normalizedVisited.add(normalized);
    }
  }

  function enqueue(rawUrl) {
    const normalized = normalizeUrl(rawUrl || "");
    if (!normalized) {
      return false;
    }
    if (normalizedVisited.has(normalized) || enqueued.has(normalized)) {
      return false;
    }

    enqueued.add(normalized);
    queue.push(normalized);
    return true;
  }

  function dequeue() {
    if (queue.length === 0) {
      return null;
    }
    const next = queue.shift();
    enqueued.delete(next);
    return next;
  }

  return {
    enqueue,
    dequeue,
    size: () => queue.length
  };
}
