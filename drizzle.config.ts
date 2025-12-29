import { env } from "#/utils/env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: env.POSTGRES_URL,
  },
  out: "./drizzle",
  schema: "./src/postgres/schema.ts",
});
