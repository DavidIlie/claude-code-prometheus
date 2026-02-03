import { Registry, Counter, Gauge, Histogram, Summary } from "prom-client";
import { DEFAULT_MODEL_PRICING } from "./pricing";

// Create a custom registry
export const registry = new Registry();

// ============================================================================
// TOKEN METRICS
// ============================================================================

// Token counters by type
export const tokensTotal = new Counter({
  name: "claude_tokens_total",
  help: "Total number of tokens processed",
  labelNames: ["device", "type", "model", "project"] as const,
  registers: [registry],
});

// Token rate histogram (tokens per minute)
export const tokenRateHistogram = new Histogram({
  name: "claude_tokens_per_request",
  help: "Distribution of tokens per request",
  labelNames: ["device", "type", "model"] as const,
  buckets: [100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
  registers: [registry],
});

// Input/Output ratio gauge
export const inputOutputRatio = new Gauge({
  name: "claude_input_output_ratio",
  help: "Ratio of input tokens to output tokens",
  labelNames: ["device", "model"] as const,
  registers: [registry],
});

// ============================================================================
// COST METRICS
// ============================================================================

// Cost counters
export const costTotal = new Counter({
  name: "claude_cost_usd_total",
  help: "Total cost in USD",
  labelNames: ["device", "model", "project"] as const,
  registers: [registry],
});

// Cost per request histogram
export const costPerRequestHistogram = new Histogram({
  name: "claude_cost_per_request_usd",
  help: "Distribution of cost per request in USD",
  labelNames: ["device", "model"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

// Hourly cost gauge (rolling)
export const hourlySpend = new Gauge({
  name: "claude_hourly_spend_usd",
  help: "Estimated hourly spend rate in USD",
  labelNames: ["device"] as const,
  registers: [registry],
});

// Daily cost gauge (rolling)
export const dailySpend = new Gauge({
  name: "claude_daily_spend_usd",
  help: "Estimated daily spend rate in USD",
  labelNames: ["device"] as const,
  registers: [registry],
});

// ============================================================================
// CACHE METRICS
// ============================================================================

// Cache savings counter
export const cacheSavingsTotal = new Counter({
  name: "claude_cache_savings_usd_total",
  help: "Total savings from cache hits in USD",
  labelNames: ["device", "model"] as const,
  registers: [registry],
});

// Cache hit ratio gauge (per device/model)
export const cacheHitRatio = new Gauge({
  name: "claude_cache_hit_ratio",
  help: "Ratio of cache hits to total input tokens (0-1)",
  labelNames: ["device", "model"] as const,
  registers: [registry],
});

// Cache tokens total by operation
export const cacheTokensTotal = new Counter({
  name: "claude_cache_tokens_total",
  help: "Total cache tokens by operation type",
  labelNames: ["device", "model", "operation"] as const,
  registers: [registry],
});

// Cache efficiency percentage (savings vs what would have been spent)
export const cacheEfficiency = new Gauge({
  name: "claude_cache_efficiency_percent",
  help: "Percentage of cost saved due to caching",
  labelNames: ["device"] as const,
  registers: [registry],
});

// ============================================================================
// SESSION METRICS
// ============================================================================

// Session counters
export const sessionsTotal = new Counter({
  name: "claude_sessions_total",
  help: "Total number of sessions",
  labelNames: ["device", "project"] as const,
  registers: [registry],
});

// Active sessions gauge
export const activeSessions = new Gauge({
  name: "claude_active_sessions",
  help: "Number of currently active sessions",
  labelNames: ["device"] as const,
  registers: [registry],
});

// Session duration histogram
export const sessionDuration = new Histogram({
  name: "claude_session_duration_seconds",
  help: "Session duration in seconds",
  labelNames: ["device", "project"] as const,
  buckets: [60, 300, 600, 1800, 3600, 7200, 14400, 28800, 86400],
  registers: [registry],
});

// Requests per session histogram
export const requestsPerSession = new Histogram({
  name: "claude_requests_per_session",
  help: "Number of requests per session",
  labelNames: ["device"] as const,
  buckets: [1, 5, 10, 20, 50, 100, 200, 500],
  registers: [registry],
});

// Cost per session histogram
export const costPerSession = new Histogram({
  name: "claude_cost_per_session_usd",
  help: "Cost per session in USD",
  labelNames: ["device", "project"] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 25, 50],
  registers: [registry],
});

// Tokens per session histogram
export const tokensPerSession = new Histogram({
  name: "claude_tokens_per_session",
  help: "Total tokens per session",
  labelNames: ["device"] as const,
  buckets: [1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  registers: [registry],
});

// Session info gauge (for session timeline)
export const sessionInfo = new Gauge({
  name: "claude_session_info",
  help: "Information about sessions (value=1 when active)",
  labelNames: ["device", "session_id", "project", "model"] as const,
  registers: [registry],
});

// Session start timestamp
export const sessionStartTime = new Gauge({
  name: "claude_session_start_timestamp",
  help: "Session start timestamp",
  labelNames: ["device", "session_id", "project"] as const,
  registers: [registry],
});

// ============================================================================
// REQUEST METRICS
// ============================================================================

// Total requests counter
export const requestsTotal = new Counter({
  name: "claude_requests_total",
  help: "Total number of API requests",
  labelNames: ["device", "model", "type", "project"] as const,
  registers: [registry],
});

// Request latency summary (simulated from timestamp gaps)
export const requestInterval = new Summary({
  name: "claude_request_interval_seconds",
  help: "Time between consecutive requests",
  labelNames: ["device"] as const,
  percentiles: [0.5, 0.9, 0.95, 0.99],
  registers: [registry],
});

// ============================================================================
// DEVICE METRICS
// ============================================================================

// Device last seen timestamp
export const deviceLastSeen = new Gauge({
  name: "claude_device_last_seen_timestamp",
  help: "Timestamp of last seen activity from device",
  labelNames: ["device", "hostname"] as const,
  registers: [registry],
});

// Device online status
export const deviceOnline = new Gauge({
  name: "claude_device_online",
  help: "Whether device is online (1) or offline (0)",
  labelNames: ["device", "hostname"] as const,
  registers: [registry],
});

// Device uptime (since first seen)
export const deviceUptime = new Gauge({
  name: "claude_device_uptime_seconds",
  help: "Time since device was first seen",
  labelNames: ["device"] as const,
  registers: [registry],
});

// Device session count gauge (current active)
export const deviceActiveSessions = new Gauge({
  name: "claude_device_active_session_count",
  help: "Number of active sessions on device",
  labelNames: ["device"] as const,
  registers: [registry],
});

// ============================================================================
// PROJECT METRICS
// ============================================================================

// Project activity gauge
export const projectActivity = new Gauge({
  name: "claude_project_last_activity_timestamp",
  help: "Timestamp of last activity in project",
  labelNames: ["project", "device"] as const,
  registers: [registry],
});

// Project session count
export const projectSessionCount = new Gauge({
  name: "claude_project_session_count",
  help: "Number of sessions per project",
  labelNames: ["project"] as const,
  registers: [registry],
});

// Project total cost gauge
export const projectTotalCost = new Gauge({
  name: "claude_project_total_cost_usd",
  help: "Total cost per project in USD",
  labelNames: ["project"] as const,
  registers: [registry],
});

// ============================================================================
// MODEL METRICS
// ============================================================================

// Model usage counter
export const modelUsage = new Counter({
  name: "claude_model_usage_total",
  help: "Usage count per model",
  labelNames: ["model", "device"] as const,
  registers: [registry],
});

// Model pricing gauges
export const modelInputPrice = new Gauge({
  name: "claude_model_input_price_per_million",
  help: "Input token price per million tokens",
  labelNames: ["model"] as const,
  registers: [registry],
});

export const modelOutputPrice = new Gauge({
  name: "claude_model_output_price_per_million",
  help: "Output token price per million tokens",
  labelNames: ["model"] as const,
  registers: [registry],
});

export const modelCacheReadPrice = new Gauge({
  name: "claude_model_cache_read_price_per_million",
  help: "Cache read token price per million tokens",
  labelNames: ["model"] as const,
  registers: [registry],
});

export const modelCacheCreationPrice = new Gauge({
  name: "claude_model_cache_creation_price_per_million",
  help: "Cache creation token price per million tokens",
  labelNames: ["model"] as const,
  registers: [registry],
});

// Pricing last updated timestamp
export const pricingLastUpdated = new Gauge({
  name: "claude_pricing_last_updated_timestamp",
  help: "Timestamp when pricing was last updated",
  registers: [registry],
});

// ============================================================================
// AGGREGATE METRICS
// ============================================================================

// Total cost gauge (for easy dashboard display)
export const totalCostGauge = new Gauge({
  name: "claude_total_cost_usd",
  help: "Total accumulated cost in USD",
  labelNames: ["device"] as const,
  registers: [registry],
});

// Total tokens gauge
export const totalTokensGauge = new Gauge({
  name: "claude_total_tokens",
  help: "Total accumulated tokens",
  labelNames: ["device", "type"] as const,
  registers: [registry],
});

// Total sessions gauge
export const totalSessionsGauge = new Gauge({
  name: "claude_total_sessions",
  help: "Total number of sessions",
  labelNames: ["device"] as const,
  registers: [registry],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Track running totals for gauges
const runningTotals: Record<string, { cost: number; tokens: Record<string, number>; sessions: number }> = {};

function getDeviceTotals(device: string) {
  if (!runningTotals[device]) {
    runningTotals[device] = { cost: 0, tokens: {}, sessions: 0 };
  }
  return runningTotals[device];
}

// Initialize pricing metrics with default values
export function initializePricingMetrics() {
  for (const [model, pricing] of Object.entries(DEFAULT_MODEL_PRICING)) {
    const p = pricing as {
      inputCostPerToken: number;
      outputCostPerToken: number;
      cacheCreationCostPerToken: number;
      cacheReadCostPerToken: number;
    };
    modelInputPrice.set({ model }, p.inputCostPerToken * 1_000_000);
    modelOutputPrice.set({ model }, p.outputCostPerToken * 1_000_000);
    modelCacheReadPrice.set({ model }, p.cacheReadCostPerToken * 1_000_000);
    modelCacheCreationPrice.set({ model }, p.cacheCreationCostPerToken * 1_000_000);
  }

  pricingLastUpdated.set(Date.now() / 1000);
}

// Record usage metrics from an entry
export function recordUsageMetrics(
  device: string,
  model: string | null,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  costUSD: number,
  cacheSavingsUSD: number,
  project: string = "unknown",
  sessionId: string = "unknown"
) {
  const modelLabel = model ?? "unknown";
  const totals = getDeviceTotals(device);

  // Token metrics
  tokensTotal.inc({ device, type: "input", model: modelLabel, project }, inputTokens);
  tokensTotal.inc({ device, type: "output", model: modelLabel, project }, outputTokens);
  tokensTotal.inc({ device, type: "cache_creation", model: modelLabel, project }, cacheCreationTokens);
  tokensTotal.inc({ device, type: "cache_read", model: modelLabel, project }, cacheReadTokens);

  // Token distribution histograms
  tokenRateHistogram.observe({ device, type: "input", model: modelLabel }, inputTokens);
  tokenRateHistogram.observe({ device, type: "output", model: modelLabel }, outputTokens);

  // Update running token totals
  totals.tokens["input"] = (totals.tokens["input"] ?? 0) + inputTokens;
  totals.tokens["output"] = (totals.tokens["output"] ?? 0) + outputTokens;
  totals.tokens["cache_read"] = (totals.tokens["cache_read"] ?? 0) + cacheReadTokens;
  totals.tokens["cache_creation"] = (totals.tokens["cache_creation"] ?? 0) + cacheCreationTokens;

  // Update token gauges
  totalTokensGauge.set({ device, type: "input" }, totals.tokens["input"]!);
  totalTokensGauge.set({ device, type: "output" }, totals.tokens["output"]!);
  totalTokensGauge.set({ device, type: "cache_read" }, totals.tokens["cache_read"]!);
  totalTokensGauge.set({ device, type: "cache_creation" }, totals.tokens["cache_creation"]!);

  // Input/output ratio
  if (outputTokens > 0) {
    inputOutputRatio.set({ device, model: modelLabel }, inputTokens / outputTokens);
  }

  // Cost metrics
  costTotal.inc({ device, model: modelLabel, project }, costUSD);
  costPerRequestHistogram.observe({ device, model: modelLabel }, costUSD);
  totals.cost += costUSD;
  totalCostGauge.set({ device }, totals.cost);

  // Cache metrics
  cacheSavingsTotal.inc({ device, model: modelLabel }, cacheSavingsUSD);
  cacheTokensTotal.inc({ device, model: modelLabel, operation: "read" }, cacheReadTokens);
  cacheTokensTotal.inc({ device, model: modelLabel, operation: "creation" }, cacheCreationTokens);

  // Cache hit ratio
  const totalInputContext = inputTokens + cacheCreationTokens + cacheReadTokens;
  if (totalInputContext > 0) {
    cacheHitRatio.set({ device, model: modelLabel }, cacheReadTokens / totalInputContext);
  }

  // Cache efficiency (savings / (cost + savings))
  const totalPotentialCost = costUSD + cacheSavingsUSD;
  if (totalPotentialCost > 0) {
    cacheEfficiency.set({ device }, (cacheSavingsUSD / totalPotentialCost) * 100);
  }

  // Request metrics
  requestsTotal.inc({ device, model: modelLabel, type: "assistant", project });

  // Model usage
  modelUsage.inc({ model: modelLabel, device });

  // Project activity
  projectActivity.set({ project, device }, Date.now() / 1000);
}

// Update device status
export function updateDeviceStatus(device: string, online: boolean, hostname: string = "unknown") {
  deviceOnline.set({ device, hostname }, online ? 1 : 0);
  if (online) {
    deviceLastSeen.set({ device, hostname }, Date.now() / 1000);
  }
}

// Record session start
export function recordSessionStart(device: string, sessionId: string, project: string, model: string = "unknown") {
  const totals = getDeviceTotals(device);
  totals.sessions++;

  sessionsTotal.inc({ device, project });
  activeSessions.inc({ device });
  deviceActiveSessions.inc({ device });
  totalSessionsGauge.set({ device }, totals.sessions);

  sessionInfo.set({ device, session_id: sessionId, project, model }, 1);
  sessionStartTime.set({ device, session_id: sessionId, project }, Date.now() / 1000);
}

// Record session end
export function recordSessionEnd(
  device: string,
  sessionId: string,
  project: string,
  durationSeconds: number,
  totalCost: number,
  totalTokens: number,
  requestCount: number
) {
  activeSessions.dec({ device });
  deviceActiveSessions.dec({ device });

  sessionDuration.observe({ device, project }, durationSeconds);
  costPerSession.observe({ device, project }, totalCost);
  tokensPerSession.observe({ device }, totalTokens);
  requestsPerSession.observe({ device }, requestCount);

  // Mark session as inactive
  sessionInfo.set({ device, session_id: sessionId, project, model: "unknown" }, 0);
}

// Update project metrics
export function updateProjectMetrics(project: string, sessionCount: number, totalCost: number) {
  projectSessionCount.set({ project }, sessionCount);
  projectTotalCost.set({ project }, totalCost);
}
