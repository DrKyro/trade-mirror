import type { TeacherPositionHistoryEntry, TraderHistoryPosition } from "#/lib/trading/types";

export type HistoryBucket = "7d" | "30d" | "all";

export type ReconstructedTrade = {
  orderId: string;
  symbol: string;
  side: TeacherPositionHistoryEntry["side"];
  traderId: string;
  openTime: number;
  closeTime: number;
  openPrice: number;
  closePrice: number;
  amount: number;
  notional: number;
  profit: number;
  profitRate: number;
  durationMs: number;
  openPs: string;
  closePs: string;
};

export type StrategyPerformancePoint = {
  label: string;
  cumulativeProfit: number;
  cumulativeProfitRate: number;
  tradeProfit: number;
};

export type StrategyDistributionPoint = {
  label: string;
  value: number;
};

export type StrategyTradeSummary = {
  closedTrades: number;
  realizedProfit: number;
  grossProfit: number;
  grossLoss: number;
  averageTradeProfit: number;
  profitRate: number;
  winRate: number;
  maxDrawdown: number;
  largestGain: number;
  largestLoss: number;
  profitFactorLabel: string;
  averageDurationLabel: string;
};

export function filterEntriesByBucket(
  entries: TeacherPositionHistoryEntry[],
  bucket: HistoryBucket,
) {
  if (bucket === "all") {
    return entries;
  }

  const now = Date.now();
  const windowMs = bucket === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => entry.t >= now - windowMs);
}

export function reconstructClosedTrades(
  entries: TeacherPositionHistoryEntry[],
): ReconstructedTrade[] {
  const openLots = new Map<
    string,
    Array<{
      orderId: string;
      symbol: string;
      side: TeacherPositionHistoryEntry["side"];
      traderId: string;
      openTime: number;
      openPrice: number;
      remainingAmount: number;
      openPs: string;
    }>
  >();
  const trades: ReconstructedTrade[] = [];

  for (const entry of [...entries].sort((a, b) => a.t - b.t)) {
    if (entry.success !== 1 || !entry.orderId) {
      continue;
    }

    if (entry.action === 1) {
      const lots = openLots.get(entry.orderId) ?? [];
      lots.push({
        orderId: entry.orderId,
        symbol: entry.symbol,
        side: entry.side,
        traderId: entry.traderId,
        openTime: entry.t,
        openPrice: entry.price,
        remainingAmount: entry.amount,
        openPs: entry.ps,
      });
      openLots.set(entry.orderId, lots);
      continue;
    }

    const lots = openLots.get(entry.orderId) ?? [];
    let remainingCloseAmount = entry.amount;

    while (remainingCloseAmount > 0 && lots.length > 0) {
      const lot = lots[0]!;
      const closedAmount = Math.min(lot.remainingAmount, remainingCloseAmount);
      const profit = entry.amount > 0 ? entry.profit * (closedAmount / entry.amount) : 0;
      const notional = Math.abs(closedAmount * lot.openPrice);

      trades.push({
        orderId: lot.orderId,
        symbol: lot.symbol,
        side: lot.side,
        traderId: lot.traderId,
        openTime: lot.openTime,
        closeTime: entry.t,
        openPrice: lot.openPrice,
        closePrice: entry.price,
        amount: closedAmount,
        notional,
        profit,
        profitRate: notional > 0 ? profit / notional : 0,
        durationMs: Math.max(entry.t - lot.openTime, 0),
        openPs: lot.openPs,
        closePs: entry.ps,
      });

      lot.remainingAmount -= closedAmount;
      remainingCloseAmount -= closedAmount;
      if (lot.remainingAmount <= 0) {
        lots.shift();
      }
    }

    if (lots.length === 0) {
      openLots.delete(entry.orderId);
    }
  }

  return trades.sort((a, b) => a.closeTime - b.closeTime);
}

