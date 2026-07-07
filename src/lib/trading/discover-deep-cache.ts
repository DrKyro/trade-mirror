import "@tanstack/react-start/server-only";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "#/lib/db";
import {
  discoverRankCache,
  discoverTraderDeepCache,
  userDiscoverFavorite,
} from "#/lib/db/schema/trading.schema";
import {
  DISCOVER_DEEP_CRAWL_CONCURRENCY,
  DISCOVER_DEEP_CRAWL_MAX_RETRIES,
  DISCOVER_DEEP_REFRESH_COOLDOWN_MS,
  DISCOVER_DEEP_REQUEST_DELAY_MS,
  retryWithBackoff,
  sleep,
} from "#/lib/trading/crawl-rate-limit";
import {
  DISCOVER_DEEP_WARMUP_PER_PLATFORM,
  DISCOVER_DEEP_WARMUP_TIME_RANGE,
} from "#/lib/trading/discover-rank-config";
import { DISCOVER_CRAWLER_PLATFORMS } from "#/lib/trading/discover-rank-config";
import { fetchTraderDeepAnalysis } from "#/lib/trading/trader-rank-adapters.server";
import type { TraderDeepAnalysis } from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

export { DISCOVER_DEEP_CRAWL_CONCURRENCY } from "#/lib/trading/crawl-rate-limit";

export type DeepCrawlTarget = {
  platform: TraderPlatform;
  traderId: string;
};

export type DiscoverDeepCrawlResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: Array<{ platform: TraderPlatform; traderId: string; message: string }>;
  crawledAt: number;
};

export type TraderDeepCacheRecord = {
  analysis: TraderDeepAnalysis;
  crawledAt: number;
};

async function listWarmupDeepCrawlTargets(): Promise<DeepCrawlTarget[]> {
  const rows = await db
    .select({
      platform: discoverRankCache.platform,
      traderId: discoverRankCache.traderId,
      yieldRatio: discoverRankCache.yieldRatio,
    })
    .from(discoverRankCache)
    .where(eq(discoverRankCache.timeRange, DISCOVER_DEEP_WARMUP_TIME_RANGE));

  const byPlatform = new Map<
    TraderPlatform,
    Array<{ platform: TraderPlatform; traderId: string; yieldRatio: number }>
  >();

  for (const row of rows) {
    const platform = row.platform as TraderPlatform;
    const current = byPlatform.get(platform) ?? [];
    current.push({
      platform,
      traderId: row.traderId,
      yieldRatio: row.yieldRatio,
    });
    byPlatform.set(platform, current);
  }

  const targets: DeepCrawlTarget[] = [];

  for (const platform of DISCOVER_CRAWLER_PLATFORMS) {
    const ranked = (byPlatform.get(platform) ?? [])
      .sort((left, right) => right.yieldRatio - left.yieldRatio)
      .slice(0, DISCOVER_DEEP_WARMUP_PER_PLATFORM);

    for (const item of ranked) {
      targets.push({ platform: item.platform, traderId: item.traderId });
    }
  }

  return targets;
}

