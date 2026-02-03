/**
 * Redis cache module for usage data (using ioredis)
 *
 * When REDIS_ENABLED=true, usage data is cached in Redis for fast Prometheus queries.
 * This reduces SQLite storage requirements since data is already persisted in Prometheus.
 *
 * Environment Variables:
 *   REDIS_ENABLED - Set to "true" to enable Redis caching
 *   REDIS_URL - Redis connection URL (default: redis://localhost:6379)
 *   REDIS_TTL_HOURS - How long to keep data in Redis (default: 24 hours)
 *   REDIS_KEY_PREFIX - Prefix for Redis keys (default: claude-usage)
 */

import Redis from "ioredis";

// Configuration from environment
const REDIS_ENABLED = process.env.REDIS_ENABLED === "true";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const REDIS_TTL_SECONDS = parseInt(process.env.REDIS_TTL_HOURS ?? "24", 10) * 3600;
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? "claude-usage";

// Redis client singleton
let redisClient: Redis | null = null;
let isConnected = false;
let connectionError: Error | null = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

/**
 * Initialize Redis connection if enabled
 */
export async function initRedis(): Promise<boolean> {
  if (!REDIS_ENABLED) {
    console.log("[Redis] Caching disabled (REDIS_ENABLED not set)");
    return false;
  }

  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    console.log("[Redis] Max connection attempts reached, not retrying");
    return false;
  }

  connectionAttempts++;

  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Client error:", err.message);
      connectionError = err;
      isConnected = false;
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected to", REDIS_URL.replace(/\/\/.*@/, "//***@"));
      isConnected = true;
      connectionError = null;
    });

    redisClient.on("close", () => {
      console.log("[Redis] Connection closed");
      isConnected = false;
    });

    redisClient.on("reconnecting", () => {
      console.log("[Redis] Reconnecting...");
    });

    await redisClient.connect();
    return true;
  } catch (error) {
    console.error("[Redis] Failed to connect:", error);
    connectionError = error instanceof Error ? error : new Error(String(error));
    redisClient = null;
    return false;
  }
}

/**
 * Check if Redis is available for caching
 */
export function isRedisAvailable(): boolean {
  return REDIS_ENABLED && isConnected && redisClient !== null;
}

/**
 * Get Redis status for health checks and settings
 */
export function getRedisStatus(): {
  enabled: boolean;
  connected: boolean;
  error: string | null;
  url: string;
  ttlHours: number;
  keyPrefix: string;
  connectionAttempts: number;
} {
  return {
    enabled: REDIS_ENABLED,
    connected: isConnected,
    error: connectionError?.message ?? null,
    url: REDIS_ENABLED ? REDIS_URL.replace(/\/\/.*@/, "//***@") : "", // Hide credentials
    ttlHours: REDIS_TTL_SECONDS / 3600,
    keyPrefix: REDIS_KEY_PREFIX,
    connectionAttempts,
  };
}

/**
 * Store usage entry in Redis
 */
export interface CachedUsageEntry {
  deviceId: string;
  deviceName: string;
  sessionId: string;
  project: string;
  timestamp: string;
  type: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUSD: number;
}

/**
 * Cache a usage entry in Redis
 */
export async function cacheUsageEntry(entry: CachedUsageEntry): Promise<boolean> {
  if (!isRedisAvailable() || !redisClient) return false;

  try {
    const key = `${REDIS_KEY_PREFIX}:entry:${entry.deviceId}:${entry.sessionId}:${entry.timestamp}`;
    await redisClient.setex(key, REDIS_TTL_SECONDS, JSON.stringify(entry));

    // Also add to sorted set for time-range queries
    const score = new Date(entry.timestamp).getTime();
    await redisClient.zadd(`${REDIS_KEY_PREFIX}:timeline`, score, key);

    // Add to device-specific set
    await redisClient.sadd(`${REDIS_KEY_PREFIX}:device:${entry.deviceId}:entries`, key);

    return true;
  } catch (error) {
    console.error("[Redis] Failed to cache entry:", error);
    return false;
  }
}

/**
 * Cache multiple usage entries
 */
export async function cacheUsageEntries(entries: CachedUsageEntry[]): Promise<number> {
  if (!isRedisAvailable() || entries.length === 0) return 0;

  let cached = 0;
  for (const entry of entries) {
    if (await cacheUsageEntry(entry)) {
      cached++;
    }
  }
  return cached;
}

