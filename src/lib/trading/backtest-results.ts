import type { MarketCandle, TraderHistoryPosition } from "#/lib/trading/types";

export type LegacyBacktestTradeInput = {
  id: string;
  symbol: string;
  side: "long" | "short";
  amount: number;
  entryPrice: number;
  closePrice: number;
  openTime: number;
  closeTime: number;
  leverage: number;
  contractVal: number;
  profit?: number;
};

export type LegacyBacktestOrder = {
  id: string;
  symbol: string;
  side: "long" | "short";
  amount: number;
  leverage: number;
  margin: number;
  time: number;
  price: number;
  profit: number;
  action: "open" | "close";
};

export type LegacyBacktestTimelinePoint = {
  datetime: number;
  balance: number;
  u_free: number;
  u_used: number;
  profit: number;
  equity: number;
  pos_len: number;
  drawdown: number;
  drawdown_rate: number;
};

export type LegacyBacktestResult = {
  trade_df: Array<{
    id: string;
    symbol: string;
    side: "long" | "short";
    amount: number;
    entry_price: number;
    close_price: number;
    open_time: number;
    close_time: number;
    leverage: number;
    contract_val: number;
    profit: number;
    profit_rate: number;
    action: "open" | "close";
  }>;
  orders: LegacyBacktestOrder[];
  timeline: LegacyBacktestTimelinePoint[];
  profit: number;
  equity: number;
  maxDrawdown: number;
};

export function buildLegacyBacktestResultFromCandles(
  trades: LegacyBacktestTradeInput[],
  candles: MarketCandle[],
  initialBalance = 0,
): LegacyBacktestResult {
  const sortedTrades = [...trades].sort((left, right) => left.openTime - right.openTime);
  const orders: LegacyBacktestOrder[] = [];
  const trade_df = sortedTrades.flatMap((trade) => {
    const notional = trade.amount * trade.entryPrice * trade.contractVal;
    const profit =
      trade.side === "long"
        ? (trade.closePrice - trade.entryPrice) * trade.amount * trade.contractVal
        : (trade.entryPrice - trade.closePrice) * trade.amount * trade.contractVal;
    const profitRate = notional > 0 ? profit / notional : 0;

    orders.push(
      {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        leverage: trade.leverage,
        margin: (trade.amount * trade.entryPrice * trade.contractVal) / trade.leverage,
        time: trade.openTime,
        price: trade.entryPrice,
        profit: 0,
        action: "open",
      },
      {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        leverage: trade.leverage,
        margin: (trade.amount * trade.entryPrice * trade.contractVal) / trade.leverage,
        time: trade.closeTime,
        price: trade.closePrice,
        profit,
        action: "close",
      },
    );

    return [
      {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        entry_price: trade.entryPrice,
        close_price: trade.closePrice,
        open_time: trade.openTime,
        close_time: trade.closeTime,
        leverage: trade.leverage,
        contract_val: trade.contractVal,
        profit,
        profit_rate: profitRate,
        action: "open" as const,
      },
      {
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        amount: trade.amount,
        entry_price: trade.entryPrice,
        close_price: trade.closePrice,
        open_time: trade.openTime,
        close_time: trade.closeTime,
        leverage: trade.leverage,
        contract_val: trade.contractVal,
        profit,
        profit_rate: profitRate,
        action: "close" as const,
      },
    ];
  });

  const sortedTimelineTimes = [
    ...new Set(trades.flatMap((trade) => [trade.openTime, trade.closeTime])),
  ].sort((left, right) => left - right);
  let balance = initialBalance;
  let runningProfit = 0;
  let peakEquity = initialBalance;
  const timeline: LegacyBacktestTimelinePoint[] = [];

  for (const time of sortedTimelineTimes) {
    const activeTrades = sortedTrades.filter(
      (trade) => trade.openTime <= time && trade.closeTime > time,
    );
    const candlesAtTime = candles.filter((candle) => candle.datetime === time);
    const markPrices = new Map(candlesAtTime.map((candle) => [candle.symbol, candle.close]));

    let unrealizedProfit = 0;
    for (const trade of activeTrades) {
      const mark = markPrices.get(trade.symbol) ?? trade.closePrice;
      unrealizedProfit +=
        trade.side === "long"
          ? (mark - trade.entryPrice) * trade.amount * trade.contractVal
          : (trade.entryPrice - mark) * trade.amount * trade.contractVal;
    }

    runningProfit = trades
      .filter((trade) => trade.closeTime <= time)
      .reduce((sum, trade) => sum + (trade.profit ?? 0), 0);
    balance = initialBalance + runningProfit;
    const equity = balance + unrealizedProfit;
    peakEquity = Math.max(peakEquity, equity);
    const drawdown = equity - peakEquity;

    timeline.push({
      datetime: time,
      balance,
      u_free: equity,
      u_used: activeTrades.reduce(
        (sum, trade) =>
          sum + (trade.amount * trade.entryPrice * trade.contractVal) / trade.leverage,
        0,
      ),
      profit: runningProfit,
      equity,
      pos_len: activeTrades.length,
      drawdown,
      drawdown_rate: peakEquity === 0 ? 0 : drawdown / peakEquity,
    });
  }

  const profit = trades.reduce((sum, trade) => sum + (trade.profit ?? 0), 0);
  const equity = initialBalance + profit;
  const maxDrawdown =
    timeline.length > 0 ? Math.min(...timeline.map((point) => point.drawdown)) : 0;

  return {
    trade_df,
    orders,
    timeline,
    profit,
    equity,
    maxDrawdown,
  };
}

export function convertTraderHistoryToBacktestTrades(
  historyPositions: TraderHistoryPosition[],
): LegacyBacktestTradeInput[] {
  return historyPositions
    .filter(
      (position) =>
        position.openTime !== null &&
        position.closeTime !== null &&
        position.closeTime > position.openTime,
    )
    .map((position) => ({
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      amount: position.amount,
      entryPrice: position.entryPrice,
      closePrice: position.closePrice,
      openTime: position.openTime ?? 0,
      closeTime: position.closeTime ?? 0,
      leverage: position.leverage,
      contractVal: position.contractValue ?? 1,
    }));
}
