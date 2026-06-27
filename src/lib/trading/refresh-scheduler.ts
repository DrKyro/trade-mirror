import "@tanstack/react-start/server-only";
import type {
  RefreshSchedulerPlatform,
  RefreshSchedulerState,
  RuntimeEvent,
  TeacherRecord,
  TraderRecord,
  TraderSyncPriority,
  TraderSyncState,
} from "#/lib/trading/types";

export const REFRESH_SCHEDULER_METADATA_KEY = "refreshScheduler";
export const REFRESH_SCHEDULER_SUPPORTED_PLATFORMS = [
  "okx",
  "bitget",
  "binanceFutures",
  "bybit",
] as const;
export const REFRESH_SCHEDULER_POLL_INTERVAL_MS = 15_000;
export const TRADER_SYNC_BATCH_SIZE = 8;
export const TRADER_SYNC_LOCK_MS = 30_000;
export const TRADER_SYNC_MAX_BACKOFF_MS = 15 * 60_000;

export function getTraderSyncPriority(
  trader: Pick<TraderRecord, "strategyStatus">,
): TraderSyncPriority {
  switch (trader.strategyStatus) {
    case "follow":
      return "active";
    case "watch":
      return "watch";
    default:
      return "cold";
  }
}

export function getTraderSyncIntervalMs(priority: TraderSyncPriority) {
  switch (priority) {
    case "live":
      return 1_000;
    case "active":
      return 15_000;
    case "watch":
      return 2 * 60_000;
    case "cold":
    default:
      return 30 * 60_000;
  }
}

export function getNextTraderSyncAt(priority: TraderSyncPriority, now = Date.now(), failCount = 0) {
  const baseIntervalMs = getTraderSyncIntervalMs(priority);
  if (failCount <= 0) {
    return now + baseIntervalMs;
  }

  const backoffMultiplier = 2 ** Math.min(failCount - 1, 5);
  return now + Math.min(baseIntervalMs * backoffMultiplier, TRADER_SYNC_MAX_BACKOFF_MS);
}

export function isRefreshSchedulerPlatform(value: string): value is RefreshSchedulerPlatform {
  return REFRESH_SCHEDULER_SUPPORTED_PLATFORMS.includes(value as RefreshSchedulerPlatform);
}

export function createDefaultRefreshSchedulerState(): RefreshSchedulerState {
  return {
    running: false,
    supportedPlatforms: REFRESH_SCHEDULER_SUPPORTED_PLATFORMS,
    activePlatforms: [],
    iterationCount: 0,
    lastStartedAt: null,
    lastStoppedAt: null,
    lastCompletedAt: null,
    lastError: null,
    pollIntervalMs: REFRESH_SCHEDULER_POLL_INTERVAL_MS,
  };
}

export interface RefreshSchedulerDeps {
  getRefreshSchedulerState: () => Promise<RefreshSchedulerState>;
  patchRefreshSchedulerState: (
    patch:
      | Partial<RefreshSchedulerState>
      | ((current: RefreshSchedulerState) => RefreshSchedulerState),
  ) => Promise<RefreshSchedulerState>;
  pushEvent: (event: Omit<RuntimeEvent, "id" | "timestamp">) => Promise<void>;
  listDueTraderSyncStates: (limit: number) => Promise<TraderSyncState[]>;
  beginTraderSyncAttempt: (traderId: string, lockMs: number) => Promise<TraderSyncState | null>;
  refreshTraderPositions: (
    traderId: string,
    options?: { preserveRunningState?: boolean },
  ) => Promise<unknown>;
  syncTeacherStates: (
    teachers: TeacherRecord[],
    traders: TraderRecord[],
    options?: { refreshLiveAccounts?: boolean; warningContext?: string },
  ) => Promise<void>;
  listTraders: () => Promise<TraderRecord[]>;
  listTeachers: () => Promise<TeacherRecord[]>;
}

export class RefreshScheduler {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private readonly deps: RefreshSchedulerDeps;

  constructor(deps: RefreshSchedulerDeps) {
    this.deps = deps;
  }

  get isRunning() {
    return this.running;
  }

  get loop() {
    return this.loopPromise;
  }

  setLoop(p: Promise<void> | null) {
    this.loopPromise = p;
  }

  setRunning(v: boolean) {
    this.running = v;
  }

