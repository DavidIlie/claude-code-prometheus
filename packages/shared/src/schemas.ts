import { z } from "zod";

// Usage entry schema (for API requests)
export const usageEntrySchema = z.object({
  sessionId: z.string(),
  project: z.string(),
  timestamp: z.string().datetime(),
  type: z.enum(["user", "assistant", "summary"]),
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  cacheCreationTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  costUSD: z.number().nonnegative().optional(),
});

// Device schema
export const deviceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  hostname: z.string(),
  apiKey: z.string().optional(),
  lastSeen: z.date(),
  createdAt: z.date(),
});

// Session schema
export const sessionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  deviceId: z.string(),
  project: z.string(),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
});

// Usage push request from daemon
export const usagePushRequestSchema = z.object({
  deviceApiKey: z.string(),
  entries: z.array(usageEntrySchema),
});

// Device registration request
export const deviceRegistrationSchema = z.object({
  name: z.string().min(1, "Device name is required"),
  hostname: z.string().min(1, "Hostname is required"),
});

// Model pricing schema
export const modelPricingSchema = z.object({
  inputCostPerToken: z.number().nonnegative(),
  outputCostPerToken: z.number().nonnegative(),
  cacheCreationCostPerToken: z.number().nonnegative(),
  cacheReadCostPerToken: z.number().nonnegative(),
});

// Settings schema
export const settingsSchema = z.object({
  id: z.string().default("settings"),
  serverName: z.string().min(1),
  serverUrl: z.string().url(),
  timezone: z.string().default("UTC"),
  currency: z.enum(["USD", "EUR", "GBP"]).default("USD"),
  enablePrometheus: z.boolean().default(true),
  prometheusPort: z.number().int().min(1).max(65535).default(9090),
  retentionDays: z.number().int().min(1).default(90),
  autoUpdatePricing: z.boolean().default(true),
  setupCompleted: z.boolean().default(false),
});

// User schema
export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(1),
  email: z.string().email().optional().nullable(),
  passwordHash: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Setup wizard schemas
export const setupAdminSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email().optional().or(z.literal("")),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export const setupServerSchema = z.object({
  serverName: z.string().min(1, "Server name is required"),
  serverUrl: z.string().url("Must be a valid URL"),
  timezone: z.string(),
  currency: z.enum(["USD", "EUR", "GBP"]),
});

export const setupOptionalSchema = z.object({
  enablePrometheus: z.boolean(),
  prometheusPort: z.number().int().min(1).max(65535),
  retentionDays: z.number().int().min(1),
  autoUpdatePricing: z.boolean(),
});

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Query filter schemas
export const dateRangeSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
});

export const usageQuerySchema = z.object({
  deviceId: z.string().optional(),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  dateRange: dateRangeSchema.optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
});
