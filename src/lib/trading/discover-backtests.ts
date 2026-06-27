import type { TraderDeepAnalysis } from "#/lib/trading/trader-rank-types";
import type {
  TraderBacktestMode,
  TraderBacktestSummary,
  TraderBacktestTimelinePoint,
  TraderBacktestTrade,
  TraderBacktestWindow,
} from "#/lib/trading/types";

function finite(value: number | null | undefined, fallback = 0) {
  return value == null || !Number.isFinite(value) ? fallback : value;
}

export function filterHistoryPositionsByWindow(
  historyPositions: TraderDeepAnalysis["historyPositions"],
  window: TraderBacktestWindow,
) {
  if (window === "all") {
    return historyPositions;
  }

  const now = Date.now();
  const windowMs = window === "30d" ? 30 * 24 * 60 * 60 * 1_000 : 90 * 24 * 60 * 60 * 1_000;
  return historyPositions.filter((position) => {
    const effectiveTime = position.closeTime ?? position.openTime;
    return effectiveTime !== null && effectiveTime >= now - windowMs;
  });
}

export function buildTraderBacktest(input: {
  analysis: TraderDeepAnalysis;
  mode: TraderBacktestMode;
  window: TraderBacktestWindow;
  initialBalance: number;
}): {
  summary: TraderBacktestSummary;
  timeline: TraderBacktestTimelinePoint[];
  trades: TraderBacktestTrade[];
} {
  const history = filterHistoryPositionsByWindow(input.analysis.historyPositions, input.window)
    .filter(
      (position) =>
        position.openTime !== null &&
        position.closeTime !== null &&
        position.closeTime > position.openTime,
    )
    .slice()
    .sort((left, right) => (left.closeTime ?? 0) - (right.closeTime ?? 0));

  const initialBalance = Math.max(input.initialBalance, 1);
  let cumulativeProfit = 0;
  let equity = initialBalance;
  let peakEquity = initialBalance;

  const trades: TraderBacktestTrade[] = history.map((position) => {
    const sourceProfit = finite(position.profit);
    const sourceProfitRate =
      position.profitRate ??
      (() => {
        const notional = Math.abs(position.amount * position.entryPrice);
        return notional > 0 ? sourceProfit / notional : 0;
      })();

    const capitalBase = input.mode === "compound" ? equity : initialBalance;
    const simulatedProfit = capitalBase * sourceProfitRate;
    cumulativeProfit += simulatedProfit;
    equity =
      input.mode === "compound" ? equity + simulatedProfit : initialBalance + cumulativeProfit;
    peakEquity = Math.max(peakEquity, equity);
    const drawdown = equity - peakEquity;
    const drawdownRate = peakEquity > 0 ? drawdown / peakEquity : 0;

    return {
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      openTime: position.openTime ?? 0,
      closeTime: position.closeTime ?? 0,
      amount: position.amount,
      entryPrice: position.entryPrice,
      closePrice: position.closePrice,
      leverage: position.leverage,
      sourceProfit,
      sourceProfitRate,
      simulatedProfit,
      cumulativeProfit,
      equityAfter: equity,
      drawdown,
      drawdownRate,
    };
  });

  const timeline: TraderBacktestTimelinePoint[] = trades.map((trade) => ({
    time: trade.closeTime,
    tradeId: trade.id,
    symbol: trade.symbol,
    cumulativeProfit: trade.cumulativeProfit,
    equity: trade.equityAfter,
    drawdown: trade.drawdown,
    drawdownRate: trade.drawdownRate,
  }));

  const realizedProfit = trades.reduce((sum, trade) => sum + trade.simulatedProfit, 0);
  const grossProfit = trades
    .filter((trade) => trade.simulatedProfit > 0)
    .reduce((sum, trade) => sum + trade.simulatedProfit, 0);
  const grossLoss = Math.abs(
    trades
      .filter((trade) => trade.simulatedProfit < 0)
      .reduce((sum, trade) => sum + trade.simulatedProfit, 0),
  );
  const wins = trades.filter((trade) => trade.simulatedProfit > 0).length;
  const maxDrawdown =
    timeline.length > 0 ? Math.min(...timeline.map((point) => point.drawdown)) : 0;
  const maxDrawdownRate =
    timeline.length > 0 ? Math.min(...timeline.map((point) => point.drawdownRate)) : 0;
  const finalEquity = trades.at(-1)?.equityAfter ?? initialBalance;
  const totalReturn = initialBalance > 0 ? realizedProfit / initialBalance : 0;
  const averageTradeReturn =
    trades.length > 0
      ? trades.reduce((sum, trade) => sum + trade.sourceProfitRate, 0) / trades.length
      : 0;
  const largestGain = trades.reduce((max, trade) => Math.max(max, trade.simulatedProfit), 0);
  const largestLoss = trades.reduce((min, trade) => Math.min(min, trade.simulatedProfit), 0);
  const profitFactor =
    grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss;

  return {
    summary: {
      closedTrades: trades.length,
      winRate: trades.length > 0 ? wins / trades.length : 0,
      realizedProfit,
      totalReturn,
      finalEquity,
      maxDrawdown,
      maxDrawdownRate,
      averageTradeReturn,
      largestGain,
      largestLoss,
      grossProfit,
      grossLoss,
      profitFactorLabel: Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "Infinity",
    },
    timeline,
    trades,
  };
}
