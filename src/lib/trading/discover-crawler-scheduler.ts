import "@tanstack/react-start/server-only";
import {
  DISCOVER_CRAWLER_INTERVAL_MS,
  runDiscoverCrawler,
  type DiscoverCrawlerResult,
} from "#/lib/trading/discover-crawler";

export const DISCOVER_CRAWLER_METADATA_KEY = "discoverCrawler";

export interface DiscoverCrawlerState {
  running: boolean;
  iterationCount: number;
  lastStartedAt: number | null;
  lastStoppedAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
  lastResult: DiscoverCrawlerResult | null;
  intervalMs: number;
}

export interface DiscoverCrawlerDeps {
  getState: () => Promise<DiscoverCrawlerState>;
  patchState: (
    patch:
      | Partial<DiscoverCrawlerState>
      | ((current: DiscoverCrawlerState) => DiscoverCrawlerState),
  ) => Promise<DiscoverCrawlerState>;
  pushEvent: (event: {
    scope: "trader-spy" | "follow-engine" | "system";
    level: "info" | "warn";
    title: string;
    detail: string;
  }) => Promise<void>;
}

export function createDefaultDiscoverCrawlerState(): DiscoverCrawlerState {
  return {
    running: false,
    iterationCount: 0,
    lastStartedAt: null,
    lastStoppedAt: null,
    lastCompletedAt: null,
    lastError: null,
    lastResult: null,
    intervalMs: DISCOVER_CRAWLER_INTERVAL_MS,
  };
}

export class DiscoverCrawlerScheduler {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private readonly deps: DiscoverCrawlerDeps;

  constructor(deps: DiscoverCrawlerDeps) {
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
      return this.deps.getState();
    }
    this.running = true;
    await this.deps.patchState((current) => ({
      ...current,
      running: true,
      lastStartedAt: Date.now(),
      lastError: null,
    }));
    await this.deps.pushEvent({
      scope: "system",
      level: "info",
      title: "discover crawler started",
      detail: `Periodic discover crawler started with ${Math.round(DISCOVER_CRAWLER_INTERVAL_MS / 60_000)}min interval.`,
    });
    this.loopPromise = this.runLoop();
    return this.deps.getState();
  }

  async stop() {
    this.running = false;
    await this.deps.patchState((current) => ({
      ...current,
      running: false,
      lastStoppedAt: Date.now(),
    }));
    await this.deps.pushEvent({
      scope: "system",
      level: "info",
      title: "discover crawler stopped",
      detail: "Periodic discover crawler was stopped.",
    });
    return this.deps.getState();
  }

  async runOnce(): Promise<DiscoverCrawlerResult> {
    const result = await runDiscoverCrawler();

    await this.deps.patchState((current) => ({
      ...current,
      iterationCount: current.iterationCount + 1,
      lastCompletedAt: Date.now(),
      lastResult: result,
      lastError:
        result.errors.length > 0
          ? result.errors.map((e) => `${e.platform}/${e.dimension}: ${e.message}`).join("; ")
          : null,
    }));

    if (result.errors.length > 0) {
      await this.deps.pushEvent({
        scope: "system",
        level: "warn",
        title: "discover crawler completed with errors",
        detail: `Crawled ${result.uniqueTraders} unique traders (${result.totalFetched} raw). Errors: ${result.errors.length}`,
      });
    } else {
      await this.deps.pushEvent({
        scope: "system",
        level: "info",
        title: "discover crawler completed",
        detail: `Crawled ${result.uniqueTraders} unique traders (${result.totalFetched} raw) across ${Object.keys(result.perPlatform).length} platforms.`,
      });
    }

    return result;
  }

  private async runLoop() {
    while (this.running) {
      try {
        await this.runOnce();
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown discover crawler error";
        await this.deps.pushEvent({
          scope: "system",
          level: "warn",
          title: "discover crawler failed",
          detail,
        });
        await this.deps.patchState((current) => ({
          ...current,
          lastError: detail,
        }));
      }

      if (!this.running) break;
      await new Promise((resolve) => setTimeout(resolve, DISCOVER_CRAWLER_INTERVAL_MS));
    }
    this.loopPromise = null;
  }
}
