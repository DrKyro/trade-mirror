import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, exists, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "#/lib/db";
import {
  marketCandle,
  runtimeEvent,
  runtimeState,
  teacher,
  trader,
  traderSyncState,
  TRADING_RUNTIME_STATE_ID,
  userTrader,
  userTraderWorkspace,
} from "#/lib/db/schema/trading.schema";
import { mockRuntimeStatus, mockTeachers, mockTraders } from "#/lib/trading/mock-data";
import {
  getNextTraderSyncAt,
  getTraderSyncIntervalMs,
  getTraderSyncPriority,
} from "#/lib/trading/refresh-scheduler";
import type {
  AppRuntimeStatus,
  EquityHistoryPoint,
  MarketCandle,
  RuntimeEvent,
  TeacherEquityHistory,
  TeacherRecord,
  TraderRecord,
  TraderSyncPriority,
  TraderSyncState,
  TraderSyncStatus,
} from "#/lib/trading/types";

const SCALE = 1_000;
const RATIO_SCALE = 10_000;
const EVENT_LIMIT = 40;

function toMilli(value: number) {
  return Math.round(value * SCALE);
}

function fromMilli(value: number) {
  return value / SCALE;
}

function toRatioBasisPoints(value: number) {
  return Math.round(value * RATIO_SCALE);
}

function fromRatioBasisPoints(value: number) {
  return value / RATIO_SCALE;
}

function toDate(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value) : null;
}

function toTimestamp(value: Date | null) {
  return value ? value.getTime() : null;
}

function normalizeEquityPoint(point: EquityHistoryPoint): EquityHistoryPoint {
  return {
    t: point.t,
    e: point.e,
  };
}

function normalizeTeacherEquityHistory(
  history: Partial<TeacherEquityHistory> | null | undefined,
): TeacherEquityHistory {
  return {
    min: Array.isArray(history?.min) ? history.min.map(normalizeEquityPoint) : [],
    hour: Array.isArray(history?.hour) ? history.hour.map(normalizeEquityPoint) : [],
    day: Array.isArray(history?.day) ? history.day.map(normalizeEquityPoint) : [],
  };
}

function serializeTrader(traderRecord: TraderRecord) {
  return {
    id: traderRecord.id,
    name: traderRecord.name,
    nickName: traderRecord.nickName ?? null,
    platform: traderRecord.platform,
    link: traderRecord.link,
    avatar: traderRecord.avatar,
    sign: traderRecord.sign ?? null,
    strategyStatus: traderRecord.strategyStatus,
    strategyName: traderRecord.strategyName,
    strategyRiskRate: toRatioBasisPoints(traderRecord.strategyRiskRate),
    balance: toMilli(traderRecord.balance),
    monthlyAveragePositionValue: toMilli(traderRecord.monthlyAveragePositionValue),
    threeMonthMaxDrawdown: toMilli(traderRecord.threeMonthMaxDrawdown),
    positionUpdateTime: toDate(traderRecord.positionUpdateTime),
    positions: traderRecord.positions,
    historyPositions: traderRecord.historyPositions ?? [],
    rawPayload: null,
  };
}

function deserializeTrader(row: typeof trader.$inferSelect): TraderRecord {
  return {
    id: row.id,
    name: row.name,
    nickName: row.nickName ?? undefined,
    platform: row.platform as TraderRecord["platform"],
    link: row.link,
    avatar: row.avatar,
    sign: row.sign ?? undefined,
    strategyStatus: row.strategyStatus as TraderRecord["strategyStatus"],
    strategyName: row.strategyName,
    strategyRiskRate: fromRatioBasisPoints(row.strategyRiskRate),
    balance: fromMilli(row.balance),
    monthlyAveragePositionValue: fromMilli(row.monthlyAveragePositionValue),
    threeMonthMaxDrawdown: fromMilli(row.threeMonthMaxDrawdown),
    positionUpdateTime: toTimestamp(row.positionUpdateTime),
    positions: row.positions,
    historyPositions: row.historyPositions ?? [],
  };
}

