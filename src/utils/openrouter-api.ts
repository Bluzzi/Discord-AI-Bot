import type { GetCreditsData, GetCurrentKeyData } from "@openrouter/sdk/models/operations";
import type { LanguageModelUsage } from "ai";
import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import { env } from "#/utils/env";

/** Current API key information (usage, credit limit, free models daily quota) */
export type OpenRouterKeyData = GetCurrentKeyData;

/** Account credits balance (total credits purchased and used) */
export type OpenRouterCreditsData = GetCreditsData;

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

// The quota CRON refreshes every minute: the SDK default retry policy (5XX with exponential backoff, up to 1h) must stay disabled to fail fast.
const openRouter = new OpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  retryConfig: { strategy: "none" },
});

const pricingByModelId = new Map<string, OpenRouterModelPricing>();

const parsePrice = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;

  const price = Number(value);

  return Number.isFinite(price) ? price : undefined;
};

const fetchModelPricing = async (): Promise<void> => {
  const pages = await openRouter.models.list();

  pricingByModelId.clear();

  for await (const page of pages) {
    for (const model of page.result.data) {
      const prompt = parsePrice(model.pricing.prompt);
      const completion = parsePrice(model.pricing.completion);

      if (prompt === undefined || completion === undefined) continue;

      pricingByModelId.set(model.id, {
        prompt,
        completion,
        inputCacheRead: parsePrice(model.pricing.inputCacheRead),
        inputCacheWrite: parsePrice(model.pricing.inputCacheWrite),
      });
    }
  }
};

const fetchKey = async (): Promise<OpenRouterKeyData> => {
  const response = await openRouter.apiKeys.getCurrentKeyMetadata();

  return response.data;
};

const fetchCredits = async (): Promise<OpenRouterCreditsData | undefined> => {
  try {
    const response = await openRouter.credits.getCredits();

    return response.data;
  }
  catch (error) {
    // Endpoint reserved to management keys: undefined is expected when using a plain inference key:
    if (error instanceof OpenRouterError && error.statusCode === 403) return undefined;

    throw error;
  }
};

export const openRouterApi = {
  /** Fetch the current API key state (usage, credit limit, free models daily quota) from OpenRouter */
  fetchKey,
  /** Fetch the account credits balance (total credits and usage) from OpenRouter, or undefined when the key is not allowed to */
  fetchCredits,
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
