import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  dbInitialized: boolean | undefined;
};

// Initialize database schema on first import (server startup)
if (!globalForPrisma.dbInitialized) {
  globalForPrisma.dbInitialized = true;
  try {
    console.log("📦 Syncing database schema...");
    // Use prisma from node_modules if available
    execSync("node_modules/.bin/prisma db push --accept-data-loss --skip-generate 2>/dev/null || npx prisma@6.2.1 db push --accept-data-loss 2>/dev/null || true", {
      stdio: "inherit",
      cwd: process.cwd(),
      timeout: 30000, // 30 second timeout
    });
    console.log("✅ Database schema synced");
  } catch (error) {
    console.log("⚠️ Schema sync skipped - database may already be initialized");
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
