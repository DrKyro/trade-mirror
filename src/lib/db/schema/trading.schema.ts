import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "#/lib/db/schema/auth.schema";
import type {
  AppRuntimeStatus,
  ExecutionMode,
  FollowOrderRelation,
  PositionSnapshot,
  RuntimeEvent,
  TeacherEquityHistory,
  TeacherCredentials,
  TeacherPositionHistoryEntry,
  TeacherSettings,
  TraceTraderSetting,
  TraderBacktestSummary,
  TraderBacktestTimelinePoint,
  TraderBacktestTrade,
  TraderHistoryPosition,
  TraderSyncPriority,
  TraderSyncStatus,
  TradingRuntimeMetadata,
} from "#/lib/trading/types";

export const trader = pgTable(
  "trader",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    nickName: text("nick_name"),
    platform: text("platform").notNull(),
    link: text("link").notNull(),
    avatar: text("avatar").notNull(),
    sign: text("sign"),
    strategyStatus: text("strategy_status").notNull(),
    strategyName: text("strategy_name").notNull(),
    strategyRiskRate: integer("strategy_risk_rate_basis_points").notNull(),
    balance: integer("balance_milli").notNull(),
    monthlyAveragePositionValue: integer("monthly_average_position_value_milli").notNull(),
    threeMonthMaxDrawdown: integer("three_month_max_drawdown_milli").notNull(),
    positionUpdateTime: timestamp("position_update_time"),
    positions: jsonb("positions").$type<PositionSnapshot[]>().notNull(),
    historyPositions: jsonb("history_positions").$type<TraderHistoryPosition[]>().notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown> | null>().default(null),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("trader_platform_idx").on(table.platform),
    index("trader_strategy_status_idx").on(table.strategyStatus),
  ],
);

export const teacher = pgTable(
  "teacher",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    platform: text("platform").notNull(),
    credentials: jsonb("credentials").$type<TeacherCredentials | null>().default(null),
    executionMode: text("execution_mode").$type<ExecutionMode>().default("dry-run").notNull(),
    balance: integer("balance_milli").notNull(),
    equity: integer("equity_milli").notNull(),
    freeUsdt: integer("free_usdt_milli").notNull(),
    unrealizedPnl: integer("unrealized_pnl_milli").notNull(),
    maxRiskRatio: integer("max_risk_ratio_basis_points").notNull(),
    nowRiskRatio: integer("now_risk_ratio_basis_points").notNull(),
    positions: jsonb("positions").$type<PositionSnapshot[]>().notNull(),
    teacherPositions: jsonb("teacher_positions").$type<PositionSnapshot[]>().notNull(),
    followRelations: jsonb("follow_relations").$type<FollowOrderRelation[]>().notNull(),
    traceTraderList: jsonb("trace_trader_list").$type<TraceTraderSetting[]>().notNull(),
    settings: jsonb("settings").$type<TeacherSettings>().notNull(),
    equityHistory: jsonb("equity_history").$type<TeacherEquityHistory>().notNull(),
    positionHistory: jsonb("position_history").$type<TeacherPositionHistoryEntry[]>().notNull(),
    lastSignalAt: timestamp("last_signal_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("teacher_owner_user_id_idx").on(table.ownerUserId)],
);

export const userTrader = pgTable(
  "user_trader",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    traderId: text("trader_id")
      .notNull()
      .references(() => trader.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.traderId] }),
    index("user_trader_user_id_idx").on(table.userId),
    index("user_trader_trader_id_idx").on(table.traderId),
  ],
);

export const userTraderWorkspace = pgTable("user_trader_workspace", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  initializedAt: timestamp("initialized_at").defaultNow().notNull(),
});

