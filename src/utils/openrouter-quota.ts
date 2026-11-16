import type { OpenRouterCreditsData, OpenRouterKeyData } from "#/utils/openrouter-api";
import { logger } from "#/utils/logger";
import { openRouterApi } from "#/utils/openrouter-api";
import dedent from "dedent";

// OpenRouter quota state shared across triggers: true means the bot cannot make AI calls anymore.
// Refreshed by the `openrouter-quota` CRON (management endpoints) and fed by the AI provider fetch wrapper (real call errors).

// Delay applied when OpenRouter returns 402: credits never refill by themselves, top-up is detected later:
const INSUFFICIENT_CREDITS_DELAY_MS = 60 * 60 * 1000;
// Delay applied when OpenRouter returns 429 without any reset information (short retry window):
const UNKNOWN_RATE_LIMIT_DELAY_MS = 2 * 60 * 1000;

const state = {
  /** Recomputed at each refresh: no usable credit left for the key or the account */
  creditsExhausted: false,
  /** Recomputed at each refresh: free models daily quota reached (resets at UTC midnight) */
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

  return state.creditsExhausted
    || state.freeDailyExhausted
    || state.rateLimitedUntilTimestamp > now
    || state.insufficientCreditsUntilTimestamp > now;
};

const formatQuotaDetails = (keyData: OpenRouterKeyData, creditsData: OpenRouterCreditsData | undefined): string => dedent`
  - [KEY] ${keyData.label} | limit remaining: ${keyData.limit_remaining === null ? "unlimited" : String(keyData.limit_remaining)}
  - [FREE DAILY] ${keyData.free_model_daily_requests === undefined ? "unknown" : `${String(keyData.free_model_daily_requests.used)}/${String(keyData.free_model_daily_requests.limit)} requests (resets at UTC midnight)`}
  - [ACCOUNT] ${creditsData === undefined ? "balance unknown (management key required)" : `${String(creditsData.total_usage)}/${String(creditsData.total_credits)} credits used`}
`;

const refresh = async (): Promise<void> => {
  const wasExhausted = isExhausted();

  const [keyData, creditsData] = await Promise.all([
    openRouterApi.fetchKey(),
    openRouterApi.fetchCredits(),
  ]);

  // Key credit limit reached (limit_remaining is null when the key has no limit):
  const keyLimitReached = keyData.limit_remaining !== null && keyData.limit_remaining <= 0;

  // Account balance empty (total_credits > 0: a never-funded account has nothing to exhaust, its free models still work):
  const accountBalanceEmpty = creditsData !== undefined && creditsData.total_credits > 0 && creditsData.total_usage >= creditsData.total_credits;

  // Free models daily quota reached (resets at UTC midnight):
  const freeDailyLimitReached = keyData.free_model_daily_requests !== undefined && keyData.free_model_daily_requests.remaining <= 0;

  state.creditsExhausted = keyLimitReached || accountBalanceEmpty;
  state.freeDailyExhausted = freeDailyLimitReached;

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
    state.insufficientCreditsUntilTimestamp = Math.max(state.insufficientCreditsUntilTimestamp, now + INSUFFICIENT_CREDITS_DELAY_MS);

    logger.warn("OpenRouter 402 (insufficient credits)");
    return;
  }

  // 429: OpenRouter rate-limited a real AI call, trust the reset timestamp (epoch ms) when OpenRouter provides one:
  if (statusCode === 429) {
    const resetTimestamp = parseEpochTimestamp(rateLimitResetHeader);

    const retryDelayMs = resetTimestamp !== undefined && resetTimestamp > now ? resetTimestamp - now : UNKNOWN_RATE_LIMIT_DELAY_MS;

    state.rateLimitedUntilTimestamp = Math.max(state.rateLimitedUntilTimestamp, now + retryDelayMs);

    logger.warn(`OpenRouter 429 rate limit (retry in ${String(retryDelayMs)} ms)`);
  }
};

export const openRouterQuota = {
  /** True when OpenRouter cannot serve AI calls anymore (no credits or free models daily quota reached) */
  isExhausted,
  /** Re-check the quota state from OpenRouter management endpoints (no model call involved, safe to run every minute) */
  refresh,
  /** Report a quota failure raised by a real AI call (429 rate limit or 402 insufficient credits) */
  reportFailure,
};