export function buildReconstructedTradesFromTraderHistory(
  historyPositions: TraderHistoryPosition[],
): ReconstructedTrade[] {
  return [...historyPositions]
    .filter(
      (position) =>
        position.closeTime !== null &&
        position.openTime !== null &&
        Number.isFinite(position.entryPrice) &&
        Number.isFinite(position.closePrice),
    )
    .map((position) => {
      const notional = Math.abs(position.amount * position.entryPrice);
      const profit =
        position.profit ??
        (position.side === "long"
          ? (position.closePrice - position.entryPrice) * position.amount
          : (position.entryPrice - position.closePrice) * position.amount);
      const profitRate = position.profitRate ?? (notional > 0 ? profit / notional : 0);

      const openTime = position.openTime ?? 0;
      const closeTime = position.closeTime ?? openTime;

      return {
        orderId: position.id,
        symbol: position.symbol,
        side: position.side,
        traderId: position.id,
        openTime,
        closeTime,
        openPrice: position.entryPrice,
        closePrice: position.closePrice,
        amount: position.amount,
        notional,
        profit,
        profitRate,
        durationMs: Math.max(closeTime - openTime, 0),
        openPs: `${position.source} trader history`,
        closePs: `${position.source} trader history`,
      } satisfies ReconstructedTrade;
    })
    .sort((left, right) => left.closeTime - right.closeTime);
}

export function buildStrategyPerformanceSeries(
  trades: ReconstructedTrade[],
  basis: number,
): StrategyPerformancePoint[] {
  let cumulativeProfit = 0;
  let cumulativeProfitRate = 0;
  const safeBasis = basis > 0 ? basis : 1;

  return trades.map((trade) => {
    cumulativeProfit += trade.profit;
    cumulativeProfitRate += trade.profit / safeBasis;

    return {
      label: new Date(trade.closeTime).toLocaleDateString(),
      cumulativeProfit,
      cumulativeProfitRate,
      tradeProfit: trade.profit,
    };
  });
}

export function buildStrategyTradeSummary(trades: ReconstructedTrade[]): StrategyTradeSummary {
  const realizedProfit = trades.reduce((total, trade) => total + trade.profit, 0);
  const grossProfit = trades
    .filter((trade) => trade.profit > 0)
    .reduce((total, trade) => total + trade.profit, 0);
  const grossLoss = trades
    .filter((trade) => trade.profit < 0)
    .reduce((total, trade) => total + Math.abs(trade.profit), 0);
  const closedTrades = trades.length;
  const wins = trades.filter((trade) => trade.profit > 0).length;
  const totalNotional = trades.reduce((total, trade) => total + trade.notional, 0);
  const totalDuration = trades.reduce((total, trade) => total + trade.durationMs, 0);
  const averageTradeProfit = closedTrades > 0 ? realizedProfit / closedTrades : 0;
  const profitRate = totalNotional > 0 ? realizedProfit / totalNotional : 0;
  const winRate = closedTrades > 0 ? wins / closedTrades : 0;
  const averageDurationMs = closedTrades > 0 ? totalDuration / closedTrades : 0;

  let runningProfit = 0;
  let peakProfit = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    runningProfit += trade.profit;
    peakProfit = Math.max(peakProfit, runningProfit);
    maxDrawdown = Math.max(maxDrawdown, peakProfit - runningProfit);
  }

  const largestGain = trades.reduce((max, trade) => Math.max(max, trade.profit), 0);
  const largestLoss = trades.reduce((min, trade) => Math.min(min, trade.profit), 0);
  const profitFactor =
    grossLoss === 0 ? (grossProfit > 0 ? Number.POSITIVE_INFINITY : 0) : grossProfit / grossLoss;

  return {
    closedTrades,
    realizedProfit,
    grossProfit,
    grossLoss,
    averageTradeProfit,
    profitRate,
    winRate,
    maxDrawdown,
    largestGain,
    largestLoss,
    profitFactorLabel: Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "Infinity",
    averageDurationLabel: formatDuration(averageDurationMs),
  };
}

export function buildOpenHourDistribution(
  trades: ReconstructedTrade[],
): StrategyDistributionPoint[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const trade of trades) {
    counts[new Date(trade.openTime).getHours()]! += 1;
  }

  return counts.map((value, hour) => ({
    label: hour.toString().padStart(2, "0"),
    value,
  }));
}

export function buildOpenWeekdayDistribution(
  trades: ReconstructedTrade[],
): StrategyDistributionPoint[] {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const counts = Array.from({ length: 7 }, () => 0);
  for (const trade of trades) {
    counts[getWeekdayIndex(trade.openTime)]! += 1;
  }

  return labels.map((label, index) => ({
    label,
    value: counts[index] ?? 0,
  }));
}

export function buildHoldingDurationDistribution(
  trades: ReconstructedTrade[],
): StrategyDistributionPoint[] {
  return trades.slice(-12).map((trade, index) => ({
    label: `${index + 1}`,
    value: Number((trade.durationMs / (60 * 60 * 1000)).toFixed(2)),
  }));
}

export function formatDuration(durationMs: number) {
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
