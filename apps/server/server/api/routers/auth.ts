import { TRPCError } from "@trpc/server";
import { loginSchema } from "@claude-code-prometheus/shared";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  verifyPassword,
  createToken,
  createAutoLoginToken,
  checkRateLimit,
  RATE_LIMITS,
} from "~/server/lib/auth";

export const authRouter = createTRPCRouter({
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    // Rate limiting
    const rateLimitKey = `login:${input.username}`;
    const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.login);

    if (!rateLimitResult.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many login attempts. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000)} minutes.`,
      });
    }

    const user = await ctx.db.user.findUnique({
      where: { username: input.username },
    });

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid username or password",
      });
    }

    const validPassword = await verifyPassword(input.password, user.passwordHash);

    if (!validPassword) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid username or password",
      });
    }

    const token = await createToken({
      userId: user.id,
      username: user.username,
    });

    return { token, user: { id: user.id, username: user.username } };
  }),

  getSession: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, username: true, email: true },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    return user;
  }),

  checkSetup: publicProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.settings.findUnique({
      where: { id: "settings" },
    });

    return {
      setupCompleted: settings?.setupCompleted ?? false,
    };
  }),

  // Get auto-login status and token if enabled
  getAutoLoginStatus: publicProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.settings.findUnique({
      where: { id: "settings" },
      select: { autoLogin: true, setupCompleted: true },
    });

    if (!settings?.setupCompleted) {
      return { autoLoginEnabled: false, token: null };
    }

    if (!settings.autoLogin) {
      return { autoLoginEnabled: false, token: null };
    }

    // Get the admin user for auto-login
    const admin = await ctx.db.user.findFirst({
      select: { id: true, username: true },
    });

    if (!admin) {
      return { autoLoginEnabled: false, token: null };
    }

    // Create an auto-login token
    const token = await createAutoLoginToken({
      userId: admin.id,
      username: admin.username,
    });

    return {
      autoLoginEnabled: true,
      token,
      user: { id: admin.id, username: admin.username },
    };
  }),

  // Logout - client side should clear the cookie
  logout: protectedProcedure.mutation(async () => {
    // In a real implementation, you might want to invalidate the token server-side
    // For now, the client will just clear the cookie
    return { success: true };
  }),
});
