import type { ScoringSignals } from "./types.js";

/**
 * Scoring weights for different signals
 */
const WEIGHTS = {
  titleMatch: 0.35,
  descriptionMatch: 0.25,
  projectMatch: 0.15,
  semanticScore: 0.2,
  stateBonus: 0.03,
  recencyBonus: 0.02,
};

/**
 * Calculates confidence score from multiple signals
 */
export function calculateConfidence(signals: ScoringSignals): number {
  let score = 0;

  // Title match (high weight)
  score += signals.titleMatch * WEIGHTS.titleMatch;

  // Description match (medium weight)
  score += signals.descriptionMatch * WEIGHTS.descriptionMatch;

  // Project name match (bonus)
  if (signals.projectMatch) {
    score += WEIGHTS.projectMatch;
  }

  // Semantic score (if available)
  if (signals.semanticScore !== undefined) {
    score += signals.semanticScore * WEIGHTS.semanticScore;
  }

  // State bonus (in-progress issues are more likely relevant)
  score += signals.stateBonus * WEIGHTS.stateBonus;

  // Recency bonus (recently updated issues are more likely relevant)
  score += signals.recencyBonus * WEIGHTS.recencyBonus;

  // Cap score at 1.0
  return Math.min(1.0, score);
}

/**
 * Combines keyword and semantic scores with configurable weights
 */
export function combineScores(
  keywordScore: number,
  semanticScore: number | undefined,
  keywordWeight: number,
  semanticWeight: number,
): number {
  if (semanticScore === undefined) {
    // If no semantic score, use keyword score only
    return keywordScore;
  }

  // Normalize weights to sum to 1
  const totalWeight = keywordWeight + semanticWeight;
  const normalizedKeywordWeight = keywordWeight / totalWeight;
  const normalizedSemanticWeight = semanticWeight / totalWeight;

  return (
    keywordScore * normalizedKeywordWeight +
    semanticScore * normalizedSemanticWeight
  );
}

/**
 * Determines if a match should be accepted based on confidence threshold
 */
export function shouldAcceptMatch(
  confidence: number,
  threshold: number,
): boolean {
  return confidence >= threshold;
}

/**
 * Calculates state bonus based on issue state
 */
export function calculateStateBonus(stateName: string): number {
  const state = stateName.toLowerCase();

  // In Progress issues get highest bonus
  if (state.includes("progress") || state.includes("started")) {
    return 1.0;
  }

  // Todo/Backlog issues get medium bonus
  if (
    state.includes("todo") ||
    state.includes("backlog") ||
    state.includes("unstarted")
  ) {
    return 0.5;
  }

  // Done/Cancelled issues get no bonus
  if (
    state.includes("done") ||
    state.includes("complete") ||
    state.includes("cancel")
  ) {
    return 0.0;
  }

  // Default
  return 0.3;
}

/**
 * Calculates recency bonus based on issue update time
 */
export function calculateRecencyBonus(updatedAt?: string): number {
  if (!updatedAt) {
    return 0;
  }

  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24);

  // Issues updated in last 24 hours get full bonus
  if (daysSinceUpdate < 1) {
    return 1.0;
  }

  // Issues updated in last week get partial bonus
  if (daysSinceUpdate < 7) {
    return 0.7;
  }

  // Issues updated in last month get small bonus
  if (daysSinceUpdate < 30) {
    return 0.3;
  }

  // Older issues get no bonus
  return 0;
}
