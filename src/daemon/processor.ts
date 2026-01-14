import chokidar, { type FSWatcher } from "chokidar";
import {
	readPendingItems,
	readRetryableItems,
	getQueuePath,
	markAsProcessing,
	markAsProcessed,
	markAsFailed,
	isSessionStopItem,
	isPrCreatedItem,
	type QueueItem,
	type SessionStopItem,
	type PrCreatedItem,
} from "../queue/index.js";
import {
	LinearClient,
	type LinearLabel,
	type LinearWorkflowState,
} from "../linear/client.js";
import {
	parseTranscript,
	filterNoise,
	extractContent,
} from "../transcript/parser.js";
import { findMatchingIssue } from "../matching/index.js";
import { summarizeSession } from "../transcript/summarizer.js";
import { logger } from "../utils/logger.js";

// Default assignee
const DEFAULT_ASSIGNEE = "hibiki.tatsuno";

// Label mapping based on directory patterns
const LABEL_PATTERNS: { pattern: RegExp; labels: string[] }[] = [
	{ pattern: /frontend|web|react|vue|next/i, labels: ["Frontend"] },
	{ pattern: /backend|api|server|node/i, labels: ["Backend"] },
	{ pattern: /mobile|ios|android|react-native/i, labels: ["Mobile"] },
	{
		pattern: /infra|devops|terraform|k8s|kubernetes/i,
		labels: ["Infrastructure"],
	},
	{ pattern: /test|spec|e2e/i, labels: ["Testing"] },
	{ pattern: /doc|readme|wiki/i, labels: ["Documentation"] },
	{ pattern: /design|figma|ui|ux/i, labels: ["Design"] },
	{ pattern: /bug|fix|hotfix/i, labels: ["Bug"] },
	{ pattern: /feature|feat/i, labels: ["Feature"] },
	{ pattern: /refactor|cleanup/i, labels: ["Refactor"] },
];

export class QueueProcessor {
	private linearClient: LinearClient;
	private watcher: FSWatcher | null = null;
	private processing = false;

	// Cache for Linear data
	private cachedUserId: string | null = null;
	private cachedTeamId: string | null = null;
	private cachedLabels: LinearLabel[] = [];
	private cachedStates: LinearWorkflowState[] = [];

	constructor() {
		this.linearClient = new LinearClient();
	}

	/**
	 * Start watching queue file
	 */
	async start(): Promise<void> {
		logger.info("Starting queue processor...");

		// Initialize Linear cache
		await this.initializeLinearCache();

		// 初回処理
		await this.processQueue();

		// キューファイルを監視
		this.watcher = chokidar.watch(getQueuePath(), {
			persistent: true,
			ignoreInitial: true,
		});

		this.watcher.on("change", async () => {
			logger.debug("Queue file changed");
			await this.processQueue();
		});

		logger.info("Queue processor started");
	}

	/**
	 * Initialize Linear cache (user, team, labels, states)
	 */
	private async initializeLinearCache(): Promise<void> {
		try {
			// Get user ID
			const user = await this.linearClient.findUser(DEFAULT_ASSIGNEE);
			if (user) {
				this.cachedUserId = user.id;
				logger.info(`Found user: ${user.name} (${user.id})`);
			}

			// Get teams
			const teams = await this.linearClient.getTeams();
			if (teams.length > 0) {
				this.cachedTeamId = teams[0].id;
				logger.info(`Using team: ${teams[0].name} (${teams[0].id})`);

				// Get labels for team
				this.cachedLabels = await this.linearClient.getLabels(
					this.cachedTeamId,
				);
				logger.info(`Found ${this.cachedLabels.length} labels`);

				// Get workflow states for team
				this.cachedStates = await this.linearClient.getWorkflowStates(
					this.cachedTeamId,
				);
				logger.info(`Found ${this.cachedStates.length} workflow states`);
			}
		} catch (error) {
			logger.error("Failed to initialize Linear cache:", error);
		}
	}

