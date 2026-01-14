import type { LinearIssue } from "../linear/client.js";
import type { SessionLogEntry } from "../daemon/parser.js";

/**
 * Extracted content from a Claude Code session for matching
 */
export interface ExtractedSessionContent {
  /** Primary user request/intent from the first message */
  primaryRequest: string;
  /** Additional context from follow-up messages */
  additionalContext: string[];
  /** Keywords extracted from messages */
  keywords: string[];
  /** Current working directory */
  cwd: string;
  /** Project name derived from cwd */
  projectName: string;
  /** Tool usage patterns (e.g., "git", "npm", "test") */
  toolPatterns: string[];
  /** File paths mentioned in the session */
  filePaths: string[];
  /** Session ID */
  sessionId: string;
  /** Timestamp range */
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * Result from keyword-based search
 */
export interface KeywordSearchResult {
  issue: LinearIssue;
  matchedKeywords: string[];
  keywordScore: number;
}

/**
 * Result from semantic (LLM-based) search
 */
export interface SemanticMatchResult {
  issue: LinearIssue;
  relevanceScore: number;
  reasoning: string;
  matchedAspects: string[];
}

/**
 * Combined match result from hybrid search
 */
export interface MatchResult {
  issue: LinearIssue;
  confidence: number;
  matchType: "exact" | "keyword" | "semantic" | "hybrid";
  details: {
    keywordScore?: number;
    semanticScore?: number;
    matchedKeywords?: string[];
    reasoning?: string;
  };
}

/**
 * Configuration for hybrid matching
 */
export interface HybridMatcherConfig {
  /** Weight for keyword search results (0.0 - 1.0) */
  keywordWeight: number;
  /** Weight for semantic search results (0.0 - 1.0) */
  semanticWeight: number;
  /** Minimum confidence threshold for accepting a match */
  confidenceThreshold: number;
  /** Maximum number of candidate issues to consider */
  maxCandidates: number;
  /** Whether to enable semantic search (requires LLM API key) */
  enableSemantic: boolean;
}

/**
 * Signals used for confidence score calculation
 */
export interface ScoringSignals {
  /** Title keyword overlap score (0.0 - 1.0) */
  titleMatch: number;
  /** Description keyword overlap score (0.0 - 1.0) */
  descriptionMatch: number;
  /** Whether project name matches */
  projectMatch: boolean;
  /** Semantic similarity score from LLM (0.0 - 1.0) */
  semanticScore?: number;
  /** Recency bonus for recently updated issues */
  recencyBonus: number;
  /** State bonus for in-progress issues */
  stateBonus: number;
}

/**
 * Matching configuration section in config file
 */
export interface MatchingConfig {
  /** Enable fuzzy matching when no branch issue ID */
  enabled: boolean;
  /** LLM API key for semantic search (optional) */
  llmApiKey?: string;
  /** LLM model to use */
  llmModel: string;
  /** Minimum confidence threshold (0.0 - 1.0) */
  confidenceThreshold: number;
  /** Weight for keyword search (0.0 - 1.0) */
  keywordWeight: number;
  /** Weight for semantic search (0.0 - 1.0) */
  semanticWeight: number;
  /** Enable semantic search (requires llmApiKey) */
  enableSemantic: boolean;
  /** Maximum API calls per minute (rate limiting) */
  maxApiCallsPerMinute: number;
}

/**
 * Session entries grouped for matching
 */
export interface SessionContext {
  sessionId: string;
  entries: SessionLogEntry[];
  gitBranch?: string;
}
