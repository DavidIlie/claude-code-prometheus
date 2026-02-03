import { db } from "~/server/db";
import { pricingLastUpdated, modelInputPrice, modelOutputPrice } from "./metrics";

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

interface LiteLLMPricing {
  [model: string]: {
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    cache_creation_input_token_cost?: number;
    cache_read_input_token_cost?: number;
    max_tokens?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    mode?: string;
    litellm_provider?: string;
  };
}

// Models we care about (Claude models)
const CLAUDE_MODEL_PATTERNS = [
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
  "claude-3.5",
  "claude-3-5",
];

function isClaudeModel(modelName: string): boolean {
  const lowerName = modelName.toLowerCase();
  return CLAUDE_MODEL_PATTERNS.some((pattern) =>
    lowerName.includes(pattern.toLowerCase())
  );
}

export async function fetchAndUpdatePricing(): Promise<{
  success: boolean;
  modelsUpdated: number;
  error?: string;
}> {
  try {
    console.log("Fetching pricing from LiteLLM...");

    const response = await fetch(LITELLM_PRICING_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "claude-code-prometheus/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const pricing = (await response.json()) as LiteLLMPricing;

    let modelsUpdated = 0;

    for (const [modelName, modelPricing] of Object.entries(pricing)) {
      // Only process Claude models
      if (!isClaudeModel(modelName)) continue;

      // Skip if no pricing data
      if (
        !modelPricing.input_cost_per_token ||
        !modelPricing.output_cost_per_token
      ) {
        continue;
      }

      // Calculate cache costs (default to 1.25x input for creation, 0.1x input for read)
      const inputCost = modelPricing.input_cost_per_token;
      const outputCost = modelPricing.output_cost_per_token;
      const cacheCreationCost =
        modelPricing.cache_creation_input_token_cost ?? inputCost * 1.25;
      const cacheReadCost =
        modelPricing.cache_read_input_token_cost ?? inputCost * 0.1;

      // Upsert into database
      await db.modelPricing.upsert({
        where: { id: modelName },
        update: {
          inputCostPerToken: inputCost,
          outputCostPerToken: outputCost,
          cacheCreationCostPerToken: cacheCreationCost,
          cacheReadCostPerToken: cacheReadCost,
        },
        create: {
          id: modelName,
          inputCostPerToken: inputCost,
          outputCostPerToken: outputCost,
          cacheCreationCostPerToken: cacheCreationCost,
          cacheReadCostPerToken: cacheReadCost,
        },
      });

      // Update Prometheus metrics
      modelInputPrice.set({ model: modelName }, inputCost * 1_000_000);
      modelOutputPrice.set({ model: modelName }, outputCost * 1_000_000);

      modelsUpdated++;
    }

    // Update the last updated timestamp
    pricingLastUpdated.set(Date.now() / 1000);

    console.log(`Updated pricing for ${modelsUpdated} Claude models`);

    return { success: true, modelsUpdated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to fetch pricing:", errorMessage);
    return { success: false, modelsUpdated: 0, error: errorMessage };
  }
}

// Get pricing from database, with fallback to static defaults
export async function getModelPricing(model: string): Promise<{
  inputCostPerToken: number;
  outputCostPerToken: number;
  cacheCreationCostPerToken: number;
  cacheReadCostPerToken: number;
}> {
  // Try exact match first
  let pricing = await db.modelPricing.findUnique({
    where: { id: model },
  });

  // Try partial match (e.g., "claude-3-opus-20240229" matches "claude-3-opus")
  if (!pricing) {
    const allPricing = await db.modelPricing.findMany();
    pricing = allPricing.find(
      (p) => model.includes(p.id) || p.id.includes(model)
    ) ?? null;
  }

  if (pricing) {
    return {
      inputCostPerToken: pricing.inputCostPerToken,
      outputCostPerToken: pricing.outputCostPerToken,
      cacheCreationCostPerToken: pricing.cacheCreationCostPerToken,
      cacheReadCostPerToken: pricing.cacheReadCostPerToken,
    };
  }

  // Fallback to Sonnet-like pricing
  return {
    inputCostPerToken: 0.000003,
    outputCostPerToken: 0.000015,
    cacheCreationCostPerToken: 0.00000375,
    cacheReadCostPerToken: 0.0000003,
  };
}
