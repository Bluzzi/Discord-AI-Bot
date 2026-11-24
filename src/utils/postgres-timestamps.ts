import { timestamp } from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());
const deletedAt = timestamp("deleted_at", { withTimezone: true });

export const columns = { createdAt, updatedAt, deletedAt };