  async start() {
    if (this.running) {
      return this.deps.getRefreshSchedulerState();
    }
    this.running = true;
    await this.deps.patchRefreshSchedulerState((current) => ({
      ...current,
      running: true,
      lastStartedAt: Date.now(),
      lastError: null,
    }));
    await this.deps.pushEvent({
      scope: "trader-spy",
      level: "info",
      title: "refresh scheduler started",
      detail: `Automatic trader refresh started for ${REFRESH_SCHEDULER_SUPPORTED_PLATFORMS.join(", ")}.`,
    });
    this.loopPromise = this.runLoop();
    return this.deps.getRefreshSchedulerState();
  }

  async stop() {
    this.running = false;
    await this.deps.patchRefreshSchedulerState((current) => ({
      ...current,
      running: false,
      activePlatforms: [],
      lastStoppedAt: Date.now(),
    }));
    await this.deps.pushEvent({
      scope: "trader-spy",
      level: "info",
      title: "refresh scheduler stopped",
      detail: "Automatic trader refresh loop was stopped.",
    });
    return this.deps.getRefreshSchedulerState();
  }

  private async runLoop() {
    while (this.running) {
      try {
        const dueSyncStates = await this.deps.listDueTraderSyncStates(TRADER_SYNC_BATCH_SIZE);

        await this.deps.patchRefreshSchedulerState((current) => ({
          ...current,
          running: true,
          activePlatforms: [],
          lastError: null,
        }));

        if (dueSyncStates.length > 0) {
          const traders = await this.deps.listTraders();
          const teachers = await this.deps.listTeachers();
          const traderMap = new Map(
            traders
              .filter((trader) => isRefreshSchedulerPlatform(trader.platform))
              .map((trader) => [trader.id, trader] as const),
          );
          const dueTraders = dueSyncStates
            .map((syncState) => traderMap.get(syncState.traderId))
            .filter((trader): trader is TraderRecord => Boolean(trader));
          const duePlatformSet = new Set(
            dueTraders.map((trader) => trader.platform as RefreshSchedulerPlatform),
          );

          await this.deps.patchRefreshSchedulerState((current) => ({
            ...current,
            activePlatforms: Array.from(duePlatformSet),
          }));

          await this.deps.syncTeacherStates(teachers, traders, {
            refreshLiveAccounts: true,
            warningContext: "running scheduled teacher pre-sync",
          });

          for (const platform of REFRESH_SCHEDULER_SUPPORTED_PLATFORMS) {
            if (!this.running) break;
            const platformTraders = dueTraders.filter((trader) => trader.platform === platform);
            for (const trader of platformTraders) {
              if (!this.running) break;
              const claim = await this.deps.beginTraderSyncAttempt(trader.id, TRADER_SYNC_LOCK_MS);
              if (!claim) {
                continue;
              }
              try {
                await this.deps.refreshTraderPositions(trader.id, {
                  preserveRunningState: true,
                });
              } catch (error) {
                const detail =
                  error instanceof Error ? error.message : "unknown trader refresh scheduler error";
                await this.deps.pushEvent({
                  scope: "trader-spy",
                  level: "warn",
                  title: "refresh scheduler trader failed",
                  detail: `${trader.name} (${trader.platform}) refresh failed: ${detail}`,
                });
                await this.deps.patchRefreshSchedulerState((current) => ({
                  ...current,
                  lastError: `${trader.id}: ${detail}`,
                }));
              }
            }
          }

          const [latestTeachers, latestTraders] = await Promise.all([
            this.deps.listTeachers(),
            this.deps.listTraders(),
          ]);
          await this.deps.syncTeacherStates(latestTeachers, latestTraders, {
            refreshLiveAccounts: false,
            warningContext: "running scheduled teacher post-sync",
          });
        }

        await this.deps.patchRefreshSchedulerState((current) => ({
          ...current,
          running: this.running,
          activePlatforms: [],
          iterationCount: current.iterationCount + 1,
          lastCompletedAt: Date.now(),
        }));
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "unknown refresh scheduler loop failure";
        await this.deps.pushEvent({
          scope: "trader-spy",
          level: "warn",
          title: "refresh scheduler failed",
          detail,
        });
        await this.deps.patchRefreshSchedulerState((current) => ({
          ...current,
          lastError: detail,
        }));
      }

      if (!this.running) break;
      await new Promise((resolve) => setTimeout(resolve, REFRESH_SCHEDULER_POLL_INTERVAL_MS));
    }
    this.loopPromise = null;
  }
}
