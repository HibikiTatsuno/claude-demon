import { spawn } from "child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { QueueProcessor } from "./processor.js";
import { logger } from "../utils/logger.js";

const DATA_DIR = join(homedir(), ".local", "share", "claude-linear-sync");
const PID_FILE = join(DATA_DIR, "daemon.pid");

/**
 * Daemon manager for starting/stopping the background processor
 */
export class DaemonManager {
  private processor: QueueProcessor | null = null;

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    if (!existsSync(PID_FILE)) {
      return false;
    }

    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);

    try {
      // Check if process is running
      process.kill(pid, 0);
      return true;
    } catch {
      // Process not running, clean up PID file
      this.cleanup();
      return false;
    }
  }

  /**
   * Get daemon PID if running
   */
  getPid(): number | null {
    if (!existsSync(PID_FILE)) {
      return null;
    }

    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  }

  /**
   * Start daemon in foreground (blocking)
   */
  async startForeground(): Promise<void> {
    if (this.isRunning()) {
      logger.error("Daemon is already running");
      return;
    }

    // Write PID file
    writeFileSync(PID_FILE, process.pid.toString());

    // Setup signal handlers
    process.on("SIGTERM", () => this.handleShutdown());
    process.on("SIGINT", () => this.handleShutdown());

    logger.info(`Daemon started (PID: ${process.pid})`);

    // Start processor
    this.processor = new QueueProcessor();
    await this.processor.start();

    // Keep running
    await new Promise(() => {});
  }

  /**
   * Start daemon in background
   */
  startBackground(): number {
    if (this.isRunning()) {
      const pid = this.getPid();
      logger.error(`Daemon is already running (PID: ${pid})`);
      return pid!;
    }

    // Spawn detached process
    const child = spawn(process.execPath, [process.argv[1], "start", "-f"], {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DAEMON_BACKGROUND: "1" },
    });

    child.unref();

    // Wait briefly for process to start
    setTimeout(() => {}, 100);

    logger.info(`Daemon started in background (PID: ${child.pid})`);
    return child.pid!;
  }

  /**
   * Stop daemon
   */
  stop(): boolean {
    const pid = this.getPid();

    if (!pid) {
      logger.warn("Daemon is not running");
      return false;
    }

    try {
      process.kill(pid, "SIGTERM");
      logger.info(`Sent SIGTERM to daemon (PID: ${pid})`);

      // Wait for graceful shutdown
      let attempts = 0;
      while (attempts < 10) {
        try {
          process.kill(pid, 0);
          // Still running, wait
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
          attempts++;
        } catch {
          // Process terminated
          break;
        }
      }

      this.cleanup();
      return true;
    } catch (error) {
      logger.error(`Failed to stop daemon: ${error}`);
      this.cleanup();
      return false;
    }
  }

  /**
   * Get daemon status
   */
  status(): { running: boolean; pid: number | null } {
    return {
      running: this.isRunning(),
      pid: this.getPid(),
    };
  }

  /**
   * Handle graceful shutdown
   */
  private async handleShutdown(): Promise<void> {
    logger.info("Shutting down daemon...");

    if (this.processor) {
      await this.processor.stop();
    }

    this.cleanup();
    process.exit(0);
  }

  /**
   * Cleanup PID file
   */
  private cleanup(): void {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  }
}
