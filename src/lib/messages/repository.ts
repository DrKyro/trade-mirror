import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware, freshAuthMiddleware } from "#/lib/auth/middleware";
import {
  countLegacyChainInfos,
  countLegacyMessages,
  getLegacyUserAccountSetting,
  listLegacyChainInfos,
  listLegacyMessages,
  upsertLegacyUserAccountSetting,
} from "#/lib/messages/store";
import type { LegacyChainInfoRecord, LegacyMessageRecord } from "#/lib/messages/types";

function toSerializableMessage(record: LegacyMessageRecord): LegacyMessageRecord {
  return {
    ...record,
    msgData: { ...record.msgData },
  };
}

function toSerializableChainInfo(record: LegacyChainInfoRecord): LegacyChainInfoRecord {
  return {
    ...record,
    data: { ...record.data },
  };
}

export const $getLegacyMessages = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ data }) =>
    (await listLegacyMessages(data.limit, data.offset)).map(toSerializableMessage),
  );

export const $getLegacyChainInfos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ data }) =>
    (await listLegacyChainInfos(data.limit, data.offset)).map(toSerializableChainInfo),
  );

export const $getLegacyCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({
    messageCount: await countLegacyMessages(),
    chainCount: await countLegacyChainInfos(),
  }));

export const $getLegacyUserAccountSetting = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => getLegacyUserAccountSetting(context.user.id));

export const $updateLegacyUserAccountSetting = createServerFn({ method: "POST" })
  .middleware([freshAuthMiddleware])
  .validator(
    z.object({
      binanceApiKey: z.string().default(""),
      binanceSecretKey: z.string().default(""),
    }),
  )
  .handler(async ({ context, data }) => {
    await upsertLegacyUserAccountSetting({
      userId: context.user.id,
      binanceApiKey: data.binanceApiKey,
      binanceSecretKey: data.binanceSecretKey,
      updatedAt: Date.now(),
    });

    return getLegacyUserAccountSetting(context.user.id);
  });
