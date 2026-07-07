import "@tanstack/react-start/server-only";
import { ensureLegacyMessageBridge } from "#/lib/messages/legacy-message-bridge";
import {
  getNotificationRouteKeys,
  mergeNotificationRouteSummary,
  sendRuntimeWarningNotification,
  sendStartupNotification,
  sendTraderChangeNotification,
} from "#/lib/system/notification-service";
import { BybitRuntimeError } from "#/lib/trading/adapters/bybit-runtime";
import { fetchTraderLiveSnapshot } from "#/lib/trading/adapters/trader-position-adapters";
import {
  BYBIT_RUNTIME_METADATA_KEY,
  parseBybitRuntimeState,
} from "#/lib/trading/bybit-runtime-state";
import {
  DISCOVER_CRAWLER_METADATA_KEY,
  DiscoverCrawlerScheduler,
  createDefaultDiscoverCrawlerState,
  type DiscoverCrawlerState,
} from "#/lib/trading/discover-crawler-scheduler";
import {
  applyPositionChangeToTeacher,
  cloneTeacher,
  cloneTrader,
  detectPositionChanges,
  updateTeacherMarksFromTraders,
} from "#/lib/trading/engine";
import { isExchangeBackedMode } from "#/lib/trading/execution-mode";
import { ensureLegacyWsBridge } from "#/lib/trading/legacy-ws-bridge";
import { supportsLiveRefresh } from "#/lib/trading/platform-utils";
import {
  REFRESH_SCHEDULER_METADATA_KEY,
  RefreshScheduler,
  TRADER_SYNC_LOCK_MS,
  createDefaultRefreshSchedulerState,
  isRefreshSchedulerPlatform,
} from "#/lib/trading/refresh-scheduler";
import {
  appendRuntimeEvent,
  beginTraderSyncAttempt,
  claimUnownedTeachers,
  claimUnownedTraders,
  completeTraderSyncAttempt,
  createTeacher,
  createTrader,
  deleteTeacherRecord,
  deleteTraderRecord,
  ensureTradingStore,
  getTraderSyncStatesByTraderIds,
  getRuntimeStatus,
  linkTraderToUser,
  listDueTraderSyncStates,
  listRuntimeEvents,
  listTeachers,
  listTeachersByOwner,
  listTraders,
  listTradersByUser,
  patchRuntimeMetadata,
  unlinkTraderFromUser,
  updateRuntimeStatusFlags,
  updateTeacherRecord,
  updateTraderRecord,
} from "#/lib/trading/store";
import { fetchTeacherAccountSnapshot } from "#/lib/trading/teacher-account-adapters";
import type {
  BybitRuntimeState,
  DiscoverCrawlerRuntimeState,
  FollowOrderRelation,
  MarketSubscriptionPlatformState,
  MarketSubscriptionState,
  PositionChange,
  RefreshSchedulerState,
  RuntimeEvent,
  TeacherSettings,
  TeacherRecord,
  TraceTraderSetting,
  TraderRecord,
} from "#/lib/trading/types";

const MARKET_SUBSCRIPTIONS_METADATA_KEY = "marketSubscriptions";
const NOTIFICATION_ROUTE_OVERRIDES_METADATA_KEY = "notificationRouteOverrides";
const DEFAULT_DRY_RUN_TEACHER_BALANCE = 10_000;
const LEGACY_TRADER_SPY_WS_PORT = Number(process.env.TRADER_SPY_WS_PORT ?? 8011);
const LEGACY_MSG_WS_PORT = Number(process.env.LEGACY_MSG_WS_PORT ?? 8001);

