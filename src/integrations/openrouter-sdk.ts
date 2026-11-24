import { OpenRouter } from "@openrouter/sdk";
import { env } from "#/utils/env";

// Fail fast when the management API is unavailable during a quota refresh:
export const openRouterSdk = new OpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  retryConfig: { strategy: "none" },
});
