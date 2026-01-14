// Types
export type {
  ExtractedSessionContent,
  KeywordSearchResult,
  SemanticMatchResult,
  MatchResult,
  HybridMatcherConfig,
  ScoringSignals,
  MatchingConfig,
  SessionContext,
} from "./types.js";

// Content extraction
export {
  extractSessionContent,
  generateSearchQuery,
} from "./content-extractor.js";

// Keyword search
export { KeywordSearcher } from "./keyword-search.js";

// Semantic search
export { SemanticSearcher } from "./semantic-search.js";

// Confidence scoring
export {
  calculateConfidence,
  combineScores,
  shouldAcceptMatch,
  calculateStateBonus,
  calculateRecencyBonus,
} from "./confidence-scorer.js";

// Hybrid matcher
export { HybridMatcher } from "./hybrid-matcher.js";

// Convenience function
import { HybridMatcher } from "./hybrid-matcher.js";
import { LinearClient } from "../linear/client.js";
import { LLMClient } from "../llm/client.js";
import type { ExtractedSessionContent } from "./types.js";

let cachedMatcher: HybridMatcher | null = null;

/**
 * Find matching Linear issue for session content
 */
export async function findMatchingIssue(
  content: { userMessages: string[]; assistantMessages: string[]; gitBranch?: string } | null,
  cwd: string,
): Promise<string | null> {
  // ブランチ名からIssue IDを直接抽出を試みる
  if (content?.gitBranch) {
    const match = content.gitBranch.match(/([A-Z]+-\d+)/);
    if (match) {
      return match[1];
    }
  }

  // セッションコンテンツがない場合は検索不可
  if (!content || content.userMessages.length === 0) {
    return null;
  }

  // HybridMatcherを使用
  if (!cachedMatcher) {
    const linearClient = new LinearClient();
    const llmClient = new LLMClient();
    cachedMatcher = new HybridMatcher(linearClient, llmClient);
  }

  // Convert to ExtractedSessionContent format
  const projectName = cwd.split("/").pop() || "";
  const keywords = extractKeywordsSimple(content.userMessages.join(" "));

  const sessionContent: ExtractedSessionContent = {
    primaryRequest: content.userMessages[0] || "",
    additionalContext: content.userMessages.slice(1),
    keywords,
    cwd,
    projectName,
    toolPatterns: [],
    filePaths: [],
    sessionId: "",
    timeRange: { start: "", end: "" },
  };

  const result = await cachedMatcher.findMatch(sessionContent);
  return result?.issue.identifier ?? null;
}

/**
 * Simple keyword extraction
 */
function extractKeywordsSimple(text: string): string[] {
  const stopWords = new Set(["the", "a", "an", "is", "are", "to", "of", "in", "for", "on", "with"]);
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w))
    .slice(0, 20);
}
