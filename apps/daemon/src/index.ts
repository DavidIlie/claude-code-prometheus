#!/usr/bin/env node

import { Command } from "commander";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { setup, quickSetup } from "./setup.js";
import { start, stop, isRunning, getPidFilePath } from "./watcher.js";
import { loadConfig, getConfigPath, deleteConfig, getStatePath } from "./config.js";
import { clearState } from "./state.js";
import { readFileSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

// Helper to get script path safely
function getScriptPath(): string {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("Unable to determine script path");
  }
  return scriptPath;
}

const program = new Command();

program
  .name("claude-usage-daemon")
  .description("Track Claude Code usage and push to central server")
  .version("1.0.0");

// Setup command
program
  .command("setup")
  .description("Configure the daemon and register with server")
  .option("-s, --server <url>", "Server URL")
  .option("-k, --key <apiKey>", "API key from server (skip registration)")
  .option("-n, --name <name>", "Device name")
  .action(async (options) => {
    if (options.key && options.server) {
      // Quick setup with existing API key
      await quickSetup({
        serverUrl: options.server,
        apiKey: options.key,
        name: options.name,
      });
    } else {
      // Interactive setup with registration
      await setup({
        server: options.server,
        name: options.name,
      });
    }
  });

// Start command
program
  .command("start")
  .description("Start the daemon")
  .option("-f, --foreground", "Run in foreground (don't daemonize)")
  .action(async (options) => {
    const config = loadConfig();
    if (!config) {
      console.error("❌ Daemon not configured. Run 'claude-usage-daemon setup' first.");
      process.exit(1);
    }

    if (isRunning()) {
      console.log("⚠️  Daemon is already running.");
      console.log(`   PID file: ${getPidFilePath()}`);
      process.exit(0);
    }

    if (options.foreground) {
      console.log("🚀 Starting daemon in foreground mode...");
      console.log("   Press Ctrl+C to stop\n");
      await start(config);
    } else {
      // Daemonize the process
      console.log("🚀 Starting daemon in background...");

      // Fork to background using Node's built-in spawn
      const scriptPath = getScriptPath();
      const child: ChildProcess = spawn(process.execPath, [scriptPath, "start", "-f"], {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          DAEMON_MODE: "true",
        },
      });

      // Write PID file
      const pidFile = getPidFilePath();
      if (child.pid) {
        writeFileSync(pidFile, child.pid.toString());
      }

      child.unref();
      console.log(`✅ Daemon started (PID: ${child.pid})`);
      console.log(`   Logs: /tmp/claude-usage-daemon.log`);
      process.exit(0);
    }
  });

// Stop command
program
  .command("stop")
  .description("Stop the running daemon")
  .action(async () => {
    const pidFile = getPidFilePath();

    if (!existsSync(pidFile)) {
      console.log("⚠️  Daemon is not running (no PID file found).");
      process.exit(0);
    }

    try {
      const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);

      // Check if process exists
      try {
        process.kill(pid, 0);
      } catch {
        console.log("⚠️  Daemon process not found. Cleaning up PID file.");
        unlinkSync(pidFile);
        process.exit(0);
      }

      // Send SIGTERM
      console.log(`🛑 Stopping daemon (PID: ${pid})...`);
      process.kill(pid, "SIGTERM");

      // Wait for process to stop
      let attempts = 0;
      while (attempts < 10) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          process.kill(pid, 0);
          attempts++;
        } catch {
          // Process stopped
          console.log("✅ Daemon stopped.");
          if (existsSync(pidFile)) {
            unlinkSync(pidFile);
          }
          process.exit(0);
        }
      }

      // Force kill if still running
      console.log("⚠️  Daemon didn't stop gracefully. Force killing...");
      process.kill(pid, "SIGKILL");
      if (existsSync(pidFile)) {
        unlinkSync(pidFile);
      }
      console.log("✅ Daemon force stopped.");
    } catch (error) {
      console.error("❌ Error stopping daemon:", error);
      process.exit(1);
    }
  });

