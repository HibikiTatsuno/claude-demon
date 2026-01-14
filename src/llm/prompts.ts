/**
 * Prompt template for matching Claude session content to Linear issues
 */
export const ISSUE_MATCHING_PROMPT = `You are an expert at matching developer work sessions to issue tracking tickets.

Given the following Claude Code session context:
- User Request: {primaryRequest}
- Project: {projectName}
- Working Directory: {cwd}
- Files Touched: {filePaths}
- Keywords: {keywords}

And the following candidate Linear issues:
{issues}

Analyze each issue and determine how relevant it is to the session work.

For each issue, provide:
1. A relevance score from 0.0 to 1.0
2. Brief reasoning for the score
3. Which aspects matched (title, description, keywords, etc.)

Respond ONLY with valid JSON in this exact format:
{
  "matches": [
    {
      "issueId": "ENG-123",
      "relevanceScore": 0.85,
      "reasoning": "Brief explanation",
      "matchedAspects": ["title", "description"]
    }
  ]
}

IMPORTANT:
- Only include issues with relevance score > 0.3
- Be strict with scoring - only give high scores (>0.7) for strong matches
- Consider: task similarity, project context, keywords, file paths
- If no issues are relevant, return {"matches": []}`;

/**
 * Prompt template for generating a search query from session content
 */
export const QUERY_SUMMARY_PROMPT = `Summarize the following developer session into a brief search query.
Focus on: the main task, technologies involved, and key components.

Session Context:
- Request: {primaryRequest}
- Project: {projectName}
- Files: {filePaths}

Output a single line search query (max 100 characters). Do not include any explanation.`;

/**
 * Formats the issue matching prompt with actual values
 */
export function formatIssueMatchingPrompt(params: {
  primaryRequest: string;
  projectName: string;
  cwd: string;
  filePaths: string[];
  keywords: string[];
  issues: Array<{
    identifier: string;
    title: string;
    description?: string;
    state: { name: string };
  }>;
}): string {
  const issuesText = params.issues
    .map(
      (issue) =>
        `- ${issue.identifier}: "${issue.title}" (Status: ${issue.state.name})${
          issue.description
            ? `\n  Description: ${issue.description.slice(0, 200)}...`
            : ""
        }`,
    )
    .join("\n");

  return ISSUE_MATCHING_PROMPT.replace(
    "{primaryRequest}",
    params.primaryRequest,
  )
    .replace("{projectName}", params.projectName || "Unknown")
    .replace("{cwd}", params.cwd || "Unknown")
    .replace("{filePaths}", params.filePaths.slice(0, 10).join(", ") || "None")
    .replace("{keywords}", params.keywords.slice(0, 15).join(", ") || "None")
    .replace("{issues}", issuesText || "No issues found");
}

/**
 * Formats the query summary prompt with actual values
 */
export function formatQuerySummaryPrompt(params: {
  primaryRequest: string;
  projectName: string;
  filePaths: string[];
}): string {
  return QUERY_SUMMARY_PROMPT.replace("{primaryRequest}", params.primaryRequest)
    .replace("{projectName}", params.projectName || "Unknown")
    .replace("{filePaths}", params.filePaths.slice(0, 5).join(", ") || "None");
}
