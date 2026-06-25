import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware, freshAuthMiddleware } from "#/lib/auth/middleware";
import { getTradingRuntime } from "#/lib/trading/runtime";
import { prepareTraderRecordForCreation } from "#/lib/trading/trader-draft-service";
import type { TraderRecord } from "#/lib/trading/types";

export const $getTraders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return getTradingRuntime().getTradersForUser(context.user.id);
  });

export const $getAllTraders = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getTraders();
});

export const $getTeachers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return getTradingRuntime().getTeachersForUser(context.user.id);
  });

export const $getRuntimeStatus = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getStatus();
});

export const $getRuntimeEvents = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getEvents();
});

export const $getRefreshScheduler = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getRefreshScheduler();
});

export const $getMarketSubscriptions = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getMarketSubscriptions();
});

export const $getNotificationConfig = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getNotificationConfig();
});

export const $getBybitRuntimeStatus = createServerFn({ method: "GET" }).handler(async () => {
  return getTradingRuntime().getBybitRuntimeStatus();
});

const notificationRouteOverrideSchema = z.record(
  z.string(),
  z.array(z.enum(["feishu", "telegram", "discord"])),
);

export const $updateNotificationRoutes = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(
    z.object({
      overrides: notificationRouteOverrideSchema.nullable(),
    }),
  )
  .handler(async ({ data }) => {
    return getTradingRuntime().updateNotificationRouteOverrides(data.overrides);
  });

const teacherEventsSchema = z.object({
  teacherId: z.string().min(1),
});

export const $getTeacherEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(teacherEventsSchema)
  .handler(async ({ context, data }) => {
    return getTradingRuntime().getTeacherEventsForUser(data.teacherId, context.user.id);
  });

const addTraderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(["okx", "bitget", "binance", "bybit", "huobi", "binanceFutures", "traderWagon"]),
  link: z.url().optional(),
  avatar: z.url().optional(),
  strategyName: z.string().min(1).optional(),
  strategyStatus: z.enum(["follow", "watch", "disabled"]).optional(),
  strategyRiskRate: z.number().min(0).optional(),
});

export const $addTrader = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(addTraderSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    const trader: TraderRecord = await prepareTraderRecordForCreation(data);

    await runtime.addTraderForUser(context.user.id, trader);
    return runtime.getTradersForUser(context.user.id);
  });

const updateTraderSchema = z.object({
  id: z.string().min(1),
  strategyStatus: z.enum(["follow", "watch", "disabled"]).optional(),
  strategyName: z.string().min(1).optional(),
  strategyRiskRate: z.number().min(0).optional(),
});

export const $updateTrader = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(updateTraderSchema)
  .handler(async ({ data }) => {
    const runtime = getTradingRuntime();
    return runtime.updateTrader(data.id, data);
  });

const removeTraderSchema = z.object({
  traderId: z.string().min(1),
});

export const $removeTrader = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(removeTraderSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.removeTraderForUser(context.user.id, data.traderId);
  });

export const $deleteTrader = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(removeTraderSchema)
  .handler(async ({ data }) => {
    const runtime = getTradingRuntime();
    return runtime.deleteTrader(data.traderId);
  });

const refreshTraderSchema = z.object({
  traderId: z.string().min(1),
});

export const $refreshTraderPositions = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(refreshTraderSchema)
  .handler(async ({ data }) => {
    const runtime = getTradingRuntime();
    return runtime.refreshTraderPositions(data.traderId);
  });

export const $refreshAllSupportedTraderPositions = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .handler(async () => {
    const runtime = getTradingRuntime();
    return runtime.refreshAllSupportedTraderPositions();
  });

const refreshTeacherSchema = z.object({
  teacherId: z.string().min(1),
});

export const $refreshTeacherAccount = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(refreshTeacherSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.refreshTeacherAccountForUser(context.user.id, data.teacherId);
  });

export const $startRefreshScheduler = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .handler(async () => {
    const runtime = getTradingRuntime();
    return runtime.startRefreshScheduler();
  });

export const $stopRefreshScheduler = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .handler(async () => {
    const runtime = getTradingRuntime();
    return runtime.stopRefreshScheduler();
  });

const addTeacherSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  platform: z.enum(["okx", "bitget", "binance", "bybit", "huobi", "binanceFutures", "traderWagon"]),
  executionMode: z.enum(["dry-run", "live"]).default("dry-run"),
  credentials: z
    .object({
      apiKey: z.string().min(1),
      apiSecret: z.string().min(1),
      apiPassword: z.string().optional(),
    })
    .optional(),
});

export const $addTeacher = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(addTeacherSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    await runtime.addTeacher({
      ...data,
      ownerUserId: context.user.id,
    });
    return runtime.getTeachersForUser(context.user.id);
  });