function createDefaultTraderSyncStateRecord(
  traderRecord: Pick<TraderRecord, "id" | "strategyStatus">,
  now = Date.now(),
): TraderSyncState {
  const priority = getTraderSyncPriority(traderRecord);
  return {
    traderId: traderRecord.id,
    priority,
    enabled: true,
    fetchIntervalMs: getTraderSyncIntervalMs(priority),
    nextFetchAt: now,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastStatus: "idle",
    lastError: null,
    failCount: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
  };
}

function serializeTraderSyncState(syncState: TraderSyncState) {
  return {
    traderId: syncState.traderId,
    priority: syncState.priority,
    enabled: syncState.enabled,
    fetchIntervalMs: syncState.fetchIntervalMs,
    nextFetchAt: toDate(syncState.nextFetchAt),
    lastAttemptAt: toDate(syncState.lastAttemptAt),
    lastSuccessAt: toDate(syncState.lastSuccessAt),
    lastStatus: syncState.lastStatus,
    lastError: syncState.lastError,
    failCount: syncState.failCount,
    lockedUntil: toDate(syncState.lockedUntil),
  };
}

function deserializeTraderSyncState(row: typeof traderSyncState.$inferSelect): TraderSyncState {
  return {
    traderId: row.traderId,
    priority: row.priority,
    enabled: row.enabled,
    fetchIntervalMs: row.fetchIntervalMs,
    nextFetchAt: toTimestamp(row.nextFetchAt),
    lastAttemptAt: toTimestamp(row.lastAttemptAt),
    lastSuccessAt: toTimestamp(row.lastSuccessAt),
    lastStatus: row.lastStatus,
    lastError: row.lastError,
    failCount: row.failCount,
    lockedUntil: toTimestamp(row.lockedUntil),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function serializeTeacher(teacherRecord: TeacherRecord) {
  return {
    id: teacherRecord.id,
    ownerUserId: null,
    name: teacherRecord.name,
    platform: teacherRecord.platform,
    credentials: teacherRecord.credentials ?? null,
    executionMode: teacherRecord.executionMode ?? "dry-run",
    balance: toMilli(teacherRecord.balance),
    equity: toMilli(teacherRecord.equity),
    freeUsdt: toMilli(teacherRecord.freeUsdt),
    unrealizedPnl: toMilli(teacherRecord.unrealizedPnl),
    maxRiskRatio: toRatioBasisPoints(teacherRecord.maxRiskRatio),
    nowRiskRatio: toRatioBasisPoints(teacherRecord.nowRiskRatio),
    positions: teacherRecord.positions,
    teacherPositions: teacherRecord.teacherPositions,
    followRelations: teacherRecord.followRelations,
    traceTraderList: teacherRecord.traceTraderList,
    settings: teacherRecord.settings,
    equityHistory: normalizeTeacherEquityHistory(teacherRecord.equityHistory),
    positionHistory: teacherRecord.positionHistory,
    lastSignalAt: toDate(teacherRecord.lastSignalAt),
  };
}

function deserializeTeacher(row: typeof teacher.$inferSelect): TeacherRecord {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform as TeacherRecord["platform"],
    credentials: row.credentials ?? undefined,
    executionMode: row.executionMode ?? "dry-run",
    balance: fromMilli(row.balance),
    equity: fromMilli(row.equity),
    freeUsdt: fromMilli(row.freeUsdt),
    unrealizedPnl: fromMilli(row.unrealizedPnl),
    maxRiskRatio: fromRatioBasisPoints(row.maxRiskRatio),
    nowRiskRatio: fromRatioBasisPoints(row.nowRiskRatio),
    positions: row.positions,
    teacherPositions: row.teacherPositions,
    followRelations: row.followRelations,
    traceTraderList: row.traceTraderList,
    settings: row.settings,
    equityHistory: normalizeTeacherEquityHistory(row.equityHistory),
    positionHistory: row.positionHistory ?? [],
    lastSignalAt: toTimestamp(row.lastSignalAt),
  };
}

function serializeStatus(status: AppRuntimeStatus) {
  return {
    id: TRADING_RUNTIME_STATE_ID,
    mongoConnected: status.mongoConnected,
    traderSpyConnected: status.traderSpyConnected,
    followEngineRunning: status.followEngineRunning,
    wsServerUrl: status.wsServerUrl,
    httpPort: status.httpPort,
    lastHeartbeat: toDate(status.lastHeartbeat),
    metadata: status.metadata ?? null,
  };
}

function deserializeStatus(row: typeof runtimeState.$inferSelect): AppRuntimeStatus {
  return {
    mongoConnected: row.mongoConnected,
    traderSpyConnected: row.traderSpyConnected,
    followEngineRunning: row.followEngineRunning,
    wsServerUrl: row.wsServerUrl,
    httpPort: row.httpPort,
    lastHeartbeat: toTimestamp(row.lastHeartbeat),
    metadata: row.metadata ?? null,
  };
}

function serializeEvent(eventRecord: RuntimeEvent) {
  return {
    id: eventRecord.id,
    scope: eventRecord.scope,
    level: eventRecord.level,
    title: eventRecord.title,
    detail: eventRecord.detail,
    timestamp: new Date(eventRecord.timestamp),
    payload:
      eventRecord.entityType || eventRecord.entityId
        ? {
            entityType: eventRecord.entityType ?? null,
            entityId: eventRecord.entityId ?? null,
          }
        : null,
  };
}

function deserializeEvent(row: typeof runtimeEvent.$inferSelect): RuntimeEvent {
  return {
    id: row.id,
    scope: row.scope as RuntimeEvent["scope"],
    level: row.level as RuntimeEvent["level"],
    title: row.title,
    detail: row.detail,
    timestamp: row.timestamp.getTime(),
    entityType:
      row.payload &&
      typeof row.payload === "object" &&
      "entityType" in row.payload &&
      typeof row.payload.entityType === "string"
        ? (row.payload.entityType as RuntimeEvent["entityType"])
        : undefined,
    entityId:
      row.payload &&
      typeof row.payload === "object" &&
      "entityId" in row.payload &&
      typeof row.payload.entityId === "string"
        ? row.payload.entityId
        : undefined,
  };
}

function serializeMarketCandle(candle: MarketCandle) {
  return {
    platform: candle.platform,
    symbol: candle.symbol,
    interval: candle.interval,
    datetime: new Date(candle.datetime),
    open: toMilli(candle.open),
    high: toMilli(candle.high),
    low: toMilli(candle.low),
    close: toMilli(candle.close),
    volume: toMilli(candle.volume),
  };
}

function deserializeMarketCandle(row: typeof marketCandle.$inferSelect): MarketCandle {
  return {
    platform: row.platform as MarketCandle["platform"],
    symbol: row.symbol,
    interval: row.interval as MarketCandle["interval"],
    datetime: row.datetime.getTime(),
    open: fromMilli(row.open),
    high: fromMilli(row.high),
    low: fromMilli(row.low),
    close: fromMilli(row.close),
    volume: fromMilli(row.volume),
  };
}

async function seedIfNeeded() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(trader);
  if (count > 0) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(trader).values(mockTraders.map(serializeTrader));
    await tx.insert(teacher).values(mockTeachers.map(serializeTeacher));
    await tx.insert(runtimeState).values(
      serializeStatus({
        ...mockRuntimeStatus,
        mongoConnected: true,
      }),
    );
  });
}

