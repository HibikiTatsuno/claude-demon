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
