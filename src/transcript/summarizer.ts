import { LLMClient } from "../llm/client.js";

const llmClient = new LLMClient();

/**
 * Summarize session content using Claude
 */
export async function summarizeSession(content: {
  userMessages: string[];
  assistantMessages: string[];
}): Promise<string> {
  // 短いセッションはそのまま返す
  if (content.userMessages.length <= 2) {
    return content.userMessages.join("\n");
  }

  const prompt = buildSummarizationPrompt(content);

  try {
    const response = await llmClient.complete(prompt);
    return response.trim();
  } catch (error) {
    // LLM失敗時はユーザーメッセージを結合
    return content.userMessages.slice(0, 5).join("\n");
  }
}

/**
 * Build summarization prompt
 */
function buildSummarizationPrompt(content: {
  userMessages: string[];
  assistantMessages: string[];
}): string {
  const userContent = content.userMessages.slice(0, 10).join("\n---\n");

  return `You are a technical writer. Summarize the following Claude Code session in 2-3 sentences.
Focus on:
- What the user wanted to accomplish
- What was implemented or changed
- Key outcomes

User requests:
${userContent}

Write a concise summary in Japanese:`;
}
