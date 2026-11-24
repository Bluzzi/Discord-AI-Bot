import { env } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { timestamp } from "drizzle-orm/pg-core";

export const postgres = drizzle(env.POSTGRESQL_URL);

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());
const deletedAt = timestamp("deleted_at", { withTimezone: true });

export const columns = { createdAt, updatedAt, deletedAt };