async function ensureTraderSyncStates() {
  const traders = await db
    .select({
      id: trader.id,
      strategyStatus: trader.strategyStatus,
    })
    .from(trader);

  if (traders.length === 0) {
    return;
  }

  const existingRows = await db
    .select({ traderId: traderSyncState.traderId })
    .from(traderSyncState);
  const existingTraderIds = new Set(existingRows.map((row) => row.traderId));

  const missingStates = traders
    .filter((row) => !existingTraderIds.has(row.id))
    .map((row) =>
      serializeTraderSyncState(
        createDefaultTraderSyncStateRecord({
          id: row.id,
          strategyStatus: row.strategyStatus as TraderRecord["strategyStatus"],
        }),
      ),
    );

  if (missingStates.length > 0) {
    await db.insert(traderSyncState).values(missingStates).onConflictDoNothing();
  }
}

export async function ensureTradingStore() {
  await seedIfNeeded();
  await ensureTraderSyncStates();
}

export async function listTraders() {
  await ensureTradingStore();
  const rows = await db.select().from(trader).orderBy(asc(trader.createdAt));
  return rows.map(deserializeTrader);
}

export async function listTraderSyncStates() {
  await ensureTradingStore();
  const rows = await db.select().from(traderSyncState).orderBy(asc(traderSyncState.createdAt));
  return rows.map(deserializeTraderSyncState);
}

