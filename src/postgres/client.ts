import { env } from "#/utils/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "path";
import { cwd } from "process";

// Export client:
export const postgres = drizzle(env.POSTGRES_URL);

// Apply migrations:
await migrate(postgres, {
  migrationsFolder: join(cwd(), "drizzle"),
});
