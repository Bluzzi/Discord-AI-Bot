import { config } from "dotenv";
import z from "zod";

config();

const schema = z.object({
  DISCORD_BOT_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),

  OPENAI_API_KEY: z.string(),
  OPENAI_BASE_URL: z.url(),
  OPENAI_MODEL: z.string(),
});

export const env = schema.parse(process.env);
