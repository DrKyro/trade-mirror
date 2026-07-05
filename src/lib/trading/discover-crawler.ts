import "@tanstack/react-start/server-only";
import { inArray, sql } from "drizzle-orm";

import { db } from "#/lib/db";
import { discoverRankCache } from "#/lib/db/schema/trading.schema";
import { fetchTraderRankList } from "#/lib/trading/trader-rank-adapters.server";
import type { RankSortBy, TraderRankItem } from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

const SCALE = 1_000;

export const DISCOVER_CRAWLER_PLATFORMS: TraderPlatform[] = ["okx", "bitget", "binanceFutures"];

export const DISCOVER_CRAWLER_SORT_DIMENSIONS: RankSortBy[] = [
  "yieldRatio",
  "pnl",
  "aum",
  "followers",
  "maxDrawdown",
  "winRate",
];

export const DISCOVER_CRAWLER_PAGE_SIZE = 100;
export const DISCOVER_CRAWLER_TIME_RANGE = "90" as const;
export const DISCOVER_CRAWLER_INTERVAL_MS = 60 * 60 * 1000;

export interface DiscoverCrawlerResult {
  totalFetched: number;
  uniqueTraders: number;
  perPlatform: Record<string, number>;
  errors: Array<{ platform: TraderPlatform; dimension: RankSortBy; message: string }>;
  crawledAt: number;
}

function toMilli(value: number) {
  return Math.round(value * SCALE);
}

function mergeRankItem(
  existing: TraderRankItem | undefined,
  incoming: TraderRankItem,
): TraderRankItem {
  if (!existing) return incoming;
  return {
    ...existing,
    yieldRatio: Math.max(existing.yieldRatio, incoming.yieldRatio),
    pnl: Math.max(existing.pnl, incoming.pnl),
    aum: Math.max(existing.aum, incoming.aum),
    followers: Math.max(existing.followers, incoming.followers),
    maxDrawdown:
      existing.maxDrawdown === null
        ? incoming.maxDrawdown
        : incoming.maxDrawdown === null
          ? existing.maxDrawdown
          : Math.min(existing.maxDrawdown, incoming.maxDrawdown),
    winRate:
      existing.winRate === null
        ? incoming.winRate
        : incoming.winRate === null
          ? existing.winRate
          : Math.max(existing.winRate, incoming.winRate),
    yieldCurve:
      incoming.yieldCurve.length > existing.yieldCurve.length
        ? incoming.yieldCurve
        : existing.yieldCurve,
  };
}

async function crawlRankList(
  platform: TraderPlatform,
  sortBy: RankSortBy,
): Promise<TraderRankItem[]> {
  const result = await fetchTraderRankList({
    platform,
    sortBy,
    timeRange: DISCOVER_CRAWLER_TIME_RANGE,
    page: 1,
    pageSize: DISCOVER_CRAWLER_PAGE_SIZE,
  });
  return result.items;
}

