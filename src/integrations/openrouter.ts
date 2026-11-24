import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "#/utils/env";
import { reportOpenRouterFailure } from "#/utils/openrouter-quota";

// Wrap fetch to report quota failures (429/402) raised by real AI calls, without consuming any extra request:
const quotaAwareFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status === 429 || response.status === 402) {
    reportOpenRouterFailure(response.status, response.headers.get("x-ratelimit-reset"));
  }

  return response;
};

const openRouterProvider = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  fetch: quotaAwareFetch,
});

export const aiModel = openRouterProvider(env.OPENROUTER_MODEL);
