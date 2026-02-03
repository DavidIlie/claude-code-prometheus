import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deviceRegistrationSchema } from "@davidilie/claude-code-prometheus-shared";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  generateApiKey,
  checkRateLimit,
  RATE_LIMITS,
} from "~/server/lib/auth";
import { updateDeviceStatus } from "~/server/lib/metrics";

export const devicesRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const devices = await ctx.db.device.findMany({
      orderBy: { lastSeen: "desc" },
      select: {
        id: true,
        name: true,
        hostname: true,
        lastSeen: true,
        createdAt: true,
        _count: {
          select: { sessions: true },
        },
      },
    });

    const now = new Date();
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    return devices.map((device) => ({
      ...device,
      sessionsCount: device._count.sessions,
      isOnline: now.getTime() - device.lastSeen.getTime() < ONLINE_THRESHOLD_MS,
    }));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const device = await ctx.db.device.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          hostname: true,
          lastSeen: true,
          createdAt: true,
          sessions: {
            orderBy: { startedAt: "desc" },
            take: 10,
            select: {
              id: true,
              sessionId: true,
              project: true,
              startedAt: true,
              endedAt: true,
              _count: {
                select: { entries: true },
              },
            },
          },
        },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      const now = new Date();
      const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

      return {
        ...device,
        isOnline: now.getTime() - device.lastSeen.getTime() < ONLINE_THRESHOLD_MS,
      };
    }),

  register: protectedProcedure
    .input(deviceRegistrationSchema)
    .mutation(async ({ ctx, input }) => {
      // Rate limiting based on IP/user
      const rateLimitKey = `register:${ctx.userId}`;
      const rateLimitResult = checkRateLimit(rateLimitKey, RATE_LIMITS.register);

      if (!rateLimitResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many device registrations. Please try again later.",
        });
      }

      const apiKey = generateApiKey();

      const device = await ctx.db.device.create({
        data: {
          name: input.name,
          hostname: input.hostname,
          apiKey,
        },
      });

      // Get server URL for the install command
      const settings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
        select: { serverUrl: true },
      });

      const serverUrl = settings?.serverUrl || "http://localhost:3000";

      // Update metrics
      updateDeviceStatus(device.name, true);

      // Generate install commands
      const installCommands = generateInstallCommands(serverUrl, apiKey, input.name);

      return {
        deviceId: device.id,
        apiKey,
        serverUrl,
        installCommands,
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        hostname: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const device = await ctx.db.device.update({
        where: { id },
        data,
      });

      return device;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.device.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  regenerateApiKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const apiKey = generateApiKey();

      const device = await ctx.db.device.update({
        where: { id: input.id },
        data: { apiKey },
      });

      // Get server URL for the install command
      const settings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
        select: { serverUrl: true },
      });

      const serverUrl = settings?.serverUrl || "http://localhost:3000";

      // Generate install commands
      const installCommands = generateInstallCommands(serverUrl, apiKey, device.name);

      return { apiKey, installCommands };
    }),

  getApiKey: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const device = await ctx.db.device.findUnique({
        where: { id: input.id },
        select: { apiKey: true, name: true },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      // Get server URL for the install command
      const settings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
        select: { serverUrl: true },
      });

      const serverUrl = settings?.serverUrl || "http://localhost:3000";

      // Generate install commands
      const installCommands = generateInstallCommands(serverUrl, device.apiKey, device.name);

      return { apiKey: device.apiKey, installCommands };
    }),

  // Get install command for an existing device
  getInstallCommand: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const device = await ctx.db.device.findUnique({
        where: { id: input.id },
        select: { apiKey: true, name: true },
      });

      if (!device) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Device not found",
        });
      }

      const settings = await ctx.db.settings.findUnique({
        where: { id: "settings" },
        select: { serverUrl: true },
      });

      const serverUrl = settings?.serverUrl || "http://localhost:3000";

      return generateInstallCommands(serverUrl, device.apiKey, device.name);
    }),
});

// Generate platform-specific install commands
function generateInstallCommands(
  serverUrl: string,
  apiKey: string,
  deviceName: string
): {
  npm: string;
  quick: string;
  manual: {
    install: string;
    configure: string;
    start: string;
  };
  launchAgent: string;
} {
  const escapedName = deviceName.replace(/'/g, "'\\''");
  const escapedUrl = serverUrl.replace(/'/g, "'\\''");
  const escapedKey = apiKey.replace(/'/g, "'\\''");

  return {
    // One-liner that installs and configures everything
    npm: `npm install -g @davidilie/claude-usage-daemon`,

    // Quick setup command (after npm install)
    quick: `claude-usage-daemon setup --server '${escapedUrl}' --key '${escapedKey}' --name '${escapedName}'`,

    // Manual steps
    manual: {
      install: `npm install -g @davidilie/claude-usage-daemon`,
      configure: `claude-usage-daemon setup --server '${escapedUrl}' --key '${escapedKey}' --name '${escapedName}'`,
      start: `claude-usage-daemon start`,
    },

    // macOS LaunchAgent plist
    launchAgent: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.davidilie.claude-usage-daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/claude-usage-daemon</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/claude-usage-daemon.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/claude-usage-daemon.error.log</string>
</dict>
</plist>`,
  };
}
