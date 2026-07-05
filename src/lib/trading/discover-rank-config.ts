import type { RankSortBy, RankTimeRange } from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

export const DISCOVER_CRAWLER_PLATFORMS: TraderPlatform[] = ["okx", "bitget", "binanceFutures"];

export const DISCOVER_RANK_TIME_RANGES: RankTimeRange[] = ["7", "30", "90"];

export const DISCOVER_LEADERBOARD_SORTS: RankSortBy[] = ["yieldRatio", "pnl"];

export const DISCOVER_LOCAL_SORTS: RankSortBy[] = ["aum", "followers", "maxDrawdown", "winRate"];

export const DISCOVER_DEEP_WARMUP_PER_PLATFORM = 30;

export const DISCOVER_DEEP_WARMUP_TIME_RANGE: RankTimeRange = "90";

export function isDiscoverLeaderboardSort(sortBy: RankSortBy) {
  return DISCOVER_LEADERBOARD_SORTS.includes(sortBy);
}
