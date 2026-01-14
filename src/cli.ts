#!/usr/bin/env node
import { Command } from "commander";
import { startDaemon, stopDaemon, getDaemonStatus } from "./index.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name("l-daemon")
  .description("Claude Code session log watcher daemon with Linear integration")
  .version("1.0.0");

program
  .command("start")
  .description("Start the daemon")
  .option("-f, --foreground", "Run in foreground (don't daemonize)")
  .action(async (options) => {
    try {
      if (options.foreground) {
        logger.info("Starting daemon in foreground mode...");
        await startDaemon({ foreground: true });
      } else {
        logger.info("Starting daemon...");
        await startDaemon({ foreground: false });
        logger.info("Daemon started successfully");
      }
    } catch (error) {
      logger.error("Failed to start daemon:", error);
      process.exit(1);
    }
  });

program
  .command("end")
  .description("Stop the daemon")
  .action(async () => {
    try {
      const stopped = await stopDaemon();
      if (stopped) {
        logger.info("Daemon stopped successfully");
      } else {
        logger.warn("Daemon is not running");
      }
    } catch (error) {
      logger.error("Failed to stop daemon:", error);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Check daemon status")
  .action(async () => {
    try {
      const status = await getDaemonStatus();
      if (status.running) {
        logger.info(`Daemon is running (PID: ${status.pid})`);
        logger.info(`Uptime: ${status.uptime}`);
        logger.info(`Watching: ${status.watchedFiles} files`);
      } else {
        logger.info("Daemon is not running");
      }
    } catch (error) {
      logger.error("Failed to get daemon status:", error);
      process.exit(1);
    }
  });

program.parse();