export async function getTraderSyncStatesByTraderIds(traderIds: string[]) {
  await ensureTradingStore();
  if (traderIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(traderSyncState)
    .where(
      sql`${traderSyncState.traderId} in (${sql.join(
        traderIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );

  return rows.map(deserializeTraderSyncState);
}

export async function getTraderSyncState(traderId: string) {
  await ensureTradingStore();
  const row = await db.query.traderSyncState.findFirst({
    where: eq(traderSyncState.traderId, traderId),
  });

  return row ? deserializeTraderSyncState(row) : null;
}

export async function listTradersByUser(userId: string) {
  await ensureTradingStore();
  const rows = await db
    .select()
    .from(trader)
    .where(
      exists(
        db
          .select({ one: sql`1` })
          .from(userTrader)
          .where(and(eq(userTrader.userId, userId), eq(userTrader.traderId, trader.id))),
      ),
    )
    .orderBy(asc(trader.createdAt));
  return rows.map(deserializeTrader);
}

export async function linkTraderToUser(userId: string, traderId: string) {
  await ensureTradingStore();
  await db.insert(userTrader).values({ userId, traderId }).onConflictDoNothing();
}

export async function unlinkTraderFromUser(userId: string, traderId: string) {
  await ensureTradingStore();
  await db
    .delete(userTrader)
    .where(and(eq(userTrader.userId, userId), eq(userTrader.traderId, traderId)));
}

export async function claimUnownedTraders(userId: string) {
  await ensureTradingStore();
  const workspace = await db.query.userTraderWorkspace.findFirst({
    where: eq(userTraderWorkspace.userId, userId),
  });

  if (workspace) {
    return;
  }

  const traderRows = await db.select({ id: trader.id }).from(trader);
  const values = traderRows.map((row) => ({
    userId,
    traderId: row.id,
  }));

  if (values.length > 0) {
    await db.insert(userTrader).values(values).onConflictDoNothing();
  }

  await db.insert(userTraderWorkspace).values({ userId }).onConflictDoNothing();
}

export async function listTeachers() {
  await ensureTradingStore();
  const rows = await db.select().from(teacher).orderBy(asc(teacher.createdAt));
  return rows.map(deserializeTeacher);
}

export async function listTeachersByOwner(ownerUserId: string) {
  await ensureTradingStore();
  const rows = await db
    .select()
    .from(teacher)
    .where(eq(teacher.ownerUserId, ownerUserId))
    .orderBy(asc(teacher.createdAt));
  return rows.map(deserializeTeacher);
}

export async function claimUnownedTeachers(ownerUserId: string) {
  await ensureTradingStore();
  await db
    .update(teacher)
    .set({
      ownerUserId,
      updatedAt: new Date(),
    })
    .where(isNull(teacher.ownerUserId));
}

export async function getRuntimeStatus() {
  await ensureTradingStore();
  const row = await db.query.runtimeState.findFirst({
    where: eq(runtimeState.id, TRADING_RUNTIME_STATE_ID),
  });

  if (!row) {
    const seeded = {
      ...mockRuntimeStatus,
      mongoConnected: true,
    } satisfies AppRuntimeStatus;
    await db.insert(runtimeState).values(serializeStatus(seeded));
    return seeded;
  }

  return deserializeStatus(row);
}

export async function setRuntimeStatus(status: AppRuntimeStatus) {
  await ensureTradingStore();
  await db
    .insert(runtimeState)
    .values(serializeStatus(status))
    .onConflictDoUpdate({
      target: runtimeState.id,
      set: {
        mongoConnected: status.mongoConnected,
        traderSpyConnected: status.traderSpyConnected,
        followEngineRunning: status.followEngineRunning,
        wsServerUrl: status.wsServerUrl,
        httpPort: status.httpPort,
        lastHeartbeat: toDate(status.lastHeartbeat),
        metadata: status.metadata ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function updateRuntimeStatusFlags(
  patch: Partial<
    Pick<
      AppRuntimeStatus,
      | "mongoConnected"
      | "traderSpyConnected"
      | "followEngineRunning"
      | "wsServerUrl"
      | "httpPort"
      | "lastHeartbeat"
    >
  >,
) {
  await ensureTradingStore();
  await db
    .update(runtimeState)
    .set({
      ...patch,
      lastHeartbeat: patch.lastHeartbeat != null ? toDate(patch.lastHeartbeat) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(runtimeState.id, TRADING_RUNTIME_STATE_ID));
}

export async function patchRuntimeMetadata<T>(
  key: string,
  patcher: (current: unknown) => T,
): Promise<T> {
  await ensureTradingStore();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ metadata: runtimeState.metadata })
      .from(runtimeState)
      .where(eq(runtimeState.id, TRADING_RUNTIME_STATE_ID))
      .for("update");

    const metadata = (rows[0]?.metadata ?? {}) as Record<string, unknown>;
    const next = patcher(metadata[key]);
    const nextMetadata = { ...metadata, [key]: next };

    await tx
      .update(runtimeState)
      .set({ metadata: nextMetadata, updatedAt: new Date() })
      .where(eq(runtimeState.id, TRADING_RUNTIME_STATE_ID));

    return next;
  });
}

export async function listRuntimeEvents() {
  await ensureTradingStore();
  const rows = await db
    .select()
    .from(runtimeEvent)
    .orderBy(desc(runtimeEvent.timestamp))
    .limit(EVENT_LIMIT);
  return rows.map(deserializeEvent);
}

export async function listTeacherRuntimeEvents(teacherId: string) {
  const events = await listRuntimeEvents();
  return events.filter((event) => event.entityType === "teacher" && event.entityId === teacherId);
}

export async function appendRuntimeEvent(eventRecord: RuntimeEvent) {
  await ensureTradingStore();
  await db.insert(runtimeEvent).values(serializeEvent(eventRecord));

  const oldRows = await db
    .select({ id: runtimeEvent.id })
    .from(runtimeEvent)
    .orderBy(desc(runtimeEvent.timestamp))
    .offset(EVENT_LIMIT);

  if (oldRows.length > 0) {
    await db.delete(runtimeEvent).where(
      sql`${runtimeEvent.id} in (${sql.join(
        oldRows.map((row) => sql`${row.id}`),
        sql`, `,
      )})`,
    );
  }
}

export async function upsertMarketCandles(candles: MarketCandle[]) {
  if (candles.length === 0) {
    return;
  }

  await ensureTradingStore();
  await db
    .insert(marketCandle)
    .values(candles.map(serializeMarketCandle))
    .onConflictDoUpdate({
      target: [
        marketCandle.platform,
        marketCandle.symbol,
        marketCandle.interval,
        marketCandle.datetime,
      ],
      set: {
        open: sql`excluded.open_milli`,
        high: sql`excluded.high_milli`,
        low: sql`excluded.low_milli`,
        close: sql`excluded.close_milli`,
        volume: sql`excluded.volume_milli`,
      },
    });
}

export async function listMarketCandles(
  platform: MarketCandle["platform"],
  symbol: string,
  interval: MarketCandle["interval"],
  startTime?: number,
  endTime?: number,
) {
  await ensureTradingStore();
  const filters = [
    eq(marketCandle.platform, platform),
    eq(marketCandle.symbol, symbol),
    eq(marketCandle.interval, interval),
    startTime != null
      ? sql`${marketCandle.datetime} >= to_timestamp(${startTime} / 1000.0)`
      : sql`true`,
    endTime != null
      ? sql`${marketCandle.datetime} <= to_timestamp(${endTime} / 1000.0)`
      : sql`true`,
  ];

  const query = db
    .select()
    .from(marketCandle)
    .where(and(...filters))
    .orderBy(asc(marketCandle.datetime));

  return (await query).map(deserializeMarketCandle);
}

export async function upsertTraderSyncState(
  traderId: string,
  patch: Partial<TraderSyncState>,
  defaults?: Pick<TraderRecord, "strategyStatus">,
) {
  await ensureTradingStore();
  const current = await getTraderSyncState(traderId);
  const base =
    current ??
    createDefaultTraderSyncStateRecord({
      id: traderId,
      strategyStatus: defaults?.strategyStatus ?? "watch",
    });
  const next: TraderSyncState = {
    ...base,
    ...patch,
    traderId,
    updatedAt: Date.now(),
  };

  await db
    .insert(traderSyncState)
    .values({
      ...serializeTraderSyncState(next),
      createdAt: current ? (toDate(current.createdAt) ?? new Date()) : new Date(next.createdAt),
      updatedAt: new Date(next.updatedAt),
    })
    .onConflictDoUpdate({
      target: traderSyncState.traderId,
      set: {
        priority: next.priority,
        enabled: next.enabled,
        fetchIntervalMs: next.fetchIntervalMs,
        nextFetchAt: toDate(next.nextFetchAt),
        lastAttemptAt: toDate(next.lastAttemptAt),
        lastSuccessAt: toDate(next.lastSuccessAt),
        lastStatus: next.lastStatus,
        lastError: next.lastError,
        failCount: next.failCount,
        lockedUntil: toDate(next.lockedUntil),
        updatedAt: new Date(next.updatedAt),
      },
    });

  return next;
}

export async function syncTraderSyncProfile(
  traderRecord: Pick<TraderRecord, "id" | "strategyStatus">,
  options?: {
    immediate?: boolean;
    priority?: TraderSyncPriority;
    enabled?: boolean;
  },
) {
  await ensureTradingStore();
  const current = await getTraderSyncState(traderRecord.id);
  const priority = options?.priority ?? getTraderSyncPriority(traderRecord);
  const now = Date.now();
  const fetchIntervalMs = getTraderSyncIntervalMs(priority);

  return upsertTraderSyncState(
    traderRecord.id,
    {
      priority,
      enabled: options?.enabled ?? current?.enabled ?? true,
      fetchIntervalMs,
      nextFetchAt: options?.immediate ? now : (current?.nextFetchAt ?? now),
      lastStatus: current?.lastStatus ?? "idle",
    },
    traderRecord,
  );
}

export async function scheduleTraderSyncNow(traderId: string) {
  await ensureTradingStore();
  const current = await getTraderSyncState(traderId);
  if (!current) {
    return null;
  }

  return upsertTraderSyncState(traderId, {
    nextFetchAt: Date.now(),
    lockedUntil: null,
    lastError: current.lastStatus === "failed" ? current.lastError : null,
  });
}

export async function listDueTraderSyncStates(limit = 8, now = Date.now()) {
  await ensureTradingStore();
  const rows = await db
    .select()
    .from(traderSyncState)
    .where(
      and(
        eq(traderSyncState.enabled, true),
        lte(traderSyncState.nextFetchAt, new Date(now)),
        or(isNull(traderSyncState.lockedUntil), lte(traderSyncState.lockedUntil, new Date(now))),
      ),
    )
    .orderBy(asc(traderSyncState.nextFetchAt), asc(traderSyncState.updatedAt))
    .limit(limit);

  return rows.map(deserializeTraderSyncState);
}

export async function beginTraderSyncAttempt(traderId: string, lockMs: number, now = Date.now()) {
  await ensureTradingStore();
  const current = await getTraderSyncState(traderId);
  if (!current) {
    return null;
  }

  if (current.lockedUntil && current.lockedUntil > now) {
    return null;
  }

  return upsertTraderSyncState(traderId, {
    lastAttemptAt: now,
    lastStatus: "running",
    lastError: null,
    lockedUntil: now + lockMs,
  });
}

export async function completeTraderSyncAttempt(
  traderId: string,
  input: {
    now?: number;
    status: Extract<TraderSyncStatus, "success" | "failed">;
    error?: string | null;
  },
) {
  await ensureTradingStore();
  const current = await getTraderSyncState(traderId);
  if (!current) {
    return null;
  }

  const now = input.now ?? Date.now();
  const failCount = input.status === "failed" ? current.failCount + 1 : 0;
  return upsertTraderSyncState(traderId, {
    lastStatus: input.status,
    lastError: input.status === "failed" ? (input.error ?? "unknown sync failure") : null,
    lastSuccessAt: input.status === "success" ? now : current.lastSuccessAt,
    failCount,
    nextFetchAt: getNextTraderSyncAt(current.priority, now, failCount),
    lockedUntil: null,
  });
}

export async function createTrader(traderRecord: TraderRecord) {
  await ensureTradingStore();
  await db.insert(trader).values(serializeTrader(traderRecord));
  await syncTraderSyncProfile(traderRecord, { immediate: true });
}

export async function updateTraderRecord(traderId: string, patch: Partial<TraderRecord>) {
  await ensureTradingStore();
  const current = await db.query.trader.findFirst({ where: eq(trader.id, traderId) });
  if (!current) {
    return null;
  }

  const next = {
    ...deserializeTrader(current),
    ...patch,
  } satisfies TraderRecord;

  await db
    .update(trader)
    .set({
      name: next.name,
      nickName: next.nickName ?? null,
      platform: next.platform,
      link: next.link,
      avatar: next.avatar,
      sign: next.sign ?? null,
      strategyStatus: next.strategyStatus,
      strategyName: next.strategyName,
      strategyRiskRate: toRatioBasisPoints(next.strategyRiskRate),
      balance: toMilli(next.balance),
      monthlyAveragePositionValue: toMilli(next.monthlyAveragePositionValue),
      threeMonthMaxDrawdown: toMilli(next.threeMonthMaxDrawdown),
      positionUpdateTime: toDate(next.positionUpdateTime),
      positions: next.positions,
      historyPositions: next.historyPositions ?? current.historyPositions ?? [],
      updatedAt: new Date(),
    })
    .where(eq(trader.id, traderId));

  await syncTraderSyncProfile(next, {
    immediate: patch.strategyStatus != null,
  });

  return next;
}

export async function createTeacher(
  teacherRecord: TeacherRecord,
  ownerUserId: string | null = null,
) {
  await ensureTradingStore();
  await db.insert(teacher).values({
    ...serializeTeacher(teacherRecord),
    ownerUserId,
  });
}

export async function updateTeacherRecord(
  teacherId: string,
  next: TeacherRecord,
  ownerUserId?: string,
) {
  await ensureTradingStore();
  const query = db
    .update(teacher)
    .set({
      name: next.name,
      platform: next.platform,
      credentials: next.credentials ?? null,
      executionMode: next.executionMode ?? "dry-run",
      balance: toMilli(next.balance),
      equity: toMilli(next.equity),
      freeUsdt: toMilli(next.freeUsdt),
      unrealizedPnl: toMilli(next.unrealizedPnl),
      maxRiskRatio: toRatioBasisPoints(next.maxRiskRatio),
      nowRiskRatio: toRatioBasisPoints(next.nowRiskRatio),
      positions: next.positions,
      teacherPositions: next.teacherPositions,
      followRelations: next.followRelations,
      traceTraderList: next.traceTraderList,
      settings: next.settings,
      equityHistory: normalizeTeacherEquityHistory(next.equityHistory),
      positionHistory: next.positionHistory,
      lastSignalAt: toDate(next.lastSignalAt),
      updatedAt: new Date(),
    })
    .where(
      ownerUserId
        ? and(eq(teacher.id, teacherId), eq(teacher.ownerUserId, ownerUserId))
        : eq(teacher.id, teacherId),
    );

  await query;
}

export async function deleteTeacherRecord(teacherId: string, ownerUserId?: string) {
  await ensureTradingStore();
  await db
    .delete(teacher)
    .where(
      ownerUserId
        ? and(eq(teacher.id, teacherId), eq(teacher.ownerUserId, ownerUserId))
        : eq(teacher.id, teacherId),
    );
}

export async function deleteTraderRecord(traderId: string) {
  await ensureTradingStore();
  await db.delete(trader).where(eq(trader.id, traderId));
}
