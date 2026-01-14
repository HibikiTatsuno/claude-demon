#!/usr/bin/env npx tsx

/**
 * Post Tool Use Hook
 *
 * Triggered after a tool is executed.
 * Detects PR creation and adds to queue.
 */

import { readStdin, continueHook } from "./lib/stdin.js";
import { enqueue } from "./lib/queue.js";
import type { PostToolUseHookInput } from "./lib/types.js";

/**
 * Extract PR URL from gh pr create output
 */
function extractPrUrl(output: string | undefined): string | null {
  if (!output) return null;

  // gh pr create outputs: https://github.com/owner/repo/pull/123
  const match = output.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/);
  return match ? match[0] : null;
}

async function main(): Promise<void> {
  try {
    const input = await readStdin<PostToolUseHookInput>();

    // Bashツールのみ処理
    if (input.tool_name !== "Bash") {
      continueHook();
      return;
    }

    const command = input.tool_input?.command as string | undefined;

    // gh pr create を検知
    if (command?.includes("gh pr create")) {
      const prUrl = extractPrUrl(input.tool_response);

      if (prUrl) {
        enqueue({
          type: "pr_created",
          sessionId: input.session_id,
          prUrl,
          cwd: input.cwd,
        });
      }
    }

    continueHook();
  } catch (error) {
    console.error(`[post-tool-use hook error] ${error}`);
    continueHook();
  }
}

main();
