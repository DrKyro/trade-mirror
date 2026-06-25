import type { TraderProfileInference } from "#/lib/trading/trader-profile-inference";
import type { StrategyStatus, TraderPlatform, TraderRecord } from "#/lib/trading/types";

export interface TraderDraftInput {
  id: string;
  name: string;
  platform: TraderPlatform;
  link?: string;
  avatar?: string;
  strategyName?: string;
  strategyStatus?: StrategyStatus;
  strategyRiskRate?: number;
}

export interface TraderDraftBuildOptions {
  profile?: TraderProfileInference | null;
}

function buildDefaultAvatar(name: string) {
  return `https://dummyimage.com/96x96/111827/ffffff&text=${encodeURIComponent(
    name.slice(0, 1).toUpperCase() || "T",
  )}`;
}

function buildDefaultTraderLink(platform: TraderPlatform, traderId: string) {
  switch (platform) {
    case "okx":
      return `https://www.okx.com/cn/copy-trading/account/${traderId}`;
    case "bitget":
      return `https://www.bitget.com/zh-CN/copytrading/trader/${traderId}/futures`;
    case "traderWagon":
      return `https://www.traderwagon.com/en/portfolio/${traderId}`;
    case "bybit":
      return `https://www.bybit.com/copyTrade/trade-center/detail?leaderMark=${encodeURIComponent(
        traderId,
      )}`;
    case "binanceFutures":
      return `https://www.binance.com/en/futures-activity/leaderboard/user?encryptedUid=${encodeURIComponent(
        traderId,
      )}`;
    case "binance":
      return `https://www.binance.com/zh-CN/copy-trading/lead-details?portfolioId=${encodeURIComponent(
        traderId,
      )}&timeRange=30D`;
    case "huobi":
      return "https://www.huobi.com/zh-cn/futures/copytrading/trading";
    default:
      return `https://example.com/trader/${encodeURIComponent(traderId)}`;
  }
}

export function createTraderRecordFromDraft(
  input: TraderDraftInput,
  options?: TraderDraftBuildOptions,
): TraderRecord {
  const inferredProfile = options?.profile ?? null;
  const resolvedName = inferredProfile?.name?.trim() || input.name;

  return {
    id: input.id,
    name: resolvedName,
    nickName: inferredProfile?.nickName?.trim() || undefined,
    platform: input.platform,
    link: input.link ?? buildDefaultTraderLink(input.platform, input.id),
    avatar: input.avatar ?? inferredProfile?.avatar ?? buildDefaultAvatar(resolvedName),
    sign: inferredProfile?.sign?.trim() || undefined,
    strategyStatus: input.strategyStatus ?? "watch",
    strategyName: input.strategyName ?? resolvedName,
    strategyRiskRate: input.strategyRiskRate ?? 0.1,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: 0,
    positionUpdateTime: null,
    positions: [],
  };
}
