#!/usr/bin/env node
import { Command } from "commander";
import { DaemonManager } from "./daemon/manager.js";
import { readAllItems, readPendingItems, resetToPending, cleanupOldItems } from "./queue/index.js";
import { logger } from "./utils/logger.js";

const program = new Command();
const daemonManager = new DaemonManager();

program
  .name("claude-linear-sync")
  .description("Claude Code session to Linear sync daemon")
  .version("1.0.0");

// Start command
program
  .command("start")
  .description("Start the daemon")
  .option("-f, --foreground", "Run in foreground (don't daemonize)")
  .action(async (options) => {
    try {
      if (options.foreground) {
        logger.info("Starting daemon in foreground mode...");
        await daemonManager.startForeground();
      } else {
        const pid = daemonManager.startBackground();
        logger.info(`Daemon started (PID: ${pid})`);
      }
    } catch (error) {
      logger.error("Failed to start daemon:", error);
      process.exit(1);
    }
  });

// Stop command
program
  .command("stop")
  .description("Stop the daemon")
  .action(() => {
    try {
      const stopped = daemonManager.stop();
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

// Status command
program
  .command("status")
  .description("Check daemon status")
  .action(() => {
    try {
      const status = daemonManager.status();
      if (status.running) {
        logger.info(`Daemon is running (PID: ${status.pid})`);
      } else {
        logger.info("Daemon is not running");
      }
    } catch (error) {
      logger.error("Failed to get daemon status:", error);
      process.exit(1);
    }
  });

// Queue commands
const queueCmd = program
  .command("queue")
  .description("Queue management commands");

queueCmd
  .command("list")
  .description("List queue items")
  .option("-a, --all", "Show all items (including processed)")
  .action((options) => {
    const items = options.all ? readAllItems() : readPendingItems();

    if (items.length === 0) {
      logger.info("Queue is empty");
      return;
    }

    logger.info(`Found ${items.length} items:\n`);

    for (const item of items) {
      const time = new Date(item.timestamp).toLocaleString();
      const status = item.status.toUpperCase();
      console.log(`[${status}] ${item.id}`);
      console.log(`  Type: ${item.type}`);
      console.log(`  Time: ${time}`);
      if (item.error) {
        console.log(`  Error: ${item.error}`);
      }
      console.log("");
    }
  });

queueCmd
  .command("retry <id>")
  .description("Retry a failed item")
  .action((id) => {
    try {
      resetToPending(id);
      logger.info(`Item ${id} reset to pending`);
    } catch (error) {
      logger.error(`Failed to retry item: ${error}`);
    }
  });

queueCmd
  .command("clear")
  .description("Clear processed items")
  .option("--hours <hours>", "Clear items older than N hours", "24")
  .action((options) => {
    const hours = parseInt(options.hours, 10);
    const removed = cleanupOldItems(hours);
    logger.info(`Removed ${removed} processed items`);
  });

program.parse();
