import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const usageRouter = createTRPCRouter({
  getEntries: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().optional(),
        deviceId: z.string().optional(),
        model: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        type: z.enum(["user", "assistant", "summary"]).optional(),
        limit: z.number().int().positive().max(1000).default(100),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: {
        session?: { deviceId?: string };
        sessionId?: string;
        model?: string;
        type?: string;
        timestamp?: { gte?: Date; lte?: Date };
      } = {};

      if (input.deviceId) {
        where.session = { deviceId: input.deviceId };
      }

      if (input.sessionId) {
        where.sessionId = input.sessionId;
      }

      if (input.model) {
        where.model = input.model;
      }

      if (input.type) {
        where.type = input.type;
      }

      if (input.from || input.to) {
        where.timestamp = {};
        if (input.from) where.timestamp.gte = input.from;
        if (input.to) where.timestamp.lte = input.to;
      }

      const [entries, total] = await Promise.all([
        ctx.db.usageEntry.findMany({
          where,
          orderBy: { timestamp: "desc" },
          take: input.limit,
          skip: input.offset,
          select: {
            id: true,
            timestamp: true,
            type: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            cacheCreationTokens: true,
            cacheReadTokens: true,
            costUSD: true,
            session: {
              select: {
                id: true,
                project: true,
                device: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        }),
        ctx.db.usageEntry.count({ where }),
      ]);

      return {
        entries,
        total,
        hasMore: input.offset + entries.length < total,
      };
    }),

  getByTimeRange: protectedProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
        deviceId: z.string().optional(),
        granularity: z.enum(["hour", "day", "week"]).default("day"),
      })
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.db.usageEntry.findMany({
        where: {
          timestamp: { gte: input.from, lte: input.to },
          ...(input.deviceId && { session: { deviceId: input.deviceId } }),
        },
        select: {
          timestamp: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          cacheCreationTokens: true,
          cacheReadTokens: true,
          costUSD: true,
        },
        orderBy: { timestamp: "asc" },
      });

      // Group by time bucket
      const buckets = new Map<
        string,
        {
          timestamp: string;
          inputTokens: number;
          outputTokens: number;
          cacheCreationTokens: number;
          cacheReadTokens: number;
          costUSD: number;
          count: number;
        }
      >();

      for (const entry of entries) {
        let bucketKey: string;
        const date = new Date(entry.timestamp);

        switch (input.granularity) {
          case "hour":
            bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:00:00`;
            break;
          case "week":
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            bucketKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
            break;
          case "day":
          default:
            bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        }

        const existing = buckets.get(bucketKey);
        if (existing) {
          existing.inputTokens += entry.inputTokens;
          existing.outputTokens += entry.outputTokens;
          existing.cacheCreationTokens += entry.cacheCreationTokens;
          existing.cacheReadTokens += entry.cacheReadTokens;
          existing.costUSD += entry.costUSD ?? 0;
          existing.count += 1;
        } else {
          buckets.set(bucketKey, {
            timestamp: bucketKey,
            inputTokens: entry.inputTokens,
            outputTokens: entry.outputTokens,
            cacheCreationTokens: entry.cacheCreationTokens,
            cacheReadTokens: entry.cacheReadTokens,
            costUSD: entry.costUSD ?? 0,
            count: 1,
          });
        }
      }

      return Array.from(buckets.values()).sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
    }),
});
