import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { DaemonConfig } from "@claude-code-prometheus/shared";

const configSchema = z.object({
  serverUrl: z.string().url(),
  deviceApiKey: z.string(),
  claudeDir: z.string(),
  pushIntervalMs: z.number().int().positive(),
});

export function getConfigDir(): string {
  return join(homedir(), ".config", "claude-usage-daemon");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getStatePath(): string {
  return join(getConfigDir(), "state.json");
}

export function loadConfig(): DaemonConfig | null {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    const validated = configSchema.parse(parsed);
    return validated;
  } catch (error) {
    console.error("Error loading config:", error);
    return null;
  }
}

export function saveConfig(config: DaemonConfig): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function deleteConfig(): void {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
}

export function deleteConfigDir(): void {
  const configDir = getConfigDir();

  if (existsSync(configDir)) {
    rmSync(configDir, { recursive: true, force: true });
  }
}

export function getDefaultClaudeDir(): string {
  const platform = process.platform;

  if (platform === "darwin") {
    return join(homedir(), ".claude");
  } else if (platform === "linux") {
    return join(homedir(), ".config", "claude");
  } else {
    // Windows or other
    return join(homedir(), ".claude");
  }
}

export function configExists(): boolean {
  return existsSync(getConfigPath());
}