/**
 * Get cached entries for a time range (for Prometheus queries)
 */
export async function getCachedEntries(
  startTime: Date,
  endTime: Date
): Promise<CachedUsageEntry[]> {
  if (!isRedisAvailable() || !redisClient) return [];

  try {
    // Get keys from sorted set within time range
    const keys = await redisClient.zrangebyscore(
      `${REDIS_KEY_PREFIX}:timeline`,
      startTime.getTime(),
      endTime.getTime()
    );

    if (keys.length === 0) return [];

    // Get all entries using pipeline for efficiency
    const pipeline = redisClient.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    const entries: CachedUsageEntry[] = [];
    if (results) {
      for (const [err, data] of results) {
        if (!err && data && typeof data === "string") {
          entries.push(JSON.parse(data) as CachedUsageEntry);
        }
      }
    }

    return entries;
  } catch (error) {
    console.error("[Redis] Failed to get cached entries:", error);
    return [];
  }
}

/**
 * Get aggregated stats from cache
 */
export async function getCachedStats(
  deviceId?: string
): Promise<{
  totalEntries: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
} | null> {
  if (!isRedisAvailable() || !redisClient) return null;

  try {
    let keys: string[];

    if (deviceId) {
      // Get entries for specific device
      keys = await redisClient.smembers(`${REDIS_KEY_PREFIX}:device:${deviceId}:entries`);
    } else {
      // Get all recent entries
      const now = Date.now();
      const oneDayAgo = now - 24 * 3600 * 1000;
      keys = await redisClient.zrangebyscore(
        `${REDIS_KEY_PREFIX}:timeline`,
        oneDayAgo,
        now
      );
    }

    if (keys.length === 0) {
      return { totalEntries: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0 };
    }

    // Use pipeline for efficiency
    const pipeline = redisClient.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    let totalEntries = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    if (results) {
      for (const [err, data] of results) {
        if (!err && data && typeof data === "string") {
          const entry = JSON.parse(data) as CachedUsageEntry;
          totalEntries++;
          totalInputTokens += entry.inputTokens;
          totalOutputTokens += entry.outputTokens;
          totalCost += entry.costUSD;
        }
      }
    }

    return { totalEntries, totalInputTokens, totalOutputTokens, totalCost };
  } catch (error) {
    console.error("[Redis] Failed to get cached stats:", error);
    return null;
  }
}

/**
 * Get Redis info/stats
 */
export async function getRedisInfo(): Promise<{
  version: string | null;
  usedMemory: string | null;
  connectedClients: number | null;
  totalKeys: number | null;
  uptime: number | null;
} | null> {
  if (!isRedisAvailable() || !redisClient) return null;

  try {
    const info = await redisClient.info();
    const lines = info.split("\n");

    const getValue = (key: string): string | null => {
      const line = lines.find((l) => l.startsWith(`${key}:`));
      return line ? line.split(":")[1]?.trim() ?? null : null;
    };

    const keyCount = await redisClient.dbsize();

    return {
      version: getValue("redis_version"),
      usedMemory: getValue("used_memory_human"),
      connectedClients: parseInt(getValue("connected_clients") ?? "0", 10),
      totalKeys: keyCount,
      uptime: parseInt(getValue("uptime_in_seconds") ?? "0", 10),
    };
  } catch (error) {
    console.error("[Redis] Failed to get info:", error);
    return null;
  }
}

/**
 * Clean up expired entries from sorted sets
 * This should be run periodically
 */
export async function cleanupExpiredEntries(): Promise<number> {
  if (!isRedisAvailable() || !redisClient) return 0;

  try {
    const cutoffTime = Date.now() - REDIS_TTL_SECONDS * 1000;

    // Remove old entries from timeline
    const removed = await redisClient.zremrangebyscore(
      `${REDIS_KEY_PREFIX}:timeline`,
      0,
      cutoffTime
    );

    console.log(`[Redis] Cleaned up ${removed} expired entries from timeline`);
    return removed;
  } catch (error) {
    console.error("[Redis] Failed to cleanup expired entries:", error);
    return 0;
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    console.log("[Redis] Connection closed");
  }
}

// Initialize on module load if enabled
if (REDIS_ENABLED) {
  initRedis().catch((err) => {
    console.error("[Redis] Initialization failed:", err);
  });
}
