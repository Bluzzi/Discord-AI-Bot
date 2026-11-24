import { env } from "#/utils/env";
import { drizzle } from "drizzle-orm/node-postgres";

export const postgres = drizzle(env.POSTGRESQL_URL);
