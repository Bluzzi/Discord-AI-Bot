import type { GetCreditsData, GetCurrentKeyData } from "@openrouter/sdk/models/operations";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import { openRouterSdk } from "#/integrations/openrouter-sdk";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import dedent from "dedent";

// Recheck insufficient credits after an hour:
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
  // Snapshot quota before fetching the key and account limits in parallel:
  const wasExhausted = isExhausted();
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

export const reportOpenRouterFailure = (statusCode: number, rateLimitResetHeader: string | null): void => {
  const now = Date.now();

  // 402: OpenRouter refused a real AI call because no credits are left:
  if (statusCode === 402) {
    quotaState.insufficientCreditsUntilTimestamp = Math.max(quotaState.insufficientCreditsUntilTimestamp, now + INSUFFICIENT_CREDITS_DELAY_MS);

    logger.warn("OpenRouter 402 (insufficient credits)");
    return;
  }

  // 429: OpenRouter rate-limited a real AI call, trust the reset timestamp (epoch ms) when OpenRouter provides one:
  if (statusCode !== 429) return;
  const resetTimestamp = parseEpochTimestamp(rateLimitResetHeader);
  const retryDelayMs = resetTimestamp !== undefined && resetTimestamp > now ? resetTimestamp - now : UNKNOWN_RATE_LIMIT_DELAY_MS;
  quotaState.rateLimitedUntilTimestamp = Math.max(quotaState.rateLimitedUntilTimestamp, now + retryDelayMs);
  logger.warn(`OpenRouter 429 rate limit (retry in ${String(retryDelayMs)} ms)`);
};

export const openRouterQuota = {
  /** True when the configured model is blocked by a credit or rate limit */
  isExhausted,
  /** Re-check the quota state from OpenRouter management endpoints (no model call involved, safe to run every minute) */
  refresh,
};
