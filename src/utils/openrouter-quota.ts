import { logger } from "#/utils/logger";

// Recheck insufficient credits after an hour:
const INSUFFICIENT_CREDITS_DELAY_MS = 60 * 60 * 1000;
// Delay applied when OpenRouter returns 429 without any reset information (short retry window):
const UNKNOWN_RATE_LIMIT_DELAY_MS = 2 * 60 * 1000;

export const quotaState = {
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
};