function buildEvent(input: Omit<RuntimeEvent, "id" | "timestamp">): RuntimeEvent {
  return {
    id: `${input.scope}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
    ...input,
  };
}

function createDefaultMarketSubscriptionState(): MarketSubscriptionState {
  return {
    derivedFrom: "follow-relations",
    lastReconciledAt: null,
    activePlatforms: [],
    totalSymbols: 0,
    totalRelations: 0,
    platforms: [],
  };
}

function parseRefreshSchedulerState(rawState: unknown): RefreshSchedulerState {
  if (!rawState || typeof rawState !== "object") {
    return createDefaultRefreshSchedulerState();
  }
  const candidate = rawState as Partial<RefreshSchedulerState>;
  return {
    ...createDefaultRefreshSchedulerState(),
    ...candidate,
    supportedPlatforms: createDefaultRefreshSchedulerState().supportedPlatforms,
    activePlatforms: Array.isArray(candidate.activePlatforms)
      ? candidate.activePlatforms.filter(isRefreshSchedulerPlatform)
      : [],
  } satisfies RefreshSchedulerState;
}

function parseDiscoverCrawlerState(rawState: unknown): DiscoverCrawlerState {
  if (!rawState || typeof rawState !== "object") {
    return createDefaultDiscoverCrawlerState();
  }
  const candidate = rawState as Partial<DiscoverCrawlerState>;
  return {
    ...createDefaultDiscoverCrawlerState(),
    ...candidate,
  } satisfies DiscoverCrawlerState;
}

function parseMarketSubscriptionState(rawState: unknown): MarketSubscriptionState {
  if (!rawState || typeof rawState !== "object") {
    return createDefaultMarketSubscriptionState();
  }
  const candidate = rawState as Partial<MarketSubscriptionState>;
  const platforms = Array.isArray(candidate.platforms)
    ? candidate.platforms
        .filter((item) =>
          Boolean(item && typeof item === "object" && typeof item.platform === "string"),
        )
        .map((item) => ({
          platform: item.platform as TeacherRecord["platform"],
          symbols: Array.isArray(item.symbols)
            ? item.symbols.filter((symbol): symbol is string => typeof symbol === "string")
            : [],
          symbolCount:
            typeof item.symbolCount === "number"
              ? item.symbolCount
              : Array.isArray(item.symbols)
                ? item.symbols.length
                : 0,
          teacherIds: Array.isArray(item.teacherIds)
            ? item.teacherIds.filter(
                (teacherId): teacherId is string => typeof teacherId === "string",
              )
            : [],
          teacherCount:
            typeof item.teacherCount === "number"
              ? item.teacherCount
              : Array.isArray(item.teacherIds)
                ? item.teacherIds.length
                : 0,
          relationCount: typeof item.relationCount === "number" ? item.relationCount : 0,
          lastMarkUpdateAt:
            typeof item.lastMarkUpdateAt === "number" ? item.lastMarkUpdateAt : null,
          lastTraderSnapshotAt:
            typeof item.lastTraderSnapshotAt === "number" ? item.lastTraderSnapshotAt : null,
          lastActivityAt: typeof item.lastActivityAt === "number" ? item.lastActivityAt : null,
        }))
    : [];
  return {
    ...createDefaultMarketSubscriptionState(),
    ...candidate,
    activePlatforms: Array.isArray(candidate.activePlatforms)
      ? candidate.activePlatforms.filter(
          (platform): platform is TeacherRecord["platform"] => typeof platform === "string",
        )
      : platforms.map((item) => item.platform),
    platforms,
    totalSymbols:
      typeof candidate.totalSymbols === "number"
        ? candidate.totalSymbols
        : platforms.reduce((sum, item) => sum + item.symbolCount, 0),
    totalRelations:
      typeof candidate.totalRelations === "number"
        ? candidate.totalRelations
        : platforms.reduce((sum, item) => sum + item.relationCount, 0),
    lastReconciledAt:
      typeof candidate.lastReconciledAt === "number" ? candidate.lastReconciledAt : null,
  } satisfies MarketSubscriptionState;
}

function parseNotificationRouteOverrides(
  rawState: unknown,
): Partial<Record<string, Array<"feishu" | "telegram" | "discord">>> | null {
  if (!rawState || typeof rawState !== "object") {
    return null;
  }
  const result: Partial<Record<string, Array<"feishu" | "telegram" | "discord">>> = {};
  for (const routeKey of getNotificationRouteKeys()) {
    const candidate = (rawState as Record<string, unknown>)[routeKey];
    if (Array.isArray(candidate)) {
      const providers = candidate.filter(
        (item): item is "feishu" | "telegram" | "discord" =>
          item === "feishu" || item === "telegram" || item === "discord",
      );
      if (providers.length > 0) {
        result[routeKey] = providers;
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

class TradingRuntime {
  private readonly previousPositions = new Map<string, TraderRecord["positions"]>();
  private bootPromise: Promise<void> | null = null;
  private readonly refreshScheduler: RefreshScheduler;
  private readonly discoverCrawlerScheduler: DiscoverCrawlerScheduler;

  constructor() {
    this.refreshScheduler = new RefreshScheduler({
      getRefreshSchedulerState: () => this.getRefreshSchedulerState(),
      patchRefreshSchedulerState: (patch) => this.patchRefreshSchedulerState(patch),
      pushEvent: (event) => this.pushEvent(event),
      listDueTraderSyncStates: (limit) => listDueTraderSyncStates(limit),
      beginTraderSyncAttempt: (traderId, lockMs) => beginTraderSyncAttempt(traderId, lockMs),
      refreshTraderPositions: (traderId, options) => this.refreshTraderPositions(traderId, options),
      syncTeacherStates: (teachers, traders, options) =>
        this.syncTeacherStates(teachers, traders, options),
      listTraders: () => listTraders(),
      listTeachers: () => listTeachers(),
    });
    this.discoverCrawlerScheduler = new DiscoverCrawlerScheduler({
      getState: () => this.getDiscoverCrawlerState(),
      patchState: (patch) => this.patchDiscoverCrawlerState(patch),
      pushEvent: (event) => this.pushEvent(event),
    });
  }

  private async getDiscoverCrawlerState(): Promise<DiscoverCrawlerState> {
    const status = await getRuntimeStatus();
    const raw = (status.metadata ?? {})[DISCOVER_CRAWLER_METADATA_KEY];
    return parseDiscoverCrawlerState(raw);
  }

  private async patchDiscoverCrawlerState(
    patch:
      | Partial<DiscoverCrawlerState>
      | ((current: DiscoverCrawlerState) => DiscoverCrawlerState),
  ) {
    return patchRuntimeMetadata(DISCOVER_CRAWLER_METADATA_KEY, (raw) => {
      const current = parseDiscoverCrawlerState(raw);
      return typeof patch === "function" ? patch(current) : { ...current, ...patch };
    });
  }

  private async getRefreshSchedulerState() {
    const status = await getRuntimeStatus();
    return parseRefreshSchedulerState((status.metadata ?? {})[REFRESH_SCHEDULER_METADATA_KEY]);
  }

  private async getMarketSubscriptionState() {
    const status = await getRuntimeStatus();
    return parseMarketSubscriptionState((status.metadata ?? {})[MARKET_SUBSCRIPTIONS_METADATA_KEY]);
  }

  private async getBybitRuntimeState() {
    const status = await getRuntimeStatus();
    return parseBybitRuntimeState((status.metadata ?? {})[BYBIT_RUNTIME_METADATA_KEY]);
  }

  private async getNotificationRouteOverrides() {
    const status = await getRuntimeStatus();
    return parseNotificationRouteOverrides(
      (status.metadata ?? {})[NOTIFICATION_ROUTE_OVERRIDES_METADATA_KEY],
    );
  }

  private async patchRefreshSchedulerState(
    patch:
      | Partial<RefreshSchedulerState>
      | ((current: RefreshSchedulerState) => RefreshSchedulerState),
  ) {
    return patchRuntimeMetadata(REFRESH_SCHEDULER_METADATA_KEY, (raw) => {
      const current = parseRefreshSchedulerState(raw);
      return typeof patch === "function" ? patch(current) : { ...current, ...patch };
    });
  }

  private async patchMarketSubscriptionState(
    patch:
      | Partial<MarketSubscriptionState>
      | ((current: MarketSubscriptionState) => MarketSubscriptionState),
  ) {
    return patchRuntimeMetadata(MARKET_SUBSCRIPTIONS_METADATA_KEY, (raw) => {
      const current = parseMarketSubscriptionState(raw);
      return typeof patch === "function" ? patch(current) : { ...current, ...patch };
    });
  }

  private async patchBybitRuntimeState(
    patch: Partial<BybitRuntimeState> | ((current: BybitRuntimeState) => BybitRuntimeState),
  ) {
    return patchRuntimeMetadata(BYBIT_RUNTIME_METADATA_KEY, (raw) => {
      const current = parseBybitRuntimeState(raw);
      return typeof patch === "function" ? patch(current) : { ...current, ...patch };
    });
  }

  private async patchNotificationRouteOverrides(
    nextOverrides: Partial<Record<string, Array<"feishu" | "telegram" | "discord">>> | null,
  ) {
    const stored = nextOverrides ?? undefined;
    return patchRuntimeMetadata(NOTIFICATION_ROUTE_OVERRIDES_METADATA_KEY, () => stored);
  }

  private async withTradersAndTeachers() {
    const [traders, teachers] = await Promise.all([listTraders(), listTeachers()]);

    for (const trader of traders) {
      if (!this.previousPositions.has(trader.id)) {
        this.previousPositions.set(
          trader.id,
          trader.positions.map((position) => ({ ...position })),
        );
      }
    }

    return {
      traders: traders.map(cloneTrader),
      teachers: teachers.map(cloneTeacher),
    };
  }

  private async attachSyncStates(traders: TraderRecord[]) {
    const syncStates = await getTraderSyncStatesByTraderIds(traders.map((trader) => trader.id));
    const syncStateMap = new Map(syncStates.map((syncState) => [syncState.traderId, syncState]));
    return traders.map((trader) => ({
      ...trader,
      syncState: syncStateMap.get(trader.id) ?? null,
    }));
  }

  private async pushEvent(event: Omit<RuntimeEvent, "id" | "timestamp">) {
    await appendRuntimeEvent(buildEvent(event));
    if (event.level === "warn") {
      const routeSummaryOverride = await this.getNotificationRouteOverrides();
      await sendRuntimeWarningNotification({
        scope: event.scope,
        title: event.title,
        detail: event.detail,
        route:
          event.title === "bybit browser fallback attention required"
            ? "bybit-attention"
            : "runtime-warning",
        screenshotPath:
          event.title === "bybit browser fallback attention required"
            ? this.extractScreenshotPathFromDetail(event.detail)
            : null,
        routeSummaryOverride,
      });
    }
  }

  private extractScreenshotPathFromDetail(detail: string) {
    const marker = "Screenshot:";
    const markerIndex = detail.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }

    return detail.slice(markerIndex + marker.length).trim() || null;
  }

  private async getTeacherForUser(userId: string, teacherId: string) {
    const teachers = await this.getTeachersForUser(userId);
    return teachers.find((teacher) => teacher.id === teacherId) ?? null;
  }

  private async removeTraderFromTeacherState(traderId: string) {
    const teachers = await listTeachers();

    for (const teacherRecord of teachers) {
      const nextTraceTraderList = teacherRecord.traceTraderList.filter(
        (item) => item.id !== traderId,
      );
      const nextFollowRelations = teacherRecord.followRelations.filter(
        (relation) => relation.followTraderId !== traderId,
      );

      if (
        nextTraceTraderList.length === teacherRecord.traceTraderList.length &&
        nextFollowRelations.length === teacherRecord.followRelations.length
      ) {
        continue;
      }

      teacherRecord.traceTraderList = nextTraceTraderList;
      teacherRecord.followRelations = nextFollowRelations;
      updateTeacherMarksFromTraders(teacherRecord, []);
      await updateTeacherRecord(teacherRecord.id, teacherRecord);
    }
  }

  private async reconcileMarketSubscriptions(teachers: TeacherRecord[], traders?: TraderRecord[]) {
    const traderRecords = traders ?? (await listTraders());
    const subscriptions = new Map<
      TeacherRecord["platform"],
      {
        symbols: Set<string>;
        teacherIds: Set<string>;
        relationCount: number;
        lastMarkUpdateAt: number | null;
        lastTraderSnapshotAt: number | null;
      }
    >();

    for (const teacherRecord of teachers) {
      if (teacherRecord.followRelations.length === 0) {
        continue;
      }

      const entry = subscriptions.get(teacherRecord.platform) ?? {
        symbols: new Set<string>(),
        teacherIds: new Set<string>(),
        relationCount: 0,
        lastMarkUpdateAt: null,
        lastTraderSnapshotAt: null,
      };
      entry.teacherIds.add(teacherRecord.id);

      for (const relation of teacherRecord.followRelations) {
        entry.relationCount += 1;
        entry.symbols.add(relation.symbol);
        if (
          relation.updateTime &&
          (!entry.lastMarkUpdateAt || relation.updateTime > entry.lastMarkUpdateAt)
        ) {
          entry.lastMarkUpdateAt = relation.updateTime;
        }

        const trader = traderRecords.find((item) => item.id === relation.followTraderId);
        if (
          trader?.positionUpdateTime &&
          (!entry.lastTraderSnapshotAt || trader.positionUpdateTime > entry.lastTraderSnapshotAt)
        ) {
          entry.lastTraderSnapshotAt = trader.positionUpdateTime;
        }
      }

      subscriptions.set(teacherRecord.platform, entry);
    }

    const platforms = Array.from(subscriptions.entries())
      .map(([platform, entry]) => {
        const symbols = Array.from(entry.symbols).sort();
        const teacherIds = Array.from(entry.teacherIds).sort();
        const lastActivityAt = [entry.lastMarkUpdateAt, entry.lastTraderSnapshotAt].reduce<
          number | null
        >((max, value) => {
          if (value == null) {
            return max;
          }
          return max == null ? value : Math.max(max, value);
        }, null);

        return {
          platform,
          symbols,
          symbolCount: symbols.length,
          teacherIds,
          teacherCount: teacherIds.length,
          relationCount: entry.relationCount,
          lastMarkUpdateAt: entry.lastMarkUpdateAt,
          lastTraderSnapshotAt: entry.lastTraderSnapshotAt,
          lastActivityAt,
        } satisfies MarketSubscriptionPlatformState;
      })
      .sort((left, right) => left.platform.localeCompare(right.platform));

    return this.patchMarketSubscriptionState({
      derivedFrom: "follow-relations",
      lastReconciledAt: Date.now(),
      activePlatforms: platforms.map((item) => item.platform),
      totalSymbols: platforms.reduce((sum, item) => sum + item.symbolCount, 0),
      totalRelations: platforms.reduce((sum, item) => sum + item.relationCount, 0),
      platforms,
    });
  }

  async ensureBooted() {
    if (!this.bootPromise) {
      this.bootPromise = (async () => {
        await ensureTradingStore();

        const status = await getRuntimeStatus();
        if (!status.followEngineRunning || !status.mongoConnected) {
          await updateRuntimeStatusFlags({
            mongoConnected: true,
            followEngineRunning: true,
            wsServerUrl: `ws://127.0.0.1:${LEGACY_TRADER_SPY_WS_PORT}`,
            lastHeartbeat: Date.now(),
          });
          await this.pushEvent({
            scope: "system",
            level: "info",
            title: "runtime booted",
            detail: "Merged TanStack runtime initialized with persisted trader + teacher state.",
          });
          await sendStartupNotification(
            "Merged TanStack runtime initialized with persisted trader + teacher state.",
          );
        }

        await ensureLegacyWsBridge({
          port: LEGACY_TRADER_SPY_WS_PORT,
          onLegacyPositionChange: async ({ trader, changes }) => {
            if (!trader) {
              return;
            }

            await this.ingestLegacyPositionChange({
              trader,
              changes,
            });
          },
          onInfo: async (message) => {
            await this.pushEvent({
              scope: "system",
              level: "info",
              title: "legacy traderSpy websocket bridge",
              detail: message,
            });
          },
          onWarn: async (message) => {
            await this.pushEvent({
              scope: "system",
              level: "warn",
              title: "legacy traderSpy websocket bridge warning",
              detail: message,
            });
          },
        });

        await ensureLegacyMessageBridge({
          port: LEGACY_MSG_WS_PORT,
          onInfo: async (message) => {
            await this.pushEvent({
              scope: "system",
              level: "info",
              title: "legacy msg bridge",
              detail: message,
            });
          },
          onWarn: async (message) => {
            await this.pushEvent({
              scope: "system",
              level: "warn",
              title: "legacy msg bridge warning",
              detail: message,
            });
          },
        });

        const refreshSchedulerState = await this.getRefreshSchedulerState();
        if (refreshSchedulerState.running) {
          this.refreshScheduler.setRunning(false);
          this.refreshScheduler.setLoop(null);
        }
        if (!refreshSchedulerState.lastStartedAt || refreshSchedulerState.running) {
          await this.startRefreshScheduler();
        }

        const discoverCrawlerState = await this.getDiscoverCrawlerState();
        if (discoverCrawlerState.running) {
          this.discoverCrawlerScheduler.setRunning(false);
          this.discoverCrawlerScheduler.setLoop(null);
        }
        await this.startDiscoverCrawler();

        await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
      })();
    }

    await this.bootPromise;
  }

  private async handlePositionChanges(
    traders: TraderRecord[],
    teachers: TeacherRecord[],
    trader: TraderRecord,
    changes: PositionChange[],
  ) {
    if (changes.length === 0) {
      await this.syncTeacherStates(teachers, traders, {
        refreshLiveAccounts: false,
        warningContext: `processing unchanged snapshot for ${trader.name}`,
      });
      return;
    }

    const touchedTeacherIds = new Set<string>();

    for (const change of changes) {
      for (const teacherRecord of teachers) {
        const beforeCount = teacherRecord.followRelations.length;
        const beforeLastSignalAt = teacherRecord.lastSignalAt;
        await applyPositionChangeToTeacher(teacherRecord, trader, change);
        const afterCount = teacherRecord.followRelations.length;
        if (teacherRecord.lastSignalAt !== beforeLastSignalAt) {
          touchedTeacherIds.add(teacherRecord.id);
        }
        await this.pushEvent({
          scope: "follow-engine",
          level: "info",
          title: "execution service evaluated change",
          detail: `${teacherRecord.name} handled ${change.symbol} ${change.positionSide} via ${teacherRecord.executionMode ?? "dry-run"} execution mode (${beforeCount} -> ${afterCount} relations).`,
          entityType: "teacher",
          entityId: teacherRecord.id,
        });
        if (teacherRecord.executionMode === "live" || teacherRecord.executionMode === "demo") {
          await this.pushEvent({
            scope: "follow-engine",
            level: "info",
            title: `${teacherRecord.executionMode} execution path selected`,
            detail: `${teacherRecord.name} used ${teacherRecord.executionMode} execution mode for ${change.symbol} on ${teacherRecord.platform}.`,
            entityType: "teacher",
            entityId: teacherRecord.id,
          });
        } else {
          await this.pushEvent({
            scope: "follow-engine",
            level: "info",
            title: "dry-run execution path selected",
            detail: `${teacherRecord.name} used dry-run execution mode for ${change.symbol} on ${teacherRecord.platform}.`,
            entityType: "teacher",
            entityId: teacherRecord.id,
          });
        }
      }
    }

    await this.syncTeacherStates(
      teachers.filter((teacherRecord) => touchedTeacherIds.has(teacherRecord.id)),
      traders,
      {
        refreshLiveAccounts: true,
        warningContext: `processing changes for ${trader.name}`,
      },
    );

    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: `follow engine processed ${trader.name}`,
      detail: `${changes.length} position change event(s) were applied to active teacher accounts.`,
    });
  }

  private async syncTeacherStates(
    teachers: TeacherRecord[],
    traders: TraderRecord[],
    options?: {
      refreshLiveAccounts?: boolean;
      warningContext?: string;
    },
  ) {
    for (const teacherRecord of teachers) {
      if (
        options?.refreshLiveAccounts &&
        (teacherRecord.executionMode === "live" || teacherRecord.executionMode === "demo")
      ) {
        try {
          const snapshot = await fetchTeacherAccountSnapshot(teacherRecord);
          teacherRecord.balance = snapshot.balance;
          teacherRecord.equity = snapshot.equity;
          teacherRecord.freeUsdt = snapshot.freeUsdt;
          teacherRecord.unrealizedPnl = snapshot.unrealizedPnl;
          teacherRecord.teacherPositions = snapshot.teacherPositions.map((position) => ({
            ...position,
          }));
        } catch (error) {
          const detail =
            error instanceof Error
              ? error.message
              : `unknown teacher account refresh failure for ${teacherRecord.name}`;
          await this.pushEvent({
            scope: "follow-engine",
            level: "warn",
            title: "teacher account auto-refresh failed",
            detail: `${teacherRecord.name} account snapshot refresh failed while ${options?.warningContext ?? "syncing teacher state"}: ${detail}`,
            entityType: "teacher",
            entityId: teacherRecord.id,
          });
        }
      }

      updateTeacherMarksFromTraders(teacherRecord, traders);
      await updateTeacherRecord(teacherRecord.id, teacherRecord);
    }

    if (teachers.length > 0) {
      await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    }
  }

  async getTraders() {
    await this.ensureBooted();
    return this.attachSyncStates(await listTraders());
  }

  async getTradersForUser(userId: string) {
    await this.ensureBooted();
    await claimUnownedTraders(userId);
    return this.attachSyncStates(await listTradersByUser(userId));
  }

  async getTeachers() {
    await this.ensureBooted();
    return listTeachers();
  }

  async getTeachersForUser(userId: string) {
    await this.ensureBooted();
    await claimUnownedTeachers(userId);
    return listTeachersByOwner(userId);
  }

  async getStatus() {
    await this.ensureBooted();
    return getRuntimeStatus();
  }

  async getEvents() {
    await this.ensureBooted();
    return listRuntimeEvents();
  }

  async getRefreshScheduler() {
    await this.ensureBooted();
    return this.getRefreshSchedulerState();
  }

  async getMarketSubscriptions() {
    await this.ensureBooted();
    return this.getMarketSubscriptionState();
  }

  async getNotificationConfig() {
    await this.ensureBooted();
    return mergeNotificationRouteSummary(await this.getNotificationRouteOverrides());
  }

  async updateNotificationRouteOverrides(
    overrides: Partial<Record<string, Array<"feishu" | "telegram" | "discord">>> | null,
  ) {
    await this.ensureBooted();
    await this.patchNotificationRouteOverrides(overrides);
    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "notification routes updated",
      detail: "Notification route overrides were updated from the merged runtime system page.",
      entityType: "system",
      entityId: "notification-routes",
    });
    return this.getNotificationConfig();
  }

  async getBybitRuntimeStatus() {
    await this.ensureBooted();
    return this.getBybitRuntimeState();
  }

  async ingestTraderSnapshot(
    traderId: string,
    positions: TraderRecord["positions"],
    traderPatch?: Partial<TraderRecord>,
  ) {
    await this.ensureBooted();
    const { traders, teachers } = await this.withTradersAndTeachers();
    const trader = traders.find((item) => item.id === traderId);
    if (!trader) {
      return null;
    }

    const previous = this.previousPositions.get(trader.id) ?? [];
    const nextPositions = positions.map((position) => ({ ...position }));
    const changes = detectPositionChanges(previous, nextPositions);

    trader.positions = nextPositions;
    trader.positionUpdateTime = Date.now();
    if (traderPatch) {
      Object.assign(trader, traderPatch);
    }
    this.previousPositions.set(
      trader.id,
      trader.positions.map((position) => ({ ...position })),
    );

    await updateTraderRecord(trader.id, trader);
    await updateRuntimeStatusFlags({
      mongoConnected: true,
      traderSpyConnected: true,
      followEngineRunning: true,
      lastHeartbeat: Date.now(),
    });

    await this.handlePositionChanges(traders, teachers, trader, changes);
    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    if (changes.length > 0) {
      const routeSummaryOverride = await this.getNotificationRouteOverrides();
      await sendTraderChangeNotification({
        trader: {
          name: trader.name,
          platform: trader.platform,
          link: trader.link,
        },
        changes,
        positions: trader.positions,
        routeSummaryOverride,
      });
    }
    await this.pushEvent({
      scope: "trader-spy",
      level: "info",
      title: "snapshot ingested",
      detail: `${trader.name} snapshot accepted with ${positions.length} position(s).`,
    });

    return trader;
  }

  async addTrader(traderRecord: TraderRecord) {
    await this.ensureBooted();
    await createTrader(traderRecord);
    this.previousPositions.set(
      traderRecord.id,
      traderRecord.positions.map((position) => ({ ...position })),
    );
    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "trader added",
      detail: `${traderRecord.name} (${traderRecord.platform}) was added to the merged runtime.`,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    return listTraders();
  }

  async addTraderForUser(userId: string, traderRecord: TraderRecord) {
    await this.ensureBooted();

    const existing = (await listTraders()).find((item) => item.id === traderRecord.id);
    let created = false;
    if (!existing) {
      await createTrader(traderRecord);
      this.previousPositions.set(
        traderRecord.id,
        traderRecord.positions.map((position) => ({ ...position })),
      );
      await this.pushEvent({
        scope: "system",
        level: "info",
        title: "trader added",
        detail: `${traderRecord.name} (${traderRecord.platform}) was added to the merged runtime.`,
        entityType: "trader",
        entityId: traderRecord.id,
      });
      created = true;
    }

    await linkTraderToUser(userId, traderRecord.id);
    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "trader linked to user",
      detail: `${traderRecord.name} was added to the current user strategy workspace.`,
      entityType: "trader",
      entityId: traderRecord.id,
    });

    if (created && supportsLiveRefresh(traderRecord.platform)) {
      try {
        await this.refreshTraderPositions(traderRecord.id);
        await this.pushEvent({
          scope: "system",
          level: "info",
          title: "trader hydrated after creation",
          detail: `${traderRecord.name} was live-refreshed immediately after creation to hydrate platform metadata and positions.`,
          entityType: "trader",
          entityId: traderRecord.id,
        });
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "unknown post-create trader hydration failure";
        await this.pushEvent({
          scope: "system",
          level: "warn",
          title: "trader hydration after creation failed",
          detail: `${traderRecord.name} was created, but immediate live hydration failed: ${detail}`,
          entityType: "trader",
          entityId: traderRecord.id,
        });
      }
    }

    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    return this.getTradersForUser(userId);
  }

  async updateTrader(traderId: string, patch: Partial<TraderRecord>) {
    await this.ensureBooted();
    const next = await updateTraderRecord(traderId, patch);
    if (!next) {
      return null;
    }

    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "trader updated",
      detail: `${next.name} configuration was updated.`,
    });
    return next;
  }

  async removeTraderForUser(userId: string, traderId: string) {
    await this.ensureBooted();
    const traders = await this.getTradersForUser(userId);
    const trader = traders.find((item) => item.id === traderId);
    if (!trader) {
      return null;
    }

    await unlinkTraderFromUser(userId, traderId);
    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "trader removed from user workspace",
      detail: `${trader.name} (${trader.platform}) was removed from the current user strategy workspace.`,
      entityType: "trader",
      entityId: traderId,
    });
    return this.getTradersForUser(userId);
  }

  async deleteTrader(traderId: string) {
    await this.ensureBooted();
    const traders = await listTraders();
    const trader = traders.find((item) => item.id === traderId);
    if (!trader) {
      return null;
    }

    await this.removeTraderFromTeacherState(traderId);
    await deleteTraderRecord(traderId);
    this.previousPositions.delete(traderId);
    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "trader deleted",
      detail: `${trader.name} (${trader.platform}) was deleted from the shared trader pool.`,
      entityType: "trader",
      entityId: traderId,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    return this.getTraders();
  }

  async refreshTraderPositions(
    traderId: string,
    options?: {
      preserveRunningState?: boolean;
    },
  ) {
    await this.ensureBooted();
    const traders = await listTraders();
    const trader = traders.find((item) => item.id === traderId);
    if (!trader) {
      return null;
    }

    let syncAttemptOwned = Boolean(options?.preserveRunningState);
    try {
      const attemptAt = Date.now();
      if (!options?.preserveRunningState) {
        const claim = await beginTraderSyncAttempt(trader.id, TRADER_SYNC_LOCK_MS, attemptAt);
        if (!claim) {
          throw new Error(`Trader sync already in progress for ${trader.name}.`);
        }
        syncAttemptOwned = true;
      }

      if (trader.platform === "bybit") {
        await this.patchBybitRuntimeState((current) => ({
          ...current,
          lastTraderId: trader.id,
          lastAttemptAt: attemptAt,
        }));
      }

      let snapshot;
      try {
        snapshot = await fetchTraderLiveSnapshot(trader);
      } catch (error) {
        if (error instanceof BybitRuntimeError) {
          await this.patchBybitRuntimeState((current) => ({
            ...current,
            lastStatus: error.report.status,
            lastMode: error.report.mode,
            lastTraderId: error.report.traderId,
            lastDetail: error.report.detail,
            lastScreenshotPath: error.report.screenshotPath ?? null,
            lastAttemptAt: Date.now(),
          }));
          await this.pushEvent({
            scope: "trader-spy",
            level: "warn",
            title: "bybit browser fallback attention required",
            detail: `${trader.name} (${trader.id}) reported ${error.report.status} via ${error.report.mode}: ${error.report.detail}${
              error.report.screenshotPath ? ` Screenshot: ${error.report.screenshotPath}` : ""
            }`,
            entityType: "trader",
            entityId: trader.id,
          });
        }
        throw error;
      }

      if (trader.platform === "bybit") {
        const usingApiCredentials = Boolean(
          process.env.BYBIT_API_COOKIE || process.env.BYBIT_API_USERTOKEN,
        );
        await this.patchBybitRuntimeState((current) => ({
          ...current,
          lastStatus: usingApiCredentials ? "api-success" : "browser-success",
          lastMode: usingApiCredentials ? "api" : "browser-fallback",
          lastTraderId: trader.id,
          lastDetail: usingApiCredentials
            ? "Bybit trader positions refreshed via API credentials."
            : "Bybit trader positions refreshed via browser fallback.",
          lastScreenshotPath: null,
          lastAttemptAt: Date.now(),
          lastSuccessAt: Date.now(),
        }));
      }

      const refreshed = await this.ingestTraderSnapshot(
        traderId,
        snapshot.positions,
        snapshot.traderPatch,
      );
      if (syncAttemptOwned) {
        await completeTraderSyncAttempt(trader.id, {
          status: "success",
        });
      }
      await this.pushEvent({
        scope: "trader-spy",
        level: "info",
        title: "live refresh completed",
        detail: `${trader.name} live positions refreshed from ${trader.platform}.`,
      });
      return refreshed;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown trader refresh failure";
      if (syncAttemptOwned) {
        await completeTraderSyncAttempt(trader.id, {
          status: "failed",
          error: detail,
        });
      }
      throw error;
    }
  }

  async refreshAllSupportedTraderPositions() {
    await this.ensureBooted();
    const traders = await listTraders();
    const refreshableTraders = traders.filter((trader) => supportsLiveRefresh(trader.platform));
    const refreshedTraderIds: string[] = [];
    const failed: Array<{ traderId: string; traderName: string; detail: string }> = [];

    for (const trader of refreshableTraders) {
      try {
        await this.refreshTraderPositions(trader.id);
        refreshedTraderIds.push(trader.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown bulk refresh failure";
        failed.push({
          traderId: trader.id,
          traderName: trader.name,
          detail,
        });
        await this.pushEvent({
          scope: "trader-spy",
          level: "warn",
          title: "bulk trader refresh failed",
          detail: `${trader.name} (${trader.platform}) bulk refresh failed: ${detail}`,
          entityType: "trader",
          entityId: trader.id,
        });
      }
    }

    await this.pushEvent({
      scope: "trader-spy",
      level: failed.length > 0 ? "warn" : "info",
      title: "bulk trader refresh completed",
      detail: `Bulk refresh finished for ${refreshedTraderIds.length}/${refreshableTraders.length} supported trader(s).`,
    });

    return {
      total: refreshableTraders.length,
      refreshedTraderIds,
      failed,
    };
  }

  async refreshTeacherAccountForUser(userId: string, teacherId: string) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    if (teacherRecord.executionMode === "dry-run") {
      throw new Error("Internal paper accounts cannot refresh from an exchange API");
    }

    const snapshot = await fetchTeacherAccountSnapshot(teacherRecord);
    teacherRecord.balance = snapshot.balance;
    teacherRecord.equity = snapshot.equity;
    teacherRecord.freeUsdt = snapshot.freeUsdt;
    teacherRecord.unrealizedPnl = snapshot.unrealizedPnl;
    teacherRecord.teacherPositions = snapshot.teacherPositions.map((position) => ({ ...position }));

    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher account refreshed",
      detail: `${teacherRecord.name} account snapshot refreshed from ${teacherRecord.platform}.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    return teacherRecord;
  }

  async startRefreshScheduler() {
    await this.ensureBooted();
    return this.refreshScheduler.start();
  }

  async stopRefreshScheduler() {
    await this.ensureBooted();
    return this.refreshScheduler.stop();
  }

  async getDiscoverCrawlerStatus(): Promise<DiscoverCrawlerRuntimeState> {
    await this.ensureBooted();
    const state = await this.getDiscoverCrawlerState();
    const { getDiscoverCrawlerStatus: getRankCacheStatus } =
      await import("#/lib/trading/discover-crawler");
    const { getDiscoverDeepCacheStatus } = await import("#/lib/trading/discover-deep-cache");
    const [rankCache, deepCache] = await Promise.all([
      getRankCacheStatus(),
      getDiscoverDeepCacheStatus(),
    ]);
    return {
      running: state.running,
      iterationCount: state.iterationCount,
      lastStartedAt: state.lastStartedAt,
      lastStoppedAt: state.lastStoppedAt,
      lastCompletedAt: state.lastCompletedAt,
      lastError: state.lastError,
      intervalMs: state.intervalMs,
      rankCache,
      deepCache,
      lastResultSummary: state.lastResult
        ? {
            totalFetched: state.lastResult.totalFetched,
            uniqueTraders: state.lastResult.uniqueTraders,
            perPlatform: state.lastResult.perPlatform,
            errorCount: state.lastResult.errors.length,
            deepAttempted: state.lastResult.deep.attempted,
            deepSucceeded: state.lastResult.deep.succeeded,
            deepFailed: state.lastResult.deep.failed,
          }
        : null,
    };
  }

  async startDiscoverCrawler() {
    await this.ensureBooted();
    return this.discoverCrawlerScheduler.start();
  }

  async stopDiscoverCrawler() {
    await this.ensureBooted();
    return this.discoverCrawlerScheduler.stop();
  }

  async runDiscoverCrawlerOnce() {
    await this.ensureBooted();
    return this.discoverCrawlerScheduler.runOnce();
  }

  async addTeacher(input: {
    ownerUserId?: string;
    id: string;
    name: string;
    platform: TeacherRecord["platform"];
    credentials?: TeacherRecord["credentials"];
    executionMode?: TeacherRecord["executionMode"];
    settings?: TeacherSettings;
  }) {
    await this.ensureBooted();
    if (input.executionMode === "demo") {
      const { DEMO_TEACHER_PLATFORMS } = await import("#/lib/trading/follow-platform");
      if (!DEMO_TEACHER_PLATFORMS.includes(input.platform)) {
        throw new Error(
          `Exchange demo accounts are limited to ${DEMO_TEACHER_PLATFORMS.join(" and ")}.`,
        );
      }
      if (!input.credentials?.apiKey || !input.credentials.apiSecret) {
        throw new Error("Exchange demo accounts require API credentials.");
      }
    }
    const initialBalance =
      (input.executionMode ?? "dry-run") === "dry-run" ? DEFAULT_DRY_RUN_TEACHER_BALANCE : 0;

    const teacherRecord: TeacherRecord = {
      id: input.id,
      name: input.name,
      platform: input.platform,
      credentials: input.credentials ?? null,
      executionMode: input.executionMode ?? "dry-run",
      balance: initialBalance,
      equity: initialBalance,
      freeUsdt: initialBalance,
      unrealizedPnl: 0,
      maxRiskRatio: 0,
      nowRiskRatio: 0,
      positions: [],
      teacherPositions: [],
      followRelations: [],
      traceTraderList: [],
      settings: input.settings ?? {
        accountMaxRiskRate: 0.2,
        safeMarginRate: 0.25,
        limitRiskRatio: 0.4,
      },
      equityHistory: {
        min: [],
        hour: [],
        day: [],
      },
      positionHistory: [],
      lastSignalAt: null,
    };

    await createTeacher(teacherRecord, input.ownerUserId ?? null);

    if (
      isExchangeBackedMode(teacherRecord.executionMode) &&
      teacherRecord.credentials?.apiKey &&
      teacherRecord.credentials.apiSecret
    ) {
      try {
        const snapshot = await fetchTeacherAccountSnapshot(teacherRecord);
        teacherRecord.balance = snapshot.balance;
        teacherRecord.equity = snapshot.equity;
        teacherRecord.freeUsdt = snapshot.freeUsdt;
        teacherRecord.unrealizedPnl = snapshot.unrealizedPnl;
        teacherRecord.teacherPositions = snapshot.teacherPositions.map((position) => ({
          ...position,
        }));
        await updateTeacherRecord(teacherRecord.id, teacherRecord, input.ownerUserId ?? undefined);
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : "unknown teacher account initial refresh failure";
        await this.pushEvent({
          scope: "system",
          level: "warn",
          title: "teacher initial account refresh failed",
          detail: `${teacherRecord.name} was added but the initial ${teacherRecord.executionMode} account snapshot failed: ${detail}`,
          entityType: "teacher",
          entityId: teacherRecord.id,
        });
      }
    }

    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "teacher added",
      detail: `${teacherRecord.name} (${teacherRecord.platform}) was added to the merged runtime.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    return input.ownerUserId ? listTeachersByOwner(input.ownerUserId) : listTeachers();
  }

  async updateTeacherSettings(teacherId: string, settings: TeacherSettings) {
    await this.ensureBooted();
    const teachers = await listTeachers();
    const teacherRecord = teachers.find((item) => item.id === teacherId);
    if (!teacherRecord) {
      return null;
    }

    teacherRecord.settings = { ...settings };
    await updateTeacherRecord(teacherId, teacherRecord);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher settings updated",
      detail: `${teacherRecord.name} risk settings were updated.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    return teacherRecord;
  }

  async updateTeacherSettingsForUser(userId: string, teacherId: string, settings: TeacherSettings) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    teacherRecord.settings = { ...settings };
    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher settings updated",
      detail: `${teacherRecord.name} risk settings were updated.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    return teacherRecord;
  }

  async updateTeacherExecution(
    teacherId: string,
    patch: Pick<TeacherRecord, "credentials" | "executionMode">,
  ) {
    await this.ensureBooted();
    const teachers = await listTeachers();
    const teacherRecord = teachers.find((item) => item.id === teacherId);
    if (!teacherRecord) {
      return null;
    }

    if (patch.credentials !== undefined) {
      teacherRecord.credentials = patch.credentials;
    }
    if (patch.executionMode !== undefined) {
      teacherRecord.executionMode = patch.executionMode;
    }

    await updateTeacherRecord(teacherId, teacherRecord);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher execution updated",
      detail: `${teacherRecord.name} execution mode/configuration was updated to ${teacherRecord.executionMode ?? "dry-run"}.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    return teacherRecord;
  }

  async updateTeacherExecutionForUser(
    userId: string,
    teacherId: string,
    patch: Pick<TeacherRecord, "credentials" | "executionMode">,
  ) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    if (patch.credentials !== undefined) {
      teacherRecord.credentials = patch.credentials;
    }
    if (patch.executionMode !== undefined) {
      teacherRecord.executionMode = patch.executionMode;
    }

    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher execution updated",
      detail: `${teacherRecord.name} execution mode/configuration was updated to ${teacherRecord.executionMode ?? "dry-run"}.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    return teacherRecord;
  }

  async updateTeacherTraceTraders(teacherId: string, traceTraderList: TraceTraderSetting[]) {
    await this.ensureBooted();
    const teachers = await listTeachers();
    const teacherRecord = teachers.find((item) => item.id === teacherId);
    if (!teacherRecord) {
      return null;
    }

    const traders = await listTraders();
    const { assertTraceTradersMatchTeacherPlatform } =
      await import("#/lib/trading/follow-platform");
    assertTraceTradersMatchTeacherPlatform(teacherRecord, traceTraderList, traders);

    teacherRecord.traceTraderList = traceTraderList.map((setting) => ({ ...setting }));
    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher trace traders updated",
      detail: `${teacherRecord.name} now tracks ${teacherRecord.traceTraderList.length} trader configuration(s).`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async updateTeacherTraceTradersForUser(
    userId: string,
    teacherId: string,
    traceTraderList: TraceTraderSetting[],
  ) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    const traders = await listTraders();
    const { assertTraceTradersMatchTeacherPlatform } =
      await import("#/lib/trading/follow-platform");
    assertTraceTradersMatchTeacherPlatform(teacherRecord, traceTraderList, traders);

    teacherRecord.traceTraderList = traceTraderList.map((setting) => ({ ...setting }));
    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher trace traders updated",
      detail: `${teacherRecord.name} now tracks ${teacherRecord.traceTraderList.length} trader configuration(s).`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async unfollowTeacherTrader(teacherId: string, traderId: string) {
    await this.ensureBooted();
    const teachers = await listTeachers();
    const teacherRecord = teachers.find((item) => item.id === teacherId);
    if (!teacherRecord) {
      return null;
    }

    teacherRecord.traceTraderList = teacherRecord.traceTraderList.filter(
      (item) => item.id !== traderId,
    );
    const traders = await listTraders();
    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher unfollowed trader",
      detail: `${teacherRecord.name} removed trader ${traderId} from trace settings.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async unfollowTeacherTraderForUser(userId: string, teacherId: string, traderId: string) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    teacherRecord.traceTraderList = teacherRecord.traceTraderList.filter(
      (item) => item.id !== traderId,
    );
    const traders = await listTraders();
    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher unfollowed trader",
      detail: `${teacherRecord.name} removed trader ${traderId} from trace settings.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async updateTeacherFollowRelations(teacherId: string, followRelations: FollowOrderRelation[]) {
    await this.ensureBooted();
    const teachers = await listTeachers();
    const teacherRecord = teachers.find((item) => item.id === teacherId);
    if (!teacherRecord) {
      return null;
    }

    teacherRecord.followRelations = followRelations.map((relation) => ({ ...relation }));
    const traders = await listTraders();
    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher follow relations updated",
      detail: `${teacherRecord.name} manually updated ${teacherRecord.followRelations.length} follow relation(s).`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async updateTeacherFollowRelationsForUser(
    userId: string,
    teacherId: string,
    followRelations: FollowOrderRelation[],
  ) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    teacherRecord.followRelations = followRelations.map((relation) => ({ ...relation }));
    const traders = await listTraders();
    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher follow relations updated",
      detail: `${teacherRecord.name} manually updated ${teacherRecord.followRelations.length} follow relation(s).`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async remapTeacherFollowRelationForUser(
    userId: string,
    teacherId: string,
    input: {
      orderId: string;
      nextFollowOrderId: string | null;
    },
  ) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    const relationIndex = teacherRecord.followRelations.findIndex(
      (relation) => relation.orderId === input.orderId,
    );
    if (relationIndex < 0) {
      return null;
    }

    if (!input.nextFollowOrderId) {
      teacherRecord.followRelations.splice(relationIndex, 1);
      const traders = await listTraders();
      updateTeacherMarksFromTraders(teacherRecord, traders);
      await updateTeacherRecord(teacherId, teacherRecord, userId);
      await this.pushEvent({
        scope: "follow-engine",
        level: "info",
        title: "teacher follow relation cleared",
        detail: `${teacherRecord.name} cleared follow relation mapping for local order ${input.orderId}.`,
        entityType: "teacher",
        entityId: teacherRecord.id,
      });
      await this.reconcileMarketSubscriptions(await listTeachers(), traders);
      return teacherRecord;
    }

    const traders = await listTraders();
    let matchedTrader: TraderRecord | undefined;

    for (const setting of teacherRecord.traceTraderList) {
      const trader = traders.find((item) => item.id === setting.id);
      const matchedPosition = trader?.positions.find(
        (position) => position.id === input.nextFollowOrderId,
      );
      if (trader && matchedPosition) {
        matchedTrader = trader;
        break;
      }
    }

    if (!matchedTrader) {
      throw new Error("No traced trader currently holds the specified follow order id.");
    }

    teacherRecord.followRelations[relationIndex] = {
      ...teacherRecord.followRelations[relationIndex]!,
      followOrderId: input.nextFollowOrderId,
      followTraderId: matchedTrader.id,
      updateTime: Date.now(),
    };

    updateTeacherMarksFromTraders(teacherRecord, traders);
    await updateTeacherRecord(teacherId, teacherRecord, userId);
    await this.pushEvent({
      scope: "follow-engine",
      level: "info",
      title: "teacher follow relation remapped",
      detail: `${teacherRecord.name} remapped local order ${input.orderId} to trader order ${input.nextFollowOrderId}.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), traders);
    return teacherRecord;
  }

  async removeTeacherForUser(userId: string, teacherId: string) {
    await this.ensureBooted();
    const teacherRecord = await this.getTeacherForUser(userId, teacherId);
    if (!teacherRecord) {
      return null;
    }

    await deleteTeacherRecord(teacherId, userId);
    await this.pushEvent({
      scope: "system",
      level: "info",
      title: "teacher removed",
      detail: `${teacherRecord.name} (${teacherRecord.platform}) was removed from the current user workspace.`,
      entityType: "teacher",
      entityId: teacherRecord.id,
    });
    await this.reconcileMarketSubscriptions(await listTeachers(), await listTraders());
    return this.getTeachersForUser(userId);
  }

  async getTeacherEvents(teacherId: string) {
    await this.ensureBooted();
    const { listTeacherRuntimeEvents } = await import("#/lib/trading/store");
    return listTeacherRuntimeEvents(teacherId);
  }

  async getTeacherEventsForUser(teacherId: string, userId: string) {
    const teachers = await this.getTeachersForUser(userId);
    const targetTeacher = teachers.find((teacher) => teacher.id === teacherId);
    if (!targetTeacher) {
      return [];
    }

    return this.getTeacherEvents(teacherId);
  }

  async ingestLegacyPositionChange(input: {
    trader: Partial<TraderRecord> &
      Pick<TraderRecord, "id" | "name" | "platform" | "link" | "avatar">;
    changes: PositionChange[];
    positions?: TraderRecord["positions"];
  }) {
    await this.ensureBooted();
    const traders = await listTraders();
    const existing = traders.find((item) => item.id === input.trader.id);
    const mergedPositions = input.positions ?? [
      ...(existing?.positions.filter(
        (position) => !input.changes.some((change) => change.id === position.id),
      ) ?? []),
      ...input.changes
        .filter((change) => !change.removed)
        .map((change) => ({
          id: change.id,
          symbol: change.symbol,
          entryPrice: change.entryPrice,
          markPrice: change.markPrice,
          amount: change.amount,
          leverage: change.leverage,
          openTime: change.openTime,
          closeTime: change.closeTime,
          margin: change.margin,
          marginMode: change.marginMode,
          pnl: change.pnl,
          pnlRatio: change.pnlRatio,
          positionSide: change.positionSide,
          closeAvgPrice: change.closeAvgPrice,
          contractValue: change.contractValue,
        })),
    ];

    if (!existing) {
      await this.addTrader({
        id: input.trader.id,
        name: input.trader.name,
        nickName: input.trader.nickName,
        platform: input.trader.platform,
        link: input.trader.link,
        avatar: input.trader.avatar,
        sign: input.trader.sign,
        strategyStatus: input.trader.strategyStatus ?? "watch",
        strategyName: input.trader.strategyName ?? input.trader.name,
        strategyRiskRate: input.trader.strategyRiskRate ?? 0.1,
        balance: input.trader.balance ?? 0,
        monthlyAveragePositionValue: input.trader.monthlyAveragePositionValue ?? 0,
        threeMonthMaxDrawdown: input.trader.threeMonthMaxDrawdown ?? 0,
        positionUpdateTime: input.trader.positionUpdateTime ?? Date.now(),
        positions: [],
        historyPositions: [],
      } as TraderRecord);
    }

    await this.ingestTraderSnapshot(input.trader.id, mergedPositions);

    await this.pushEvent({
      scope: "trader-spy",
      level: "info",
      title: "legacy ws payload ingested",
      detail: `${input.trader.name} pushed ${input.changes.length} change record(s) through the compatibility ingress.`,
    });

    return this.getTraders();
  }
}

declare global {
  var __traderPlatformRuntime: TradingRuntime | undefined;
}

export function getTradingRuntime() {
  if (!globalThis.__traderPlatformRuntime) {
    globalThis.__traderPlatformRuntime = new TradingRuntime();
  }

  return globalThis.__traderPlatformRuntime;
}
