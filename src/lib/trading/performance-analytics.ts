import type { BacktestChartPoint } from "#/components/trading/backtest-charts";
import {
  buildStrategyTradeSummary,
  filterEntriesByBucket,
  reconstructClosedTrades,
  type HistoryBucket,
  type ReconstructedTrade,
  type StrategyDistributionPoint,
  type StrategyPerformancePoint,
} from "#/lib/trading/strategy-analytics";
import type { TeacherRecord, TraderPlatform, TraderRecord } from "#/lib/trading/types";

export type PortfolioRelationshipRank = {
  key: string;
  accountId: string;
  traderId: string;
  accountName: string;
  traderName: string;
  strategyName: string;
  accountPlatform: TeacherRecord["platform"];
  traderPlatform: TraderPlatform;
  realizedProfit: number;
  unrealizedProfit: number;
  netPnl: number;
  maxDrawdown: number;
  winRate: number;
  closedTrades: number;
};

export type RelationshipRankSort = "pnl" | "drawdown";

export function buildPortfolioCopyTrades(
  accounts: TeacherRecord[],
  bucket: HistoryBucket,
): ReconstructedTrade[] {
  const trades: ReconstructedTrade[] = [];

  for (const account of accounts) {
    for (const setting of account.traceTraderList) {
      const entries = filterEntriesByBucket(
        account.positionHistory.filter((entry) => entry.traderId === setting.id),
        bucket,
      );
      trades.push(...reconstructClosedTrades(entries));
    }
  }

  return trades.sort((left, right) => left.closeTime - right.closeTime);
}

export function buildPortfolioFundsBasis(accounts: TeacherRecord[]) {
  let basis = 0;

  for (const account of accounts) {
    for (const setting of account.traceTraderList) {
      basis +=
        setting.traceOrderMode === "fixed"
          ? setting.fixedFunds || setting.funds || 0
          : setting.funds || 0;
    }
  }

  return basis > 0 ? basis : 1;
}

export function buildPortfolioRelationshipRanks(
  accounts: TeacherRecord[],
  traders: TraderRecord[],
  bucket: HistoryBucket,
): PortfolioRelationshipRank[] {
  const traderMap = new Map(traders.map((trader) => [trader.id, trader]));
  const ranks: PortfolioRelationshipRank[] = [];

  for (const account of accounts) {
    for (const setting of account.traceTraderList) {
      const trader = traderMap.get(setting.id);
      const entries = filterEntriesByBucket(
        account.positionHistory.filter((entry) => entry.traderId === setting.id),
        bucket,
      );
      const trades = reconstructClosedTrades(entries);
      const summary = buildStrategyTradeSummary(trades);
      const realizedProfit =
        summary.closedTrades > 0 ? summary.realizedProfit : setting.followProfit;
      const unrealizedProfit = setting.unrealizedProfitSum;

      ranks.push({
        key: `${account.id}:${setting.id}`,
        accountId: account.id,
        traderId: setting.id,
        accountName: account.name,
        traderName: trader?.name ?? setting.name,
        strategyName: trader?.strategyName ?? setting.name,
        accountPlatform: account.platform,
        traderPlatform: trader?.platform ?? account.platform,
        realizedProfit,
        unrealizedProfit,
        netPnl: realizedProfit + unrealizedProfit,
        maxDrawdown: summary.maxDrawdown,
        winRate: summary.winRate,
        closedTrades: summary.closedTrades,
      });
    }
  }

  return ranks;
}

export function sortRelationshipRanks(
  ranks: PortfolioRelationshipRank[],
  sortBy: RelationshipRankSort,
) {
  return [...ranks].sort((left, right) => {
    if (sortBy === "pnl") {
      return right.netPnl - left.netPnl;
    }

    if (left.maxDrawdown !== right.maxDrawdown) {
      return left.maxDrawdown - right.maxDrawdown;
    }

    return right.netPnl - left.netPnl;
  });
}

export function buildPortfolioEquityCurve(
  accounts: TeacherRecord[],
  bucket: HistoryBucket,
): BacktestChartPoint[] {
  const trades = buildPortfolioCopyTrades(accounts, bucket);
  const basis = buildPortfolioFundsBasis(accounts);
  let cumulativeProfit = 0;

  return trades.map((trade, index) => {
    cumulativeProfit += trade.profit;

    return {
      label: String(index + 1),
      time: trade.closeTime,
      openTime: trade.openTime,
      holdingDurationMs: trade.durationMs,
      sequence: index + 1,
      value: basis + cumulativeProfit,
    };
  });
}

export function toCumulativeProfitChartPoints(
  performance: StrategyPerformancePoint[],
  trades: ReconstructedTrade[],
): BacktestChartPoint[] {
  return performance.map((point, index) => {
    const trade = trades[index];

    return {
      label: String(index + 1),
      time: trade?.closeTime,
      openTime: trade?.openTime,
      holdingDurationMs: trade?.durationMs,
      sequence: index + 1,
      value: point.cumulativeProfit,
    };
  });
}

export function toCumulativeReturnChartPoints(
  performance: StrategyPerformancePoint[],
  trades: ReconstructedTrade[],
): BacktestChartPoint[] {
  return performance.map((point, index) => {
    const trade = trades[index];

    return {
      label: String(index + 1),
      time: trade?.closeTime,
      openTime: trade?.openTime,
      holdingDurationMs: trade?.durationMs,
      sequence: index + 1,
      value: point.cumulativeProfitRate,
    };
  });
}

export function toPerTradeProfitChartPoints(
  performance: StrategyPerformancePoint[],
  trades: ReconstructedTrade[],
): BacktestChartPoint[] {
  return performance.map((point, index) => {
    const trade = trades[index];

    return {
      label: String(index + 1),
      time: trade?.closeTime,
      openTime: trade?.openTime,
      holdingDurationMs: trade?.durationMs,
      sequence: index + 1,
      value: point.tradeProfit,
    };
  });
}

export function hourDistributionToChartPoints(
  points: StrategyDistributionPoint[],
): BacktestChartPoint[] {
  return points.map((point) => ({
    label: point.label,
    category: point.label.padStart(2, "0"),
    value: point.value,
  }));
}

export function weekdayDistributionToChartPoints(
  points: StrategyDistributionPoint[],
): BacktestChartPoint[] {
  return points.map((point) => ({
    label: point.label,
    category: point.label,
    value: point.value,
  }));
}

export function durationDistributionToChartPoints(
  points: StrategyDistributionPoint[],
  trades: ReconstructedTrade[],
): BacktestChartPoint[] {
  const recentTrades = trades.slice(-points.length);

  return points.map((point, index) => {
    const trade = recentTrades[index];

    return {
      label: point.label,
      time: trade?.closeTime,
      openTime: trade?.openTime,
      holdingDurationMs: trade?.durationMs,
      sequence: Number(point.label) || index + 1,
      value: point.value,
    };
  });
}