	/**
	 * Stop watching queue file
	 */
	async stop(): Promise<void> {
		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}
		logger.info("Queue processor stopped");
	}

	/**
	 * Process all pending items in queue
	 */
	async processQueue(): Promise<void> {
		// 同時処理を防ぐ
		if (this.processing) {
			logger.debug("Already processing, skipping");
			return;
		}

		this.processing = true;

		try {
			// Pending items
			const pendingItems = readPendingItems();
			logger.debug(`Found ${pendingItems.length} pending items`);

			for (const item of pendingItems) {
				await this.processItem(item);
			}

			// Retryable failed items
			const retryableItems = readRetryableItems();
			if (retryableItems.length > 0) {
				logger.debug(`Found ${retryableItems.length} retryable items`);
				for (const item of retryableItems) {
					await this.processItem(item);
				}
			}
		} finally {
			this.processing = false;
		}
	}

	/**
	 * Process a single queue item
	 */
	private async processItem(item: QueueItem): Promise<void> {
		logger.info(`Processing item: ${item.id} (${item.type})`);

		try {
			markAsProcessing(item.id);

			if (isSessionStopItem(item)) {
				await this.processSessionStop(item);
			} else if (isPrCreatedItem(item)) {
				await this.processPrCreated(item);
			}

			markAsProcessed(item.id);
			logger.info(`Item processed: ${item.id}`);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`Failed to process item ${item.id}: ${errorMessage}`);
			markAsFailed(item.id, errorMessage);
		}
	}

	/**
	 * Process session stop event
	 */
	private async processSessionStop(item: SessionStopItem): Promise<void> {
		// 1. Read transcript
		const transcript = await parseTranscript(item.transcriptPath);
		if (transcript.length === 0) {
			logger.warn(`Empty transcript: ${item.transcriptPath}`);
			return;
		}

		// 2. Filter noise
		const filtered = filterNoise(transcript);
		if (filtered.length === 0) {
			logger.warn("No content after filtering");
			return;
		}

		// 3. Extract content
		const content = extractContent(filtered);

		// 4. Find or create Linear issue
		let issueId = await findMatchingIssue(content, item.cwd);

		if (!issueId) {
			// Create new issue
			logger.info("No matching issue found, creating new one...");
			issueId = await this.createIssueFromSession(content, item.cwd);

			if (!issueId) {
				logger.error("Failed to create issue");
				return;
			}
		}

		logger.info(`Using issue: ${issueId}`);

		// 5. Ensure issue is assigned and has correct status
		await this.ensureIssueSetup(issueId, item.cwd, content);

		// 6. Summarize session
		const summary = await summarizeSession(content);

		// 7. Post to Linear
		await this.linearClient.addComment(
			issueId,
			this.formatComment(summary, content),
		);
		logger.info(`Posted comment to ${issueId}`);
	}

	/**
	 * Create a new Linear issue from session content
	 */
	private async createIssueFromSession(
		content: {
			userMessages: string[];
			assistantMessages: string[];
			gitBranch?: string;
		},
		cwd: string,
	): Promise<string | null> {
		// teamIdがない場合はIssue作成不可
		if (!this.cachedTeamId) {
			logger.error("Cannot create issue: no team ID cached");
			return null;
		}

		// Generate title from first user message
		const title = this.generateIssueTitle(
			content.userMessages[0] || "Claude Code Session",
			cwd,
		);

		// Generate description
		const description = this.generateIssueDescription(content);

		// Get label IDs based on directory and content
		const labelIds = this.getLabelIds(cwd, content.userMessages.join(" "));

		// Get "In Progress" state ID
		const inProgressStateId =
			this.getStateId("In Progress") || this.getStateId("started");

		const issue = await this.linearClient.createIssue({
			title,
			description,
			teamId: this.cachedTeamId,
			assigneeId: this.cachedUserId ?? undefined,
			labelIds: labelIds.length > 0 ? labelIds : undefined,
			stateId: inProgressStateId ?? undefined,
		});

		return issue?.identifier ?? null;
	}

	/**
	 * Ensure issue has correct assignee, labels, and status
	 */
	private async ensureIssueSetup(
		issueId: string,
		cwd: string,
		content: { userMessages: string[]; assistantMessages: string[] },
	): Promise<void> {
		// Assign to default user if not assigned
		if (this.cachedUserId) {
			await this.linearClient.assignIssue(issueId, this.cachedUserId);
			logger.debug(`Assigned ${issueId} to ${DEFAULT_ASSIGNEE}`);
		}

		// Update status to "In Progress"
		const inProgressStateId =
			this.getStateId("In Progress") || this.getStateId("started");
		if (inProgressStateId) {
			await this.linearClient.updateIssueStatus(issueId, inProgressStateId);
			logger.debug(`Updated ${issueId} status to In Progress`);
		}

		// Add labels based on directory
		const labelIds = this.getLabelIds(cwd, content.userMessages.join(" "));
		if (labelIds.length > 0) {
			await this.linearClient.addLabels(issueId, labelIds);
			logger.debug(`Added ${labelIds.length} labels to ${issueId}`);
		}
	}

	/**
	 * Generate issue title from user message
	 */
	private generateIssueTitle(message: string, cwd: string): string {
		// Get project name from cwd
		const projectName = cwd.split("/").pop() || "";

		// Truncate message to reasonable length
		const truncated =
			message.length > 60
				? message.slice(0, 60).trim() + "..."
				: message.trim();

		// Clean up title
		const cleaned = truncated
			.replace(/[\n\r]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();

		if (projectName) {
			return `[${projectName}] ${cleaned}`;
		}

		return cleaned;
	}

	/**
	 * Generate issue description from content
	 */
	private generateIssueDescription(content: {
		userMessages: string[];
		assistantMessages: string[];
	}): string {
		const lines: string[] = [];

		lines.push("## Context");
		lines.push("");
		lines.push("This issue was auto-created from a Claude Code session.");
		lines.push("");

		if (content.userMessages.length > 0) {
			lines.push("## User Requests");
			lines.push("");
			for (const msg of content.userMessages.slice(0, 3)) {
				const truncated = msg.length > 300 ? msg.slice(0, 300) + "..." : msg;
				lines.push(`- ${truncated}`);
			}
		}

		return lines.join("\n");
	}

	/**
	 * Get label IDs based on directory and content
	 */
	private getLabelIds(cwd: string, content: string): string[] {
		const matchedLabelNames = new Set<string>();

		// Check directory path against patterns
		for (const { pattern, labels } of LABEL_PATTERNS) {
			if (pattern.test(cwd) || pattern.test(content)) {
				for (const label of labels) {
					matchedLabelNames.add(label);
				}
			}
		}

		// Map label names to IDs
		const labelIds: string[] = [];
		for (const name of matchedLabelNames) {
			const label = this.cachedLabels.find(
				(l) => l.name.toLowerCase() === name.toLowerCase(),
			);
			if (label) {
				labelIds.push(label.id);
			}
		}

		return labelIds;
	}

	/**
	 * Get workflow state ID by name
	 */
	private getStateId(name: string): string | null {
		const state = this.cachedStates.find((s) =>
			s.name.toLowerCase().includes(name.toLowerCase()),
		);
		return state?.id ?? null;
	}

	/**
	 * Process PR created event
	 */
	private async processPrCreated(item: PrCreatedItem): Promise<void> {
		// Find matching Linear issue
		let issueId = await findMatchingIssue(null, item.cwd);

		const teamId = this.cachedTeamId;
		if (!issueId && teamId) {
			// Create new issue for PR
			const title = `PR created: ${item.prUrl.split("/").pop()}`;
			const issue = await this.linearClient.createIssue({
				title,
				description: `Pull Request: ${item.prUrl}`,
				teamId,
				assigneeId: this.cachedUserId ?? undefined,
			});
			issueId = issue?.identifier ?? null;
		}

		if (!issueId) {
			logger.warn("No issue for PR (and no team ID to create one)");
			return;
		}

		// Attach PR link to issue
		await this.linearClient.attachLink(issueId, item.prUrl, "Pull Request");
		logger.info(`Attached PR ${item.prUrl} to ${issueId}`);

		// Update status to "In Review"
		const reviewStateId =
			this.getStateId("In Review") || this.getStateId("review");
		if (reviewStateId) {
			await this.linearClient.updateIssueStatus(issueId, reviewStateId);
			logger.debug(`Updated ${issueId} status to In Review`);
		}
	}

	/**
	 * Format comment for Linear
	 */
	private formatComment(
		summary: string,
		content: { userMessages: string[]; assistantMessages: string[] },
	): string {
		const lines: string[] = [];

		lines.push("## Claude Code Session Summary");
		lines.push("");
		lines.push(summary);
		lines.push("");
		lines.push("---");
		lines.push("");
		lines.push("### User Requests");
		for (const msg of content.userMessages.slice(0, 5)) {
			const truncated = msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
			lines.push(`- ${truncated}`);
		}

		return lines.join("\n");
	}
}
