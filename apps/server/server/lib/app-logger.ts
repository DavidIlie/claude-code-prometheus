/**
 * In-memory application logger for runtime logs
 *
 * Stores recent logs in memory for display in the settings page.
 * Logs are automatically rotated when the limit is reached.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

// Configuration
const MAX_LOGS = 500; // Maximum number of logs to keep in memory
const logs: LogEntry[] = [];
let logIdCounter = 0;

// Generate unique log ID
function generateLogId(): string {
  logIdCounter++;
  return `log_${Date.now()}_${logIdCounter}`;
}

/**
 * Add a log entry
 */
export function addLog(
  level: LogLevel,
  category: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    id: generateLogId(),
    timestamp: new Date(),
    level,
    category,
    message,
    details,
  };

  logs.unshift(entry); // Add to beginning (newest first)

  // Rotate logs if limit exceeded
  if (logs.length > MAX_LOGS) {
    logs.pop();
  }

  // Also log to console in development
  if (process.env.NODE_ENV !== "production") {
    const levelColors: Record<LogLevel, string> = {
      info: "\x1b[36m", // Cyan
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
      debug: "\x1b[90m", // Gray
    };
    const reset = "\x1b[0m";
    console.log(
      `${levelColors[level]}[${level.toUpperCase()}]${reset} [${category}] ${message}`,
      details ? details : ""
    );
  }
}

/**
 * Convenience loggers
 */
export const appLog = {
  info: (category: string, message: string, details?: Record<string, unknown>) =>
    addLog("info", category, message, details),
  warn: (category: string, message: string, details?: Record<string, unknown>) =>
    addLog("warn", category, message, details),
  error: (category: string, message: string, details?: Record<string, unknown>) =>
    addLog("error", category, message, details),
  debug: (category: string, message: string, details?: Record<string, unknown>) =>
    addLog("debug", category, message, details),
};

/**
 * Get all logs
 */
export function getLogs(options?: {
  level?: LogLevel;
  category?: string;
  limit?: number;
  since?: Date;
}): LogEntry[] {
  let filtered = [...logs];

  if (options?.level) {
    filtered = filtered.filter((log) => log.level === options.level);
  }

  if (options?.category) {
    filtered = filtered.filter((log) => log.category === options.category);
  }

  if (options?.since) {
    const sinceDate = options.since;
    filtered = filtered.filter((log) => log.timestamp >= sinceDate);
  }

  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }

  return filtered;
}

/**
 * Get log stats
 */
export function getLogStats(): {
  total: number;
  byLevel: Record<LogLevel, number>;
  byCategory: Record<string, number>;
  oldestLog: Date | null;
  newestLog: Date | null;
} {
  const byLevel: Record<LogLevel, number> = {
    info: 0,
    warn: 0,
    error: 0,
    debug: 0,
  };
  const byCategory: Record<string, number> = {};

  for (const log of logs) {
    byLevel[log.level]++;
    byCategory[log.category] = (byCategory[log.category] ?? 0) + 1;
  }

  return {
    total: logs.length,
    byLevel,
    byCategory,
    oldestLog: logs.length > 0 ? logs[logs.length - 1]?.timestamp ?? null : null,
    newestLog: logs.length > 0 ? logs[0]?.timestamp ?? null : null,
  };
}

/**
 * Clear all logs
 */
export function clearLogs(): void {
  logs.length = 0;
  logIdCounter = 0;
}

/**
 * Log categories for consistency
 */
export const LogCategories = {
  API: "api",
  AUTH: "auth",
  USAGE: "usage",
  DEVICE: "device",
  SESSION: "session",
  REDIS: "redis",
  DATABASE: "database",
  METRICS: "metrics",
  SCHEDULER: "scheduler",
  SYSTEM: "system",
} as const;

// Log app startup
appLog.info(LogCategories.SYSTEM, "Application logger initialized", {
  maxLogs: MAX_LOGS,
});
