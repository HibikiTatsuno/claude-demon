import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse as parseYaml } from "yaml";

export interface MatchingConfig {
  /** Enable fuzzy matching when no branch issue ID */
  enabled: boolean;
  /** Minimum confidence threshold (0.0 - 1.0) */
  confidenceThreshold: number;
  /** Weight for keyword search (0.0 - 1.0) */
  keywordWeight: number;
  /** Weight for semantic search (0.0 - 1.0) */
  semanticWeight: number;
  /** Enable semantic search (uses `claude -p` command) */
  enableSemantic: boolean;
  /** Maximum API calls per minute (rate limiting) */
  maxApiCallsPerMinute: number;
}

export interface Config {
  watch: {
    claudeProjectsPath: string;
  };
  branchPattern: string;
  logging: {
    level: "debug" | "info" | "warn" | "error";
  };
  matching: MatchingConfig;
}

const CONFIG_DIR = join(homedir(), ".config", "l-daemon");
const CONFIG_FILE = join(CONFIG_DIR, "config.yaml");

const DEFAULT_CONFIG: Config = {
  watch: {
    claudeProjectsPath: join(homedir(), ".claude", "projects"),
  },
  branchPattern: "([A-Z]+-\\d+)",
  logging: {
    level: "info",
  },
  matching: {
    enabled: true,
    confidenceThreshold: 0.7,
    keywordWeight: 0.6,
    semanticWeight: 0.4,
    enableSemantic: true,
    maxApiCallsPerMinute: 30,
  },
};

/**
 * Creates default config file if it doesn't exist
 */
function ensureConfigFile(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!existsSync(CONFIG_FILE)) {
    const defaultYaml = `# l-daemon configuration
# Linear integration uses MCP (no API key required)
# Make sure Linear MCP is configured in Claude Code:
#   ~/.claude.json -> mcpServers -> "linear-server": { "type": "sse", "url": "https://mcp.linear.app/sse" }

watch:
  # Path to Claude Code projects directory
  claude_projects_path: ~/.claude/projects/

# Regex pattern to extract Linear issue ID from git branch name
branch_pattern: "([A-Z]+-\\\\d+)"

logging:
  level: info

# Fuzzy matching configuration
matching:
  enabled: true
  confidence_threshold: 0.7
  keyword_weight: 0.6
  semantic_weight: 0.4
  # Enable semantic search using \`claude -p\` command
  enable_semantic: true
  max_api_calls_per_minute: 30
`;
    writeFileSync(CONFIG_FILE, defaultYaml);
  }
}

/**
 * Loads configuration from file and environment
 */
export function loadConfig(): Config {
  ensureConfigFile();

  const config = { ...DEFAULT_CONFIG };

  if (existsSync(CONFIG_FILE)) {
    try {
      const fileContent = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = parseYaml(fileContent);

      if (parsed.watch?.claude_projects_path) {
        config.watch.claudeProjectsPath =
          parsed.watch.claude_projects_path.replace("~", homedir());
      }

      if (parsed.branch_pattern) {
        config.branchPattern = parsed.branch_pattern;
      }

      if (parsed.logging?.level) {
        config.logging.level = parsed.logging.level;
      }

      // Parse matching configuration
      if (parsed.matching) {
        if (typeof parsed.matching.enabled === "boolean") {
          config.matching.enabled = parsed.matching.enabled;
        }
        if (typeof parsed.matching.confidence_threshold === "number") {
          config.matching.confidenceThreshold =
            parsed.matching.confidence_threshold;
        }
        if (typeof parsed.matching.keyword_weight === "number") {
          config.matching.keywordWeight = parsed.matching.keyword_weight;
        }
        if (typeof parsed.matching.semantic_weight === "number") {
          config.matching.semanticWeight = parsed.matching.semantic_weight;
        }
        if (typeof parsed.matching.enable_semantic === "boolean") {
          config.matching.enableSemantic = parsed.matching.enable_semantic;
        }
        if (typeof parsed.matching.max_api_calls_per_minute === "number") {
          config.matching.maxApiCallsPerMinute =
            parsed.matching.max_api_calls_per_minute;
        }
      }
    } catch (error) {
      console.error("Failed to parse config file:", error);
    }
  }

  return config;
}
