import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const sessionsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().optional(),
        project: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().int().positive().max(100).default(20),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: {
        deviceId?: string;
        project?: { contains: string };
        startedAt?: { gte?: Date; lte?: Date };
      } = {};

      if (input.deviceId) {
        where.deviceId = input.deviceId;
      }

      if (input.project) {
        where.project = { contains: input.project };
      }

      if (input.from || input.to) {
        where.startedAt = {};
        if (input.from) where.startedAt.gte = input.from;
        if (input.to) where.startedAt.lte = input.to;
      }

      const [sessions, total] = await Promise.all([
        ctx.db.session.findMany({
          where,
          orderBy: { startedAt: "desc" },
          take: input.limit,
          skip: input.offset,
          select: {
            id: true,
            sessionId: true,
            project: true,
            startedAt: true,
            endedAt: true,
            device: {
              select: { id: true, name: true },
            },
            _count: {
              select: { entries: true },
            },
          },
        }),
        ctx.db.session.count({ where }),
      ]);

      // Calculate totals for each session
      const sessionsWithTotals = await Promise.all(
        sessions.map(async (session) => {
          const totals = await ctx.db.usageEntry.aggregate({
            where: { sessionId: session.id },
            _sum: {
              inputTokens: true,
              outputTokens: true,
              cacheCreationTokens: true,
              cacheReadTokens: true,
              costUSD: true,
            },
          });

          return {
            ...session,
            entriesCount: session._count.entries,
            totalInputTokens: totals._sum.inputTokens ?? 0,
            totalOutputTokens: totals._sum.outputTokens ?? 0,
            totalCacheCreationTokens: totals._sum.cacheCreationTokens ?? 0,
            totalCacheReadTokens: totals._sum.cacheReadTokens ?? 0,
            totalCostUSD: totals._sum.costUSD ?? 0,
          };
        })
      );

      return {
        sessions: sessionsWithTotals,
        total,
        hasMore: input.offset + sessions.length < total,
      };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.session.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          sessionId: true,
          project: true,
          startedAt: true,
          endedAt: true,
          device: {
            select: { id: true, name: true, hostname: true },
          },
          entries: {
            orderBy: { timestamp: "asc" },
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
            },
          },
        },
      });

      if (!session) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      // Calculate totals
      const totals = session.entries.reduce(
        (acc, entry) => ({
          inputTokens: acc.inputTokens + entry.inputTokens,
          outputTokens: acc.outputTokens + entry.outputTokens,
          cacheCreationTokens: acc.cacheCreationTokens + entry.cacheCreationTokens,
          cacheReadTokens: acc.cacheReadTokens + entry.cacheReadTokens,
          costUSD: acc.costUSD + (entry.costUSD ?? 0),
        }),
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUSD: 0,
        }
      );

      // Get unique models used
      const models = [...new Set(session.entries.map((e) => e.model).filter(Boolean))];

      return {
        ...session,
        totals,
        models,
        duration: session.endedAt
          ? Math.floor(
              (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
            )
          : null,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.session.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
