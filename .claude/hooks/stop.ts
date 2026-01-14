#!/usr/bin/env npx tsx

/**
 * Stop Hook
 *
 * Triggered when Claude Code finishes responding.
 * Adds session info to queue for background processing.
 */

import { readStdin, continueHook } from "./lib/stdin.js";
import { enqueue } from "./lib/queue.js";
import type { StopHookInput } from "./lib/types.js";

async function main(): Promise<void> {
  try {
    const input = await readStdin<StopHookInput>();

    // キューに追加（即座に完了）
    enqueue({
      type: "session_stop",
      sessionId: input.session_id,
      transcriptPath: input.transcript_path,
      cwd: input.cwd,
    });

    // 即座にreturn
    continueHook();
  } catch (error) {
    // エラーでもブロックしない
    console.error(`[stop hook error] ${error}`);
    continueHook();
  }
}

main();
