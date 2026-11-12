import "dotenv/config";
// env loading first
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),

  POSTGRESQL_URL: z.url(),

  DISCORD_BOT_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),
  DISCORD_BOT_NAME: z.string().default("Jean Pascal"),
  DISCORD_BOT_ALIASES: z.string().default("JP, Jean").transform((aliases) => aliases.split(",").map((alias) => alias.trim()).filter(Boolean)),

  OPENROUTER_API_KEY: z.string(),
  OPENROUTER_MODEL: z.string().default("google/gemma-4-31b-it:free"),
});

export const env = schema.parse(process.env);
