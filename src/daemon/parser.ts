/**
 * Represents a parsed session log entry
 */
export interface SessionLogEntry {
  type: "user" | "assistant" | "file-history-snapshot";
  sessionId: string;
  cwd?: string;
  gitBranch?: string;
  timestamp: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
}

/**
 * Content block types in assistant messages
 */
export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

/**
 * Parses a single line from a session log file
 */
export function parseSessionLogLine(line: string): SessionLogEntry | null {
  try {
    const parsed = JSON.parse(line);

    // Skip file-history-snapshot entries
    if (parsed.type === "file-history-snapshot") {
      return null;
    }

    // Handle user messages
    if (parsed.type === "user") {
      return {
        type: "user",
        sessionId: parsed.sessionId,
        cwd: parsed.cwd,
        gitBranch: parsed.gitBranch,
        timestamp: parsed.timestamp,
        message: parsed.message,
      };
    }

    // Handle assistant messages
    if (parsed.type === "assistant") {
      return {
        type: "assistant",
        sessionId: parsed.sessionId,
        cwd: parsed.cwd,
        gitBranch: parsed.gitBranch,
        timestamp: parsed.timestamp,
        message: parsed.message,
      };
    }

    return null;
  } catch {
    // Invalid JSON or parsing error
    return null;
  }
}

/**
 * Extracts user request text from a session log entry
 */
export function extractUserRequest(entry: SessionLogEntry): string | null {
  if (entry.type !== "user") {
    return null;
  }

  if (typeof entry.message?.content === "string") {
    return entry.message.content;
  }

  return null;
}

/**
 * Extracts tool uses from an assistant message
 */
export function extractToolUses(
  entry: SessionLogEntry,
): Array<{ name: string; input: unknown }> {
  if (entry.type !== "assistant" || !Array.isArray(entry.message?.content)) {
    return [];
  }

  return entry.message.content
    .filter(
      (block): block is ContentBlock & { type: "tool_use" } =>
        block.type === "tool_use",
    )
    .map((block) => ({
      name: block.name || "unknown",
      input: block.input,
    }));
}
