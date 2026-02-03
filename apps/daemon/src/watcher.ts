import chokidar from "chokidar";
import { join } from "node:path";
import { existsSync, readFileSync, unlinkSync, appendFileSync } from "node:fs";
import type { DaemonConfig } from "@claude-code-prometheus/shared";
import { ApiClient } from "./client.js";
import { parseJSONLFile } from "./parser.js";
import { loadState, saveState, getFilePosition, setFilePosition } from "./state.js";
import { getConfigDir } from "./config.js";

// Log file paths
const LOG_FILE = "/tmp/claude-usage-daemon.log";
const ERROR_LOG_FILE = "/tmp/claude-usage-daemon.error.log";

// Logging utilities
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}`;
  console.log(formatted);

  // Also write to log file when running as daemon
  if (process.env.DAEMON_MODE === "true") {
    appendFileSync(LOG_FILE, formatted + "\n");
  }
}

function logError(message: string): void {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ERROR: ${message}`;
  console.error(formatted);
  appendFileSync(ERROR_LOG_FILE, formatted + "\n");
}

// Get PID file path
export function getPidFilePath(): string {
  return join(getConfigDir(), "daemon.pid");
}

// Check if daemon is running
export function isRunning(): boolean {
  const pidFile = getPidFilePath();

  if (!existsSync(pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);

    // Check if process exists by sending signal 0
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist, clean up stale PID file
    try {
      unlinkSync(pidFile);
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}

// Stop the daemon
export async function stop(): Promise<boolean> {
  const pidFile = getPidFilePath();

  if (!existsSync(pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);

    // Send SIGTERM
    process.kill(pid, "SIGTERM");

    // Wait for process to stop (max 5 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        process.kill(pid, 0);
      } catch {
        // Process stopped
        if (existsSync(pidFile)) {
          unlinkSync(pidFile);
        }
        return true;
      }
    }

    // Force kill if still running
    process.kill(pid, "SIGKILL");
    if (existsSync(pidFile)) {
      unlinkSync(pidFile);
    }
    return true;
  } catch {
    return false;
  }
}

// Get daemon status information
export function getStatus(): {
  running: boolean;
  pid: number | null;
  pidFile: string;
  logFile: string;
  errorLogFile: string;
} {
  const pidFile = getPidFilePath();
  let pid: number | null = null;
  let running = false;

  if (existsSync(pidFile)) {
    try {
      pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
      process.kill(pid, 0);
      running = true;
    } catch {
      pid = null;
    }
  }

  return {
    running,
    pid,
    pidFile,
    logFile: LOG_FILE,
    errorLogFile: ERROR_LOG_FILE,
  };
}

export async function start(config: DaemonConfig): Promise<void> {
  log("📊 Claude Usage Daemon Starting...");
  log(`Server: ${config.serverUrl}`);
  log(`Watching: ${config.claudeDir}`);
  log(`Push interval: ${config.pushIntervalMs}ms`);

  const projectsDir = join(config.claudeDir, "projects");

  if (!existsSync(projectsDir)) {
    logError(`Claude projects directory not found: ${projectsDir}`);
    logError("Make sure Claude Code has been used at least once.");
    process.exit(1);
  }

  // Create API client with notifications enabled
  const client = new ApiClient(config.serverUrl, config.deviceApiKey, {
    enableNotifications: true,
    maxRetries: 3,
    retryDelayMs: 5000,
  });

  let state = loadState();
  let filesProcessed = 0;
  let entriesFound = 0;

  // Process a file
  async function processFile(filePath: string): Promise<void> {
    if (!filePath.endsWith(".jsonl")) return;

    try {
      const startPosition = getFilePosition(state, filePath);
      const result = await parseJSONLFile(filePath, startPosition);

      if (result.entries.length > 0) {
        log(`Found ${result.entries.length} new entries in ${filePath}`);
        client.addEntries(result.entries);
        entriesFound += result.entries.length;
      }

      if (result.newPosition > startPosition) {
        setFilePosition(state, filePath, result.newPosition);
        saveState(state);
        filesProcessed++;
      }
    } catch (error) {
      logError(`Error processing file ${filePath}: ${error}`);
    }
  }

  // Set up file watcher
  const watcher = chokidar.watch(`${projectsDir}/**/*.jsonl`, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on("add", processFile);
  watcher.on("change", processFile);

  watcher.on("error", (error) => {
    logError(`Watcher error: ${error}`);
  });

  watcher.on("ready", () => {
    log("Watching for Claude Code activity...");
    log(`Initial scan complete. Files processed: ${filesProcessed}, Entries found: ${entriesFound}`);
  });

  // Periodic flush to server
  let successfulPushes = 0;
  let failedPushes = 0;

  const flushInterval = setInterval(async () => {
    const queueSize = client.getQueueSize();
    if (queueSize > 0) {
      log(`Pushing ${queueSize} entries to server...`);
      const result = await client.flush();
      if (result.success) {
        log(`Successfully pushed ${result.processed} entries`);
        successfulPushes++;
      } else {
        log(`Failed to push entries: ${result.error || "Unknown error"}`);
        failedPushes++;
      }
    }
  }, config.pushIntervalMs);

  // Periodic stats logging (every 5 minutes)
  const statsInterval = setInterval(() => {
    log(`Stats - Queue: ${client.getQueueSize()}, Pushes: ${successfulPushes} success / ${failedPushes} failed`);
  }, 5 * 60 * 1000);

  // Handle graceful shutdown
  const shutdown = async () => {
    log("Shutting down...");
    clearInterval(flushInterval);
    clearInterval(statsInterval);
    await watcher.close();

    // Final flush
    const queueSize = client.getQueueSize();
    if (queueSize > 0) {
      log(`Pushing remaining ${queueSize} entries...`);
      const result = await client.flush();
      if (result.success) {
        log(`Final push successful: ${result.processed} entries`);
      } else {
        logError(`Final push failed: ${result.error || "Unknown error"}`);
      }
    }

    saveState(state);
    log("Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
