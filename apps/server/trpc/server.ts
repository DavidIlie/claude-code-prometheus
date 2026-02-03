import "server-only";
import { createTRPCContext } from "~/server/api/trpc";
import { appRouter } from "~/server/api/root";

export async function createCaller(headers: Headers) {
  const ctx = await createTRPCContext({ headers });
  return appRouter.createCaller(ctx);
}
