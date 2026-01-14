# Linear Issue Search

Search for Linear issues by ID or keyword.

## Usage

```
/linear-issue <issue-id or search query>
```

## Examples

```
/linear-issue ENG-123
/linear-issue "login bug"
/linear-issue authentication feature
```

## Instructions

When the user runs this command, perform the following steps:

1. **Determine the search type:**
   - If the argument matches a pattern like `[A-Z]+-\d+` (e.g., ENG-123, PROJ-456), treat it as an issue identifier
   - Otherwise, treat it as a search query

2. **Fetch the issue using Linear API:**

   For direct issue lookup:
   ```bash
   curl -s -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: $LINEAR_API_KEY" \
     --data '{"query": "query { issue(id: \"<ISSUE_ID>\") { id identifier title description state { name } assignee { name } url } }"}' \
     https://api.linear.app/graphql
   ```

   For search:
   ```bash
   curl -s -X POST \
     -H "Content-Type: application/json" \
     -H "Authorization: $LINEAR_API_KEY" \
     --data '{"query": "query { issueSearch(query: \"<SEARCH_QUERY>\", first: 5) { nodes { id identifier title description state { name } assignee { name } url } } }"}' \
     https://api.linear.app/graphql
   ```

3. **Display the results in a formatted table:**

   | Field | Value |
   |-------|-------|
   | ID | ENG-123 |
   | Title | Issue title here |
   | Status | In Progress |
   | Assignee | John Doe |
   | URL | https://linear.app/... |

4. **If multiple results, list them with key information:**
   - Identifier
   - Title
   - Status
   - Assignee

5. **Handle errors gracefully:**
   - If LINEAR_API_KEY is not set, inform the user to set it
   - If no results found, suggest alternative search terms

## Environment Variables

- `LINEAR_API_KEY`: Your Linear personal API key (required)
  - Get it from: Linear Settings > Security & access > Personal API keys

## Notes

- The Linear API requires authentication via API key
- Rate limits apply: 1,500 requests per hour for API key auth
- Issue identifiers are case-insensitive
