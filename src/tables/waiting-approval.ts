import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const tableWaitingApproval = pgTable("waiting_approval", {
  id: uuid("id").primaryKey().defaultRandom(),
  requesterMember: text("requester_member").notNull(),
  validatingMessageId: text("validating_message_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  actions: jsonb("actions").$type<{ toolName: string; input: Record<string, unknown> }[]>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
