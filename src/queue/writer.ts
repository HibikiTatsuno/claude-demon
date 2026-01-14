import { writeFileSync, mkdirSync, existsSync } from "fs";
import { readAllItems, getQueuePath, getQueueDir } from "./reader.js";
import type { QueueItem } from "./types.js";

/**
 * Ensure queue directory exists
 */
function ensureQueueDir(): void {
  const dir = getQueueDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write all items to queue file
 */
function writeAllItems(items: QueueItem[]): void {
  ensureQueueDir();
  const content = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(getQueuePath(), content);
}

/**
 * Update item status
 */
export function updateItemStatus(
  id: string,
  status: QueueItem["status"],
  error?: string
): void {
  const items = readAllItems();
  const index = items.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error(`Queue item not found: ${id}`);
  }

  items[index] = {
    ...items[index],
    status,
    error,
    retryCount:
      status === "failed"
        ? (items[index].retryCount ?? 0) + 1
        : items[index].retryCount,
  };

  writeAllItems(items);
}

/**
 * Mark item as processing
 */
export function markAsProcessing(id: string): void {
  updateItemStatus(id, "processing");
}

/**
 * Mark item as processed
 */
export function markAsProcessed(id: string): void {
  updateItemStatus(id, "processed");
}

/**
 * Mark item as failed
 */
export function markAsFailed(id: string, error: string): void {
  updateItemStatus(id, "failed", error);
}

/**
 * Reset item to pending (for retry)
 */
export function resetToPending(id: string): void {
  updateItemStatus(id, "pending");
}

/**
 * Remove processed items older than specified hours
 */
export function cleanupOldItems(hoursOld: number = 24): number {
  const items = readAllItems();
  const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;

  const remaining = items.filter((item) => {
    if (item.status !== "processed") return true;
    return new Date(item.timestamp).getTime() > cutoff;
  });

  const removed = items.length - remaining.length;
  if (removed > 0) {
    writeAllItems(remaining);
  }

  return removed;
}
