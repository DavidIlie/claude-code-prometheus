import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { hashPassword, verifyPassword } from "~/server/lib/auth";

export const settingsRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.settings.findUnique({
      where: { id: "settings" },
    });

    if (!settings) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Settings not found",
      });
    }

    return settings;
  }),

  update: protectedProcedure
    .input(
      z.object({
        serverName: z.string().min(1).optional(),
        serverUrl: z.string().url().optional(),
        timezone: z.string().optional(),
        currency: z.enum(["USD", "EUR", "GBP"]).optional(),
        enablePrometheus: z.boolean().optional(),
        prometheusPort: z.number().int().min(1).max(65535).optional(),
        retentionDays: z.number().int().min(1).optional(),
        autoUpdatePricing: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.settings.update({
        where: { id: "settings" },
        data: input,
      });

      return settings;
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      const validPassword = await verifyPassword(
        input.currentPassword,
        user.passwordHash
      );

      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      const newPasswordHash = await hashPassword(input.newPassword);

      await ctx.db.user.update({
        where: { id: ctx.userId },
        data: { passwordHash: newPasswordHash },
      });

      return { success: true };
    }),

  getDatabaseStats: protectedProcedure.query(async ({ ctx }) => {
    const [devicesCount, sessionsCount, entriesCount] = await Promise.all([
      ctx.db.device.count(),
      ctx.db.session.count(),
      ctx.db.usageEntry.count(),
    ]);

    return {
      devices: devicesCount,
      sessions: sessionsCount,
      entries: entriesCount,
    };
  }),

  clearOldData: protectedProcedure
    .input(z.object({ olderThanDays: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - input.olderThanDays);

      const result = await ctx.db.usageEntry.deleteMany({
        where: {
          timestamp: { lt: cutoffDate },
        },
      });

      // Clean up empty sessions
      await ctx.db.session.deleteMany({
        where: {
          entries: { none: {} },
        },
      });

      return { deletedEntries: result.count };
    }),
});
