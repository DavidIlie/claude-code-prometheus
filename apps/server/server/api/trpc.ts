import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "~/server/db";
import { verifyToken, type JWTPayload } from "~/server/lib/auth";

export interface CreateContextOptions {
  userId?: string;
  username?: string;
}

export async function createTRPCContext(opts: {
  headers: Headers;
}): Promise<CreateContextOptions & { db: typeof db }> {
  const authHeader = opts.headers.get("authorization");
  const cookieHeader = opts.headers.get("cookie");

  let user: JWTPayload | null = null;

  // Try to get token from Authorization header
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    user = await verifyToken(token);
  }

  // Try to get token from cookies
  if (!user && cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map((c) => {
        const [key, ...rest] = c.split("=");
        return [key, rest.join("=")];
      })
    );
    if (cookies["auth-token"]) {
      user = await verifyToken(cookies["auth-token"]);
    }
  }

  return {
    db,
    userId: user?.userId,
    username: user?.username,
  };
}

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Middleware to check if setup is completed
const enforceSetupCompleted = t.middleware(async ({ ctx, next }) => {
  const settings = await ctx.db.settings.findUnique({
    where: { id: "settings" },
  });

  if (!settings?.setupCompleted) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Setup not completed",
    });
  }

  return next({ ctx });
});

// Middleware to check if user is authenticated
const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId || !ctx.username) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      username: ctx.username,
    },
  });
});

// Procedure that requires setup to be completed
export const setupCompletedProcedure = t.procedure.use(enforceSetupCompleted);

// Procedure that requires authentication
export const protectedProcedure = t.procedure
  .use(enforceSetupCompleted)
  .use(enforceAuth);