// Restart command
program
  .command("restart")
  .description("Restart the daemon")
  .action(async () => {
    // Stop first
    const pidFile = getPidFilePath();
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
        process.kill(pid, "SIGTERM");

        // Wait for stop
        let attempts = 0;
        while (attempts < 10) {
          await new Promise((r) => setTimeout(r, 500));
          try {
            process.kill(pid, 0);
            attempts++;
          } catch {
            break;
          }
        }

        if (existsSync(pidFile)) {
          unlinkSync(pidFile);
        }
      } catch {
        // Process already stopped
      }
    }

    // Start
    const config = loadConfig();
    if (!config) {
      console.error("❌ Daemon not configured. Run 'claude-usage-daemon setup' first.");
      process.exit(1);
    }

    console.log("🔄 Restarting daemon...");
    const scriptPath = getScriptPath();
    const child: ChildProcess = spawn(process.execPath, [scriptPath, "start", "-f"], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        DAEMON_MODE: "true",
      },
    });

    if (child.pid) {
      writeFileSync(pidFile, child.pid.toString());
    }
    child.unref();
    console.log(`✅ Daemon restarted (PID: ${child.pid})`);
  });

// Status command
program
  .command("status")
  .description("Show daemon status and configuration")
  .option("-v, --verbose", "Show detailed information")
  .action((options) => {
    const config = loadConfig();
    const running = isRunning();
    const pidFile = getPidFilePath();

    console.log("\n📊 Claude Usage Daemon Status\n");
    console.log("─".repeat(40));

    // Running status
    if (running) {
      const pid = readFileSync(pidFile, "utf-8").trim();
      console.log(`Status:      🟢 Running (PID: ${pid})`);
    } else {
      console.log("Status:      🔴 Stopped");
    }

    // Configuration status
    if (!config) {
      console.log("Config:      ⚠️  Not configured");
      console.log(`\nRun 'claude-usage-daemon setup' to configure.\n`);
      return;
    }

    console.log("Config:      ✅ Configured");
    console.log(`Server URL:  ${config.serverUrl}`);
    console.log(`Claude Dir:  ${config.claudeDir}`);
    console.log(`Interval:    ${config.pushIntervalMs / 1000}s`);

    if (options.verbose) {
      console.log("\n─".repeat(40));
      console.log("File Paths:");
      console.log(`  Config:    ${getConfigPath()}`);
      console.log(`  State:     ${getStatePath()}`);
      console.log(`  PID:       ${pidFile}`);
      console.log(`  Logs:      /tmp/claude-usage-daemon.log`);
      console.log(`  Errors:    /tmp/claude-usage-daemon.error.log`);
    }

    console.log("");
  });

// Logs command
program
  .command("logs")
  .description("Show daemon logs")
  .option("-f, --follow", "Follow log output")
  .option("-n, --lines <number>", "Number of lines to show", "50")
  .option("-e, --errors", "Show error log instead")
  .action(async (options) => {
    const logFile = options.errors
      ? "/tmp/claude-usage-daemon.error.log"
      : "/tmp/claude-usage-daemon.log";

    if (!existsSync(logFile)) {
      console.log(`⚠️  Log file not found: ${logFile}`);
      console.log("   Daemon may not have been started yet.");
      process.exit(0);
    }

    try {
      if (options.follow) {
        // Use tail -f for following
        const { spawn } = await import("node:child_process");
        const tail = spawn("tail", ["-f", "-n", options.lines, logFile], {
          stdio: "inherit",
        });

        tail.on("close", (code) => {
          process.exit(code ?? 0);
        });

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          tail.kill();
        });
      } else {
        // Just show last N lines
        const content = readFileSync(logFile, "utf-8");
        const lines = content.trim().split("\n");
        const numLines = parseInt(options.lines, 10);
        const lastLines = lines.slice(-numLines);
        console.log(lastLines.join("\n"));
      }
    } catch (error) {
      console.error("❌ Error reading logs:", error);
      process.exit(1);
    }
  });

// Reset command
program
  .command("reset")
  .description("Reset daemon state (re-process all files)")
  .option("-c, --config", "Also reset configuration (requires re-setup)")
  .action((options) => {
    console.log("🔄 Resetting daemon state...");

    // Clear state
    clearState();
    console.log("✅ State cleared (will re-process all files on next start)");

    if (options.config) {
      deleteConfig();
      console.log("✅ Configuration cleared (run 'claude-usage-daemon setup' to reconfigure)");
    }
  });

