import "dotenv/config";
// env loading first
import { z } from "zod";

const schema = z.object({
  DISCORD_BOT_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),

  MISTRAL_API_KEY: z.string(),
  MISTRAL_BASE_URL: z.string().default("https://api.mistral.ai/v1"),
  MISTRAL_MODEL: z.string().default("mistral-large-latest"),

  IGDB_CLIENT_ID: z.string().optional(),
  IGDB_CLIENT_SECRET: z.string().optional(),
  IGDB_ACCESS_TOKEN: z.string().optional(),

  PASTEBIN_API_KEY: z.string().optional(),
  GIPHY_API_KEY: z.string().optional(),
  FORTYTWO_CLIENT_ID: z.string().optional(),
  FORTYTWO_CLIENT_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_REGION: z.string().optional(),
});

export const env = schema.parse(process.env);
