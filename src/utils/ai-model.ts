import { createOpenAI } from "@ai-sdk/openai";
import { env } from "#/utils/env";

// Providers:
const openRouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: env.OPENROUTER_API_KEY,
});

// Export model:
export const aiModel = openRouter(env.OPENROUTER_MODEL);
