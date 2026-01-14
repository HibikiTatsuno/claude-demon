/**
 * Queue item types for daemon processing
 */

export interface BaseQueueItem {
  id: string;
  type: string;
  timestamp: string;
  status: "pending" | "processing" | "processed" | "failed";
  error?: string;
  retryCount?: number;
}

export interface SessionStopItem extends BaseQueueItem {
  type: "session_stop";
  sessionId: string;
  transcriptPath: string;
  cwd: string;
}

export interface PrCreatedItem extends BaseQueueItem {
  type: "pr_created";
  sessionId: string;
  prUrl: string;
  cwd: string;
}

export type QueueItem = SessionStopItem | PrCreatedItem;

export function isSessionStopItem(item: QueueItem): item is SessionStopItem {
  return item.type === "session_stop";
}

export function isPrCreatedItem(item: QueueItem): item is PrCreatedItem {
  return item.type === "pr_created";
}