const updateTeacherExecutionSchema = z.object({
  teacherId: z.string().min(1),
  executionMode: z.enum(["dry-run", "live"]).optional(),
  credentials: z
    .object({
      apiKey: z.string().min(1),
      apiSecret: z.string().min(1),
      apiPassword: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export const $updateTeacherExecution = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(updateTeacherExecutionSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.updateTeacherExecutionForUser(context.user.id, data.teacherId, {
      executionMode: data.executionMode,
      credentials: data.credentials,
    });
  });

const teacherSettingsSchema = z.object({
  teacherId: z.string().min(1),
  settings: z.object({
    accountMaxRiskRate: z.number().min(0),
    safeMarginRate: z.number().min(0),
    limitRiskRatio: z.number().min(0),
  }),
});

export const $updateTeacherSettings = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(teacherSettingsSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.updateTeacherSettingsForUser(context.user.id, data.teacherId, data.settings);
  });

const teacherTraceTraderSettingSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  funds: z.number(),
  traceOrderMode: z.enum(["fixed", "ratio"]),
  fixedFunds: z.number(),
  tracePerRatio: z.number(),
  stopLossUsdt: z.number(),
  stopLossPositionValueRate: z.number(),
  followStatus: z.enum(["following", "unfollow"]),
  unrealizedProfitSum: z.number(),
  followProfit: z.number(),
});

const updateTeacherTraceTradersSchema = z.object({
  teacherId: z.string().min(1),
  traceTraderList: z.array(teacherTraceTraderSettingSchema),
});

export const $updateTeacherTraceTraders = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(updateTeacherTraceTradersSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.updateTeacherTraceTradersForUser(
      context.user.id,
      data.teacherId,
      data.traceTraderList,
    );
  });

const unfollowTeacherTraderSchema = z.object({
  teacherId: z.string().min(1),
  traderId: z.string().min(1),
});

export const $unfollowTeacherTrader = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(unfollowTeacherTraderSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.unfollowTeacherTraderForUser(context.user.id, data.teacherId, data.traderId);
  });

const followRelationSchema = z.object({
  orderId: z.string().min(1),
  followOrderId: z.string().min(1),
  followTraderId: z.string().min(1),
  symbol: z.string().min(1),
  amount: z.number(),
  positionSide: z.enum(["long", "short"]),
  openAvgPrice: z.number(),
  markPrice: z.number(),
  unrealizedProfit: z.number(),
  updateTime: z.number().nullable(),
  openTime: z.number().nullable(),
});

const updateTeacherFollowRelationsSchema = z.object({
  teacherId: z.string().min(1),
  followRelations: z.array(followRelationSchema),
});

export const $updateTeacherFollowRelations = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(updateTeacherFollowRelationsSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.updateTeacherFollowRelationsForUser(
      context.user.id,
      data.teacherId,
      data.followRelations,
    );
  });

const remapTeacherFollowRelationSchema = z.object({
  teacherId: z.string().min(1),
  orderId: z.string().min(1),
  nextFollowOrderId: z.string().min(1).nullable(),
});

export const $remapTeacherFollowRelation = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(remapTeacherFollowRelationSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.remapTeacherFollowRelationForUser(context.user.id, data.teacherId, {
      orderId: data.orderId,
      nextFollowOrderId: data.nextFollowOrderId,
    });
  });

const removeTeacherSchema = z.object({
  teacherId: z.string().min(1),
});

export const $removeTeacher = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(removeTeacherSchema)
  .handler(async ({ context, data }) => {
    const runtime = getTradingRuntime();
    return runtime.removeTeacherForUser(context.user.id, data.teacherId);
  });

const ingestTraderSnapshotSchema = z.object({
  traderId: z.string().min(1),
  positions: z.array(
    z.object({
      id: z.string(),
      symbol: z.string(),
      entryPrice: z.number(),
      markPrice: z.number().nullable(),
      amount: z.number(),
      leverage: z.number(),
      openTime: z.number().nullable(),
      closeTime: z.number().nullable(),
      margin: z.number().nullable(),
      marginMode: z.string().nullable(),
      pnl: z.number().nullable(),
      pnlRatio: z.number().nullable(),
      positionSide: z.enum(["long", "short"]),
      closeAvgPrice: z.number().nullable(),
      contractValue: z.number().nullable(),
    }),
  ),
});

export const $ingestTraderSnapshot = createServerFn({
  method: "POST",
})
  .middleware([freshAuthMiddleware])
  .validator(ingestTraderSnapshotSchema)
  .handler(async ({ data }) => {
    const runtime = getTradingRuntime();
    return runtime.ingestTraderSnapshot(data.traderId, data.positions);
  });
