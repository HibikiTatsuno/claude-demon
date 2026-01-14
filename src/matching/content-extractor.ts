import type { SessionLogEntry, ContentBlock } from "../daemon/parser.js";
import type { ExtractedSessionContent } from "./types.js";

/**
 * Extracts searchable content from session log entries
 */
export function extractSessionContent(
  entries: SessionLogEntry[],
): ExtractedSessionContent {
  const userEntries = entries.filter((e) => e.type === "user");
  const assistantEntries = entries.filter((e) => e.type === "assistant");

  // Extract primary request from first user message
  const primaryRequest = extractPrimaryRequest(userEntries);

  // Extract additional context from follow-up messages
  const additionalContext = extractAdditionalContext(userEntries);

  // Extract working directory and project name
  const cwd = entries.find((e) => e.cwd)?.cwd || "";
  const projectName = extractProjectName(cwd);

  // Extract tool patterns from assistant messages
  const toolPatterns = extractToolPatterns(assistantEntries);

  // Extract file paths from tool usage
  const filePaths = extractFilePaths(assistantEntries);

  // Generate keywords from all content
  const keywords = generateKeywords(
    primaryRequest,
    additionalContext,
    projectName,
    filePaths,
  );

  // Get time range
  const timestamps = entries
    .map((e) => e.timestamp)
    .filter(Boolean)
    .sort();
  const timeRange = {
    start: timestamps[0] || "",
    end: timestamps[timestamps.length - 1] || "",
  };

  return {
    primaryRequest,
    additionalContext,
    keywords,
    cwd,
    projectName,
    toolPatterns,
    filePaths,
    sessionId: entries[0]?.sessionId || "",
    timeRange,
  };
}

/**
 * Extracts the primary request from the first user message
 */
function extractPrimaryRequest(userEntries: SessionLogEntry[]): string {
  if (userEntries.length === 0) {
    return "";
  }

  const firstEntry = userEntries[0];
  if (typeof firstEntry.message?.content === "string") {
    return firstEntry.message.content.trim();
  }

  return "";
}

/**
 * Extracts additional context from follow-up user messages
 */
function extractAdditionalContext(userEntries: SessionLogEntry[]): string[] {
  return userEntries
    .slice(1)
    .map((entry) => {
      if (typeof entry.message?.content === "string") {
        return entry.message.content.trim();
      }
      return "";
    })
    .filter((content) => content.length > 0);
}

/**
 * Extracts project name from working directory path
 */
function extractProjectName(cwd: string): string {
  if (!cwd) {
    return "";
  }

  // Get the last directory name from the path
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

/**
 * Extracts tool usage patterns from assistant messages
 */
function extractToolPatterns(assistantEntries: SessionLogEntry[]): string[] {
  const toolNames = new Set<string>();

  for (const entry of assistantEntries) {
    if (!Array.isArray(entry.message?.content)) {
      continue;
    }

    for (const block of entry.message.content as ContentBlock[]) {
      if (block.type === "tool_use" && block.name) {
        toolNames.add(block.name.toLowerCase());
      }
    }
  }

  return Array.from(toolNames);
}

/**
 * Extracts file paths from tool usage
 */
function extractFilePaths(assistantEntries: SessionLogEntry[]): string[] {
  const filePaths = new Set<string>();

  for (const entry of assistantEntries) {
    if (!Array.isArray(entry.message?.content)) {
      continue;
    }

    for (const block of entry.message.content as ContentBlock[]) {
      if (block.type === "tool_use" && block.input) {
        // Extract file paths from tool inputs
        const input = block.input as Record<string, unknown>;

        // Common file path parameter names
        const pathKeys = ["file_path", "path", "filePath", "file"];
        for (const key of pathKeys) {
          if (typeof input[key] === "string") {
            filePaths.add(input[key] as string);
          }
        }
      }
    }
  }

  return Array.from(filePaths);
}

/**
 * Generates search keywords from extracted content
 */
function generateKeywords(
  primaryRequest: string,
  additionalContext: string[],
  projectName: string,
  filePaths: string[],
): string[] {
  const keywords = new Set<string>();

  // Add project name as a keyword
  if (projectName) {
    keywords.add(projectName.toLowerCase());
  }

  // Extract keywords from primary request
  const requestKeywords = extractKeywordsFromText(primaryRequest);
  for (const kw of requestKeywords) {
    keywords.add(kw);
  }

  // Extract keywords from additional context
  for (const context of additionalContext) {
    const contextKeywords = extractKeywordsFromText(context);
    for (const kw of contextKeywords) {
      keywords.add(kw);
    }
  }

  // Extract component/file names from file paths
  for (const filePath of filePaths) {
    const fileName = filePath.split("/").pop() || "";
    const baseName = fileName.replace(/\.[^.]+$/, ""); // Remove extension
    if (baseName && baseName.length > 2) {
      keywords.add(baseName.toLowerCase());
    }
  }

  return Array.from(keywords);
}

/**
 * Extracts meaningful keywords from text
 */
function extractKeywordsFromText(text: string): string[] {
  if (!text) {
    return [];
  }

  // Common stop words to filter out
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "shall",
    "can",
    "need",
    "dare",
    "ought",
    "used",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "and",
    "but",
    "if",
    "or",
    "because",
    "until",
    "while",
    "although",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "myself",
    "we",
    "our",
    "you",
    "your",
    "he",
    "him",
    "his",
    "she",
    "her",
    "it",
    "its",
    "they",
    "them",
    "their",
    "what",
    "which",
    "who",
    "whom",
    // Japanese particles and common words
    "の",
    "に",
    "は",
    "を",
    "が",
    "と",
    "で",
    "て",
    "も",
    "な",
    "や",
    "か",
    "ら",
    "へ",
    "から",
    "まで",
    "より",
    "など",
    "ため",
    "こと",
    "もの",
    "する",
    "ある",
    "いる",
    "なる",
    "できる",
    "この",
    "その",
    "あの",
    "どの",
    "です",
    "ます",
    "した",
    "して",
    "という",
    "ください",
    "お願い",
    "欲しい",
    "したい",
    "ほしい",
  ]);

  // Extract words (including Japanese and technical terms)
  const words = text
    .toLowerCase()
    // Split on whitespace and common delimiters
    .split(/[\s,.:;!?()[\]{}"'`]+/)
    .filter((word) => {
      // Filter out stop words and short words
      if (stopWords.has(word)) return false;
      if (word.length < 2) return false;
      // Keep technical terms (camelCase, snake_case, etc.)
      if (/^[a-z_][a-z0-9_-]*$/i.test(word)) return true;
      // Keep Japanese words (hiragana, katakana, kanji)
      if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(word)) return true;
      return false;
    });

  return words;
}

/**
 * Generates a search query summary from extracted content
 */
export function generateSearchQuery(content: ExtractedSessionContent): string {
  const parts: string[] = [];

  // Add project name
  if (content.projectName) {
    parts.push(content.projectName);
  }

  // Add top keywords (limit to 5)
  const topKeywords = content.keywords.slice(0, 5);
  parts.push(...topKeywords);

  return parts.join(" ");
}
