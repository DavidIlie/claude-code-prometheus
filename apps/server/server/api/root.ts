import { createTRPCRouter } from "~/server/api/trpc";
import { authRouter } from "~/server/api/routers/auth";
import { setupRouter } from "~/server/api/routers/setup";
import { settingsRouter } from "~/server/api/routers/settings";
import { devicesRouter } from "~/server/api/routers/devices";
import { sessionsRouter } from "~/server/api/routers/sessions";
import { usageRouter } from "~/server/api/routers/usage";
import { statsRouter } from "~/server/api/routers/stats";
import { pricingRouter } from "~/server/api/routers/pricing";
import { systemRouter } from "~/server/api/routers/system";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  setup: setupRouter,
  settings: settingsRouter,
  devices: devicesRouter,
  sessions: sessionsRouter,
  usage: usageRouter,
  stats: statsRouter,
  pricing: pricingRouter,
  system: systemRouter,
});

export type AppRouter = typeof appRouter;
