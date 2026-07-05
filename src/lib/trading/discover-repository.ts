import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth/middleware";
import { db } from "#/lib/db";
import { traderBacktestRun } from "#/lib/db/schema";
import { buildTraderBacktest } from "#/lib/trading/discover-backtests";
import { queryAllDiscoverCache, runDiscoverCrawler } from "#/lib/trading/discover-crawler";
import { fetchTraderDeepAnalysis } from "#/lib/trading/trader-rank-adapters.server";
import type { RankSortBy, TraderRankPlatformError } from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

const supportedPlatformsSchema = z.enum(["okx", "bitget", "bybit", "binanceFutures"]);
const traderBacktestModeSchema = z.enum(["fixed", "compound"]);
const traderBacktestWindowSchema = z.enum(["30d", "90d", "all"]);

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
});

export const $fetchTraderRankList = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(rankQuerySchema)
  .handler(async ({ data }) => {
    const platforms = [...new Set(data.platforms)] as TraderPlatform[];

    let cacheResult = await queryAllDiscoverCache(platforms);
    if (cacheResult.items.length === 0) {
      try {
        await runDiscoverCrawler();
        cacheResult = await queryAllDiscoverCache(platforms);
      } catch (error) {
        console.error("discover crawler bootstrap failed", error);
      }
    }

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
    return fetchTraderDeepAnalysis(
      data.platform as Parameters<typeof fetchTraderDeepAnalysis>[0],
      data.traderId,
      { historyWindow: data.window },
    );
  });

const runBacktestSchema = z.object({
  platform: supportedPlatformsSchema,
  traderId: z.string().min(1),
  uniqueName: z.string().min(1),
  nickName: z.string().min(1),
  mode: traderBacktestModeSchema,
  window: traderBacktestWindowSchema,
  initialBalance: z.number().positive().max(1_000_000),
});

export const $runTraderBacktest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(runBacktestSchema)
  .handler(async ({ context, data }) => {
    const analysis = await fetchTraderDeepAnalysis(data.platform, data.traderId, {
      historyWindow: data.window,
    });
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
