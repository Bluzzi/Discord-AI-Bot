import { OpenRouterError } from "@openrouter/sdk/models/errors";
import { openRouterSdk } from "#/integrations/openrouter.client";
import { openRouterQuota, quotaState } from "#/integrations/openrouter.helper-quota";
import { env } from "#/utils/env";
import { logger } from "#/utils/logger";
import { trigger } from "#/utils/trigger";
import dedent from "dedent";

const usesFreeModel = env.OPENROUTER_MODEL.endsWith(":free") || env.OPENROUTER_MODEL === "openrouter/free";

await trigger.cron(
  "openrouter-quota",
  "* * * * *",
  async () => {
    // Snapshot quota before fetching the key and account limits in parallel:
    const wasExhausted = openRouterQuota.isExhausted();
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

    // Update the shared quota state:
    quotaState.creditsExhausted = keyLimitReached || accountBalanceEmpty;
    quotaState.freeDailyExhausted = usesFreeModel && keyData.freeModelDailyRequests.remaining <= 0;

    // Log only transitions into or out of exhaustion:
    const nowExhausted = openRouterQuota.isExhausted();

    if (wasExhausted === nowExhausted) return;

    // Describe the key, account and free-model quotas for the transition log:
    const keyCredits = keyData.limitRemaining === null ? "no key credit limit" : `${String(keyData.limitRemaining)} credits remaining under the key limit`;
    const accountCredits = creditsData === undefined ? "credit balance unknown (management key required)" : `${(creditsData.totalCredits - creditsData.totalUsage).toFixed(9)} credits remaining (${String(creditsData.totalUsage)}/${String(creditsData.totalCredits)} credits used)`;

    const quotaDetails = dedent`
      - [KEY] ${keyData.label} | ${keyCredits}
      - [ACCOUNT] ${accountCredits}
      - [FREE DAILY] ${String(keyData.freeModelDailyRequests.used)}/${String(keyData.freeModelDailyRequests.limit)} requests (resets at UTC midnight)
    `;

    if (nowExhausted) {
      logger.warn(`OpenRouter quota exhausted:\n${quotaDetails}`);
      return;
    }

    logger.info(`OpenRouter quota recovered:\n${quotaDetails}`);
  },
  {
    triggerAtStartup: true,
  },
);
