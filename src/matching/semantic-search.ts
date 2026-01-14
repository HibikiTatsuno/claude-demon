import type { LinearIssue } from "../linear/client.js";
import type { LLMClient } from "../llm/client.js";
import { formatIssueMatchingPrompt } from "../llm/prompts.js";
import type { ExtractedSessionContent, SemanticMatchResult } from "./types.js";

/**
 * Configuration for semantic search
 */
export interface SemanticSearchConfig {
  /** Minimum relevance score to include in results */
  minRelevanceScore: number;
}

const DEFAULT_CONFIG: SemanticSearchConfig = {
  minRelevanceScore: 0.3,
};

/**
 * LLM-based semantic search for issue matching
 */
export class SemanticSearcher {
  private llmClient: LLMClient;
  private config: SemanticSearchConfig;

  constructor(llmClient: LLMClient, config?: Partial<SemanticSearchConfig>) {
    this.llmClient = llmClient;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Finds semantically matching issues from candidates
   */
  async findMatchingIssues(
    sessionContent: ExtractedSessionContent,
    candidateIssues: LinearIssue[],
  ): Promise<SemanticMatchResult[]> {
    if (candidateIssues.length === 0) {
      return [];
    }

    // Format the prompt
    const prompt = formatIssueMatchingPrompt({
      primaryRequest: sessionContent.primaryRequest,
      projectName: sessionContent.projectName,
      cwd: sessionContent.cwd,
      filePaths: sessionContent.filePaths,
      keywords: sessionContent.keywords,
      issues: candidateIssues.map((issue) => ({
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description,
        state: issue.state,
      })),
    });

    try {
      const response = await this.llmClient.matchIssues(prompt);

      // Map response to SemanticMatchResult
      const results: SemanticMatchResult[] = [];

      for (const match of response.matches) {
        // Find the corresponding issue
        const issue = candidateIssues.find(
          (i) => i.identifier === match.issueId,
        );

        if (issue && match.relevanceScore >= this.config.minRelevanceScore) {
          results.push({
            issue,
            relevanceScore: match.relevanceScore,
            reasoning: match.reasoning,
            matchedAspects: match.matchedAspects,
          });
        }
      }

      // Sort by relevance score descending
      return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (error) {
      console.error("Semantic search failed:", error);
      return [];
    }
  }
}
