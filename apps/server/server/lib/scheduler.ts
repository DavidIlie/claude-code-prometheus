import { db } from "~/server/db";
import { fetchAndUpdatePricing } from "./pricing-fetcher";

// Track if scheduler is already running
let schedulerRunning = false;
let pricingIntervalId: NodeJS.Timeout | null = null;
let dataCleanupIntervalId: NodeJS.Timeout | null = null;

// Default intervals
const PRICING_UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const DATA_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

export async function startScheduler(): Promise<void> {
  if (schedulerRunning) {
    console.log("Scheduler already running");
    return;
  }

  schedulerRunning = true;
  console.log("Starting background scheduler...");

  // Run pricing update immediately on startup
  const settings = await db.settings.findUnique({ where: { id: "settings" } });

  if (settings?.autoUpdatePricing !== false) {
    console.log("Running initial pricing update...");
    await fetchAndUpdatePricing();
  }

  // Schedule periodic pricing updates
  pricingIntervalId = setInterval(async () => {
    try {
      const currentSettings = await db.settings.findUnique({
        where: { id: "settings" },
      });

      if (currentSettings?.autoUpdatePricing) {
        console.log("Running scheduled pricing update...");
        await fetchAndUpdatePricing();
      }
    } catch (error) {
      console.error("Pricing update job failed:", error);
    }
  }, PRICING_UPDATE_INTERVAL);

  // Schedule data cleanup
  dataCleanupIntervalId = setInterval(async () => {
    try {
      const currentSettings = await db.settings.findUnique({
        where: { id: "settings" },
      });

      if (currentSettings?.retentionDays) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - currentSettings.retentionDays);

        const result = await db.usageEntry.deleteMany({
          where: { timestamp: { lt: cutoffDate } },
        });

        if (result.count > 0) {
          console.log(`Cleaned up ${result.count} old usage entries`);

          // Clean up empty sessions
          await db.session.deleteMany({
            where: { entries: { none: {} } },
          });
        }
      }
    } catch (error) {
      console.error("Data cleanup job failed:", error);
    }
  }, DATA_CLEANUP_INTERVAL);

  console.log("Background scheduler started");
}

export function stopScheduler(): void {
  if (pricingIntervalId) {
    clearInterval(pricingIntervalId);
    pricingIntervalId = null;
  }
  if (dataCleanupIntervalId) {
    clearInterval(dataCleanupIntervalId);
    dataCleanupIntervalId = null;
  }
  schedulerRunning = false;
  console.log("Background scheduler stopped");
}
