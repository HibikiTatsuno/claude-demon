import { spawn } from "child_process";

/**
 * Configuration for the LLM client
 */
export interface LLMClientConfig {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Max tokens for response (used in prompt instruction) */
  maxTokens?: number;
}

/**
 * Response from semantic matching
 */
export interface SemanticMatchResponse {
  matches: Array<{
    issueId: string;
    relevanceScore: number;
    reasoning: string;
    matchedAspects: string[];
  }>;
}

/**
 * LLM client using Claude CLI (`claude -p`)
 */
export class LLMClient {
  private timeout: number;
  private maxTokens: number;

  constructor(config?: LLMClientConfig) {
    this.timeout = config?.timeout || 60000;
    this.maxTokens = config?.maxTokens || 1024;
  }

  /**
   * Sends a prompt to Claude CLI and returns the response
   */
  async complete(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("claude", ["-p", prompt], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: this.timeout,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`claude -p failed with code ${code}: ${stderr}`));
        }
      });

      child.on("error", (error) => {
        reject(new Error(`Failed to spawn claude: ${error.message}`));
      });
    });
  }

  /**
   * Sends a prompt and parses the JSON response
   */
  async completeJSON<T>(prompt: string): Promise<T> {
    const response = await this.complete(prompt);

    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error}`);
    }
  }

  /**
   * Performs semantic matching and returns structured results
   */
  async matchIssues(prompt: string): Promise<SemanticMatchResponse> {
    return this.completeJSON<SemanticMatchResponse>(prompt);
  }
}
