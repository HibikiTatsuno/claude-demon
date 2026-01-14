import { LinearClient } from "./src/linear/client.js";

async function test() {
	const client = new LinearClient();

	console.log("Testing Linear GraphQL API connection...\n");

	// 設定確認
	if (!client.isConfigured()) {
		console.error("ERROR: LINEAR_API_KEY is not set!");
		console.log("\nPlease set your Linear API key:");
		console.log("  export LINEAR_API_KEY=lin_api_xxxxxx");
		console.log("\nYou can create an API key at:");
		console.log("  https://linear.app/settings/api");
		process.exit(1);
	}

	try {
		// Test 0: Get current user (viewer)
		console.log("0. Getting current user (viewer)...");
		const viewer = await client.getViewer();
		if (viewer) {
			console.log(`   Authenticated as: ${viewer.name} (${viewer.email})`);
		} else {
			console.log("   Failed to get viewer - API key may be invalid");
			process.exit(1);
		}

		// Test 1: Get teams
		console.log("\n1. Getting teams...");
		const teams = await client.getTeams();
		console.log(`   Found ${teams.length} teams:`);
		for (const team of teams) {
			console.log(`   - ${team.name} (${team.key})`);
		}

		// Test 2: Find user
		console.log("\n2. Finding user hibiki.tatsuno...");
		const user = await client.findUser("hibiki.tatsuno");
		if (user) {
			console.log(`   Found: ${user.name} (${user.id})`);
		} else {
			console.log("   User not found");
		}

		// Test 3: Get labels
		if (teams.length > 0) {
			console.log(`\n3. Getting labels for team ${teams[0].name}...`);
			const labels = await client.getLabels(teams[0].id);
			console.log(`   Found ${labels.length} labels:`);
			for (const label of labels.slice(0, 5)) {
				console.log(`   - ${label.name}`);
			}
			if (labels.length > 5) {
				console.log(`   ... and ${labels.length - 5} more`);
			}
		}

		// Test 4: Get workflow states
		if (teams.length > 0) {
			console.log(`\n4. Getting workflow states for team ${teams[0].name}...`);
			const states = await client.getWorkflowStates(teams[0].id);
			console.log(`   Found ${states.length} states:`);
			for (const state of states) {
				console.log(`   - ${state.name} (${state.type})`);
			}
		}

		// Test 5: Get recent issues
		console.log("\n5. Getting recent active issues...");
		const issues = await client.getRecentIssues(5);
		console.log(`   Found ${issues.length} active issues:`);
		for (const issue of issues) {
			console.log(`   - ${issue.identifier}: ${issue.title}`);
			console.log(
				`     State: ${issue.state.name}, Assignee: ${issue.assignee?.name || "Unassigned"}`,
			);
		}

		console.log("\n✓ All tests passed!");
	} catch (error) {
		console.error("\nTest failed:", error);
		process.exit(1);
	}
}

test().catch(console.error);
