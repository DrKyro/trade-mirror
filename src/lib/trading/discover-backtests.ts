import {
  listTradeableHistoryPositions,
  resolveBacktestWindowCutoff,
} from "#/lib/trading/backtest-window";
import type { TraderDeepAnalysis } from "#/lib/trading/trader-rank-types";
import type {
  TraderBacktestMode,
  TraderBacktestSummary,
  TraderBacktestTimelinePoint,
  TraderBacktestTrade,
  TraderBacktestWindow,
} from "#/lib/trading/types";

export {
  filterHistoryPositionsByWindow,
  summarizeBacktestWindow,
  formatBacktestWindowRangeLabel,
  listTradeableHistoryPositions,
} from "#/lib/trading/backtest-window";
export type { BacktestWindowPreview } from "#/lib/trading/backtest-window";

function finite(value: number | null | undefined, fallback = 0) {
  return value == null || !Number.isFinite(value) ? fallback : value;
}

function resolveSourceProfitRate(position: TraderDeepAnalysis["historyPositions"][number]) {
  const sourceProfit = finite(position.profit);
  if (position.profitRate != null && Number.isFinite(position.profitRate)) {
    return position.profitRate;
  }

  const notional = Math.abs(position.amount * position.entryPrice);
  return notional > 0 ? sourceProfit / notional : 0;
}

type SimulationState = {
  equity: number;
  peakEquity: number;
  cumulativeProfit: number;
};

function simulateTrade(
  position: TraderDeepAnalysis["historyPositions"][number] & {
    openTime: number;
    closeTime: number;
  },
  mode: TraderBacktestMode,
  initialBalance: number,
  state: SimulationState,
): { trade: TraderBacktestTrade; state: SimulationState } {
  const sourceProfit = finite(position.profit);
  const sourceProfitRate = resolveSourceProfitRate(position);
  const capitalBase = mode === "compound" ? state.equity : initialBalance;
  const simulatedProfit = capitalBase * sourceProfitRate;
  const cumulativeProfit = state.cumulativeProfit + simulatedProfit;
  const equity =
    mode === "compound" ? state.equity + simulatedProfit : initialBalance + cumulativeProfit;
  const peakEquity = Math.max(state.peakEquity, equity);
  const drawdown = equity - peakEquity;
  const drawdownRate = peakEquity > 0 ? drawdown / peakEquity : 0;

  return {
    trade: {
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      openTime: position.openTime,
      closeTime: position.closeTime,
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
    },
    state: {
      equity,
      peakEquity,
      cumulativeProfit,
    },
  };
}

function warmUpCompoundEquity(
  positions: Array<
    TraderDeepAnalysis["historyPositions"][number] & { openTime: number; closeTime: number }
  >,
  initialBalance: number,
) {
  let equity = initialBalance;

  for (const position of positions) {
    const sourceProfitRate = resolveSourceProfitRate(position);
    equity += equity * sourceProfitRate;
  }

  return equity;
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
  const initialBalance = Math.max(input.initialBalance, 1);
  const allTradeable = listTradeableHistoryPositions(input.analysis.historyPositions);
  const windowCutoff = resolveBacktestWindowCutoff(input.window);
  const inWindow = allTradeable.filter((position) =>
    windowCutoff === null ? true : position.closeTime >= windowCutoff,
  );

  let equityAtWindowStart = initialBalance;
  if (input.mode === "compound" && windowCutoff !== null) {
    const preWindow = allTradeable.filter((position) => position.closeTime < windowCutoff);
    equityAtWindowStart = warmUpCompoundEquity(preWindow, initialBalance);
  }

  let state: SimulationState = {
    equity: equityAtWindowStart,
    peakEquity: equityAtWindowStart,
    cumulativeProfit: 0,
  };

  const trades: TraderBacktestTrade[] = [];
  for (const position of inWindow) {
    const result = simulateTrade(position, input.mode, initialBalance, state);
    trades.push(result.trade);
    state = result.state;
  }

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
  const finalEquity = trades.at(-1)?.equityAfter ?? equityAtWindowStart;
  const returnBase =
    input.mode === "compound" && windowCutoff !== null ? equityAtWindowStart : initialBalance;
  const totalReturn = returnBase > 0 ? realizedProfit / returnBase : 0;
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
