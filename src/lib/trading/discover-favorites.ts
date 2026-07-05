import type { DiscoverFavoriteRecord, TraderRankItem } from "#/lib/trading/trader-rank-types";

export function discoverFavoriteKey(platform: string, traderId: string) {
  return `${platform}:${traderId}`;
}

export type DiscoverFavoriteRef = Pick<DiscoverFavoriteRecord, "platform" | "traderId">;

export function isDiscoverFavorite(
  favorites: DiscoverFavoriteRef[],
  platform: string,
  traderId: string,
) {
  const key = discoverFavoriteKey(platform, traderId);
  return favorites.some(
    (favorite) => discoverFavoriteKey(favorite.platform, favorite.traderId) === key,
  );
}

export function favoriteRecordToRankItem(favorite: DiscoverFavoriteRecord): TraderRankItem {
  return {
    traderId: favorite.traderId,
    uniqueName: favorite.uniqueName,
    nickName: favorite.nickName,
    avatar: favorite.avatar,
    sign: "",
    platform: favorite.platform,
    yieldRatio: 0,
    pnl: 0,
    aum: 0,
    followers: 0,
    maxDrawdown: null,
    winRate: null,
    instNum: null,
    link: favorite.link,
    yieldCurve: [],
  };
}

export function mergeFavoriteWithRankItems(
  favorites: DiscoverFavoriteRecord[],
  rankItems: TraderRankItem[],
) {
  const rankByKey = new Map(
    rankItems.map((item) => [discoverFavoriteKey(item.platform, item.traderId), item]),
  );

  return favorites.map((favorite) => {
    const live = rankByKey.get(discoverFavoriteKey(favorite.platform, favorite.traderId));
    return live ?? favoriteRecordToRankItem(favorite);
  });
}
