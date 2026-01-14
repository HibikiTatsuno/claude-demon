/**
 * Linear issue type
 */
export interface LinearIssue {
	id: string;
	identifier: string;
	title: string;
	description?: string;
	state: {
		id: string;
		name: string;
	};
	assignee?: {
		id: string;
		name: string;
	};
	labels?: {
		id: string;
		name: string;
	}[];
	url: string;
}

/**
 * Linear label type
 */
export interface LinearLabel {
	id: string;
	name: string;
}

/**
 * Linear team type
 */
export interface LinearTeam {
	id: string;
	name: string;
	key: string;
}

/**
 * Linear workflow state type
 */
export interface LinearWorkflowState {
	id: string;
	name: string;
	type: string;
}

/**
 * Linear user type
 */
export interface LinearUser {
	id: string;
	name: string;
	email?: string;
}

/**
 * Client for Linear GraphQL API
 */
export class LinearClient {
	private apiKey: string;
	private baseUrl = "https://api.linear.app/graphql";

	constructor(apiKey?: string) {
		this.apiKey = apiKey || process.env.LINEAR_API_KEY || "";
		if (!this.apiKey) {
			console.warn(
				"LINEAR_API_KEY not set. Please set it in environment variables.",
			);
		}
	}

	/**
	 * Checks if the client is properly configured
	 */
	isConfigured(): boolean {
		return !!this.apiKey;
	}

