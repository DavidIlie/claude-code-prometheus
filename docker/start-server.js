import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT || "3000", 10);

async function main() {
  console.log("Loading TanStack Start server...");

  // Import the built server module
  const { default: server } = await import("./dist/server/server.js");

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      // Build headers from node request
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v));
          } else {
            headers.set(key, value);
          }
        }
      }

      // Read body for non-GET requests
      let body = null;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        if (chunks.length > 0) {
          body = Buffer.concat(chunks);
        }
      }

      // Create fetch Request
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body,
        duplex: body ? "half" : undefined,
      });

      // Call the TanStack Start fetch handler
      const response = await server.fetch(request);

      // Set status and headers
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (error) {
      console.error("Request error:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
