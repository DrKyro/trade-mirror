import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth/middleware";
import { db } from "#/lib/db";
import { traderBacktestRun, userDiscoverFavorite } from "#/lib/db/schema";
import { buildTraderBacktest } from "#/lib/trading/discover-backtests";
import { getDiscoverCrawlerStatus, queryAllDiscoverCache } from "#/lib/trading/discover-crawler";
import {
  getDiscoverDeepCacheStatus,
  queryTraderDeepCache,
  refreshTraderDeepCache,
} from "#/lib/trading/discover-deep-cache";
import { getTradingRuntime } from "#/lib/trading/runtime";
import type {
  DiscoverFavoriteRecord,
  RankSortBy,
  TraderRankPlatformError,
} from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

const supportedPlatformsSchema = z.enum(["okx", "bitget", "bybit", "binanceFutures"]);
const traderBacktestModeSchema = z.enum(["fixed", "compound"]);
const traderBacktestWindowSchema = z.enum(["30d", "90d", "all"]);
const traderHistoryPositionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: z.enum(["long", "short"]),
  leverage: z.number(),
  amount: z.number(),
  entryPrice: z.number(),
  closePrice: z.number(),
  openTime: z.number().nullable(),
  closeTime: z.number().nullable(),
  profit: z.number().nullable(),
  profitRate: z.number().nullable(),
});

function compareRankItems(
  left: {
    yieldRatio: number;
    pnl: number;
    aum: number;
    followers: number;
    maxDrawdown: number | null;
    winRate: number | null;
    nickName: string;
  },
  right: typeof left,
  sortBy: RankSortBy,
) {
  if (sortBy === "maxDrawdown") {
    const leftValue = left.maxDrawdown ?? Number.POSITIVE_INFINITY;
    const rightValue = right.maxDrawdown ?? Number.POSITIVE_INFINITY;
    if (leftValue !== rightValue) return leftValue - rightValue;
  } else {
    const metric = left[sortBy] ?? 0;
    const other = right[sortBy] ?? 0;
    if (metric !== other) return other - metric;
  }

  return left.nickName.localeCompare(right.nickName);
}

const rankQuerySchema = z.object({
  platforms: z.array(supportedPlatformsSchema).min(1),
  sortBy: z.enum(["yieldRatio", "pnl", "aum", "followers", "maxDrawdown", "winRate"]),
  timeRange: z.enum(["7", "30", "90"]).default("90"),
});

export const $fetchTraderRankList = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(rankQuerySchema)
  .handler(async ({ data }) => {
    const platforms = [...new Set(data.platforms)] as TraderPlatform[];

    const cacheResult = await queryAllDiscoverCache(platforms, data.timeRange);

    const seen = new Set<string>();
    const items = cacheResult.items
      .filter((item) => {
        const key = `${item.platform}-${item.traderId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => compareRankItems(left, right, data.sortBy as RankSortBy));

    return {
      items,
      total: items.length,
      platforms,
      platformErrors: [] as TraderRankPlatformError[],
      crawledAt: cacheResult.crawledAt,
    };
  });

const deepAnalysisSchema = z.object({
  platform: z.string(),
  traderId: z.string(),
  window: traderBacktestWindowSchema.optional(),
});

export const $fetchTraderDeepAnalysis = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(deepAnalysisSchema)
  .handler(async ({ data }) => {
    const platform = data.platform as TraderPlatform;
    const cached = await queryTraderDeepCache(platform, data.traderId);
    if (cached) {
      return {
        status: "ready" as const,
        analysis: cached.analysis,
        crawledAt: cached.crawledAt,
      };
    }

    const rankCache = await getDiscoverCrawlerStatus();
    return {
      status: "pending" as const,
      rankCrawledAt: rankCache.lastCrawledAt,
    };
  });

const refreshDeepAnalysisSchema = z.object({
  platform: supportedPlatformsSchema,
  traderId: z.string().min(1),
});

export const $refreshTraderDeepAnalysis = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(refreshDeepAnalysisSchema)
  .handler(async ({ data }) => {
    const cached = await refreshTraderDeepCache(data.platform, data.traderId);
    return {
      analysis: cached.analysis,
      crawledAt: cached.crawledAt,
    };
  });

const runBacktestSchema = z.object({
  platform: supportedPlatformsSchema,
  traderId: z.string().min(1),
  uniqueName: z.string().min(1),
  nickName: z.string().min(1),
  mode: traderBacktestModeSchema,
  window: traderBacktestWindowSchema,
  initialBalance: z.number().positive().max(1_000_000),
  historyPositions: z.array(traderHistoryPositionSchema).min(1).optional(),
});

export const $runTraderBacktest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(runBacktestSchema)
  .handler(async ({ context, data }) => {
    const analysis =
      data.historyPositions && data.historyPositions.length > 0
        ? {
            traderId: data.traderId,
            uniqueName: data.uniqueName,
            nickName: data.nickName,
            platform: data.platform,
            avatar: "",
            sign: "",
            link: "",
            balance: null,
            yieldRatio: null,
            pnl: null,
            aum: null,
            followers: null,
            maxDrawdown: null,
            winRate: null,
            monthlyAveragePositionValue: null,
            positions: [],
            historyPositions: data.historyPositions,
            yieldCurve: [],
            extraStats: { nonPeriodicPart: [], periodicPart: [] },
          }
        : await (async () => {
            const cached = await queryTraderDeepCache(data.platform, data.traderId);
            if (!cached) {
              throw new Error("Trader deep analysis is not cached yet");
            }
            return cached.analysis;
          })();
    const result = buildTraderBacktest({
      analysis,
      mode: data.mode,
      window: data.window,
      initialBalance: data.initialBalance,
    });

    if (result.trades.length === 0) {
      throw new Error("No history positions available for backtest");
    }

    const id = `backtest-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date();

    await db.insert(traderBacktestRun).values({
      id,
      userId: context.user.id,
      platform: data.platform,
      traderId: data.traderId,
      uniqueName: data.uniqueName,
      nickName: data.nickName,
      mode: data.mode,
      window: data.window,
      initialBalance: Math.round(data.initialBalance * 1000),
      summary: result.summary,
      timeline: result.timeline,
      trades: result.trades,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      userId: context.user.id,
      platform: data.platform,
      traderId: data.traderId,
      uniqueName: data.uniqueName,
      nickName: data.nickName,
      mode: data.mode,
      window: data.window,
      initialBalance: data.initialBalance,
      summary: result.summary,
      timeline: result.timeline,
      trades: result.trades,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    };
  });

const listBacktestsSchema = z.object({
  platform: supportedPlatformsSchema,
  traderId: z.string().min(1),
  limit: z.number().int().min(1).max(20).default(10),
});

export const $listTraderBacktests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listBacktestsSchema)
  .handler(async ({ context, data }) => {
    const rows = await db
      .select()
      .from(traderBacktestRun)
      .where(
        and(
          eq(traderBacktestRun.userId, context.user.id),
          eq(traderBacktestRun.platform, data.platform),
          eq(traderBacktestRun.traderId, data.traderId),
        ),
      )
      .orderBy(desc(traderBacktestRun.createdAt))
      .limit(data.limit);

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      platform: row.platform as TraderPlatform,
      traderId: row.traderId,
      uniqueName: row.uniqueName,
      nickName: row.nickName,
      mode: row.mode as z.infer<typeof traderBacktestModeSchema>,
      window: row.window as z.infer<typeof traderBacktestWindowSchema>,
      initialBalance: row.initialBalance / 1000,
      summary: row.summary,
      timeline: row.timeline,
      trades: row.trades,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }));
  });

