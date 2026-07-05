import type { TraderPlatform } from "#/lib/trading/types";

export type RankSortBy = "yieldRatio" | "pnl" | "aum" | "followers" | "maxDrawdown" | "winRate";

export type RankTimeRange = "7" | "30" | "90";

export interface DiscoverFavoriteRecord {
  platform: TraderPlatform;
  traderId: string;
  uniqueName: string;
  nickName: string;
  avatar: string;
  link: string;
  createdAt: number;
}

export interface TraderRankItem {
  traderId: string;
  uniqueName: string;
  nickName: string;
  avatar: string;
  sign: string;
  platform: TraderPlatform;
  yieldRatio: number;
  pnl: number;
  aum: number;
  followers: number;
  maxDrawdown: number | null;
  winRate: number | null;
  instNum: number | null;
  link: string;
  yieldCurve: number[];
}

export interface TraderRankResult {
  items: TraderRankItem[];
  total: number;
  platform: TraderPlatform;
}

export interface TraderRankPlatformError {
  platform: TraderPlatform;
  message: string;
}

export interface TraderRankQuery {
  platform: TraderPlatform;
  sortBy: RankSortBy;
  timeRange: RankTimeRange;
  page: number;
  pageSize: number;
}

export interface TraderDeepAnalysis {
  traderId: string;
  uniqueName: string;
  nickName: string;
  avatar: string;
  sign: string;
  platform: TraderPlatform;
  link: string;
  balance: number | null;
  yieldRatio: number | null;
  pnl: number | null;
  aum: number | null;
  followers: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  monthlyAveragePositionValue: number | null;
  positions: Array<{
    id: string;
    symbol: string;
    entryPrice: number;
    markPrice: number | null;
    amount: number;
    leverage: number;
    openTime: number | null;
    margin: number | null;
    pnl: number | null;
    pnlRatio: number | null;
    positionSide: "long" | "short";
  }>;
  historyPositions: Array<{
    id: string;
    symbol: string;
    side: "long" | "short";
    leverage: number;
    amount: number;
    entryPrice: number;
    closePrice: number;
    openTime: number | null;
    closeTime: number | null;
    profit: number | null;
    profitRate: number | null;
  }>;
  yieldCurve: Array<{
    time: number;
    ratio: number;
    pnl: number;
  }>;
  extraStats: {
    nonPeriodicPart: Array<{
      functionId: string;
      title: string;
      value: string;
      desc: string;
      type: string;
      order: number;
      learnMoreUrl: string;
    }>;
    periodicPart: Array<{
      functionId: string;
      title: string;
      value: string;
      desc: string;
      type: string;
      order: number;
      learnMoreUrl: string;
    }>;
  };
}

export type TraderDeepAnalysisResponse =
  | {
      status: "ready";
      analysis: TraderDeepAnalysis;
      crawledAt: number;
    }
  | {
      status: "pending";
      rankCrawledAt: number | null;
    };
