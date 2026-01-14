import { spawn } from "child_process";

/**
 * Linear issue type
 */
export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: {
    name: string;
  };
  assignee?: {
    name: string;
  };
  url: string;
}

/**
 * Client for Linear via MCP (using `claude -p` command)
 */
export class LinearClient {
  private timeout: number;

  constructor(_apiKey?: string) {
    // API key is no longer needed - using MCP via claude -p
    this.timeout = 60000;
  }

  /**
   * Executes a claude -p command and returns the response
   */
  private async executeClaudeCommand(prompt: string): Promise<string> {
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
   * Parses JSON from claude response
   */
  private parseJsonFromResponse<T>(response: string): T | null {
    try {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }

      // Try to find JSON array
      const arrayMatch = response.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]) as T;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches an issue by identifier (e.g., ENG-123)
   */
  async getIssue(identifier: string): Promise<LinearIssue | null> {
    try {
      const prompt = `Use the Linear MCP to get issue ${identifier}. Return ONLY a JSON object with these fields: id, identifier, title, description, state (with name), assignee (with name), url. No explanation.`;

      const response = await this.executeClaudeCommand(prompt);
      return this.parseJsonFromResponse<LinearIssue>(response);
    } catch (error) {
      console.error("Failed to fetch issue:", error);
      return null;
    }
  }

  /**
   * Searches for issues by query
   */
  async searchIssues(query: string): Promise<LinearIssue[]> {
    try {
      const prompt = `Use the Linear MCP to search for issues matching "${query}". Return ONLY a JSON array of issues with these fields for each: id, identifier, title, description, state (with name), assignee (with name), url. Limit to 10 results. No explanation.`;

      const response = await this.executeClaudeCommand(prompt);
      const issues = this.parseJsonFromResponse<LinearIssue[]>(response);
      return issues || [];
    } catch (error) {
      console.error("Failed to search issues:", error);
      return [];
    }
  }

  /**
   * Fetches recent active issues for matching
   */
  async getRecentIssues(limit: number = 20): Promise<LinearIssue[]> {
    try {
      const prompt = `Use the Linear MCP to list recent active issues (in progress or todo status). Return ONLY a JSON array of up to ${limit} issues with these fields for each: id, identifier, title, description, state (with name), assignee (with name), url. No explanation.`;

      const response = await this.executeClaudeCommand(prompt);
      const issues = this.parseJsonFromResponse<LinearIssue[]>(response);
      return issues || [];
    } catch (error) {
      console.error("Failed to fetch recent issues:", error);
      return [];
    }
  }

  /**
   * Adds a comment to an issue
   */
  async addComment(issueIdentifier: string, body: string): Promise<boolean> {
    try {
      // Escape quotes in body for the prompt
      const escapedBody = body.replace(/"/g, '\\"').replace(/\n/g, "\\n");

      const prompt = `Use the Linear MCP to add a comment to issue ${issueIdentifier}. The comment body is: "${escapedBody}". Return ONLY {"success": true} or {"success": false}. No explanation.`;

      const response = await this.executeClaudeCommand(prompt);
      const result = this.parseJsonFromResponse<{ success: boolean }>(response);
      return result?.success ?? false;
    } catch (error) {
      console.error("Failed to add comment:", error);
      return false;
    }
  }

  /**
   * Attaches a link to an issue (e.g., PR URL)
   */
  async attachLink(
    issueIdentifier: string,
    url: string,
    title: string
  ): Promise<boolean> {
    try {
      const prompt = `Use the Linear MCP to add a link attachment to issue ${issueIdentifier}. URL: "${url}", Title: "${title}". Return ONLY {"success": true} or {"success": false}. No explanation.`;

      const response = await this.executeClaudeCommand(prompt);
      const result = this.parseJsonFromResponse<{ success: boolean }>(response);
      return result?.success ?? false;
    } catch (error) {
      console.error("Failed to attach link:", error);
      return false;
    }
  }
}
