import { readFileSync, existsSync } from "fs";

/**
 * Transcript log entry types
 */

interface BaseLogEntry {
  type: string;
  sessionId: string;
  timestamp: string;
}

interface UserLogEntry extends BaseLogEntry {
  type: "user";
  cwd: string;
  gitBranch?: string;
  message: {
    role: "user";
    content: string;
  };
}

interface AssistantLogEntry extends BaseLogEntry {
  type: "assistant";
  message: {
    role: "assistant";
    content: ContentBlock[];
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export type LogEntry = UserLogEntry | AssistantLogEntry;

/**
 * Noise patterns to filter out
 */
const NOISE_PATTERNS = [
  /<system-reminder>/,
  /<local-command>/,
  /<user-prompt-submit-hook>/,
  /subagents\//,
];

/**
 * Parse transcript JSONL file
 */
export async function parseTranscript(path: string): Promise<LogEntry[]> {
  if (!existsSync(path)) {
    return [];
  }

  const content = readFileSync(path, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  const entries: LogEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.type === "user" || entry.type === "assistant") {
        entries.push(entry);
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return entries;
}

/**
 * Filter out noise entries
 */
export function filterNoise(entries: LogEntry[]): LogEntry[] {
  return entries.filter((entry) => {
    const content = getEntryContent(entry);
    return !NOISE_PATTERNS.some((pattern) => pattern.test(content));
  });
}

/**
 * Get text content from entry
 */
function getEntryContent(entry: LogEntry): string {
  if (entry.type === "user") {
    return entry.message.content;
  }

  // Assistant entry
  const blocks = entry.message.content;
  return blocks
    .filter((block): block is ContentBlock & { text: string } => block.type === "text" && !!block.text)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Extract user and assistant messages
 */
export function extractContent(entries: LogEntry[]): {
  userMessages: string[];
  assistantMessages: string[];
  gitBranch?: string;
} {
  const userMessages: string[] = [];
  const assistantMessages: string[] = [];
  let gitBranch: string | undefined;

  for (const entry of entries) {
    if (entry.type === "user") {
      userMessages.push(entry.message.content);
      if (entry.gitBranch && !gitBranch) {
        gitBranch = entry.gitBranch;
      }
    } else {
      const content = getEntryContent(entry);
      if (content) {
        assistantMessages.push(content);
      }
    }
  }

  return { userMessages, assistantMessages, gitBranch };
}

/**
 * Extract git branch from entries
 */
export function extractGitBranch(entries: LogEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type === "user" && entry.gitBranch) {
      return entry.gitBranch;
    }
  }
  return undefined;
}
