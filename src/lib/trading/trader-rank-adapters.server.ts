import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import type { FetchTraderDeepAnalysisOptions } from "#/lib/trading/adapters/platform-adapter";
import { getAdapter } from "#/lib/trading/adapters/registry";
import type {
  TraderDeepAnalysis,
  TraderRankQuery,
  TraderRankResult,
} from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

export async function fetchTraderRankList(query: TraderRankQuery): Promise<TraderRankResult> {
  const adapter = getAdapter(query.platform);
  if (!adapter.fetchRankList) {
    return { items: [], total: 0, platform: query.platform };
  }
  return adapter.fetchRankList(query);
}

export async function fetchTraderDeepAnalysis(
  platform: TraderPlatform,
  traderId: string,
  options?: FetchTraderDeepAnalysisOptions,
): Promise<TraderDeepAnalysis> {
  const adapter = getAdapter(platform);
  if (!adapter.fetchDeepAnalysis) {
    throw new Error(`Deep analysis not implemented for platform ${platform}`);
  }
  return adapter.fetchDeepAnalysis(traderId, options);
}