export async function runDiscoverCrawler(): Promise<DiscoverCrawlerResult> {
  const crawledAt = Date.now();
  const errors: DiscoverCrawlerResult["errors"] = [];
  const perPlatform: Record<string, number> = {};
  let totalFetched = 0;

  const mergedByPlatform = new Map<TraderPlatform, Map<string, TraderRankItem>>();

  for (const platform of DISCOVER_CRAWLER_PLATFORMS) {
    const platformMap = new Map<string, TraderRankItem>();

    for (const dimension of DISCOVER_CRAWLER_SORT_DIMENSIONS) {
      try {
        const items = await crawlRankList(platform, dimension);
        totalFetched += items.length;

        for (const item of items) {
          const existing = platformMap.get(item.traderId);
          platformMap.set(item.traderId, mergeRankItem(existing, item));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown crawl error";
        errors.push({ platform, dimension, message });
      }
    }

    mergedByPlatform.set(platform, platformMap);
    perPlatform[platform] = platformMap.size;
  }

  let uniqueTraders = 0;

  for (const [platform, platformMap] of mergedByPlatform) {
    if (platformMap.size === 0) continue;

    const items = Array.from(platformMap.values());
    uniqueTraders += items.length;

    const rows = items.map((item) => ({
      platform,
      traderId: item.traderId,
      uniqueName: item.uniqueName,
      nickName: item.nickName,
      avatar: item.avatar,
      sign: item.sign,
      link: item.link,
      yieldRatio: toMilli(item.yieldRatio),
      pnl: toMilli(item.pnl),
      aum: toMilli(item.aum),
      followers: item.followers,
      maxDrawdown: item.maxDrawdown !== null ? toMilli(item.maxDrawdown) : null,
      winRate: item.winRate !== null ? toMilli(item.winRate) : null,
      instNum: item.instNum,
      yieldCurve: item.yieldCurve,
      rankData: item,
      crawledAt: new Date(crawledAt),
    }));

    const chunkSize = 50;
    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      await db
        .insert(discoverRankCache)
        .values(chunk)
        .onConflictDoUpdate({
          target: [discoverRankCache.platform, discoverRankCache.traderId],
          set: {
            uniqueName: sql`excluded.unique_name`,
            nickName: sql`excluded.nick_name`,
            avatar: sql`excluded.avatar`,
            sign: sql`excluded.sign`,
            link: sql`excluded.link`,
            yieldRatio: sql`excluded.yield_ratio_milli`,
            pnl: sql`excluded.pnl_milli`,
            aum: sql`excluded.aum_milli`,
            followers: sql`excluded.followers`,
            maxDrawdown: sql`excluded.max_drawdown_milli`,
            winRate: sql`excluded.win_rate_milli`,
            instNum: sql`excluded.inst_num`,
            yieldCurve: sql`excluded.yield_curve`,
            rankData: sql`excluded.rank_data`,
            crawledAt: sql`excluded.crawled_at`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  return {
    totalFetched,
    uniqueTraders,
    perPlatform,
    errors,
    crawledAt,
  };
}

export interface DiscoverCacheQuery {
  platforms: TraderPlatform[];
  sortBy: RankSortBy;
  page: number;
  pageSize: number;
}

export interface DiscoverCacheResult {
  items: TraderRankItem[];
  total: number;
  crawledAt: number | null;
}

function compareRankItems(left: TraderRankItem, right: TraderRankItem, sortBy: RankSortBy) {
  if (sortBy === "maxDrawdown") {
    const leftValue = left.maxDrawdown ?? Number.POSITIVE_INFINITY;
    const rightValue = right.maxDrawdown ?? Number.POSITIVE_INFINITY;
    if (leftValue !== rightValue) return leftValue - rightValue;
  } else {
    const leftValue = left[sortBy] ?? 0;
    const rightValue = right[sortBy] ?? 0;
    if (leftValue !== rightValue) return rightValue - leftValue;
  }
  return left.nickName.localeCompare(right.nickName);
}

export async function queryDiscoverCache(query: DiscoverCacheQuery): Promise<DiscoverCacheResult> {
  const platforms = query.platforms.length > 0 ? query.platforms : DISCOVER_CRAWLER_PLATFORMS;

  const rows = await db
    .select()
    .from(discoverRankCache)
    .where(inArray(discoverRankCache.platform, platforms));

  if (rows.length === 0) {
    return { items: [], total: 0, crawledAt: null };
  }

  const items = rows.map((row) => row.rankData);
  items.sort((a, b) => compareRankItems(a, b, query.sortBy));

  const total = items.length;
  const start = (query.page - 1) * query.pageSize;
  const paged = items.slice(start, start + query.pageSize);

  const crawledAt = Math.max(...rows.map((r) => r.crawledAt.getTime()));

  return { items: paged, total, crawledAt };
}

export async function queryAllDiscoverCache(
  platforms?: TraderPlatform[],
): Promise<DiscoverCacheResult> {
  const platformList = platforms ?? DISCOVER_CRAWLER_PLATFORMS;

  const rows = await db
    .select()
    .from(discoverRankCache)
    .where(inArray(discoverRankCache.platform, platformList));

  if (rows.length === 0) {
    return { items: [], total: 0, crawledAt: null };
  }

  const items = rows.map((row) => row.rankData);
  const crawledAt = Math.max(...rows.map((r) => r.crawledAt.getTime()));

  return { items, total: items.length, crawledAt };
}

export async function getDiscoverCrawlerStatus(): Promise<{
  lastCrawledAt: number | null;
  totalCached: number;
  perPlatform: Record<string, number>;
}> {
  const rows = await db.select().from(discoverRankCache);

  if (rows.length === 0) {
    return { lastCrawledAt: null, totalCached: 0, perPlatform: {} };
  }

  const perPlatform: Record<string, number> = {};
  for (const row of rows) {
    perPlatform[row.platform] = (perPlatform[row.platform] ?? 0) + 1;
  }

  const lastCrawledAt = Math.max(...rows.map((r) => r.crawledAt.getTime()));

  return {
    lastCrawledAt,
    totalCached: rows.length,
    perPlatform,
  };
}

export async function clearDiscoverCache(platforms?: TraderPlatform[]): Promise<void> {
  if (platforms && platforms.length > 0) {
    await db.delete(discoverRankCache).where(inArray(discoverRankCache.platform, platforms));
  } else {
    await db.delete(discoverRankCache);
  }
}
