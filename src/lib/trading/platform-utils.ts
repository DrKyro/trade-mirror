import type { TraderPlatform } from "#/lib/trading/types";

const LIVE_REFRESH_PLATFORMS: TraderPlatform[] = ["okx", "bitget", "binanceFutures", "bybit"];

const PLATFORM_LABELS: Record<TraderPlatform, string> = {
  okx: "OKX",
  bitget: "Bitget",
  binanceFutures: "Binance Futures",
  bybit: "Bybit",
};

export const SUPPORTED_TEACHER_PLATFORMS: TraderPlatform[] = [...LIVE_REFRESH_PLATFORMS];

export function getPlatformLabel(platform: TraderPlatform) {
  return PLATFORM_LABELS[platform];
}

export function supportsLiveRefresh(platform: TraderPlatform) {
  return LIVE_REFRESH_PLATFORMS.includes(platform);
}
