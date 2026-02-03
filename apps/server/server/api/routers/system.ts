import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getRedisStatus, getRedisInfo } from "~/server/lib/redis";
import {
  getLogs,
  getLogStats,
  clearLogs,
  type LogLevel,
} from "~/server/lib/app-logger";

export const systemRouter = createTRPCRouter({
  // Get overall system status
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    // Get database stats
    const [deviceCount, sessionCount, entryCount] = await Promise.all([
      ctx.db.device.count(),
      ctx.db.session.count(),
      ctx.db.usageEntry.count(),
    ]);

    // Get Redis status
    const redisStatus = getRedisStatus();
    const redisInfo = await getRedisInfo();

    // Get log stats
    const logStats = getLogStats();

    // Get server uptime (approximate - based on when logs started)
    const uptimeSeconds = logStats.oldestLog
      ? Math.floor((Date.now() - logStats.oldestLog.getTime()) / 1000)
      : 0;

    return {
      database: {
        status: "connected",
        deviceCount,
        sessionCount,
        entryCount,
      },
      redis: {
        ...redisStatus,
        info: redisInfo,
      },
      logs: logStats,
      server: {
        uptimeSeconds,
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage(),
        env: process.env.NODE_ENV ?? "development",
      },
    };
  }),

  // Get Redis status specifically
  getRedisStatus: protectedProcedure.query(async () => {
    const status = getRedisStatus();
    const info = await getRedisInfo();
    return { ...status, info };
  }),

  // Get application logs
  getLogs: protectedProcedure
    .input(
      z.object({
        level: z.enum(["info", "warn", "error", "debug"]).optional(),
        category: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
        sinceMinutes: z.number().min(1).max(1440).optional(), // Max 24 hours
      })
    )
    .query(({ input }) => {
      const since = input.sinceMinutes
        ? new Date(Date.now() - input.sinceMinutes * 60 * 1000)
        : undefined;

      return getLogs({
        level: input.level as LogLevel | undefined,
        category: input.category,
        limit: input.limit,
        since,
      });
    }),

  // Get log statistics
  getLogStats: protectedProcedure.query(() => {
    return getLogStats();
  }),

  // Clear logs (admin action)
  clearLogs: protectedProcedure.mutation(() => {
    clearLogs();
    return { success: true };
  }),

  // Get server info
  getServerInfo: protectedProcedure.query(async ({ ctx }) => {
    // Get settings
    const settings = await ctx.db.settings.findUnique({
      where: { id: "settings" },
    });

    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV ?? "development",
      settings: settings
        ? {
            serverName: settings.serverName,
            serverUrl: settings.serverUrl,
            timezone: settings.timezone,
            enablePrometheus: settings.enablePrometheus,
            autoLogin: settings.autoLogin,
            retentionDays: settings.retentionDays,
          }
        : null,
    };
  }),
});
