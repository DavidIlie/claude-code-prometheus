import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { deviceRegistrationSchema } from "@davidilie/claude-code-prometheus-shared";
import { db } from "~/server/db";
import { generateApiKey } from "~/server/lib/auth";
import { updateDeviceStatus } from "~/server/lib/metrics";

export const Route = createFileRoute("/api/devices/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const parsed = deviceRegistrationSchema.safeParse(body);

          if (!parsed.success) {
            return json(
              {
                success: false,
                error: "Invalid request body",
                details: parsed.error.flatten(),
              },
              { status: 400 }
            );
          }

          // Check if setup is completed
          const settings = await db.settings.findUnique({
            where: { id: "settings" },
          });

          if (!settings?.setupCompleted) {
            return json(
              {
                success: false,
                error: "Server setup not completed",
              },
              { status: 403 }
            );
          }

          const { name, hostname } = parsed.data;
          const apiKey = generateApiKey();

          const device = await db.device.create({
            data: {
              name,
              hostname,
              apiKey,
            },
          });

          updateDeviceStatus(device.name, true);

          return json(
            {
              deviceId: device.id,
              apiKey,
            },
            { status: 201 }
          );
        } catch (error) {
          console.error("Error registering device:", error);
          return json(
            {
              success: false,
              error: "Internal server error",
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
