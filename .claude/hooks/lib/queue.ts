import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { QueueItem, SessionStopItem, PrCreatedItem } from "./types.js";

const QUEUE_DIR = join(homedir(), ".local", "share", "claude-linear-sync");
const QUEUE_FILE = join(QUEUE_DIR, "queue.jsonl");

type NewSessionStopItem = Omit<SessionStopItem, "id" | "timestamp" | "status">;
type NewPrCreatedItem = Omit<PrCreatedItem, "id" | "timestamp" | "status">;
type NewQueueItem = NewSessionStopItem | NewPrCreatedItem;

/**
 * Ensure queue directory exists
 */
function ensureQueueDir(): void {
  if (!existsSync(QUEUE_DIR)) {
    mkdirSync(QUEUE_DIR, { recursive: true });
  }
}

/**
 * Add item to queue
 */
export function enqueue(item: NewQueueItem): void {
  ensureQueueDir();

  const queueItem: QueueItem = {
    ...item,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    status: "pending",
  } as QueueItem;

  appendFileSync(QUEUE_FILE, JSON.stringify(queueItem) + "\n");
}

/**
 * Get queue file path
 */
export function getQueuePath(): string {
  return QUEUE_FILE;
}
