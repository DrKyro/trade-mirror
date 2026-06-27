import "#/lib/trading/adapters/index";
import { getAdapter } from "#/lib/trading/adapters/registry";
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
  const adapter = getAdapter(platform);
  return adapter.buildTraderLink(traderId);
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