export const $listDiscoverFavorites = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const rows = await db
      .select()
      .from(userDiscoverFavorite)
      .where(eq(userDiscoverFavorite.userId, context.user.id))
      .orderBy(desc(userDiscoverFavorite.createdAt));

    return rows.map(
      (row) =>
        ({
          platform: row.platform as TraderPlatform,
          traderId: row.traderId,
          uniqueName: row.uniqueName,
          nickName: row.nickName,
          avatar: row.avatar,
          link: row.link,
          createdAt: row.createdAt.getTime(),
        }) satisfies DiscoverFavoriteRecord,
    );
  });

const toggleDiscoverFavoriteSchema = z.object({
  platform: supportedPlatformsSchema,
  traderId: z.string().min(1),
  uniqueName: z.string().min(1),
  nickName: z.string().min(1),
  avatar: z.string().optional(),
  link: z.string().optional(),
  favorite: z.boolean(),
});

export const $toggleDiscoverFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(toggleDiscoverFavoriteSchema)
  .handler(async ({ context, data }) => {
    if (data.favorite) {
      await db
        .insert(userDiscoverFavorite)
        .values({
          userId: context.user.id,
          platform: data.platform,
          traderId: data.traderId,
          uniqueName: data.uniqueName,
          nickName: data.nickName,
          avatar: data.avatar ?? "",
          link: data.link ?? "",
        })
        .onConflictDoUpdate({
          target: [
            userDiscoverFavorite.userId,
            userDiscoverFavorite.platform,
            userDiscoverFavorite.traderId,
          ],
          set: {
            uniqueName: data.uniqueName,
            nickName: data.nickName,
            avatar: data.avatar ?? "",
            link: data.link ?? "",
          },
        });
    } else {
      await db
        .delete(userDiscoverFavorite)
        .where(
          and(
            eq(userDiscoverFavorite.userId, context.user.id),
            eq(userDiscoverFavorite.platform, data.platform),
            eq(userDiscoverFavorite.traderId, data.traderId),
          ),
        );
    }

    return { favorited: data.favorite };
  });

export const $getDiscoverDataStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const runtime = getTradingRuntime();
    const [rankCache, deepCache, crawler] = await Promise.all([
      getDiscoverCrawlerStatus(),
      getDiscoverDeepCacheStatus(),
      runtime.getDiscoverCrawlerStatus(),
    ]);

    return { rankCache, deepCache, crawler };
  });

export const $startDiscoverCrawler = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => getTradingRuntime().startDiscoverCrawler());

export const $stopDiscoverCrawler = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => getTradingRuntime().stopDiscoverCrawler());

export const $runDiscoverCrawlerOnce = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => getTradingRuntime().runDiscoverCrawlerOnce());
