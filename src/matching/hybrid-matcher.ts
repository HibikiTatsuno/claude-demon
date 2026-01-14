import type { LinearClient, LinearIssue } from "../linear/client.js";
import type { LLMClient } from "../llm/client.js";
import type {
  ExtractedSessionContent,
  HybridMatcherConfig,
  MatchResult,
} from "./types.js";
import { KeywordSearcher } from "./keyword-search.js";
import { SemanticSearcher } from "./semantic-search.js";
import { combineScores, calculateStateBonus } from "./confidence-scorer.js";
import { RateLimiter } from "../utils/rate-limiter.js";

const DEFAULT_CONFIG: HybridMatcherConfig = {
  keywordWeight: 0.6,
  semanticWeight: 0.4,
  confidenceThreshold: 0.7,
  maxCandidates: 10,
  enableSemantic: true,
};

/**
 * Hybrid matcher combining keyword and semantic search
 */
export class HybridMatcher {
  private linearClient: LinearClient;
  private llmClient: LLMClient | null;
  private config: HybridMatcherConfig;
  private keywordSearcher: KeywordSearcher;
  private semanticSearcher: SemanticSearcher | null;
  private rateLimiter: RateLimiter;

  constructor(
    linearClient: LinearClient,
    llmClient: LLMClient | null,
    config?: Partial<HybridMatcherConfig>,
    maxApiCallsPerMinute: number = 30,
  ) {
    this.linearClient = linearClient;
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.keywordSearcher = new KeywordSearcher(linearClient);
    this.semanticSearcher =
      llmClient && this.config.enableSemantic
        ? new SemanticSearcher(llmClient)
        : null;
    this.rateLimiter = new RateLimiter(maxApiCallsPerMinute);
  }

  /**
   * Finds the best matching issue for a session
   */
  async findMatch(
    sessionContent: ExtractedSessionContent,
  ): Promise<MatchResult | null> {
    const matches = await this.findMatches(sessionContent);

    if (matches.length === 0) {
      return null;
    }

    const bestMatch = matches[0];

    // Only return if above confidence threshold
    if (bestMatch.confidence >= this.config.confidenceThreshold) {
      return bestMatch;
    }

    return null;
  }

  /**
   * Finds all potential matches above a minimum score
   */
  async findMatches(
    sessionContent: ExtractedSessionContent,
  ): Promise<MatchResult[]> {
    // Wait for rate limiter
    await this.rateLimiter.acquire();

    // Step 1: Keyword search to get candidates
    const keywordResults = await this.keywordSearcher.search(sessionContent);

    if (keywordResults.length === 0) {
      // Try searching recent issues as fallback
      const recentResults = await this.keywordSearcher.searchRecentIssues(
        sessionContent,
        this.config.maxCandidates,
      );

      if (recentResults.length === 0) {
        return [];
      }

      // Use recent results as candidates
      return this.processResults(sessionContent, recentResults, []);
    }

    // Limit candidates
    const candidates = keywordResults.slice(0, this.config.maxCandidates);

    // Step 2: Semantic search on candidates (if enabled)
    let semanticResults: Map<string, { score: number; reasoning: string }> =
      new Map();

    if (this.semanticSearcher && candidates.length > 0) {
      try {
        await this.rateLimiter.acquire();
        const semanticMatches = await this.semanticSearcher.findMatchingIssues(
          sessionContent,
          candidates.map((c) => c.issue),
        );

        for (const match of semanticMatches) {
          semanticResults.set(match.issue.identifier, {
            score: match.relevanceScore,
            reasoning: match.reasoning,
          });
        }
      } catch (error) {
        // Semantic search failed, continue with keyword-only
        console.error("Semantic search failed, using keyword-only:", error);
      }
    }

    return this.processResults(sessionContent, candidates, semanticResults);
  }

  /**
   * Processes search results and combines scores
   */
  private processResults(
    sessionContent: ExtractedSessionContent,
    keywordResults: Array<{
      issue: LinearIssue;
      keywordScore: number;
      matchedKeywords: string[];
    }>,
    semanticResults:
      | Map<string, { score: number; reasoning: string }>
      | Array<unknown>,
  ): MatchResult[] {
    const semanticMap =
      semanticResults instanceof Map
        ? semanticResults
        : new Map<string, { score: number; reasoning: string }>();

    const results: MatchResult[] = [];

    for (const keywordResult of keywordResults) {
      const { issue, keywordScore, matchedKeywords } = keywordResult;
      const semantic = semanticMap.get(issue.identifier);

      // Calculate state bonus
      const stateBonus = calculateStateBonus(issue.state.name);

      // Combine scores
      const confidence = combineScores(
        keywordScore + stateBonus * 0.1, // Add small state bonus to keyword score
        semantic?.score,
        this.config.keywordWeight,
        this.config.semanticWeight,
      );

      // Determine match type
      let matchType: MatchResult["matchType"];
      if (semantic && keywordScore > 0.3) {
        matchType = "hybrid";
      } else if (semantic) {
        matchType = "semantic";
      } else {
        matchType = "keyword";
      }

      results.push({
        issue,
        confidence,
        matchType,
        details: {
          keywordScore,
          semanticScore: semantic?.score,
          matchedKeywords,
          reasoning: semantic?.reasoning,
        },
      });
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence);
  }
}