	/**
	 * Executes a GraphQL query/mutation
	 */
	private async executeGraphQL<T>(
		query: string,
		variables?: Record<string, unknown>,
	): Promise<T> {
		if (!this.apiKey) {
			throw new Error("LINEAR_API_KEY not configured");
		}

		const response = await fetch(this.baseUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: this.apiKey,
			},
			body: JSON.stringify({ query, variables }),
		});

		if (!response.ok) {
			throw new Error(
				`Linear API error: ${response.status} ${response.statusText}`,
			);
		}

		const result = (await response.json()) as {
			data?: T;
			errors?: { message: string }[];
		};

		if (result.errors && result.errors.length > 0) {
			throw new Error(`Linear GraphQL error: ${result.errors[0].message}`);
		}

		if (!result.data) {
			throw new Error("No data returned from Linear API");
		}

		return result.data;
	}

	/**
	 * Fetches an issue by identifier (e.g., ENG-123)
	 */
	async getIssue(identifier: string): Promise<LinearIssue | null> {
		try {
			const query = `
        query GetIssue($identifier: String!) {
          issue(id: $identifier) {
            id
            identifier
            title
            description
            url
            state {
              id
              name
            }
            assignee {
              id
              name
            }
            labels {
              nodes {
                id
                name
              }
            }
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issue: {
					id: string;
					identifier: string;
					title: string;
					description?: string;
					url: string;
					state: { id: string; name: string };
					assignee?: { id: string; name: string };
					labels: { nodes: { id: string; name: string }[] };
				};
			}>(query, { identifier });

			if (!data.issue) return null;

			return {
				...data.issue,
				labels: data.issue.labels?.nodes,
			};
		} catch (error) {
			console.error("Failed to fetch issue:", error);
			return null;
		}
	}

	/**
	 * Searches for issues by query
	 */
	async searchIssues(searchQuery: string): Promise<LinearIssue[]> {
		try {
			const query = `
        query SearchIssues($searchQuery: String!, $first: Int!) {
          issueSearch(query: $searchQuery, first: $first) {
            nodes {
              id
              identifier
              title
              description
              url
              state {
                id
                name
              }
              assignee {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                }
              }
            }
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issueSearch: {
					nodes: {
						id: string;
						identifier: string;
						title: string;
						description?: string;
						url: string;
						state: { id: string; name: string };
						assignee?: { id: string; name: string };
						labels: { nodes: { id: string; name: string }[] };
					}[];
				};
			}>(query, { searchQuery, first: 10 });

			return data.issueSearch.nodes.map((issue) => ({
				...issue,
				labels: issue.labels?.nodes,
			}));
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
			const query = `
        query GetRecentIssues($first: Int!) {
          issues(
            first: $first
            orderBy: updatedAt
            filter: {
              state: { type: { in: ["started", "unstarted"] } }
            }
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              state {
                id
                name
              }
              assignee {
                id
                name
              }
              labels {
                nodes {
                  id
                  name
                }
              }
            }
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issues: {
					nodes: {
						id: string;
						identifier: string;
						title: string;
						description?: string;
						url: string;
						state: { id: string; name: string };
						assignee?: { id: string; name: string };
						labels: { nodes: { id: string; name: string }[] };
					}[];
				};
			}>(query, { first: limit });

			return data.issues.nodes.map((issue) => ({
				...issue,
				labels: issue.labels?.nodes,
			}));
		} catch (error) {
			console.error("Failed to fetch recent issues:", error);
			return [];
		}
	}

	/**
	 * Adds a comment to an issue
	 */
	async addComment(issueId: string, body: string): Promise<boolean> {
		try {
			const mutation = `
        mutation AddComment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success
          }
        }
      `;

			const data = await this.executeGraphQL<{
				commentCreate: { success: boolean };
			}>(mutation, { issueId, body });

			return data.commentCreate.success;
		} catch (error) {
			console.error("Failed to add comment:", error);
			return false;
		}
	}

	/**
	 * Attaches a link to an issue (e.g., PR URL)
	 */
	async attachLink(
		issueId: string,
		url: string,
		title: string,
	): Promise<boolean> {
		try {
			const mutation = `
        mutation AttachLink($issueId: String!, $url: String!, $title: String!) {
          attachmentCreate(input: { issueId: $issueId, url: $url, title: $title }) {
            success
          }
        }
      `;

			const data = await this.executeGraphQL<{
				attachmentCreate: { success: boolean };
			}>(mutation, { issueId, url, title });

			return data.attachmentCreate.success;
		} catch (error) {
			console.error("Failed to attach link:", error);
			return false;
		}
	}

	/**
	 * Creates a new issue
	 */
	async createIssue(params: {
		title: string;
		description?: string;
		teamId: string;
		assigneeId?: string;
		labelIds?: string[];
		stateId?: string;
	}): Promise<LinearIssue | null> {
		try {
			const mutation = `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
              state {
                id
                name
              }
            }
          }
        }
      `;

			const input: Record<string, unknown> = {
				title: params.title,
				teamId: params.teamId,
			};

			if (params.description) input.description = params.description;
			if (params.assigneeId) input.assigneeId = params.assigneeId;
			if (params.labelIds && params.labelIds.length > 0)
				input.labelIds = params.labelIds;
			if (params.stateId) input.stateId = params.stateId;

			const data = await this.executeGraphQL<{
				issueCreate: {
					success: boolean;
					issue: {
						id: string;
						identifier: string;
						title: string;
						url: string;
						state: { id: string; name: string };
					};
				};
			}>(mutation, { input });

			if (!data.issueCreate.success) return null;

			return {
				...data.issueCreate.issue,
				labels: [],
			};
		} catch (error) {
			console.error("Failed to create issue:", error);
			return null;
		}
	}

	/**
	 * Updates issue status
	 */
	async updateIssueStatus(issueId: string, stateId: string): Promise<boolean> {
		try {
			const mutation = `
        mutation UpdateIssue($issueId: String!, $stateId: String!) {
          issueUpdate(id: $issueId, input: { stateId: $stateId }) {
            success
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issueUpdate: { success: boolean };
			}>(mutation, { issueId, stateId });

			return data.issueUpdate.success;
		} catch (error) {
			console.error("Failed to update issue status:", error);
			return false;
		}
	}

	/**
	 * Assigns issue to a user
	 */
	async assignIssue(issueId: string, assigneeId: string): Promise<boolean> {
		try {
			const mutation = `
        mutation AssignIssue($issueId: String!, $assigneeId: String!) {
          issueUpdate(id: $issueId, input: { assigneeId: $assigneeId }) {
            success
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issueUpdate: { success: boolean };
			}>(mutation, { issueId, assigneeId });

			return data.issueUpdate.success;
		} catch (error) {
			console.error("Failed to assign issue:", error);
			return false;
		}
	}

	/**
	 * Adds labels to an issue
	 */
	async addLabels(issueId: string, labelIds: string[]): Promise<boolean> {
		try {
			// 既存のラベルを取得してマージする
			const issue = await this.getIssueById(issueId);
			if (!issue) return false;

			const existingLabelIds = issue.labels?.map((l) => l.id) || [];
			const allLabelIds = [...new Set([...existingLabelIds, ...labelIds])];

			const mutation = `
        mutation UpdateIssueLabels($issueId: String!, $labelIds: [String!]!) {
          issueUpdate(id: $issueId, input: { labelIds: $labelIds }) {
            success
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issueUpdate: { success: boolean };
			}>(mutation, { issueId, labelIds: allLabelIds });

			return data.issueUpdate.success;
		} catch (error) {
			console.error("Failed to add labels:", error);
			return false;
		}
	}

	/**
	 * Gets an issue by ID (internal use)
	 */
	private async getIssueById(issueId: string): Promise<LinearIssue | null> {
		try {
			const query = `
        query GetIssueById($issueId: String!) {
          issue(id: $issueId) {
            id
            identifier
            title
            description
            url
            state {
              id
              name
            }
            assignee {
              id
              name
            }
            labels {
              nodes {
                id
                name
              }
            }
          }
        }
      `;

			const data = await this.executeGraphQL<{
				issue: {
					id: string;
					identifier: string;
					title: string;
					description?: string;
					url: string;
					state: { id: string; name: string };
					assignee?: { id: string; name: string };
					labels: { nodes: { id: string; name: string }[] };
				};
			}>(query, { issueId });

			if (!data.issue) return null;

			return {
				...data.issue,
				labels: data.issue.labels?.nodes,
			};
		} catch (error) {
			console.error("Failed to fetch issue by ID:", error);
			return null;
		}
	}

	/**
	 * Gets available labels for a team
	 */
	async getLabels(teamId?: string): Promise<LinearLabel[]> {
		try {
			let query: string;
			let variables: Record<string, unknown>;

			if (teamId) {
				query = `
          query GetTeamLabels($teamId: String!) {
            team(id: $teamId) {
              labels {
                nodes {
                  id
                  name
                }
              }
            }
          }
        `;
				variables = { teamId };

				const data = await this.executeGraphQL<{
					team: { labels: { nodes: { id: string; name: string }[] } };
				}>(query, variables);

				return data.team.labels.nodes;
			} else {
				query = `
          query GetAllLabels {
            issueLabels(first: 100) {
              nodes {
                id
                name
              }
            }
          }
        `;

				const data = await this.executeGraphQL<{
					issueLabels: { nodes: { id: string; name: string }[] };
				}>(query);

				return data.issueLabels.nodes;
			}
		} catch (error) {
			console.error("Failed to get labels:", error);
			return [];
		}
	}

	/**
	 * Gets workflow states for a team
	 */
	async getWorkflowStates(teamId?: string): Promise<LinearWorkflowState[]> {
		try {
			let query: string;
			let variables: Record<string, unknown>;

			if (teamId) {
				query = `
          query GetTeamStates($teamId: String!) {
            team(id: $teamId) {
              states {
                nodes {
                  id
                  name
                  type
                }
              }
            }
          }
        `;
				variables = { teamId };

				const data = await this.executeGraphQL<{
					team: {
						states: { nodes: { id: string; name: string; type: string }[] };
					};
				}>(query, variables);

				return data.team.states.nodes;
			} else {
				query = `
          query GetAllStates {
            workflowStates(first: 100) {
              nodes {
                id
                name
                type
              }
            }
          }
        `;

				const data = await this.executeGraphQL<{
					workflowStates: {
						nodes: { id: string; name: string; type: string }[];
					};
				}>(query);

				return data.workflowStates.nodes;
			}
		} catch (error) {
			console.error("Failed to get workflow states:", error);
			return [];
		}
	}

	/**
	 * Gets teams
	 */
	async getTeams(): Promise<LinearTeam[]> {
		try {
			const query = `
        query GetTeams {
          teams {
            nodes {
              id
              name
              key
            }
          }
        }
      `;

			const data = await this.executeGraphQL<{
				teams: { nodes: { id: string; name: string; key: string }[] };
			}>(query);

			return data.teams.nodes;
		} catch (error) {
			console.error("Failed to get teams:", error);
			return [];
		}
	}

	/**
	 * Finds user by name or email
	 */
	async findUser(nameOrEmail: string): Promise<LinearUser | null> {
		try {
			const query = `
        query FindUser {
          users(first: 50) {
            nodes {
              id
              name
              email
            }
          }
        }
      `;

			const data = await this.executeGraphQL<{
				users: { nodes: { id: string; name: string; email?: string }[] };
			}>(query);

			// nameOrEmailで部分一致検索
			const user = data.users.nodes.find(
				(u) =>
					u.name.toLowerCase().includes(nameOrEmail.toLowerCase()) ||
					u.email?.toLowerCase().includes(nameOrEmail.toLowerCase()),
			);

			return user || null;
		} catch (error) {
			console.error("Failed to find user:", error);
			return null;
		}
	}

	/**
	 * Gets the current authenticated user
	 */
	async getViewer(): Promise<LinearUser | null> {
		try {
			const query = `
        query GetViewer {
          viewer {
            id
            name
            email
          }
        }
      `;

			const data = await this.executeGraphQL<{
				viewer: { id: string; name: string; email?: string };
			}>(query);

			return data.viewer;
		} catch (error) {
			console.error("Failed to get viewer:", error);
			return null;
		}
	}
}
