import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { execSync } from "node:child_process";

const PORT = parseInt(process.env.PORT || "3000", 10);

// Initialize database schema
async function initDatabase() {
  console.log("📦 Initializing database...");
  try {
    // Try to push schema using prisma from node_modules
    const prismaPath = join(process.cwd(), "node_modules", ".bin", "prisma");
    if (existsSync(prismaPath)) {
      execSync(`${prismaPath} db push --schema=/app/prisma/schema.prisma --accept-data-loss --skip-generate`, {
        stdio: "inherit",
        env: { ...process.env, npm_config_cache: "/app/.npm" }
      });
    } else {
      // Fallback: use npx
      execSync("npx prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss --skip-generate", {
        stdio: "inherit",
        env: { ...process.env, npm_config_cache: "/app/.npm" }
      });
    }
    console.log("✅ Database ready!");
  } catch (error) {
    console.error("⚠️ Database initialization failed:", error.message);
    console.log("Continuing anyway - database may already be initialized");
  }
}

// MIME types for static files
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

// Serve static file
function serveStatic(filePath, res) {
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  const stat = statSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  createReadStream(filePath).pipe(res);
}

async function main() {
  // Initialize database first
  await initDatabase();

  console.log("Loading TanStack Start server...");

  // Import the built server module
  const { default: server } = await import("./dist/server/server.js");

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      // Serve static assets from /assets/ path
      if (url.pathname.startsWith("/assets/")) {
        const filePath = join(process.cwd(), "dist/client", url.pathname);
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          return serveStatic(filePath, res);
        }
      }

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
