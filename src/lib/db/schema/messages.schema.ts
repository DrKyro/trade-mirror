import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "#/lib/db/schema/auth.schema";
import type { LegacyChainInfoRecord, LegacyMessageRecord } from "#/lib/messages/types";

export const legacyMessage = pgTable(
  "legacy_message",
  {
    id: text("id").primaryKey(),
    msgClass: text("msg_class").notNull(),
    msgSource: text("msg_source").notNull(),
    uniqueId: text("unique_id"),
    messageTime: timestamp("message_time"),
    payload: jsonb("payload").$type<LegacyMessageRecord["msgData"]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("legacy_message_class_idx").on(table.msgClass),
    uniqueIndex("legacy_message_unique_id_idx").on(table.uniqueId),
    index("legacy_message_time_idx").on(table.messageTime),
  ],
);

export const legacyChainInfo = pgTable(
  "legacy_chain_info",
  {
    id: text("id").primaryKey(),
    transactionHash: text("transaction_hash"),
    payload: jsonb("payload").$type<LegacyChainInfoRecord["data"]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("legacy_chain_info_hash_idx").on(table.transactionHash),
    index("legacy_chain_info_created_at_idx").on(table.createdAt),
  ],
);

export const legacyUserAccountSetting = pgTable("legacy_user_account_setting", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  binanceApiKey: text("binance_api_key").notNull().default(""),
  binanceSecretKey: text("binance_secret_key").notNull().default(""),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export type LegacyMessageRow = typeof legacyMessage.$inferSelect;
export type LegacyChainInfoRow = typeof legacyChainInfo.$inferSelect;
export type LegacyUserAccountSettingRow = typeof legacyUserAccountSetting.$inferSelect;
