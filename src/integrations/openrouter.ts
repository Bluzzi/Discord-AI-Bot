import type { GetCreditsData, GetCurrentKeyData } from "@openrouter/sdk/models/operations";
import type { LanguageModelUsage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import dedent from "dedent";

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

// ── Management API ────────────────────────────────────────────────────────────────────────────────
// Key/credits state and usage pricing, from the OpenRouter SDK (management endpoints, no model call):

// The quota CRON refreshes every minute: the SDK default retry policy (5XX with exponential backoff, up to 1h) must stay disabled to fail fast.
const openRouterSdk = new OpenRouter({
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

// ── Quota ─────────────────────────────────────────────────────────────────────────────────────────
// State shared across triggers: true means the bot cannot make AI calls anymore.
// Refreshed by the `openrouter-quota` CRON (management endpoints) and fed by the AI provider fetch wrapper (real call errors).

// Delay applied when OpenRouter returns 402: credits never refill by themselves, top-up is detected later:
const INSUFFICIENT_CREDITS_DELAY_MS = 60 * 60 * 1000;
// Delay applied when OpenRouter returns 429 without any reset information (short retry window):
const UNKNOWN_RATE_LIMIT_DELAY_MS = 2 * 60 * 1000;

const usesFreeModel = env.OPENROUTER_MODEL.endsWith(":free") || env.OPENROUTER_MODEL === "openrouter/free";

const quotaState = {
  /** Recomputed at each refresh: no usable credit left for the key or the account */
  creditsExhausted: false,
  /** Recomputed at each refresh: the configured model is subject to the exhausted free daily quota */
  freeDailyExhausted: false,
  /** Timestamp until which OpenRouter rate-limited (429) real AI calls */
  rateLimitedUntilTimestamp: 0,
  /** Timestamp until which OpenRouter refused real AI calls with 402 (insufficient credits) */
  insufficientCreditsUntilTimestamp: 0,
};

const parseEpochTimestamp = (value: string | null): number | undefined => {
  if (value === null) return undefined;

  const timestamp = Number(value);

  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const isExhausted = (): boolean => {
  const now = Date.now();

  return quotaState.creditsExhausted
    || quotaState.freeDailyExhausted
    || quotaState.rateLimitedUntilTimestamp > now
    || quotaState.insufficientCreditsUntilTimestamp > now;
};

const formatQuotaDetails = (keyData: GetCurrentKeyData, creditsData: GetCreditsData | undefined): string => {
  const keyCredits = keyData.limitRemaining === null ? "no key credit limit" : `${String(keyData.limitRemaining)} credits remaining under the key limit`;
  const accountCredits = creditsData === undefined ? "credit balance unknown (management key required)" : `${(creditsData.totalCredits - creditsData.totalUsage).toFixed(9)} credits remaining (${String(creditsData.totalUsage)}/${String(creditsData.totalCredits)} credits used)`;

  return dedent`
    - [KEY] ${keyData.label} | ${keyCredits}
    - [ACCOUNT] ${accountCredits}
    - [FREE DAILY] ${String(keyData.freeModelDailyRequests.used)}/${String(keyData.freeModelDailyRequests.limit)} requests (resets at UTC midnight)
  `;
};

const refresh = async (): Promise<void> => {
  const wasExhausted = isExhausted();

  // Fetch the key and account limits in parallel:
  const [{ data: keyData }, creditsResponse] = await Promise.all([
    openRouterSdk.apiKeys.getCurrentKeyMetadata(),
    (async () => {
      try {
        return await openRouterSdk.credits.getCredits();
      }
      catch (error) {
        // Treat the account balance as unknown when the key cannot read it:
        if (error instanceof OpenRouterError && error.statusCode === 403) return undefined;
        throw error;
      }
    })(),
  ]);
  const creditsData = creditsResponse?.data;

  // Key credit limit reached (limitRemaining is null when the key has no limit):
  const keyLimitReached = keyData.limitRemaining !== null && keyData.limitRemaining <= 0;

  // Account balance empty (totalCredits > 0: a never-funded account has nothing to exhaust, its free models still work):
  const accountBalanceEmpty = creditsData !== undefined && creditsData.totalCredits > 0 && creditsData.totalUsage >= creditsData.totalCredits;

  quotaState.creditsExhausted = keyLimitReached || accountBalanceEmpty;
  quotaState.freeDailyExhausted = usesFreeModel && keyData.freeModelDailyRequests.remaining <= 0;

  // Log only transitions into or out of exhaustion:
  const nowExhausted = isExhausted();

  if (!wasExhausted && nowExhausted) {
    logger.warn(`OpenRouter quota exhausted:\n${formatQuotaDetails(keyData, creditsData)}`);
  }

  if (wasExhausted && !nowExhausted) {
    logger.info(`OpenRouter quota recovered:\n${formatQuotaDetails(keyData, creditsData)}`);
  }
};

const reportFailure = (statusCode: number, rateLimitResetHeader: string | null): void => {
  const now = Date.now();

  // 402: OpenRouter refused a real AI call because no credits are left:
  if (statusCode === 402) {
    quotaState.insufficientCreditsUntilTimestamp = Math.max(quotaState.insufficientCreditsUntilTimestamp, now + INSUFFICIENT_CREDITS_DELAY_MS);

    logger.warn("OpenRouter 402 (insufficient credits)");
    return;
  }

  // 429: OpenRouter rate-limited a real AI call, trust the reset timestamp (epoch ms) when OpenRouter provides one:
  if (statusCode === 429) {
    const resetTimestamp = parseEpochTimestamp(rateLimitResetHeader);

    const retryDelayMs = resetTimestamp !== undefined && resetTimestamp > now ? resetTimestamp - now : UNKNOWN_RATE_LIMIT_DELAY_MS;

    quotaState.rateLimitedUntilTimestamp = Math.max(quotaState.rateLimitedUntilTimestamp, now + retryDelayMs);

    logger.warn(`OpenRouter 429 rate limit (retry in ${String(retryDelayMs)} ms)`);
  }
};

export const openRouterQuota = {
  /** True when the configured model is blocked by a credit or rate limit */
  isExhausted,
  /** Re-check the quota state from OpenRouter management endpoints (no model call involved, safe to run every minute) */
  refresh,
};

// ── Model ─────────────────────────────────────────────────────────────────────────────────────────

// Wrap fetch to report quota failures (429/402) raised by real AI calls, without consuming any extra request:
const quotaAwareFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status === 429 || response.status === 402) {
    reportFailure(response.status, response.headers.get("x-ratelimit-reset"));
  }

  return response;
};

const openRouterProvider = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  fetch: quotaAwareFetch,
});

export const aiModel = openRouterProvider(env.OPENROUTER_MODEL);
