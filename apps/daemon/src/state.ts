import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { getStatePath } from "./config.js";
import type { DaemonState } from "@claude-code-prometheus/shared";

const DEFAULT_STATE: DaemonState = {
  filePositions: {},
  lastSync: new Date().toISOString(),
};

export function loadState(): DaemonState {
  const statePath = getStatePath();

  if (!existsSync(statePath)) {
    return DEFAULT_STATE;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    return JSON.parse(content) as DaemonState;
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: DaemonState): void {
  const statePath = getStatePath();
  const dir = dirname(statePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function clearState(): void {
  const statePath = getStatePath();

  if (existsSync(statePath)) {
    unlinkSync(statePath);
  }
}

export function getFilePosition(state: DaemonState, filePath: string): number {
  return state.filePositions[filePath] ?? 0;
}

export function setFilePosition(
  state: DaemonState,
  filePath: string,
  position: number
): void {
  state.filePositions[filePath] = position;
  state.lastSync = new Date().toISOString();
}
