import type { LinearClient, LinearIssue } from "../linear/client.js";
import type { ExtractedSessionContent, KeywordSearchResult } from "./types.js";
import { generateSearchQuery } from "./content-extractor.js";

/**
 * Performs keyword-based search on Linear issues
 */
export class KeywordSearcher {
  private linearClient: LinearClient;

  constructor(linearClient: LinearClient) {
    this.linearClient = linearClient;
  }

  /**
   * Searches for issues using extracted session content
   */
  async search(
    content: ExtractedSessionContent,
  ): Promise<KeywordSearchResult[]> {
    const results: Map<string, KeywordSearchResult> = new Map();

    // Strategy 1: Search with generated query
    const query = generateSearchQuery(content);
    if (query) {
      const issues = await this.linearClient.searchIssues(query);
      for (const issue of issues) {
        const score = this.calculateKeywordScore(issue, content);
        if (
          !results.has(issue.identifier) ||
          results.get(issue.identifier)!.keywordScore < score.keywordScore
        ) {
          results.set(issue.identifier, score);
        }
      }
    }

    // Strategy 2: Search with primary request keywords
    if (content.primaryRequest) {
      const requestQuery = content.primaryRequest.slice(0, 100);
      const issues = await this.linearClient.searchIssues(requestQuery);
      for (const issue of issues) {
        const score = this.calculateKeywordScore(issue, content);
        if (
          !results.has(issue.identifier) ||
          results.get(issue.identifier)!.keywordScore < score.keywordScore
        ) {
          results.set(issue.identifier, score);
        }
      }
    }

    // Strategy 3: Search with project name
    if (content.projectName) {
      const issues = await this.linearClient.searchIssues(content.projectName);
      for (const issue of issues) {
        const score = this.calculateKeywordScore(issue, content);
        if (
          !results.has(issue.identifier) ||
          results.get(issue.identifier)!.keywordScore < score.keywordScore
        ) {
          results.set(issue.identifier, score);
        }
      }
    }

    // Sort by score descending
    return Array.from(results.values()).sort(
      (a, b) => b.keywordScore - a.keywordScore,
    );
  }

  /**
   * Searches issues with recent/active filter using the new API method
   */
  async searchRecentIssues(
    content: ExtractedSessionContent,
    limit: number = 20,
  ): Promise<KeywordSearchResult[]> {
    const issues = await this.linearClient.getRecentIssues(limit);
    const results: KeywordSearchResult[] = [];

    for (const issue of issues) {
      const score = this.calculateKeywordScore(issue, content);
      if (score.keywordScore > 0) {
        results.push(score);
      }
    }

    return results.sort((a, b) => b.keywordScore - a.keywordScore);
  }

  /**
   * Calculates keyword match score between issue and session content
   */
  private calculateKeywordScore(
    issue: LinearIssue,
    content: ExtractedSessionContent,
  ): KeywordSearchResult {
    const matchedKeywords: string[] = [];
    let score = 0;

    const issueText = `${issue.title} ${issue.description || ""}`.toLowerCase();
    const issueWords = new Set(issueText.split(/\s+/));

    // Check keyword matches
    for (const keyword of content.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (issueText.includes(keywordLower)) {
        matchedKeywords.push(keyword);
        // Title match is worth more
        if (issue.title.toLowerCase().includes(keywordLower)) {
          score += 0.15;
        } else {
          score += 0.05;
        }
      }
    }

    // Project name match bonus
    if (
      content.projectName &&
      issueText.includes(content.projectName.toLowerCase())
    ) {
      score += 0.2;
      if (!matchedKeywords.includes(content.projectName)) {
        matchedKeywords.push(content.projectName);
      }
    }

    // Primary request similarity
    const requestWords = content.primaryRequest
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const requestMatches = requestWords.filter((w) => issueWords.has(w));
    if (requestWords.length > 0) {
      score += (requestMatches.length / requestWords.length) * 0.3;
    }

    // Cap score at 1.0
    score = Math.min(1.0, score);

    return {
      issue,
      matchedKeywords,
      keywordScore: score,
    };
  }
}
