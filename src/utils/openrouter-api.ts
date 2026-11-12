import type { LanguageModelUsage } from "ai";

type OpenRouterModelPricing = {
  /** Price per input token, in USD */
  prompt: number;
  /** Price per output token, in USD */
  completion: number;
  /** Price per cache-read input token, in USD (undefined when unknown) */
  inputCacheRead: number | undefined;
  /** Price per cache-write input token, in USD (undefined when unknown) */
  inputCacheWrite: number | undefined;
};

type OpenRouterModelsResponse = {
  data: {
    id: string;
    pricing?: {
      prompt?: string;
      completion?: string;
      input_cache_read?: string;
      input_cache_write?: string;
    };
  }[];
};

const openRouterModelsUrl = "https://openrouter.ai/api/v1/models";

const pricingByModelId = new Map<string, OpenRouterModelPricing>();

const parsePrice = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;

  const price = Number(value);

  return Number.isFinite(price) ? price : undefined;
};

const fetchModelPricing = async (): Promise<void> => {
  const response = await fetch(openRouterModelsUrl);

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${String(response.status)} ${response.statusText}`);
  }

  const body = await response.json() as OpenRouterModelsResponse;

  pricingByModelId.clear();

  for (const model of body.data) {
    const prompt = parsePrice(model.pricing?.prompt);
    const completion = parsePrice(model.pricing?.completion);

    if (prompt === undefined || completion === undefined) continue;

    pricingByModelId.set(model.id, {
      prompt,
      completion,
      inputCacheRead: parsePrice(model.pricing?.input_cache_read),
      inputCacheWrite: parsePrice(model.pricing?.input_cache_write),
    });
  }
};

export const openRouterApi = {
  /** Compute input and output prices (USD) from OpenRouter public pricing (fetched once and cached), or undefined when the model pricing is unknown */
  computeUsagePrices: async (modelId: string, usage: LanguageModelUsage): Promise<{ inputPrice: number | undefined; outputPrice: number | undefined }> => {
    if (pricingByModelId.size === 0) {
      await fetchModelPricing();
    }

    const pricing = pricingByModelId.get(modelId);

    if (pricing === undefined) {
      return { inputPrice: undefined, outputPrice: undefined };
    }

    // Cache-write tokens are part of the input tokens but priced separately:
    const cacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens ?? 0;
    const cacheReadTokens = usage.inputTokenDetails.cacheReadTokens ?? 0;
    const uncachedTokens = Math.max((usage.inputTokenDetails.noCacheTokens ?? 0) - cacheWriteTokens, 0);

    const inputPrice = uncachedTokens * pricing.prompt
      + cacheWriteTokens * (pricing.inputCacheWrite ?? pricing.prompt)
      + cacheReadTokens * (pricing.inputCacheRead ?? pricing.prompt);

    const outputPrice = (usage.outputTokens ?? 0) * pricing.completion;

    return { inputPrice, outputPrice };
  },
};
