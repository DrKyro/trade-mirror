import type { TraderBacktestRunRecord, TraderBacktestTrade } from "#/lib/trading/types";

export type BacktestChartPoint = {
  label: string;
  value: number;
  time?: number;
  openTime?: number;
  holdingDurationMs?: number;
  sequence?: number;
  granularity?: "day" | "datetime";
  category?: string;
};

export type BacktestComparisonPoint = {
  label: string;
  primary: number;
  secondary: number;
};

export type DerivedTraderBacktestTrade = TraderBacktestTrade & {
  index: number;
  notionalUsd: number;
  holdingDurationMs: number;
  equityBefore: number;
  cumulativeReturn: number;
};

export type TraderBacktestAnalytics = {
  trades: DerivedTraderBacktestTrade[];
  averageTradeProfit: number;
  averageTradeReturn: number;
  averageHoldingDurationMs: number;
  averageNotionalUsd: number;
  totalNotionalUsd: number;
  profitableTrades: number;
  losingTrades: number;
  averageDrawdownRate: number;
  equitySeries: BacktestChartPoint[];
  cumulativeProfitSeries: BacktestChartPoint[];
  cumulativeReturnSeries: BacktestChartPoint[];
  tradeProfitSeries: BacktestChartPoint[];
  tradeNotionalSeries: BacktestChartPoint[];
  profitVsDrawdownSeries: BacktestComparisonPoint[];
  returnVsDrawdownRateSeries: BacktestComparisonPoint[];
  openHourCounts: number[];
  openWeekdayCounts: number[];
  openDayDistribution: BacktestChartPoint[];
};

export function buildTraderBacktestAnalytics(
  run: Pick<TraderBacktestRunRecord, "trades" | "initialBalance">,
): TraderBacktestAnalytics {
  const safeInitialBalance = run.initialBalance > 0 ? run.initialBalance : 1;
  const rawTrades = [...run.trades].sort((left, right) => left.closeTime - right.closeTime);

  const trades = rawTrades.map((trade, index) => {
    const notionalUsd = Math.abs(trade.amount * trade.entryPrice);
    const holdingDurationMs = Math.max(trade.closeTime - trade.openTime, 0);
    const equityBefore = trade.equityAfter - trade.simulatedProfit;
    const cumulativeReturn = (trade.equityAfter - safeInitialBalance) / safeInitialBalance;

    return {
      ...trade,
      index,
      notionalUsd,
      holdingDurationMs,
      equityBefore,
      cumulativeReturn,
    } satisfies DerivedTraderBacktestTrade;
  });

  const totalNotionalUsd = trades.reduce((sum, trade) => sum + trade.notionalUsd, 0);
  const totalHoldingDuration = trades.reduce((sum, trade) => sum + trade.holdingDurationMs, 0);
  const profitableTrades = trades.filter((trade) => trade.simulatedProfit > 0).length;
  const losingTrades = trades.filter((trade) => trade.simulatedProfit < 0).length;
  const averageDrawdownRate =
    trades.length > 0
      ? trades.reduce((sum, trade) => sum + Math.abs(trade.drawdownRate), 0) / trades.length
      : 0;

  const openHourCounts = Array.from({ length: 24 }, () => 0);
  const openWeekdayCounts = Array.from({ length: 7 }, () => 0);
  const openDayMap = new Map<string, { label: string; value: number; time: number }>();

  for (const trade of trades) {
    openHourCounts[new Date(trade.openTime).getHours()]! += 1;
    openWeekdayCounts[getWeekdayIndex(trade.openTime)]! += 1;

    const dayKey = formatDateKey(trade.openTime);
    const entry = openDayMap.get(dayKey);
    if (entry) {
      entry.value += 1;
    } else {
      openDayMap.set(dayKey, {
        label: formatShortDate(trade.openTime),
        value: 1,
        time: startOfDay(trade.openTime),
      });
    }
  }

  return {
    trades,
    averageTradeProfit:
      trades.length > 0
        ? trades.reduce((sum, trade) => sum + trade.simulatedProfit, 0) / trades.length
        : 0,
    averageTradeReturn:
      trades.length > 0
        ? trades.reduce((sum, trade) => sum + trade.sourceProfitRate, 0) / trades.length
        : 0,
    averageHoldingDurationMs: trades.length > 0 ? totalHoldingDuration / trades.length : 0,
    averageNotionalUsd: trades.length > 0 ? totalNotionalUsd / trades.length : 0,
    totalNotionalUsd,
    profitableTrades,
    losingTrades,
    averageDrawdownRate,
    equitySeries: trades.map((trade) => ({
      label: formatShortDate(trade.closeTime),
      time: trade.closeTime,
      sequence: trade.index + 1,
      value: trade.equityAfter,
    })),
    cumulativeProfitSeries: trades.map((trade) => ({
      label: formatShortDate(trade.closeTime),
      time: trade.closeTime,
      sequence: trade.index + 1,
      value: trade.cumulativeProfit,
    })),
    cumulativeReturnSeries: trades.map((trade) => ({
      label: formatShortDate(trade.closeTime),
      time: trade.closeTime,
      sequence: trade.index + 1,
      value: trade.cumulativeReturn,
    })),
    tradeProfitSeries: trades.map((trade) => ({
      label: `${trade.index + 1}`,
      time: trade.closeTime,
      openTime: trade.openTime,
      holdingDurationMs: trade.holdingDurationMs,
      sequence: trade.index + 1,
      value: trade.simulatedProfit,
    })),
    tradeNotionalSeries: trades.map((trade) => ({
      label: `${trade.index + 1}`,
      time: trade.closeTime,
      openTime: trade.openTime,
      holdingDurationMs: trade.holdingDurationMs,
      sequence: trade.index + 1,
      value: trade.notionalUsd,
    })),
    profitVsDrawdownSeries: trades.map((trade) => ({
      label: `${trade.index + 1}`,
      primary: trade.simulatedProfit,
      secondary: trade.drawdown,
    })),
    returnVsDrawdownRateSeries: trades.map((trade) => ({
      label: `${trade.index + 1}`,
      primary: trade.sourceProfitRate,
      secondary: trade.drawdownRate,
    })),
    openHourCounts,
    openWeekdayCounts,
    openDayDistribution: [...openDayMap.values()]
      .sort((left, right) => left.time - right.time)
      .map(({ label, value, time }) => ({
        label,
        value,
        time,
        granularity: "day" as const,
      })),
  };
}

export function formatDurationLabel(durationMs: number) {
  if (!(durationMs > 0)) {
    return "0m";
  }

  const totalMinutes = Math.round(durationMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function getWeekdayIndex(timestamp: number) {
  const day = new Date(timestamp).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