export async function listDeepCrawlTargets(): Promise<DeepCrawlTarget[]> {
  const [favoriteRows, warmupTargets] = await Promise.all([
    db
      .select({
        platform: userDiscoverFavorite.platform,
        traderId: userDiscoverFavorite.traderId,
      })
      .from(userDiscoverFavorite),
    listWarmupDeepCrawlTargets(),
  ]);

  const seen = new Set<string>();
  const targets: DeepCrawlTarget[] = [];

  for (const row of [...favoriteRows, ...warmupTargets]) {
    const key = `${row.platform}:${row.traderId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      platform: row.platform as TraderPlatform,
      traderId: row.traderId,
    });
  }

  return targets;
}

export async function refreshTraderDeepCache(
  platform: TraderPlatform,
  traderId: string,
  options?: { force?: boolean },
): Promise<TraderDeepCacheRecord> {
  const cached = await queryTraderDeepCache(platform, traderId);
  if (
    !options?.force &&
    cached &&
    Date.now() - cached.crawledAt < DISCOVER_DEEP_REFRESH_COOLDOWN_MS
  ) {
    return cached;
  }

  const crawledAt = Date.now();
  const analysis = await retryWithBackoff(
    `deep:${platform}:${traderId}`,
    () =>
      fetchTraderDeepAnalysis(platform, traderId, {
        historyWindow: "all",
      }),
    { maxRetries: DISCOVER_DEEP_CRAWL_MAX_RETRIES },
  );
  await upsertTraderDeepCache(analysis, crawledAt);
  return { analysis, crawledAt };
}

export async function queryTraderDeepCache(
  platform: TraderPlatform,
  traderId: string,
): Promise<TraderDeepCacheRecord | null> {
  const row = await db.query.discoverTraderDeepCache.findFirst({
    where: and(
      eq(discoverTraderDeepCache.platform, platform),
      eq(discoverTraderDeepCache.traderId, traderId),
    ),
  });

  if (!row) return null;

  return {
    analysis: row.analysisData,
    crawledAt: row.crawledAt.getTime(),
  };
}

export async function upsertTraderDeepCache(analysis: TraderDeepAnalysis, crawledAt = Date.now()) {
  await db
    .insert(discoverTraderDeepCache)
    .values({
      platform: analysis.platform,
      traderId: analysis.traderId,
      analysisData: analysis,
      crawledAt: new Date(crawledAt),
    })
    .onConflictDoUpdate({
      target: [discoverTraderDeepCache.platform, discoverTraderDeepCache.traderId],
      set: {
        analysisData: sql`excluded.analysis_data`,
        crawledAt: sql`excluded.crawled_at`,
        updatedAt: sql`now()`,
      },
    });
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
  delayMs = 0,
) {
  if (items.length === 0) return;

  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      await worker(current);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }
  });

  await Promise.all(runners);
}

export async function runDiscoverDeepCrawler(): Promise<DiscoverDeepCrawlResult> {
  const crawledAt = Date.now();
  const targets = await listDeepCrawlTargets();
  const errors: DiscoverDeepCrawlResult["errors"] = [];

  await mapWithConcurrency(
    targets,
    DISCOVER_DEEP_CRAWL_CONCURRENCY,
    async (target) => {
      try {
        const analysis = await retryWithBackoff(
          `deep-crawl:${target.platform}:${target.traderId}`,
          () =>
            fetchTraderDeepAnalysis(target.platform, target.traderId, {
              historyWindow: "all",
            }),
          { maxRetries: DISCOVER_DEEP_CRAWL_MAX_RETRIES },
        );
        await upsertTraderDeepCache(analysis, crawledAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown deep crawl error";
        errors.push({
          platform: target.platform,
          traderId: target.traderId,
          message,
        });
      }
    },
    DISCOVER_DEEP_REQUEST_DELAY_MS,
  );

  return {
    attempted: targets.length,
    succeeded: targets.length - errors.length,
    failed: errors.length,
    errors,
    crawledAt,
  };
}

export async function getDiscoverDeepCacheStatus() {
  const rows = await db
    .select({
      platform: discoverTraderDeepCache.platform,
      crawledAt: discoverTraderDeepCache.crawledAt,
    })
    .from(discoverTraderDeepCache);

  if (rows.length === 0) {
    return {
      totalCached: 0,
      lastCrawledAt: null as number | null,
      perPlatform: {} as Record<string, number>,
    };
  }

  const perPlatform: Record<string, number> = {};
  for (const row of rows) {
    perPlatform[row.platform] = (perPlatform[row.platform] ?? 0) + 1;
  }

  return {
    totalCached: rows.length,
    lastCrawledAt: Math.max(...rows.map((row) => row.crawledAt.getTime())),
    perPlatform,
  };
}

export async function clearTraderDeepCache(platforms?: TraderPlatform[]) {
  if (platforms && platforms.length > 0) {
    await db
      .delete(discoverTraderDeepCache)
      .where(inArray(discoverTraderDeepCache.platform, platforms));
    return;
  }

  await db.delete(discoverTraderDeepCache);
}
