import "dotenv/config";
// env loading first
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),

  POSTGRES_URL: z.url(),

  DISCORD_BOT_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODEL: z.string().default("z-ai/glm-5.3-flash"),
});

export const env = schema.parse(process.env);
