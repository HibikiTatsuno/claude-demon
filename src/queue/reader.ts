import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { QueueItem } from "./types.js";

const QUEUE_DIR = join(homedir(), ".local", "share", "claude-linear-sync");
const QUEUE_FILE = join(QUEUE_DIR, "queue.jsonl");

/**
 * Read all items from queue file
 */
export function readAllItems(): QueueItem[] {
  if (!existsSync(QUEUE_FILE)) {
    return [];
  }

  const content = readFileSync(QUEUE_FILE, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line) as QueueItem);
}

/**
 * Read pending items from queue
 */
export function readPendingItems(): QueueItem[] {
  return readAllItems().filter((item) => item.status === "pending");
}

/**
 * Read failed items that can be retried
 */
export function readRetryableItems(maxRetries: number = 3): QueueItem[] {
  return readAllItems().filter(
    (item) => item.status === "failed" && (item.retryCount ?? 0) < maxRetries
  );
}

/**
 * Get queue file path
 */
export function getQueuePath(): string {
  return QUEUE_FILE;
}

/**
 * Get queue directory path
 */
export function getQueueDir(): string {
  return QUEUE_DIR;
}
