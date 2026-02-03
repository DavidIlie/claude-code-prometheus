import type { ModelPricing } from "@davidilie/claude-code-prometheus-shared";
import { db } from "~/server/db";

// Default pricing for Claude models (per token) - used as fallback
// These will be replaced by auto-fetched pricing from LiteLLM
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude Opus 4.5
  "claude-opus-4-5-20251101": {
    inputCostPerToken: 0.000015,
    outputCostPerToken: 0.000075,
    cacheCreationCostPerToken: 0.00001875,
    cacheReadCostPerToken: 0.0000015,
  },
  // Claude Opus 4
  "claude-opus-4-20250514": {
    inputCostPerToken: 0.000015,
    outputCostPerToken: 0.000075,
    cacheCreationCostPerToken: 0.00001875,
    cacheReadCostPerToken: 0.0000015,
  },
  // Claude Sonnet 4
  "claude-sonnet-4-20250514": {
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015,
    cacheCreationCostPerToken: 0.00000375,
    cacheReadCostPerToken: 0.0000003,
  },
  // Claude 3.5 Sonnet
  "claude-3-5-sonnet-20241022": {
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015,
    cacheCreationCostPerToken: 0.00000375,
    cacheReadCostPerToken: 0.0000003,
  },
  // Claude 3.5 Haiku
  "claude-3-5-haiku-20241022": {
    inputCostPerToken: 0.0000008,
    outputCostPerToken: 0.000004,
    cacheCreationCostPerToken: 0.000001,
    cacheReadCostPerToken: 0.00000008,
  },
  // Claude 3 Opus
  "claude-3-opus-20240229": {
    inputCostPerToken: 0.000015,
    outputCostPerToken: 0.000075,
    cacheCreationCostPerToken: 0.00001875,
    cacheReadCostPerToken: 0.0000015,
  },
  // Claude 3 Sonnet
  "claude-3-sonnet-20240229": {
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015,
    cacheCreationCostPerToken: 0.00000375,
    cacheReadCostPerToken: 0.0000003,
  },
  // Claude 3 Haiku
  "claude-3-haiku-20240307": {
    inputCostPerToken: 0.00000025,
    outputCostPerToken: 0.00000125,
    cacheCreationCostPerToken: 0.0000003,
    cacheReadCostPerToken: 0.00000003,
  },
};

// Fallback pricing for unknown models (use Sonnet pricing as reasonable default)
export const FALLBACK_PRICING: ModelPricing = {
  inputCostPerToken: 0.000003,
  outputCostPerToken: 0.000015,
  cacheCreationCostPerToken: 0.00000375,
  cacheReadCostPerToken: 0.0000003,
};

// In-memory cache for pricing to avoid DB lookups on every request
let pricingCache: Map<string, ModelPricing> = new Map();
let cacheLastUpdated = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function refreshPricingCache(): Promise<void> {
  try {
    const dbPricing = await db.modelPricing.findMany();

    pricingCache = new Map();

    // Add DB pricing
    for (const p of dbPricing) {
      pricingCache.set(p.id, {
        inputCostPerToken: p.inputCostPerToken,
        outputCostPerToken: p.outputCostPerToken,
        cacheCreationCostPerToken: p.cacheCreationCostPerToken,
        cacheReadCostPerToken: p.cacheReadCostPerToken,
      });
    }

    // Add default pricing for models not in DB
    for (const [model, pricing] of Object.entries(DEFAULT_MODEL_PRICING)) {
      if (!pricingCache.has(model)) {
        pricingCache.set(model, pricing);
      }
    }

    cacheLastUpdated = Date.now();
  } catch (error) {
    console.error("Error refreshing pricing cache:", error);
    // Fall back to defaults if DB error
    pricingCache = new Map(Object.entries(DEFAULT_MODEL_PRICING));
    cacheLastUpdated = Date.now();
  }
}

export async function getPricingAsync(
  model: string | null | undefined
): Promise<ModelPricing> {
  if (!model) return FALLBACK_PRICING;

  // Refresh cache if stale
  if (Date.now() - cacheLastUpdated > CACHE_TTL) {
    await refreshPricingCache();
  }

  // Try exact match
  const exactMatch = pricingCache.get(model);
  if (exactMatch) return exactMatch;

  // Try partial match (e.g., model name without date suffix)
  for (const [cachedModel, pricing] of pricingCache) {
    if (model.includes(cachedModel) || cachedModel.includes(model)) {
      return pricing;
    }
  }

  return FALLBACK_PRICING;
}

// Synchronous version using defaults (for when async not possible)
export function getPricing(model: string | null | undefined): ModelPricing {
  if (!model) return FALLBACK_PRICING;

  // Check cache first (may be stale, but better than nothing)
  const cached = pricingCache.get(model);
  if (cached) return cached;

  // Try partial match in cache
  for (const [cachedModel, pricing] of pricingCache) {
    if (model.includes(cachedModel) || cachedModel.includes(model)) {
      return pricing;
    }
  }

  // Fall back to static defaults
  return DEFAULT_MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

export function calculateCost(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number
): number {
  const pricing = getPricing(model);

  // Input tokens that are not cache reads
  const regularInputTokens = Math.max(0, inputTokens - cacheReadTokens);

  return (
    regularInputTokens * pricing.inputCostPerToken +
    outputTokens * pricing.outputCostPerToken +
    cacheCreationTokens * pricing.cacheCreationCostPerToken +
    cacheReadTokens * pricing.cacheReadCostPerToken
  );
}

// Calculate savings from cache hits compared to regular input pricing
export function calculateCacheSavings(
  model: string | null | undefined,
  cacheReadTokens: number
): number {
  const pricing = getPricing(model);
  // Savings = (regular input cost - cache read cost) * tokens
  return (
    cacheReadTokens *
    (pricing.inputCostPerToken - pricing.cacheReadCostPerToken)
  );
}

// Initialize cache on module load
refreshPricingCache().catch(console.error);
