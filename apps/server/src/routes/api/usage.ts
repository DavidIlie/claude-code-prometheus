import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { usagePushRequestSchema } from "@claude-code-prometheus/shared";
import { db } from "~/server/db";
import { calculateCost, calculateCacheSavings } from "~/server/lib/pricing";
import {
  recordUsageMetrics,
  updateDeviceStatus,
  recordSessionStart,
} from "~/server/lib/metrics";
import { checkRateLimit, RATE_LIMITS } from "~/server/lib/auth";
import {
  isRedisAvailable,
  cacheUsageEntry,
  type CachedUsageEntry,
} from "~/server/lib/redis";
import { appLog, LogCategories } from "~/server/lib/app-logger";

// Get client IP for rate limiting
function getClientIP(request: Request): string {
  // Check common proxy headers
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIP = forwarded.split(",")[0];
    if (firstIP) {
      return firstIP.trim();
    }
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // Fallback to a default (in real scenarios, you'd extract from connection)
  return "unknown";
}

export const Route = createFileRoute("/api/usage")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Get API key from header (preferred) or body (legacy support)
          const apiKeyFromHeader = request.headers.get("X-Device-Key");

          // Rate limiting based on API key or IP
          const rateLimitKey = apiKeyFromHeader
            ? `usage:${apiKeyFromHeader.substring(0, 20)}` // Use first 20 chars for rate limit key
            : `usage:${getClientIP(request)}`;

          const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.usage);

          if (!rateLimitResult.allowed) {
            appLog.warn(LogCategories.API, "Rate limit exceeded for usage endpoint", {
              key: rateLimitKey.substring(0, 30),
              retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
            });
            return json(
              {
                success: false,
                error: "Rate limit exceeded",
                retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
              },
              {
                status: 429,
                headers: {
                  "Retry-After": Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString(),
                  "X-RateLimit-Limit": RATE_LIMITS.usage.maxRequests.toString(),
                  "X-RateLimit-Remaining": "0",
                  "X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
                },
              }
            );
          }

          const body = await request.json();

          // Support both header-based and body-based API key (header takes precedence)
          const deviceApiKey = apiKeyFromHeader ?? body.deviceApiKey;

          if (!deviceApiKey) {
            return json(
              { success: false, error: "API key required in X-Device-Key header or request body" },
              { status: 401 }
            );
          }

          // Validate request body
          const bodyWithKey = { ...body, deviceApiKey };
          const parsed = usagePushRequestSchema.safeParse(bodyWithKey);

          if (!parsed.success) {
            return json(
              {
                success: false,
                error: "Invalid request body",
                details: parsed.error.flatten(),
              },
              { status: 400 }
            );
          }

          const { entries } = parsed.data;

          // Verify device API key
          const device = await db.device.findUnique({
            where: { apiKey: deviceApiKey },
          });

          if (!device) {
            return json(
              { success: false, error: "Invalid API key" },
              { status: 401 }
            );
          }

          // Update device last seen
          await db.device.update({
            where: { id: device.id },
            data: { lastSeen: new Date() },
          });

          updateDeviceStatus(device.name, true, device.hostname);

          // Return early if no entries to process
          if (entries.length === 0) {
            return json(
              { success: true, processed: 0 },
              {
                headers: {
                  "X-RateLimit-Limit": RATE_LIMITS.usage.maxRequests.toString(),
                  "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
                  "X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
                },
              }
            );
          }

          let processed = 0;

          for (const entry of entries) {
            // Get or create session
            let session = await db.session.findUnique({
              where: {
                deviceId_sessionId: {
                  deviceId: device.id,
                  sessionId: entry.sessionId,
                },
              },
            });

            const entryTimestamp = new Date(entry.timestamp);

            if (!session) {
              session = await db.session.create({
                data: {
                  sessionId: entry.sessionId,
                  deviceId: device.id,
                  project: entry.project,
                  startedAt: entryTimestamp,
                },
              });

              recordSessionStart(
                device.name,
                entry.sessionId,
                entry.project,
                entry.model ?? "unknown"
              );
            }

            // Calculate cost if not provided
            let costUSD = entry.costUSD;
            if (costUSD === undefined) {
              costUSD = calculateCost(
                entry.model,
                entry.inputTokens,
                entry.outputTokens,
                entry.cacheCreationTokens,
                entry.cacheReadTokens
              );
            }

            // Calculate cache savings
            const cacheSavings = calculateCacheSavings(
              entry.model,
              entry.cacheReadTokens
            );

            // Create usage entry
            await db.usageEntry.create({
              data: {
                sessionId: session.id,
                timestamp: entryTimestamp,
                type: entry.type,
                model: entry.model,
                inputTokens: entry.inputTokens,
                outputTokens: entry.outputTokens,
                cacheCreationTokens: entry.cacheCreationTokens,
                cacheReadTokens: entry.cacheReadTokens,
                costUSD,
              },
            });

            // Record metrics
            recordUsageMetrics(
              device.name,
              entry.model ?? null,
              entry.inputTokens,
              entry.outputTokens,
              entry.cacheCreationTokens,
              entry.cacheReadTokens,
              costUSD,
              cacheSavings,
              entry.project,
              entry.sessionId
            );

            // Cache in Redis if enabled (for faster Prometheus queries)
            if (isRedisAvailable()) {
              const cachedEntry: CachedUsageEntry = {
                deviceId: device.id,
                deviceName: device.name,
                sessionId: entry.sessionId,
                project: entry.project,
                timestamp: entry.timestamp,
                type: entry.type,
                model: entry.model ?? null,
                inputTokens: entry.inputTokens,
                outputTokens: entry.outputTokens,
                cacheCreationTokens: entry.cacheCreationTokens,
                cacheReadTokens: entry.cacheReadTokens,
                costUSD,
              };
              // Fire and forget - don't block on Redis
              cacheUsageEntry(cachedEntry).catch(() => {
                // Silently ignore Redis cache failures
              });
            }

            // Update session end time
            await db.session.update({
              where: { id: session.id },
              data: { endedAt: entryTimestamp },
            });

            processed++;
          }

          appLog.info(LogCategories.USAGE, `Processed ${processed} usage entries`, {
            device: device.name,
            entries: processed,
          });

          return json(
            { success: true, processed },
            {
              headers: {
                "X-RateLimit-Limit": RATE_LIMITS.usage.maxRequests.toString(),
                "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
                "X-RateLimit-Reset": new Date(rateLimitResult.resetTime).toISOString(),
              },
            }
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          appLog.error(LogCategories.USAGE, "Error processing usage data", {
            error: errorMessage,
          });
          console.error("Error processing usage data:", error);
          return json(
            {
              success: false,
              error: "Internal server error",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
