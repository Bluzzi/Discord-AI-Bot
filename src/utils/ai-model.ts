import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "#/utils/env";

// Providers:
const openRouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

// Export models:
export const aiModel = {
  fast: openRouter(env.OPENROUTER_MODEL_FAST),
  large: openRouter(env.OPENROUTER_MODEL_LARGE),
};
