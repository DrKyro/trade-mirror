import { mockTeachers, mockTraders } from "../src/lib/trading/mock-data";
import {
  buildReconstructedTradesFromTraderHistory,
  buildHoldingDurationDistribution,
  buildOpenHourDistribution,
  buildOpenWeekdayDistribution,
  buildStrategyPerformanceSeries,
  buildStrategyTradeSummary,
  reconstructClosedTrades,
} from "../src/lib/trading/strategy-analytics";

async function main() {
  const teacher = mockTeachers[0];
  const trader = mockTraders[0];
  if (!teacher || !trader) {
    throw new Error("Missing mock teacher/trader data.");
  }

  const traderId = trader.id;
  if (!traderId) {
    throw new Error("Missing mock trace trader.");
  }

  const entries = teacher.positionHistory
    .filter((entry) => entry.traderId === traderId)
    .sort((a, b) => a.t - b.t);

  const historyPositions = trader.historyPositions ?? [];
  const trades =
    historyPositions.length > 0
      ? buildReconstructedTradesFromTraderHistory(historyPositions)
      : reconstructClosedTrades(entries);
  const summary = buildStrategyTradeSummary(trades);
  const basis =
    teacher.traceTraderList[0]?.traceOrderMode === "fixed"
      ? (teacher.traceTraderList[0]?.fixedFunds ?? 0) || (teacher.traceTraderList[0]?.funds ?? 1)
      : (teacher.traceTraderList[0]?.funds ?? 1);
  const performance = buildStrategyPerformanceSeries(trades, basis);
  const openHours = buildOpenHourDistribution(trades)
    .filter((item) => item.value > 0)
    .map((item) => item.label);
  const weekdays = buildOpenWeekdayDistribution(trades)
    .filter((item) => item.value > 0)
    .map((item) => item.label);
  const durations = buildHoldingDurationDistribution(trades).map((item) => item.value);

  console.log(
    JSON.stringify(
      {
        tradeCount: trades.length,
        tradeSymbols: trades.map((trade) => trade.symbol),
        analyticsSource: historyPositions.length > 0 ? "trader-history" : "teacher-history",
        realizedProfit: summary.realizedProfit,
        winRate: summary.winRate,
        profitFactor: summary.profitFactorLabel,
        averageDuration: summary.averageDurationLabel,
        cumulativeProfit: performance.at(-1)?.cumulativeProfit ?? 0,
        cumulativeProfitRate: performance.at(-1)?.cumulativeProfitRate ?? 0,
        openHours,
        weekdays,
        durations,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
