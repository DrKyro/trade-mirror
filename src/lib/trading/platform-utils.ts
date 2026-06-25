import type { TraderPlatform } from "#/lib/trading/types";

const LIVE_REFRESH_PLATFORMS: TraderPlatform[] = [
  "okx",
  "bitget",
  "binanceFutures",
  "bybit",
  "traderWagon",
];

export function supportsLiveRefresh(platform: TraderPlatform) {
  return LIVE_REFRESH_PLATFORMS.includes(platform);
}
