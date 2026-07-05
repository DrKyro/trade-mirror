import type { TraderDraftInput } from "#/lib/trading/trader-defaults";
import type { TraderRankItem } from "#/lib/trading/trader-rank-types";

export function rankItemToTraderDraft(item: TraderRankItem): TraderDraftInput {
  return {
    id: item.traderId,
    name: item.nickName,
    platform: item.platform,
    link: item.link,
    avatar: item.avatar,
    strategyName: item.nickName,
    strategyStatus: "watch",
  };
}

export function isTraderTracked(trackedIds: Set<string>, item: TraderRankItem) {
  return trackedIds.has(item.traderId);
}
