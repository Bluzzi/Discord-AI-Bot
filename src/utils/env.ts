import "dotenv/config";
// env loading first
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),

  POSTGRES_URL: z.url(),

  DISCORD_BOT_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODEL_FAST: z.string().default("z-ai/glm-4.5-air"),
  OPENROUTER_MODEL_LARGE: z.string().default("z-ai/glm-4.6"),
});

export const env = schema.parse(process.env);
