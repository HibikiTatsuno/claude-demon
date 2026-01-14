import chokidar, { type FSWatcher } from "chokidar";
import { readFileSync, statSync } from "fs";
import { basename } from "path";
import type { Config } from "../utils/config.js";
import { logger } from "../utils/logger.js";
import { parseSessionLogLine, type SessionLogEntry } from "./parser.js";
import { LinearClient } from "../linear/client.js";
import {
  HybridMatcher,
  extractSessionContent,
  type MatchResult,
} from "../matching/index.js";
import { LLMClient } from "../llm/client.js";

/**
 * Watches Claude Code session logs and syncs to Linear
 */
export class SessionWatcher {
  private config: Config;
  private watcher: FSWatcher | null = null;
  private linearClient: LinearClient;
  private filePositions: Map<string, number> = new Map();
  private sessionBranches: Map<string, string> = new Map();
  // Fuzzy matching support
  private hybridMatcher: HybridMatcher | null = null;
  private sessionEntries: Map<string, SessionLogEntry[]> = new Map();
  private matchCache: Map<string, MatchResult | null> = new Map();

  constructor(config: Config) {
    this.config = config;
    this.linearClient = new LinearClient();

    // Initialize hybrid matcher if enabled
    if (config.matching?.enabled) {
      // LLMClient uses `claude -p` command, no API key required
      const llmClient = config.matching.enableSemantic ? new LLMClient() : null;

      this.hybridMatcher = new HybridMatcher(
        this.linearClient,
        llmClient,
        {
          keywordWeight: config.matching.keywordWeight,
          semanticWeight: config.matching.semanticWeight,
          confidenceThreshold: config.matching.confidenceThreshold,
          maxCandidates: 10,
          enableSemantic: config.matching.enableSemantic,
        },
        config.matching.maxApiCallsPerMinute,
      );

      logger.info("Fuzzy matching enabled (using claude -p for semantic search)");
    }
  }

  /**
   * Starts watching session logs
   */
  async start(): Promise<void> {
    const watchPath = `${this.config.watch.claudeProjectsPath}/**/*.jsonl`;

    logger.info(`Watching: ${watchPath}`);

    this.watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on("add", (path) => this.handleNewFile(path));
    this.watcher.on("change", (path) => this.handleFileChange(path));
    this.watcher.on("error", (error) => logger.error("Watcher error:", error));
  }

  /**
   * Stops watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Handles a new session file
   */
  private handleNewFile(filePath: string): void {
    // Skip subagent files
    if (filePath.includes("/subagents/")) {
      return;
    }

    const sessionId = basename(filePath, ".jsonl");
    logger.debug(`New session file: ${sessionId}`);

    // Initialize file position to end of file
    try {
      const stats = statSync(filePath);
      this.filePositions.set(filePath, stats.size);
    } catch {
      this.filePositions.set(filePath, 0);
    }
  }

