import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { reportOpenRouterFailure } from "#/integrations/openrouter-quota.helper";
import { env } from "#/utils/env";

const openRouterProvider = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  fetch: async (input, init) => {
    // Report quota failures from model requests:
    const response = await fetch(input, init);
    if (response.status === 429 || response.status === 402) {
      reportOpenRouterFailure(response.status, response.headers.get("x-ratelimit-reset"));
    }
    return response;
  },
});

export const aiModel = openRouterProvider(env.OPENROUTER_MODEL);
