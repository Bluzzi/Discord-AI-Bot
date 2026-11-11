import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "#/utils/env";

// Providers:
const openRouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
});

// Export model:
export const aiModel = openRouter(env.OPENROUTER_MODEL);
