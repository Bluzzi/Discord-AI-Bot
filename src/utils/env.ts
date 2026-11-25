import { z } from "zod";
import "dotenv/config";

const schema = z.object({
  POSTGRESQL_URL: z.url().describe("PostgreSQL connection URL."),

  DISCORD_BOT_ID: z.string().describe("Discord user ID of the bot."),
  DISCORD_BOT_TOKEN: z.string().describe("Token used to authenticate the bot with Discord."),
  DISCORD_BOT_NAME: z.string().describe("Bot name used in the model instructions."),

  OPENROUTER_API_KEY: z.string().describe("OpenRouter API key used for model requests and quota checks."),
  OPENROUTER_MODEL: z.string().default("deepseek/deepseek-v4.1-flash-1017").describe("OpenRouter model ID used for replies."),

  GITHUB_TOKEN: z.string().optional().describe("Greatly increases the GitHub API rate limit. A token with public-only access is recommended."),
  RAILWAY_TOKEN: z.string().trim().min(1).optional().describe("Railway project token for the sandbox environment."),
  EXA_API_KEY: z.string().describe("Exa API key used for web search."),
});

// Validate configuration after loading environment variables:
export const env = schema.parse(process.env);
