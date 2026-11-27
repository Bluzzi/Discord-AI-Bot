import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core";

export const utcNow = sql`(now() at time zone 'UTC')`;
export const columns = {
  createdAt: timestamp("created_at").notNull().default(utcNow),
  updatedAt: timestamp("updated_at").notNull().default(utcNow).$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
};
