import "@tanstack/react-start/server-only";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "#/lib/db";
import {
  legacyChainInfo,
  legacyMessage,
  legacyUserAccountSetting,
} from "#/lib/db/schema/messages.schema";
import type {
  LegacyChainInfoRecord,
  LegacyMessageRecord,
  LegacyUserAccountSetting,
} from "#/lib/messages/types";

function toTimestamp(value: Date | null) {
  return value ? value.getTime() : null;
}

function toDate(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value) : null;
}

function normalizeMessageData(
  input: LegacyMessageRecord["msgData"],
): LegacyMessageRecord["msgData"] {
  return {
    ...input,
    msgFiles: Array.isArray(input.msgFiles)
      ? input.msgFiles.filter((item) => typeof item === "string")
      : [],
    msgContentTranslate:
      typeof input.msgContentTranslate === "string" ? input.msgContentTranslate : "",
    msgContent: typeof input.msgContent === "string" ? input.msgContent : "",
    msgAvatar: typeof input.msgAvatar === "string" ? input.msgAvatar : "",
    msgReleaseTime: typeof input.msgReleaseTime === "string" ? input.msgReleaseTime : "",
    msgTitle: typeof input.msgTitle === "string" ? input.msgTitle : "",
    msgUrl: typeof input.msgUrl === "string" ? input.msgUrl : "",
    msgCollectionTime:
      typeof input.msgCollectionTime === "number" ? input.msgCollectionTime : Date.now(),
  };
}

function serializeMessage(record: LegacyMessageRecord) {
  return {
    id: record.id,
    msgClass: record.msgClass,
    msgSource: record.msgSource,
    uniqueId: record.uniqueId,
    messageTime: toDate(record.messageTime),
    payload: normalizeMessageData(record.msgData),
  };
}

function deserializeMessage(row: typeof legacyMessage.$inferSelect): LegacyMessageRecord {
  return {
    id: row.id,
    msgClass: row.msgClass,
    msgSource: row.msgSource,
    uniqueId: row.uniqueId ?? null,
    messageTime: toTimestamp(row.messageTime),
    msgData: normalizeMessageData(row.payload),
    createdAt: row.createdAt.getTime(),
  };
}

function serializeChainInfo(record: LegacyChainInfoRecord) {
  return {
    id: record.id,
    transactionHash: record.transactionHash,
    payload: record.data,
  };
}

function deserializeChainInfo(row: typeof legacyChainInfo.$inferSelect): LegacyChainInfoRecord {
  return {
    id: row.id,
    transactionHash: row.transactionHash ?? null,
    data: row.payload ?? {},
    createdAt: row.createdAt.getTime(),
  };
}

function serializeAccountSetting(record: LegacyUserAccountSetting) {
  return {
    userId: record.userId,
    binanceApiKey: record.binanceApiKey,
    binanceSecretKey: record.binanceSecretKey,
  };
}

function deserializeAccountSetting(
  row: typeof legacyUserAccountSetting.$inferSelect,
): LegacyUserAccountSetting {
  return {
    userId: row.userId,
    binanceApiKey: row.binanceApiKey,
    binanceSecretKey: row.binanceSecretKey,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function upsertLegacyMessage(record: LegacyMessageRecord) {
  await db
    .insert(legacyMessage)
    .values(serializeMessage(record))
    .onConflictDoUpdate({
      target: legacyMessage.id,
      set: {
        msgClass: record.msgClass,
        msgSource: record.msgSource,
        messageTime: toDate(record.messageTime),
        payload: normalizeMessageData(record.msgData),
      },
    });
}

export async function upsertLegacyChainInfo(record: LegacyChainInfoRecord) {
  await db
    .insert(legacyChainInfo)
    .values(serializeChainInfo(record))
    .onConflictDoUpdate({
      target: legacyChainInfo.id,
      set: {
        transactionHash: record.transactionHash,
        payload: record.data,
      },
    });
}

export async function listLegacyMessages(limit = 50, offset = 0) {
  const rows = await db
    .select()
    .from(legacyMessage)
    .orderBy(desc(legacyMessage.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(deserializeMessage);
}

export async function listLegacyChainInfos(limit = 50, offset = 0) {
  const rows = await db
    .select()
    .from(legacyChainInfo)
    .orderBy(desc(legacyChainInfo.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map(deserializeChainInfo);
}

export async function getLegacyUserAccountSetting(userId: string) {
  const row = await db.query.legacyUserAccountSetting.findFirst({
    where: eq(legacyUserAccountSetting.userId, userId),
  });

  return row ? deserializeAccountSetting(row) : null;
}

export async function upsertLegacyUserAccountSetting(record: LegacyUserAccountSetting) {
  await db
    .insert(legacyUserAccountSetting)
    .values(serializeAccountSetting(record))
    .onConflictDoUpdate({
      target: legacyUserAccountSetting.userId,
      set: {
        binanceApiKey: record.binanceApiKey,
        binanceSecretKey: record.binanceSecretKey,
        updatedAt: new Date(),
      },
    });
}

export async function countLegacyMessages() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(legacyMessage);
  return row?.count ?? 0;
}

export async function countLegacyChainInfos() {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(legacyChainInfo);
  return row?.count ?? 0;
}