// Uninstall command
program
  .command("uninstall")
  .description("Stop daemon and remove all configuration")
  .option("-y, --yes", "Skip confirmation")
  .action(async (options) => {
    if (!options.yes) {
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question("⚠️  This will stop the daemon and remove all configuration. Continue? [y/N] ", resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== "y") {
        console.log("Cancelled.");
        process.exit(0);
      }
    }

    console.log("\n🗑️  Uninstalling Claude Usage Daemon...\n");

    // Stop daemon if running
    const pidFile = getPidFilePath();
    if (existsSync(pidFile)) {
      try {
        const pid = parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
        console.log(`Stopping daemon (PID: ${pid})...`);
        process.kill(pid, "SIGTERM");
        await new Promise((r) => setTimeout(r, 1000));
        if (existsSync(pidFile)) {
          unlinkSync(pidFile);
        }
      } catch {
        // Already stopped
      }
    }

    // Remove LaunchAgent if on macOS
    if (process.platform === "darwin") {
      const launchAgentPath = join(
        homedir(),
        "Library/LaunchAgents/com.davidilie.claude-usage-daemon.plist"
      );
      if (existsSync(launchAgentPath)) {
        console.log("Removing LaunchAgent...");
        try {
          execSync(`launchctl unload "${launchAgentPath}"`, { stdio: "ignore" });
        } catch {
          // May not be loaded
        }
        unlinkSync(launchAgentPath);
      }
    }

    // Clear state and config
    clearState();
    deleteConfig();

    // Clean up log files
    const logFiles = [
      "/tmp/claude-usage-daemon.log",
      "/tmp/claude-usage-daemon.error.log",
    ];
    for (const logFile of logFiles) {
      if (existsSync(logFile)) {
        unlinkSync(logFile);
      }
    }

    console.log("\n✅ Uninstall complete!");
    console.log("   Run 'npm uninstall -g @davidilie/claude-usage-daemon' to remove the package.\n");
  });

// Install LaunchAgent (macOS)
program
  .command("install-service")
  .description("Install as a system service (macOS LaunchAgent)")
  .action(async () => {
    if (process.platform !== "darwin") {
      console.error("❌ This command is only supported on macOS.");
      console.log("   For Linux, create a systemd service manually.");
      process.exit(1);
    }

    const config = loadConfig();
    if (!config) {
      console.error("❌ Daemon not configured. Run 'claude-usage-daemon setup' first.");
      process.exit(1);
    }

    // Find the actual path to the binary
    let binaryPath: string;
    try {
      binaryPath = execSync("which claude-usage-daemon", { encoding: "utf-8" }).trim();
    } catch {
      binaryPath = getScriptPath();
    }

    const launchAgentDir = join(homedir(), "Library/LaunchAgents");
    const launchAgentPath = join(launchAgentDir, "com.davidilie.claude-usage-daemon.plist");

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.davidilie.claude-usage-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binaryPath}</string>
    <string>start</string>
    <string>-f</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/claude-usage-daemon.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/claude-usage-daemon.error.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>`;

    try {
      // Create LaunchAgents directory if it doesn't exist
      if (!existsSync(launchAgentDir)) {
        const { mkdirSync } = await import("node:fs");
        mkdirSync(launchAgentDir, { recursive: true });
      }

      // Write plist file
      writeFileSync(launchAgentPath, plist);
      console.log(`✅ Created LaunchAgent: ${launchAgentPath}`);

      // Load the service
      console.log("Loading service...");
      execSync(`launchctl load "${launchAgentPath}"`);
      console.log("✅ Service installed and started!");
      console.log("\nThe daemon will now start automatically at login.");
      console.log("To uninstall, run: claude-usage-daemon uninstall");
    } catch (error) {
      console.error("❌ Error installing service:", error);
      process.exit(1);
    }
  });

// Test connection
program
  .command("test")
  .description("Test connection to server")
  .action(async () => {
    const config = loadConfig();
    if (!config) {
      console.error("❌ Daemon not configured. Run 'claude-usage-daemon setup' first.");
      process.exit(1);
    }

    console.log(`\n🔍 Testing connection to ${config.serverUrl}...\n`);

    try {
      // Test health endpoint
      const healthResponse = await fetch(`${config.serverUrl}/api/health`);
      if (healthResponse.ok) {
        console.log("✅ Server is reachable");
      } else {
        console.log(`⚠️  Server returned status: ${healthResponse.status}`);
      }

      // Test API key
      const testResponse = await fetch(`${config.serverUrl}/api/usage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": config.deviceApiKey,
        },
        body: JSON.stringify({ entries: [] }),
      });

      if (testResponse.ok) {
        console.log("✅ API key is valid");
      } else if (testResponse.status === 401) {
        console.log("❌ API key is invalid or expired");
        console.log("   Run 'claude-usage-daemon setup' to reconfigure");
      } else {
        console.log(`⚠️  Server returned status: ${testResponse.status}`);
      }

      console.log("\n");
    } catch (error) {
      console.error("❌ Connection failed:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
