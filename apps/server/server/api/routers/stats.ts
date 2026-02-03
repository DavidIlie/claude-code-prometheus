import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const statsRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1); // Start of current month
      const from = input.from ?? defaultFrom;
      const to = input.to ?? now;

      const [totals, devicesCount, sessionsCount, activeDevices] =
        await Promise.all([
          // Aggregate totals
          ctx.db.usageEntry.aggregate({
            where: {
              timestamp: { gte: from, lte: to },
            },
            _sum: {
              inputTokens: true,
              outputTokens: true,
              cacheCreationTokens: true,
              cacheReadTokens: true,
              costUSD: true,
            },
          }),

          // Total devices
          ctx.db.device.count(),

          // Total sessions in period
          ctx.db.session.count({
            where: {
              startedAt: { gte: from, lte: to },
            },
          }),

          // Active devices (seen in last 5 minutes)
          ctx.db.device.count({
            where: {
              lastSeen: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
          }),
        ]);

      return {
        totalCostUSD: totals._sum.costUSD ?? 0,
        totalInputTokens: totals._sum.inputTokens ?? 0,
        totalOutputTokens: totals._sum.outputTokens ?? 0,
        totalCacheCreationTokens: totals._sum.cacheCreationTokens ?? 0,
        totalCacheReadTokens: totals._sum.cacheReadTokens ?? 0,
        totalDevices: devicesCount,
        activeDevices,
        sessionsCount,
        period: { from, to },
      };
    }),

  costByModel: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      const from = input.from ?? defaultFrom;
      const to = input.to ?? now;

      const entries = await ctx.db.usageEntry.groupBy({
        by: ["model"],
        where: {
          timestamp: { gte: from, lte: to },
        },
        _sum: {
          costUSD: true,
          inputTokens: true,
          outputTokens: true,
        },
      });

      const totalCost = entries.reduce(
        (sum, e) => sum + (e._sum.costUSD ?? 0),
        0
      );

      return entries.map((entry) => ({
        model: entry.model ?? "unknown",
        costUSD: entry._sum.costUSD ?? 0,
        inputTokens: entry._sum.inputTokens ?? 0,
        outputTokens: entry._sum.outputTokens ?? 0,
        percentage: totalCost > 0 ? ((entry._sum.costUSD ?? 0) / totalCost) * 100 : 0,
      }));
    }),

  costByDevice: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      const from = input.from ?? defaultFrom;
      const to = input.to ?? now;

      const sessions = await ctx.db.session.findMany({
        where: {
          startedAt: { gte: from, lte: to },
        },
        select: {
          deviceId: true,
          device: { select: { name: true } },
          entries: {
            select: {
              costUSD: true,
              inputTokens: true,
              outputTokens: true,
            },
          },
        },
      });

      // Aggregate by device
      const deviceMap = new Map<
        string,
        {
          deviceId: string;
          deviceName: string;
          costUSD: number;
          inputTokens: number;
          outputTokens: number;
        }
      >();

      for (const session of sessions) {
        const existing = deviceMap.get(session.deviceId);
        const sessionTotals = session.entries.reduce(
          (acc, e) => ({
            costUSD: acc.costUSD + (e.costUSD ?? 0),
            inputTokens: acc.inputTokens + e.inputTokens,
            outputTokens: acc.outputTokens + e.outputTokens,
          }),
          { costUSD: 0, inputTokens: 0, outputTokens: 0 }
        );

        if (existing) {
          existing.costUSD += sessionTotals.costUSD;
          existing.inputTokens += sessionTotals.inputTokens;
          existing.outputTokens += sessionTotals.outputTokens;
        } else {
          deviceMap.set(session.deviceId, {
            deviceId: session.deviceId,
            deviceName: session.device.name,
            ...sessionTotals,
          });
        }
      }

      const result = Array.from(deviceMap.values());
      const totalCost = result.reduce((sum, d) => sum + d.costUSD, 0);

      return result.map((d) => ({
        ...d,
        percentage: totalCost > 0 ? (d.costUSD / totalCost) * 100 : 0,
      }));
    }),

  recentSessions: protectedProcedure
    .input(z.object({ limit: z.number().int().positive().max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.db.session.findMany({
        orderBy: { startedAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          sessionId: true,
          project: true,
          startedAt: true,
          endedAt: true,
          device: { select: { id: true, name: true } },
          _count: { select: { entries: true } },
        },
      });

      const sessionsWithTotals = await Promise.all(
        sessions.map(async (session) => {
          const totals = await ctx.db.usageEntry.aggregate({
            where: { sessionId: session.id },
            _sum: {
              inputTokens: true,
              outputTokens: true,
              costUSD: true,
            },
          });

          return {
            ...session,
            entriesCount: session._count.entries,
            totalTokens:
              (totals._sum.inputTokens ?? 0) + (totals._sum.outputTokens ?? 0),
            totalCostUSD: totals._sum.costUSD ?? 0,
          };
        })
      );

      return sessionsWithTotals;
    }),

  dailyTrend: protectedProcedure
    .input(z.object({ days: z.number().int().positive().max(90).default(7) }))
    .query(async ({ ctx, input }) => {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - input.days);

      const entries = await ctx.db.usageEntry.findMany({
        where: {
          timestamp: { gte: from, lte: to },
        },
        select: {
          timestamp: true,
          inputTokens: true,
          outputTokens: true,
          cacheCreationTokens: true,
          cacheReadTokens: true,
          costUSD: true,
        },
        orderBy: { timestamp: "asc" },
      });

      // Group by day
      const days = new Map<
        string,
        {
          date: string;
          inputTokens: number;
          outputTokens: number;
          cacheReadTokens: number;
          costUSD: number;
        }
      >();

      for (const entry of entries) {
        const date = entry.timestamp.toISOString().split("T")[0]!;
        const existing = days.get(date);

        if (existing) {
          existing.inputTokens += entry.inputTokens;
          existing.outputTokens += entry.outputTokens;
          existing.cacheReadTokens += entry.cacheReadTokens;
          existing.costUSD += entry.costUSD ?? 0;
        } else {
          days.set(date, {
            date,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
            cacheReadTokens: entry.cacheReadTokens,
            costUSD: entry.costUSD ?? 0,
          });
        }
      }

      return Array.from(days.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
    }),
});