  /**
   * Handles file changes (new log entries)
   */
  private async handleFileChange(filePath: string): Promise<void> {
    // Skip subagent files
    if (filePath.includes("/subagents/")) {
      return;
    }

    const previousPosition = this.filePositions.get(filePath) || 0;

    try {
      const content = readFileSync(filePath, "utf-8");
      const newContent = content.slice(previousPosition);

      if (!newContent.trim()) {
        return;
      }

      // Update position
      this.filePositions.set(filePath, content.length);

      // Process new lines
      const lines = newContent.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        await this.processLogLine(filePath, line);
      }
    } catch (error) {
      logger.error(`Error processing file ${filePath}:`, error);
    }
  }

  /**
   * Processes a single log line
   */
  private async processLogLine(_filePath: string, line: string): Promise<void> {
    const entry = parseSessionLogLine(line);

    if (!entry) {
      return;
    }

    // Track session entries for fuzzy matching
    const sessionEntries = this.sessionEntries.get(entry.sessionId) || [];
    sessionEntries.push(entry);
    this.sessionEntries.set(entry.sessionId, sessionEntries);

    // Track git branch for session
    if (entry.type === "user" && entry.gitBranch) {
      this.sessionBranches.set(entry.sessionId, entry.gitBranch);
    }

    const gitBranch =
      entry.gitBranch || this.sessionBranches.get(entry.sessionId);

    // Try to extract Linear issue ID from branch name first
    let issueId = gitBranch ? this.extractIssueId(gitBranch) : null;

    // Fallback to fuzzy matching if no issue ID found
    if (!issueId && this.hybridMatcher) {
      issueId = await this.findMatchingIssue(entry.sessionId);
    }

    if (!issueId) {
      return;
    }

    // Process based on entry type
    if (entry.type === "user" && typeof entry.message?.content === "string") {
      await this.handleUserMessage(issueId, entry);
    }

    if (entry.type === "assistant") {
      await this.handleAssistantMessage(issueId, entry);
    }
  }

  /**
   * Finds matching issue using hybrid search (fuzzy matching)
   */
  private async findMatchingIssue(sessionId: string): Promise<string | null> {
    // Check cache first
    if (this.matchCache.has(sessionId)) {
      const cached = this.matchCache.get(sessionId);
      return cached?.issue.identifier ?? null;
    }

    const entries = this.sessionEntries.get(sessionId) || [];

    // Wait for at least 2 entries to have enough context
    if (entries.length < 2) {
      return null;
    }

    try {
      const content = extractSessionContent(entries);

      // Skip if primary request is too short
      if (content.primaryRequest.length < 20) {
        return null;
      }

      const result = await this.hybridMatcher!.findMatch(content);

      // Cache the result
      this.matchCache.set(sessionId, result);

      if (result) {
        logger.info(
          `Auto-matched session to ${result.issue.identifier} ` +
            `(confidence: ${(result.confidence * 100).toFixed(1)}%, type: ${result.matchType})`,
        );
        return result.issue.identifier;
      }
    } catch (error) {
      logger.error("Failed to find matching issue:", error);
    }

    return null;
  }

  /**
   * Extracts Linear issue ID from git branch name
   */
  private extractIssueId(branch: string): string | null {
    const pattern = new RegExp(this.config.branchPattern);
    const match = branch.match(pattern);
    return match ? match[1] : null;
  }

  /**
   * Handles user message - add as comment to Linear
   */
  private async handleUserMessage(
    issueId: string,
    entry: SessionLogEntry,
  ): Promise<void> {
    if (entry.type !== "user" || typeof entry.message?.content !== "string") {
      return;
    }

    const content = entry.message.content;

    // Skip short messages
    if (content.length < 20) {
      return;
    }

    const comment = `**Claude Code Session Log**\n\n**Request:**\n${content}\n\n_${new Date(entry.timestamp).toLocaleString()}_`;

    try {
      await this.linearClient.addComment(issueId, comment);
      logger.info(`Added comment to ${issueId}`);
    } catch (error) {
      logger.error(`Failed to add comment to ${issueId}:`, error);
    }
  }

  /**
   * Handles assistant message - check for PR creation
   */
  private async handleAssistantMessage(
    issueId: string,
    entry: SessionLogEntry,
  ): Promise<void> {
    if (entry.type !== "assistant" || !Array.isArray(entry.message?.content)) {
      return;
    }

    // Look for PR URL in tool results
    for (const block of entry.message.content) {
      if (block.type === "tool_use" && block.name === "Bash") {
        // Check if it's a gh pr create command result
        const input = block.input as { command?: string };
        if (input.command?.includes("gh pr create")) {
          // The PR URL will be in a subsequent tool_result
          // We'll capture it when we see the result
          logger.debug("Detected gh pr create command");
        }
      }

      if (block.type === "tool_result") {
        const content = String(block.content || "");
        // Look for GitHub PR URL
        const prUrlMatch = content.match(
          /https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/\d+/,
        );

        if (prUrlMatch) {
          const prUrl = prUrlMatch[0];
          await this.linkPrToIssue(issueId, prUrl);
        }
      }
    }
  }

  /**
   * Links a PR to a Linear issue
   */
  private async linkPrToIssue(issueId: string, prUrl: string): Promise<void> {
    try {
      await this.linearClient.attachLink(issueId, prUrl, "GitHub Pull Request");
      logger.info(`Linked PR ${prUrl} to ${issueId}`);
    } catch (error) {
      logger.error(`Failed to link PR to ${issueId}:`, error);
    }
  }
}
