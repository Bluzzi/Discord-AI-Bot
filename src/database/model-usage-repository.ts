import type { aiCauseEnum } from "#/database/schema";
import type { LanguageModelUsage } from "ai";
import { postgres } from "#/database/client";
import { tableModelUsage } from "#/database/schema";
import { openRouterApi } from "#/integrations/openrouter";

type AiCause = typeof aiCauseEnum.enumValues[number];

type AiUsageResult = {
  usage: LanguageModelUsage;
  steps: readonly { model: { modelId: string } }[];
};

export const modelUsageRepository = {
  /** Track a completed generation in the model_usage table (tokens + computed OpenRouter prices) */
  track: async (cause: AiCause, result: AiUsageResult): Promise<void> => {
    const modelUsed = result.steps.at(-1)?.model.modelId;

    if (modelUsed === undefined) {
      throw new Error("Cannot resolve the used model: no step available");
    }

    const prices = await openRouterApi.computeUsagePrices(modelUsed, result.usage);

    await postgres.insert(tableModelUsage).values({
      cause,
      inputTokenCount: result.usage.inputTokens ?? 0,
      outputTokenCount: result.usage.outputTokens ?? 0,
      inputPrice: prices.inputPrice,
      outputPrice: prices.outputPrice,
      modelUsed,
    });
  },
};
