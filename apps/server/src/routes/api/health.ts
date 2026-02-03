import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { db } from "~/server/db";
import { getRedisStatus } from "~/server/lib/redis";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Check database connectivity
          await db.$queryRaw`SELECT 1`;

          // Get Redis status
          const redisStatus = getRedisStatus();

          return json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            database: "connected",
            redis: redisStatus,
          });
        } catch (error) {
          // Get Redis status even if DB fails
          const redisStatus = getRedisStatus();

          return json(
            {
              status: "unhealthy",
              timestamp: new Date().toISOString(),
              database: "disconnected",
              error: error instanceof Error ? error.message : "Unknown error",
              redis: redisStatus,
            },
            { status: 503 }
          );
        }
      },
    },
  },
});
