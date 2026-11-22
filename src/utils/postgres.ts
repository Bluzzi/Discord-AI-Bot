import { env } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { timestamp } from "drizzle-orm/pg-core";
import { join } from "path";
import { cwd } from "process";

export const postgres = drizzle(env.POSTGRESQL_URL);

export const migratePostgres = async () => migrate(postgres, {
  migrationsFolder: join(cwd(), "drizzle"),
});

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());
const deletedAt = timestamp("deleted_at", { withTimezone: true });

export const columns = { createdAt, updatedAt, deletedAt };
