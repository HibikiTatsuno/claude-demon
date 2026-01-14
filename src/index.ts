import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { SessionWatcher } from "./daemon/watcher.js";
import { logger } from "./utils/logger.js";
import { loadConfig } from "./utils/config.js";

const DATA_DIR = join(homedir(), ".local", "share", "l-daemon");
const PID_FILE = join(DATA_DIR, "daemon.pid");
const LOG_FILE = join(DATA_DIR, "daemon.log");

interface StartOptions {
  foreground: boolean;
}

interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
  watchedFiles?: number;
}

/**
 * Ensures the data directory exists
 */
function ensureDataDir(): void {
  const { mkdirSync } = require("fs");
  mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Starts the daemon process
 */
export async function startDaemon(options: StartOptions): Promise<void> {
  ensureDataDir();

  // Check if already running
  const status = await getDaemonStatus();
  if (status.running) {
    throw new Error(`Daemon is already running (PID: ${status.pid})`);
  }

  if (options.foreground) {
    // Run in foreground
    await runDaemon();
  } else {
    // Spawn as background process
    const child = spawn(process.execPath, [process.argv[1], "start", "-f"], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, L_DAEMON_BACKGROUND: "1" },
    });

    child.unref();

    // Wait a bit and write PID
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (child.pid) {
      writeFileSync(PID_FILE, child.pid.toString());
    }
  }
}

/**
 * Stops the daemon process
 */
export async function stopDaemon(): Promise<boolean> {
  const status = await getDaemonStatus();

  if (!status.running || !status.pid) {
    return false;
  }

  try {
    process.kill(status.pid, "SIGTERM");
    // Wait for process to exit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Clean up PID file
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }

    return true;
  } catch (error) {
    // Process might already be dead
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
    return true;
  }
}

/**
 * Gets the daemon status
 */
export async function getDaemonStatus(): Promise<DaemonStatus> {
  if (!existsSync(PID_FILE)) {
    return { running: false };
  }

  const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

  try {
    // Check if process is running
    process.kill(pid, 0);

    // Process is running
    return {
      running: true,
      pid,
      uptime: "N/A", // TODO: Implement uptime tracking
      watchedFiles: 0, // TODO: Implement file count
    };
  } catch {
    // Process is not running, clean up stale PID file
    unlinkSync(PID_FILE);
    return { running: false };
  }
}

/**
 * Main daemon loop
 */
async function runDaemon(): Promise<void> {
  const config = loadConfig();
  const watcher = new SessionWatcher(config);

  // Handle shutdown signals
  const shutdown = async () => {
    logger.info("Shutting down daemon...");
    await watcher.stop();

    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }

    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Write PID file if running as background process
  if (process.env.L_DAEMON_BACKGROUND === "1") {
    writeFileSync(PID_FILE, process.pid.toString());
  }

  logger.info("Daemon started, watching Claude session logs...");
  await watcher.start();

  // Keep process alive
  await new Promise(() => {});
}
