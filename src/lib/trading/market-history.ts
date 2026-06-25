import { listMarketCandles, upsertMarketCandles } from "#/lib/trading/store";
import type { MarketCandle } from "#/lib/trading/types";

export async function saveMarketCandles(candles: MarketCandle[]) {
  await upsertMarketCandles(candles);
}

export async function getMarketCandles(
  platform: MarketCandle["platform"],
  symbol: string,
  interval: MarketCandle["interval"],
  startTime?: number,
  endTime?: number,
) {
  return listMarketCandles(platform, symbol, interval, startTime, endTime);
}
