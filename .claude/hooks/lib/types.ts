/**
 * Hook input types received from Claude Code via stdin
 */

export interface BaseHookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

export interface StopHookInput extends BaseHookInput {
  hook_event_name: "stop";
  stop_hook_active: boolean;
}

export interface PostToolUseHookInput extends BaseHookInput {
  hook_event_name: "post_tool_use";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: string;
}

export interface SessionStartHookInput extends BaseHookInput {
  hook_event_name: "session_start";
}

export type HookInput = StopHookInput | PostToolUseHookInput | SessionStartHookInput;

/**
 * Hook output types
 */

export interface HookContinueOutput {
  decision: "continue";
}

export interface HookBlockOutput {
  decision: "block";
  reason: string;
}

export type HookOutput = HookContinueOutput | HookBlockOutput;

/**
 * Queue item types
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
