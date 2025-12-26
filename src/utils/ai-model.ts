import { createMistral } from "@ai-sdk/mistral";
import { env } from "#/utils/env";

// Providers:
const mistral = createMistral({
  baseURL: env.MISTRAL_BASE_URL,
  apiKey: env.MISTRAL_API_KEY,
});

// Export models:
export const aiModels = {
  mistralFast: mistral("mistral-small-latest"),
  mistralLarge: mistral("mistral-large-latest"),
};
