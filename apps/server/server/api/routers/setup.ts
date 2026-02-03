import { TRPCError } from "@trpc/server";
import {
  setupAdminSchema,
  setupServerSchema,
  setupOptionalSchema,
} from "@claude-code-prometheus/shared";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { hashPassword, createToken } from "~/server/lib/auth";
import { z } from "zod";

// Extended optional schema with autoLogin
const setupOptionalWithAutoLoginSchema = setupOptionalSchema.extend({
  autoLogin: z.boolean().default(false),
});

export const setupRouter = createTRPCRouter({
  getStatus: publicProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.settings.findUnique({
      where: { id: "settings" },
    });

    const user = await ctx.db.user.findFirst();

    return {
      setupCompleted: settings?.setupCompleted ?? false,
      hasAdmin: !!user,
      hasSettings: !!settings,
      admin: user
        ? { username: user.username, email: user.email }
        : null,
    };
  }),

  // Update admin during setup (before setup is completed)
  updateAdmin: publicProcedure
    .input(
      z.object({
        username: z.string().min(1).optional(),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(8).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const settings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
      });

      if (settings?.setupCompleted) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Setup already completed. Use settings to change password.",
        });
      }

      const existingUser = await ctx.db.user.findFirst();
      if (!existingUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No admin user exists",
        });
      }

      const updateData: { username?: string; email?: string | null; passwordHash?: string } = {};

      if (input.username) {
        updateData.username = input.username;
      }
      if (input.email !== undefined) {
        updateData.email = input.email || null;
      }
      if (input.password) {
        updateData.passwordHash = await hashPassword(input.password);
      }

      const user = await ctx.db.user.update({
        where: { id: existingUser.id },
        data: updateData,
      });

      return { userId: user.id, username: user.username };
    }),

  createAdmin: publicProcedure
    .input(setupAdminSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if setup is already completed
      const settings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
      });

      if (settings?.setupCompleted) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Setup already completed",
        });
      }

      // Check if admin already exists
      const existingUser = await ctx.db.user.findFirst();
      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Admin user already exists",
        });
      }

      const passwordHash = await hashPassword(input.password);

      const user = await ctx.db.user.create({
        data: {
          username: input.username,
          email: input.email || null,
          passwordHash,
        },
      });

      return { userId: user.id, username: user.username };
    }),

  saveServerConfig: publicProcedure
    .input(setupServerSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if setup is already completed
      const existingSettings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
      });

      if (existingSettings?.setupCompleted) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Setup already completed",
        });
      }

      const settings = await ctx.db.settings.upsert({
        where: { id: "settings" },
        update: {
          serverName: input.serverName,
          serverUrl: input.serverUrl,
          timezone: input.timezone,
          currency: input.currency,
        },
        create: {
          id: "settings",
          serverName: input.serverName,
          serverUrl: input.serverUrl,
          timezone: input.timezone,
          currency: input.currency,
        },
      });

      return settings;
    }),

  saveOptionalConfig: publicProcedure
    .input(setupOptionalWithAutoLoginSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if setup is already completed
      const existingSettings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
      });

      if (existingSettings?.setupCompleted) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Setup already completed",
        });
      }

      const settings = await ctx.db.settings.update({
        where: { id: "settings" },
        data: {
          enablePrometheus: input.enablePrometheus,
          prometheusPort: input.prometheusPort,
          retentionDays: input.retentionDays,
          autoUpdatePricing: input.autoUpdatePricing,
          autoLogin: input.autoLogin,
        },
      });

      return settings;
    }),

  completeSetup: publicProcedure.mutation(async ({ ctx }) => {
    // Verify admin exists
    const admin = await ctx.db.user.findFirst();
    if (!admin) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Admin user must be created first",
      });
    }

    // Verify settings exist
    const settings = await ctx.db.settings.findUnique({
      where: { id: "settings" },
    });

    if (!settings) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Server configuration must be saved first",
      });
    }

    if (settings.setupCompleted) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Setup already completed",
      });
    }

    // Mark setup as completed
    await ctx.db.settings.update({
      where: { id: "settings" },
      data: { setupCompleted: true },
    });

    // Create auth token for the admin
    const token = await createToken({
      userId: admin.id,
      username: admin.username,
    });

    return {
      token,
      user: { id: admin.id, username: admin.username },
      autoLogin: settings.autoLogin,
    };
  }),
});
