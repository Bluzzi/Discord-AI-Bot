import type { LanguageModelUsage } from "ai";
import { openRouterSdk } from "#/integrations/openrouter.client";

type OpenRouterModelPricing = {
  acceptsImages: boolean;
  /** Price per input token, in USD */
  prompt: number;
  /** Price per output token, in USD */
  completion: number;
  /** Price per cache-read input token, in USD (undefined when unknown) */
  inputCacheRead: number | undefined;
  /** Price per cache-write input token, in USD (undefined when unknown) */
  inputCacheWrite: number | undefined;
};

const pricingByModelId = new Map<string, OpenRouterModelPricing>();

const parsePrice = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;

  const price = Number(value);

  return Number.isFinite(price) ? price : undefined;
};

const fetchModelPricing = async (): Promise<void> => {
  // Retrieve model metadata and rebuild the pricing cache:
  const pages = await openRouterSdk.models.list();

  pricingByModelId.clear();

  for await (const page of pages) {
    for (const model of page.result.data) {
      const prompt = parsePrice(model.pricing.prompt);
      const completion = parsePrice(model.pricing.completion);

      if (prompt === undefined || completion === undefined) continue;

      pricingByModelId.set(model.id, {
        acceptsImages: model.architecture.inputModalities.includes("image"),
        prompt,
        completion,
        inputCacheRead: parsePrice(model.pricing.inputCacheRead),
        inputCacheWrite: parsePrice(model.pricing.inputCacheWrite),
      });
    }
  }
};

export const openRouterApi = {
  acceptsImages: async (modelId: string): Promise<boolean> => {
    if (pricingByModelId.size === 0) await fetchModelPricing();
    return pricingByModelId.get(modelId)?.acceptsImages ?? true;
  },
  /** Compute input and output prices (USD) from OpenRouter public pricing (fetched once and cached), or undefined when the model pricing is unknown */
  computeUsagePrices: async (modelId: string, usage: LanguageModelUsage): Promise<{ inputPrice: number | undefined; outputPrice: number | undefined }> => {
    if (pricingByModelId.size === 0) {
      await fetchModelPricing();
    }

    // Use the pricing for the model reported by the provider:
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
