import type { z } from "zod";
import type {
  usageEntrySchema,
  deviceSchema,
  sessionSchema,
  usagePushRequestSchema,
  deviceRegistrationSchema,
  modelPricingSchema,
  settingsSchema,
  userSchema,
} from "./schemas.js";

// Claude Code JSONL entry types
export interface ClaudeCodeMessage {
  role: string;
  content: string;
  usage?: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    service_tier?: string;
  };
}

export interface ClaudeCodeEntry {
  sessionId: string;
  uuid: string;
  timestamp: string;
  type: "user" | "assistant" | "summary";
  message: ClaudeCodeMessage;
  costUSD?: number;
  model?: string;
}

// Inferred types from Zod schemas
export type UsageEntry = z.infer<typeof usageEntrySchema>;
export type Device = z.infer<typeof deviceSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type UsagePushRequest = z.infer<typeof usagePushRequestSchema>;
export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;
export type ModelPricing = z.infer<typeof modelPricingSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type User = z.infer<typeof userSchema>;

// Prometheus metric types
export interface MetricLabels {
  device: string;
  model?: string;
  type?: "input" | "output" | "cache_read" | "cache_creation";
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UsagePushResponse {
  success: boolean;
  processed: number;
}

export interface DeviceRegistrationResponse {
  deviceId: string;
  apiKey: string;
}

// Stats types for dashboard
export interface UsageStats {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  sessionsCount: number;
  activeDevices: number;
}

export interface CostBreakdown {
  model: string;
  costUSD: number;
  percentage: number;
}

export interface TokenBreakdown {
  type: "input" | "output" | "cache_creation" | "cache_read";
  count: number;
  percentage: number;
}

// Daemon state types
export interface DaemonState {
  filePositions: Record<string, number>;
  lastSync: string;
}

export interface DaemonConfig {
  serverUrl: string;
  deviceApiKey: string;
  claudeDir: string;
  pushIntervalMs: number;
}

// Supported models
export const SUPPORTED_MODELS = [
  "claude-opus-4-20250514",
  "claude-opus-4-5-20251101",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-5-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];
