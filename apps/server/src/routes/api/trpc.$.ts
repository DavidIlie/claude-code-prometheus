import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        return fetchRequestHandler({
          endpoint: "/api/trpc",
          req: request,
          router: appRouter,
          createContext: () => createTRPCContext({ headers: request.headers }),
        });
      },
      POST: ({ request }) => {
        return fetchRequestHandler({
          endpoint: "/api/trpc",
          req: request,
          router: appRouter,
          createContext: () => createTRPCContext({ headers: request.headers }),
        });
      },
    },
  },
});
