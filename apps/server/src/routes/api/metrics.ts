import { createFileRoute } from "@tanstack/react-router";
import { registry, initializePricingMetrics } from "~/server/lib/metrics";

// Initialize pricing metrics on module load
initializePricingMetrics();

export const Route = createFileRoute("/api/metrics")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const metrics = await registry.metrics();
          return new Response(metrics, {
            status: 200,
            headers: { "Content-Type": registry.contentType },
          });
        } catch (error) {
          console.error("Error generating metrics:", error);
          return new Response("Error generating metrics", { status: 500 });
        }
      },
    },
  },
});
