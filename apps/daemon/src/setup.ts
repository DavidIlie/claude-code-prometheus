import { createInterface } from "node:readline";
import { hostname } from "node:os";
import { saveConfig, getDefaultClaudeDir } from "./config.js";
import type { DaemonConfig, DeviceRegistrationResponse } from "@claude-code-prometheus/shared";

interface SetupOptions {
  server?: string;
  name?: string;
}

interface QuickSetupOptions {
  serverUrl: string;
  apiKey: string;
  name?: string;
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const displayDefault = defaultValue ? ` (${defaultValue})` : "";
    rl.question(`${question}${displayDefault}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

// Quick setup with existing API key (used with --key flag)
export async function quickSetup(options: QuickSetupOptions): Promise<void> {
  console.log("\n📊 Claude Usage Daemon Quick Setup\n");

  // Validate server URL
  console.log(`Testing connection to ${options.serverUrl}...`);

  try {
    const response = await fetch(`${options.serverUrl}/api/health`);
    if (!response.ok) {
      console.error(`⚠️  Server returned status: ${response.status}`);
    } else {
      console.log("✅ Server is reachable");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.error(`\n❌ Could not connect to server at ${options.serverUrl}`);
      console.error("Make sure the server is running and accessible.\n");
      process.exit(1);
    }
    console.log(`⚠️  Could not verify server (continuing anyway)`);
  }

  // Test API key
  console.log("Validating API key...");
  try {
    const testResponse = await fetch(`${options.serverUrl}/api/usage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Key": options.apiKey,
      },
      body: JSON.stringify({ entries: [] }),
    });

    if (testResponse.status === 401) {
      console.error("\n❌ API key is invalid or expired");
      console.error("Please check the API key and try again.\n");
      process.exit(1);
    }

    console.log("✅ API key is valid");
  } catch (error) {
    console.log(`⚠️  Could not validate API key (continuing anyway)`);
  }

  // Save configuration
  const config: DaemonConfig = {
    serverUrl: options.serverUrl,
    deviceApiKey: options.apiKey,
    claudeDir: getDefaultClaudeDir(),
    pushIntervalMs: 30000, // 30 seconds
  };

  saveConfig(config);

  console.log("\n✅ Setup complete!\n");
  console.log(`Server URL:      ${config.serverUrl}`);
  console.log(`Claude directory: ${config.claudeDir}`);
  console.log(`\nTo start the daemon:`);
  console.log(`  claude-usage-daemon start`);
  console.log(`\nTo install as a service (starts on login):`);
  console.log(`  claude-usage-daemon install-service\n`);
}

// Interactive setup with registration
export async function setup(options: SetupOptions): Promise<void> {
  console.log("\n📊 Claude Usage Daemon Setup\n");

  // Get server URL
  const serverUrl = options.server || await prompt("Server URL", "http://localhost:3000");

  if (!serverUrl) {
    console.error("Error: Server URL is required");
    process.exit(1);
  }

  // Get device name
  const defaultName = `${process.env.USER || "user"}'s ${process.platform === "darwin" ? "Mac" : "Computer"}`;
  const deviceName = options.name || await prompt("Device name", defaultName);

  // Get hostname
  const deviceHostname = hostname();

  console.log(`\nRegistering device with server...`);

  try {
    const response = await fetch(`${serverUrl}/api/devices/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: deviceName,
        hostname: deviceHostname,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Registration failed: ${error}`);
    }

    const data = await response.json() as DeviceRegistrationResponse;

    // Save configuration
    const config: DaemonConfig = {
      serverUrl,
      deviceApiKey: data.apiKey,
      claudeDir: getDefaultClaudeDir(),
      pushIntervalMs: 30000, // 30 seconds
    };

    saveConfig(config);

    console.log("\n✅ Setup complete!\n");
    console.log(`Device ID:        ${data.deviceId}`);
    console.log(`API Key:          ${data.apiKey}`);
    console.log(`Claude directory: ${config.claudeDir}`);
    console.log(`\nTo start the daemon:`);
    console.log(`  claude-usage-daemon start`);
    console.log(`\nTo install as a service (starts on login):`);
    console.log(`  claude-usage-daemon install-service\n`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.error(`\n❌ Could not connect to server at ${serverUrl}`);
      console.error("Make sure the server is running and accessible.\n");
    } else {
      console.error(`\n❌ ${error instanceof Error ? error.message : error}\n`);
    }
    process.exit(1);
  }
}
