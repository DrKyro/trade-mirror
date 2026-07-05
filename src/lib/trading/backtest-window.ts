import type { AppLocale } from "#/lib/i18n";
import { formatBacktestDateOnly } from "#/lib/trading/backtest-time-format";
import type { TraderDeepAnalysis } from "#/lib/trading/trader-rank-types";
import type { TraderBacktestWindow } from "#/lib/trading/types";

export const BACKTEST_WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1_000;
export const BACKTEST_WINDOW_90D_MS = 90 * 24 * 60 * 60 * 1_000;

export type TradeableHistoryPosition = TraderDeepAnalysis["historyPositions"][number];

export type BacktestWindowPreview = {
  window: TraderBacktestWindow;
  tradeableCount: number;
  closeTimeStart: number | null;
  closeTimeEnd: number | null;
  windowCutoff: number | null;
};

export function resolveBacktestWindowCutoff(
  window: TraderBacktestWindow,
  now = Date.now(),
): number | null {
  if (window === "all") return null;
  const windowMs = window === "30d" ? BACKTEST_WINDOW_30D_MS : BACKTEST_WINDOW_90D_MS;
  return now - windowMs;
}

export function isTradeableHistoryPosition(
  position: TradeableHistoryPosition,
): position is TradeableHistoryPosition & { openTime: number; closeTime: number } {
  return (
    position.openTime !== null &&
    position.closeTime !== null &&
    position.closeTime > position.openTime
  );
}

export function listTradeableHistoryPositions(
  historyPositions: TraderDeepAnalysis["historyPositions"],
) {
  return historyPositions
    .filter(isTradeableHistoryPosition)
    .slice()
    .sort((left, right) => left.closeTime - right.closeTime);
}

export function isPositionInBacktestWindow(
  position: TradeableHistoryPosition,
  window: TraderBacktestWindow,
  now = Date.now(),
) {
  if (window === "all") return true;
  if (position.closeTime === null) return false;
  const cutoff = resolveBacktestWindowCutoff(window, now);
  return cutoff !== null && position.closeTime >= cutoff;
}

export function filterHistoryPositionsByWindow(
  historyPositions: TraderDeepAnalysis["historyPositions"],
  window: TraderBacktestWindow,
  now = Date.now(),
) {
  if (window === "all") return historyPositions;
  return historyPositions.filter((position) => isPositionInBacktestWindow(position, window, now));
}

export function summarizeBacktestWindow(
  historyPositions: TraderDeepAnalysis["historyPositions"],
  window: TraderBacktestWindow,
  now = Date.now(),
): BacktestWindowPreview {
  const tradeable = listTradeableHistoryPositions(historyPositions).filter((position) =>
    isPositionInBacktestWindow(position, window, now),
  );
  const closeTimes = tradeable.map((position) => position.closeTime);

  return {
    window,
    tradeableCount: tradeable.length,
    closeTimeStart: closeTimes.length > 0 ? Math.min(...closeTimes) : null,
    closeTimeEnd: closeTimes.length > 0 ? Math.max(...closeTimes) : null,
    windowCutoff: resolveBacktestWindowCutoff(window, now),
  };
}

export function formatBacktestWindowRangeLabel(preview: BacktestWindowPreview, locale: AppLocale) {
  if (
    preview.tradeableCount === 0 ||
    preview.closeTimeStart === null ||
    preview.closeTimeEnd === null
  ) {
    return null;
  }

  const start = formatBacktestDateOnly(preview.closeTimeStart, locale);
  const end = formatBacktestDateOnly(preview.closeTimeEnd, locale);
  return start === end ? start : `${start} – ${end}`;
}