export const traderSyncState = pgTable(
  "trader_sync_state",
  {
    traderId: text("trader_id")
      .primaryKey()
      .references(() => trader.id, { onDelete: "cascade" }),
    priority: text("priority").$type<TraderSyncPriority>().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    fetchIntervalMs: integer("fetch_interval_ms").notNull(),
    nextFetchAt: timestamp("next_fetch_at"),
    lastAttemptAt: timestamp("last_attempt_at"),
    lastSuccessAt: timestamp("last_success_at"),
    lastStatus: text("last_status").$type<TraderSyncStatus>().notNull(),
    lastError: text("last_error"),
    failCount: integer("fail_count").default(0).notNull(),
    lockedUntil: timestamp("locked_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("trader_sync_state_priority_idx").on(table.priority),
    index("trader_sync_state_next_fetch_at_idx").on(table.nextFetchAt),
    index("trader_sync_state_locked_until_idx").on(table.lockedUntil),
  ],
);

export const traderBacktestRun = pgTable(
  "trader_backtest_run",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    traderId: text("trader_id").notNull(),
    uniqueName: text("unique_name").notNull(),
    nickName: text("nick_name").notNull(),
    mode: text("mode").notNull(),
    window: text("window").notNull(),
    initialBalance: integer("initial_balance_milli").notNull(),
    summary: jsonb("summary").$type<TraderBacktestSummary>().notNull(),
    timeline: jsonb("timeline").$type<TraderBacktestTimelinePoint[]>().notNull(),
    trades: jsonb("trades").$type<TraderBacktestTrade[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("trader_backtest_run_user_id_idx").on(table.userId),
    index("trader_backtest_run_platform_trader_idx").on(table.platform, table.traderId),
    index("trader_backtest_run_created_at_idx").on(table.createdAt),
  ],
);

export const runtimeState = pgTable("runtime_state", {
  id: text("id").primaryKey(),
  mongoConnected: boolean("mongo_connected").notNull(),
  traderSpyConnected: boolean("trader_spy_connected").notNull(),
  followEngineRunning: boolean("follow_engine_running").notNull(),
  wsServerUrl: text("ws_server_url").notNull(),
  httpPort: integer("http_port").notNull(),
  lastHeartbeat: timestamp("last_heartbeat"),
  metadata: jsonb("metadata").$type<TradingRuntimeMetadata | null>().default(null),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const runtimeEvent = pgTable(
  "runtime_event",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    level: text("level").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>().default(null),
  },
  (table) => [index("runtime_event_timestamp_idx").on(table.timestamp)],
);

export const marketCandle = pgTable(
  "market_candle",
  {
    platform: text("platform").notNull(),
    symbol: text("symbol").notNull(),
    interval: text("interval").notNull(),
    datetime: timestamp("datetime").notNull(),
    open: integer("open_milli").notNull(),
    high: integer("high_milli").notNull(),
    low: integer("low_milli").notNull(),
    close: integer("close_milli").notNull(),
    volume: integer("volume_milli").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.platform, table.symbol, table.interval, table.datetime] }),
  ],
);

export const teacherRelations = relations(teacher, ({ one }) => ({
  owner: one(user, {
    fields: [teacher.ownerUserId],
    references: [user.id],
  }),
}));

export const traderRelations = relations(trader, ({ many }) => ({
  userLinks: many(userTrader),
}));

export const traderBacktestRunRelations = relations(traderBacktestRun, ({ one }) => ({
  user: one(user, {
    fields: [traderBacktestRun.userId],
    references: [user.id],
  }),
}));

export const userTraderRelations = relations(userTrader, ({ one }) => ({
  user: one(user, {
    fields: [userTrader.userId],
    references: [user.id],
  }),
  trader: one(trader, {
    fields: [userTrader.traderId],
    references: [trader.id],
  }),
}));

export const userTraderWorkspaceRelations = relations(userTraderWorkspace, ({ one }) => ({
  user: one(user, {
    fields: [userTraderWorkspace.userId],
    references: [user.id],
  }),
}));

export const traderSyncStateRelations = relations(traderSyncState, ({ one }) => ({
  trader: one(trader, {
    fields: [traderSyncState.traderId],
    references: [trader.id],
  }),
}));

export const userTradingRelations = relations(user, ({ many }) => ({
  teachers: many(teacher),
  traderLinks: many(userTrader),
  traderWorkspaces: many(userTraderWorkspace),
}));

export type TraderRow = typeof trader.$inferSelect;
export type TeacherRow = typeof teacher.$inferSelect;
export type UserTraderRow = typeof userTrader.$inferSelect;
export type UserTraderWorkspaceRow = typeof userTraderWorkspace.$inferSelect;
export type TraderSyncStateRow = typeof traderSyncState.$inferSelect;
export type RuntimeStateRow = typeof runtimeState.$inferSelect;
export type RuntimeEventRow = typeof runtimeEvent.$inferSelect;
export type MarketCandleRow = typeof marketCandle.$inferSelect;

export type RuntimeStatePayload = Omit<AppRuntimeStatus, "lastHeartbeat"> & {
  lastHeartbeat: Date | null;
};

export type PersistedRuntimeEvent = Omit<RuntimeEvent, "timestamp"> & {
  timestamp: Date;
};

export const TRADING_RUNTIME_STATE_ID = "primary";
