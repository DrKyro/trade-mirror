import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";

import {
  BacktestBarChart,
  BacktestLineChart,
  downsampleChartPoints,
} from "#/components/trading/backtest-charts";
import { TradingPageShell } from "#/components/trading/page-shell";
import { PerformancePortfolioSummary } from "#/components/trading/performance-portfolio-summary";
import { PerformanceRelationshipRanking } from "#/components/trading/performance-relationship-ranking";
import { Button } from "#/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { useI18n } from "#/lib/i18n";
import {
  buildPortfolioEquityCurve,
  buildPortfolioRelationshipRanks,
  type RelationshipRankSort,
  durationDistributionToChartPoints,
  hourDistributionToChartPoints,
  toCumulativeProfitChartPoints,
  toCumulativeReturnChartPoints,
  toPerTradeProfitChartPoints,
  weekdayDistributionToChartPoints,
} from "#/lib/trading/performance-analytics";
import { buildPortfolioSummary } from "#/lib/trading/performance-summary";
import { accountsQueryOptions, allTradersQueryOptions } from "#/lib/trading/queries";
import {
  buildReconstructedTradesFromTraderHistory,
  buildHoldingDurationDistribution,
  buildOpenHourDistribution,
  buildOpenWeekdayDistribution,
  buildStrategyPerformanceSeries,
  buildStrategyTradeSummary,
  filterEntriesByBucket,
  formatDuration,
  type HistoryBucket,
  reconstructClosedTrades,
  type ReconstructedTrade,
  type StrategyPerformancePoint,
  type StrategyTradeSummary,
} from "#/lib/trading/strategy-analytics";
import type { TeacherPositionHistoryEntry, TeacherRecord, TraderRecord } from "#/lib/trading/types";

const performanceSearchSchema = z.object({
  copy: z.string().optional(),
  tab: z.enum(["mine", "reference", "trades", "config"]).optional().catch("mine"),
});

export const Route = createFileRoute("/_auth/app/performance")({
  validateSearch: performanceSearchSchema,
  loader: async ({ context }) => {
    const [accounts, traders] = await Promise.all([
      context.queryClient.ensureQueryData(accountsQueryOptions()),
      context.queryClient.ensureQueryData(allTradersQueryOptions()),
    ]);

    return { accounts, traders };
  },
  component: PerformancePage,
});

type StrategyBoardRecord = {
  key: string;
  accountId: string;
  traderId: string;
  accountName: string;
  accountPlatform: TeacherRecord["platform"];
  traderName: string;
  traderPlatform: TraderRecord["platform"];
  strategyName: string;
  followStatus: string;
  traceOrderMode: string;
  funds: number;
  fixedFunds: number;
  tracePerRatio: number;
  stopLossUsdt: number;
  stopLossPositionValueRate: number;
  unrealizedProfitSum: number;
  followProfit: number;
  openRelationsCount: number;
  recentEntries: TeacherPositionHistoryEntry[];
  traderPositions: TraderRecord["positions"];
  traderHistoryPositions: NonNullable<TraderRecord["historyPositions"]>;
  analyticsSource: "trader-history" | "teacher-history";
};

function PerformancePage() {
  const { accounts, traders } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t } = useI18n();
  const text = useStrategyBoardText();
  const detailTab = search.tab ?? "mine";
  const [selectedKey, setSelectedKey] = useState<string | null>(search.copy ?? null);
  const [bucket, setBucket] = useState<HistoryBucket>("30d");
  const [rankSort, setRankSort] = useState<RelationshipRankSort>("pnl");

  const selectRelationship = (key: string) => {
    setSelectedKey(key);
    void navigate({
      search: (current) => ({ ...current, copy: key, tab: current.tab ?? "mine" }),
      replace: true,
    });
  };

  const setDetailTab = (tab: "mine" | "reference" | "trades" | "config") => {
    void navigate({
      search: (current) => ({ ...current, tab }),
      replace: true,
    });
  };

  const portfolioSummary = useMemo(() => buildPortfolioSummary(accounts), [accounts]);
  const portfolioEquityCurve = useMemo(
    () => buildPortfolioEquityCurve(accounts, bucket),
    [accounts, bucket],
  );
  const relationshipRanks = useMemo(
    () => buildPortfolioRelationshipRanks(accounts, traders, bucket),
    [accounts, bucket, traders],
  );
  const records = useMemo(() => buildStrategyBoardRecords(accounts, traders), [accounts, traders]);

  const selectedRecord = useMemo(() => {
    if (records.length === 0) {
      return null;
    }

    if (selectedKey == null) {
      return records[0] ?? null;
    }

    return records.find((record) => record.key === selectedKey) ?? records[0] ?? null;
  }, [records, selectedKey]);

  const filteredEntries = useMemo(() => {
    if (!selectedRecord || selectedRecord.analyticsSource === "trader-history") {
      return [];
    }

    return filterEntriesByBucket(selectedRecord.recentEntries, bucket);
  }, [bucket, selectedRecord]);

  const referenceClosedTrades = useMemo(() => {
    if (!selectedRecord) {
      return [];
    }
    return buildReconstructedTradesFromTraderHistory(
      filterTraderHistoryByBucket(selectedRecord.traderHistoryPositions, bucket),
    );
  }, [bucket, selectedRecord]);

  const mineClosedTrades = useMemo(() => {
    if (!selectedRecord || selectedRecord.analyticsSource === "trader-history") {
      return [];
    }
    return reconstructClosedTrades(filteredEntries);
  }, [filteredEntries, selectedRecord]);

  const baseAmount = selectedRecord
    ? selectedRecord.traceOrderMode === "fixed"
      ? selectedRecord.fixedFunds || selectedRecord.funds || 1
      : selectedRecord.funds || 1
    : 1;

  const minePerformance = useMemo(
    () => buildStrategyPerformanceSeries(mineClosedTrades, baseAmount),
    [baseAmount, mineClosedTrades],
  );

  const referencePerformance = useMemo(
    () => buildStrategyPerformanceSeries(referenceClosedTrades, baseAmount),
    [baseAmount, referenceClosedTrades],
  );

  const mineSummary = useMemo(
    () => buildStrategyTradeSummary(mineClosedTrades),
    [mineClosedTrades],
  );

  const referenceSummary = useMemo(
    () => buildStrategyTradeSummary(referenceClosedTrades),
    [referenceClosedTrades],
  );

  const mineOpenHourDistribution = useMemo(
    () => buildOpenHourDistribution(mineClosedTrades),
    [mineClosedTrades],
  );

  const referenceOpenHourDistribution = useMemo(
    () => buildOpenHourDistribution(referenceClosedTrades),
    [referenceClosedTrades],
  );

  const mineOpenWeekdayDistribution = useMemo(
    () => buildOpenWeekdayDistribution(mineClosedTrades),
    [mineClosedTrades],
  );

  const referenceOpenWeekdayDistribution = useMemo(
    () => buildOpenWeekdayDistribution(referenceClosedTrades),
    [referenceClosedTrades],
  );

  const mineDurationDistribution = useMemo(
    () => buildHoldingDurationDistribution(mineClosedTrades),
    [mineClosedTrades],
  );

  const referenceDurationDistribution = useMemo(
    () => buildHoldingDurationDistribution(referenceClosedTrades),
    [referenceClosedTrades],
  );

  return (
    <TradingPageShell
      title={t("performance.pageTitle")}
      description={t("performance.pageDescription")}
    >
      <PerformancePortfolioSummary
        summary={portfolioSummary}
        equityCurve={portfolioEquityCurve}
        bucket={bucket}
        onBucketChange={setBucket}
      />

      <PerformanceRelationshipRanking
        ranks={relationshipRanks}
        sortBy={rankSort}
        onSortChange={setRankSort}
        selectedKey={selectedRecord?.key ?? selectedKey}
        onSelect={selectRelationship}
      />

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <section className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{text.strategySelector}</h2>
              <p className="text-xs text-muted-foreground">{text.strategySelectorDescription}</p>
            </div>
            <Badge>{String(records.length)}</Badge>
          </div>

          <div className="mt-4 space-y-3">
            {records.length > 0 ? (
              records.map((record) => {
                const active = record.key === selectedRecord?.key;

                return (
                  <button
                    key={record.key}
                    type="button"
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
                    }`}
                    onClick={() => selectRelationship(record.key)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{record.strategyName}</div>
                      <Badge>{record.accountPlatform}</Badge>
                      <Badge tone={record.followStatus === "following" ? "success" : "muted"}>
                        {formatFollowStatus(record.followStatus, text)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {record.accountName} → {record.traderName}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div>{text.openRelationsLabel(record.openRelationsCount)}</div>
                      <div>{text.trackedFillsLabel(record.recentEntries.length)}</div>
                      <div>{text.unrealizedLabel(record.unrealizedProfitSum.toFixed(2))}</div>
                      <div>{text.realizedLabel(record.followProfit.toFixed(2))}</div>
                    </div>
                  </button>
                );
              })
            ) : (
              <EmptyState message={text.noStrategyRecords} />
            )}
          </div>
        </section>

        <section className="space-y-6">
          {selectedRecord ? (
            <>
              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-semibold">{selectedRecord.strategyName}</h2>
                      <Badge>{selectedRecord.accountPlatform}</Badge>
                      <Badge
                        tone={selectedRecord.followStatus === "following" ? "success" : "muted"}
                      >
                        {formatFollowStatus(selectedRecord.followStatus, text)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {text.copyRelationship(
                        selectedRecord.accountName,
                        selectedRecord.traderName,
                        formatTraceOrderMode(selectedRecord.traceOrderMode, text),
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{text.boardDescription}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          to="/app/accounts/$accountId"
                          params={{ accountId: selectedRecord.accountId }}
                          search={{ tab: "follow" }}
                        />
                      }
                      nativeButton={false}
                    >
                      {t("performance.editCopy")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          to="/app/traders/$traderId"
                          params={{ traderId: selectedRecord.traderId }}
                        />
                      }
                      nativeButton={false}
                    >
                      {t("performance.viewTrader")}
                    </Button>
                    {(["7d", "30d", "all"] as const).map((item) => (
                      <Button
                        key={item}
                        size="sm"
                        variant={bucket === item ? "default" : "outline"}
                        onClick={() => setBucket(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                </div>

                <Tabs
                  value={detailTab}
                  onValueChange={(value) => setDetailTab(value as typeof detailTab)}
                >
                  <TabsList className="mt-6 flex h-auto w-full flex-wrap justify-start gap-1">
                    <TabsTrigger value="mine">{t("performance.tab.mine")}</TabsTrigger>
                    <TabsTrigger value="reference">{t("performance.tab.reference")}</TabsTrigger>
                    <TabsTrigger value="trades">{t("performance.tab.trades")}</TabsTrigger>
                    <TabsTrigger value="config">{t("performance.tab.config")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="mine" className="mt-6 space-y-6">
                    {mineClosedTrades.length === 0 ? (
                      <EmptyState message={text.noMineAnalytics} />
                    ) : (
                      <AnalyticsPanels
                        text={text}
                        selectedRecord={selectedRecord}
                        trades={mineClosedTrades}
                        summary={mineSummary}
                        performance={minePerformance}
                        openHourDistribution={mineOpenHourDistribution}
                        openWeekdayDistribution={mineOpenWeekdayDistribution}
                        durationDistribution={mineDurationDistribution}
                        analyticsSourceLabel={text.copyHistory}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="reference" className="mt-6 space-y-6">
                    <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">{text.referenceHint}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <Link
                            to="/app/backtest/$platform/$traderId"
                            params={{
                              platform: selectedRecord.traderPlatform,
                              traderId: selectedRecord.traderId,
                            }}
                          />
                        }
                        nativeButton={false}
                      >
                        {t("performance.openBacktest")}
                      </Button>
                    </div>
                    {referenceClosedTrades.length === 0 ? (
                      <EmptyState message={text.noReferenceAnalytics} />
                    ) : (
                      <AnalyticsPanels
                        text={text}
                        selectedRecord={selectedRecord}
                        trades={referenceClosedTrades}
                        summary={referenceSummary}
                        performance={referencePerformance}
                        openHourDistribution={referenceOpenHourDistribution}
                        openWeekdayDistribution={referenceOpenWeekdayDistribution}
                        durationDistribution={referenceDurationDistribution}
                        analyticsSourceLabel={text.traderHistory}
                        showCopyMetrics={false}
                      />
                    )}
                  </TabsContent>

                  <TabsContent value="trades" className="mt-6 space-y-6">
                    <div className="rounded-2xl border bg-card p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold">{text.closedTradeDetails}</h3>
                        <div className="text-xs text-muted-foreground">
                          {text.closedTradeSummary(mineClosedTrades.length, bucket)}
                        </div>
                      </div>
                      <div className="mt-4">
                        <ClosedTradeTable trades={mineClosedTrades} />
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-sm font-semibold">{text.copyHistory}</h3>
                        <div className="text-xs text-muted-foreground">
                          {text.runtimeEntrySummary(filteredEntries.length)}
                        </div>
                      </div>
                      <div className="mt-4">
                        <StrategyOrderHistoryTable entries={filteredEntries} />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="config" className="mt-6 space-y-6">
                    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="rounded-2xl border bg-card p-6 shadow-sm">
                        <h3 className="text-sm font-semibold">{text.strategyConfiguration}</h3>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <Metric label={text.funds} value={selectedRecord.funds.toFixed(2)} />
                          <Metric
                            label={text.fixedFunds}
                            value={selectedRecord.fixedFunds.toFixed(2)}
                          />
                          <Metric
                            label={text.traceRatio}
                            value={selectedRecord.tracePerRatio.toFixed(3)}
                          />
                          <Metric
                            label={text.stopLossRate}
                            value={`${(selectedRecord.stopLossPositionValueRate * 100).toFixed(2)}%`}
                          />
                          <Metric
                            label={text.openRelations}
                            value={String(selectedRecord.openRelationsCount)}
                          />
                          <Metric
                            label={text.liveTraderPositions}
                            value={String(selectedRecord.traderPositions.length)}
                          />
                          <Metric
                            label={text.traderHistoryRows}
                            value={String(selectedRecord.traderHistoryPositions.length)}
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-card p-6 shadow-sm">
                        <h3 className="text-sm font-semibold">{text.liveTraderPositions}</h3>
                        <div className="mt-4">
                          <TraderPositionsTable positions={selectedRecord.traderPositions} />
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border bg-card p-8 shadow-sm">
              <EmptyState message={text.waitingForStrategyData} />
            </div>
          )}
        </section>
      </div>
    </TradingPageShell>
  );
}

function buildStrategyBoardRecords(
  accounts: TeacherRecord[],
  traders: TraderRecord[],
): StrategyBoardRecord[] {
  const traderMap = new Map(traders.map((trader) => [trader.id, trader]));

  return accounts.flatMap((account) =>
    account.traceTraderList.map((setting) => {
      const trader = traderMap.get(setting.id);
      const recentEntries = account.positionHistory
        .filter((entry) => entry.traderId === setting.id)
        .sort((a, b) => a.t - b.t);
      const openRelations = account.followRelations.filter(
        (relation) => relation.followTraderId === setting.id,
      );
      const traderHistoryPositions = trader?.historyPositions ?? [];

      return {
        key: `${account.id}:${setting.id}`,
        accountId: account.id,
        traderId: setting.id,
        accountName: account.name,
        accountPlatform: account.platform,
        traderName: trader?.name ?? setting.name,
        traderPlatform: trader?.platform ?? account.platform,
        strategyName: trader?.strategyName ?? setting.name,
        followStatus: setting.followStatus,
        traceOrderMode: setting.traceOrderMode,
        funds: setting.funds,
        fixedFunds: setting.fixedFunds,
        tracePerRatio: setting.tracePerRatio,
        stopLossUsdt: setting.stopLossUsdt,
        stopLossPositionValueRate: setting.stopLossPositionValueRate,
        unrealizedProfitSum: setting.unrealizedProfitSum,
        followProfit: setting.followProfit,
        openRelationsCount: openRelations.length,
        recentEntries,
        traderPositions: trader?.positions ?? [],
        traderHistoryPositions,
        analyticsSource: traderHistoryPositions.length > 0 ? "trader-history" : "teacher-history",
      };
    }),
  );
}

function filterTraderHistoryByBucket(
  historyPositions: NonNullable<TraderRecord["historyPositions"]>,
  bucket: HistoryBucket,
) {
  if (bucket === "all") {
    return historyPositions;
  }

  const now = Date.now();
  const windowMs = bucket === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  return historyPositions.filter((position) => {
    const effectiveTime = position.closeTime ?? position.openTime;
    return effectiveTime !== null && effectiveTime >= now - windowMs;
  });
}

function AnalyticsPanels(props: {
  text: ReturnType<typeof useStrategyBoardText>;
  selectedRecord: StrategyBoardRecord;
  trades: ReconstructedTrade[];
  summary: StrategyTradeSummary;
  performance: StrategyPerformancePoint[];
  openHourDistribution: Array<{ value: number; label: string }>;
  openWeekdayDistribution: Array<{ value: number; label: string }>;
  durationDistribution: Array<{ value: number; label: string }>;
  analyticsSourceLabel: string;
  showCopyMetrics?: boolean;
}) {
  const { t } = useI18n();
  const showCopyMetrics = props.showCopyMetrics ?? true;
  const formatUsd = (value: number) => `${value.toFixed(2)} U`;
  const formatCount = (value: number) => String(Math.round(value));
  const formatHours = (value: number) => `${value.toFixed(1)}h`;

  const cumulativeProfitPoints = toCumulativeProfitChartPoints(props.performance, props.trades);
  const cumulativeReturnPoints = toCumulativeReturnChartPoints(props.performance, props.trades);
  const perTradeProfitPoints = downsampleChartPoints(
    toPerTradeProfitChartPoints(props.performance, props.trades),
    72,
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label={props.text.closedTrades} value={String(props.summary.closedTrades)} />
        <Metric label={props.text.winRate} value={`${(props.summary.winRate * 100).toFixed(2)}%`} />
        <Metric label={props.text.realizedProfit} value={props.summary.realizedProfit.toFixed(2)} />
        <Metric
          label={props.text.profitRate}
          value={`${(props.summary.profitRate * 100).toFixed(2)}%`}
        />
        <Metric
          label={props.text.averageTradeProfit}
          value={props.summary.averageTradeProfit.toFixed(2)}
        />
        <Metric label={props.text.profitFactor} value={props.summary.profitFactorLabel} />
        <Metric label={props.text.maxDrawdown} value={props.summary.maxDrawdown.toFixed(2)} />
        <Metric label={props.text.averageDuration} value={props.summary.averageDurationLabel} />
        <Metric label={props.text.analyticsSource} value={props.analyticsSourceLabel} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.cumulativeRealizedProfit}</h3>
          <div className="mt-4">
            <BacktestLineChart
              points={cumulativeProfitPoints}
              color="hsl(142 71% 45%)"
              emptyMessage={props.text.noClosedFillsForRange}
              valueFormatter={formatUsd}
              valueLabel={t("performance.chart.cumulativeProfit")}
              hoverLabelMode="trade"
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.profitVsDrawdown}</h3>
          <div className="mt-4 grid gap-4">
            <StatRow
              label={props.text.largestGain}
              value={props.summary.largestGain.toFixed(2)}
              positive={props.summary.largestGain >= 0}
            />
            <StatRow
              label={props.text.largestLoss}
              value={props.summary.largestLoss.toFixed(2)}
              positive={props.summary.largestLoss >= 0}
            />
            <StatRow
              label={props.text.grossProfit}
              value={props.summary.grossProfit.toFixed(2)}
              positive
            />
            <StatRow
              label={props.text.grossLoss}
              value={props.summary.grossLoss.toFixed(2)}
              positive={false}
            />
            {showCopyMetrics ? (
              <>
                <StatRow
                  label={props.text.openUnrealized}
                  value={props.selectedRecord.unrealizedProfitSum.toFixed(2)}
                  positive={props.selectedRecord.unrealizedProfitSum >= 0}
                />
                <StatRow
                  label={props.text.configuredStopLoss}
                  value={props.selectedRecord.stopLossUsdt.toFixed(2)}
                  positive={false}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.cumulativeProfitRate}</h3>
          <div className="mt-4">
            <BacktestLineChart
              points={cumulativeReturnPoints}
              color="hsl(199 89% 48%)"
              emptyMessage={props.text.profitRateEmpty}
              valueLabel={t("performance.chart.cumulativeReturn")}
              asPercent
              hoverLabelMode="trade"
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.perTradeRealizedProfit}</h3>
          <div className="mt-4">
            <BacktestBarChart
              points={perTradeProfitPoints}
              emptyMessage={props.text.noPerTradeResults}
              valueFormatter={formatUsd}
              valueLabel={t("performance.chart.perTradeProfit")}
              hoverLabelMode="trade"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr_1fr]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.openHourDistribution}</h3>
          <div className="mt-4">
            <BacktestBarChart
              points={hourDistributionToChartPoints(props.openHourDistribution)}
              emptyMessage={props.text.openHourDistributionEmpty}
              valueFormatter={formatCount}
              valueLabel={t("performance.chart.openCount")}
              domainMode="positive"
              heightClassName="h-48"
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.openWeekdayDistribution}</h3>
          <div className="mt-4">
            <BacktestBarChart
              points={weekdayDistributionToChartPoints(props.openWeekdayDistribution)}
              emptyMessage={props.text.openWeekdayDistributionEmpty}
              valueFormatter={formatCount}
              valueLabel={t("performance.chart.openCount")}
              domainMode="positive"
              heightClassName="h-48"
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h3 className="text-sm font-semibold">{props.text.holdingDuration}</h3>
          <div className="mt-4">
            <BacktestBarChart
              points={durationDistributionToChartPoints(props.durationDistribution, props.trades)}
              emptyMessage={props.text.holdingDurationEmpty}
              valueFormatter={formatHours}
              valueLabel={t("performance.chart.holdingHours")}
              domainMode="positive"
              heightClassName="h-48"
              hoverLabelMode="trade"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function TraderPositionsTable(props: { positions: TraderRecord["positions"] }) {
  const text = useStrategyBoardText();

  if (props.positions.length === 0) {
    return <EmptyState message={text.noLiveTraderPositions} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.entry}</th>
            <th className="px-3 py-2">{text.amount}</th>
            <th className="px-3 py-2">{text.margin}</th>
            <th className="px-3 py-2">{text.pnl}</th>
            <th className="px-3 py-2">{text.opened}</th>
          </tr>
        </thead>
        <tbody>
          {props.positions.map((position) => (
            <tr key={position.id} className="border-b last:border-0">
              <td className="px-3 py-2">{position.symbol}</td>
              <td className="px-3 py-2">
                <Badge tone={position.positionSide === "long" ? "success" : "muted"}>
                  {formatPositionSide(position.positionSide, text)}
                </Badge>
              </td>
              <td className="px-3 py-2">{position.entryPrice.toFixed(2)}</td>
              <td className="px-3 py-2">{position.amount.toFixed(3)}</td>
              <td className="px-3 py-2">{(position.margin ?? 0).toFixed(2)}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    position.pnl != null && position.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
                  }
                >
                  {(position.pnl ?? 0).toFixed(2)}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {position.openTime ? new Date(position.openTime).toLocaleString() : text.na}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClosedTradeTable(props: { trades: ReconstructedTrade[] }) {
  const text = useStrategyBoardText();
  const rows = [...props.trades].reverse();

  if (rows.length === 0) {
    return <EmptyState message={text.noClosedTrades} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.open}</th>
            <th className="px-3 py-2">{text.close}</th>
            <th className="px-3 py-2">{text.duration}</th>
            <th className="px-3 py-2">{text.amount}</th>
            <th className="px-3 py-2">{text.entry}</th>
            <th className="px-3 py-2">{text.closePrice}</th>
            <th className="px-3 py-2">{text.profit}</th>
            <th className="px-3 py-2">{text.profitRate}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((trade, index) => (
            <tr
              key={`${trade.orderId}-${trade.closeTime}-${index}`}
              className="border-b last:border-0"
            >
              <td className="px-3 py-2">{trade.symbol}</td>
              <td className="px-3 py-2">
                <Badge tone={trade.side === "long" ? "success" : "muted"}>
                  {formatTradeSide(trade.side, text)}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(trade.openTime).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(trade.closeTime).toLocaleString()}
              </td>
              <td className="px-3 py-2">{formatDuration(trade.durationMs)}</td>
              <td className="px-3 py-2">{trade.amount.toFixed(3)}</td>
              <td className="px-3 py-2">{trade.openPrice.toFixed(2)}</td>
              <td className="px-3 py-2">{trade.closePrice.toFixed(2)}</td>
              <td className="px-3 py-2">
                <span className={trade.profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {trade.profit.toFixed(2)}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={trade.profitRate >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {(trade.profitRate * 100).toFixed(2)}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StrategyOrderHistoryTable(props: { entries: TeacherPositionHistoryEntry[] }) {
  const text = useStrategyBoardText();
  const rows = [...props.entries].reverse();

  if (rows.length === 0) {
    return <EmptyState message={text.noRuntimeHistory} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{text.time}</th>
            <th className="px-3 py-2">{text.action}</th>
            <th className="px-3 py-2">{text.order}</th>
            <th className="px-3 py-2">{text.symbol}</th>
            <th className="px-3 py-2">{text.side}</th>
            <th className="px-3 py-2">{text.worth}</th>
            <th className="px-3 py-2">{text.profit}</th>
            <th className="px-3 py-2">{text.result}</th>
            <th className="px-3 py-2">{text.reason}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, index) => {
            const worth = Math.abs(entry.amount * entry.price);
            const resultLabel =
              entry.success === 1 ? text.ok : entry.success === 0 ? text.partial : text.rejected;

            return (
              <tr
                key={`${entry.t}-${entry.orderId ?? "none"}-${index}`}
                className="border-b last:border-0"
              >
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(entry.t).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={entry.action === 0 ? "muted" : "success"}>
                    {entry.action === 0 ? text.close : text.open}
                  </Badge>
                </td>
                <td className="px-3 py-2">{entry.orderId ?? text.rejected}</td>
                <td className="px-3 py-2">{entry.symbol}</td>
                <td className="px-3 py-2">
                  <Badge tone={entry.side === "long" ? "success" : "muted"}>
                    {formatTradeSide(entry.side, text)}
                  </Badge>
                </td>
                <td className="px-3 py-2">{worth.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={entry.profit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {entry.profit.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Badge tone={entry.success === 1 ? "success" : "muted"}>{resultLabel}</Badge>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{entry.ps}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="text-xs tracking-wide text-muted-foreground uppercase">{props.label}</div>
      <div className="mt-2 text-xl font-semibold">{props.value}</div>
    </div>
  );
}

function Badge(props: { children: string; tone?: "success" | "muted" }) {
  const tone = props.tone ?? "muted";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === "success"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {props.children}
    </span>
  );
}

function EmptyState(props: { message: string }) {
  return (
    <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
      {props.message}
    </div>
  );
}

function StatRow(props: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border bg-background px-4 py-3 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      <span className={props.positive ? "text-emerald-600" : "text-rose-600"}>{props.value}</span>
    </div>
  );
}

function useStrategyBoardText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    strategySelector: isZh ? "跟单组合" : "Follow pairs",
    strategySelectorDescription: isZh
      ? "这里列出已配置跟单关系的交易账户与带单员组合。"
      : "Trading account and lead trader pairs configured for copy execution.",
    openRelationsLabel: (count: number) =>
      isZh ? `开仓关系：${count}` : `Open relations: ${count}`,
    trackedFillsLabel: (count: number) => (isZh ? `跟踪成交：${count}` : `Tracked fills: ${count}`),
    unrealizedLabel: (value: string) => (isZh ? `未实现：${value}` : `Unrealized: ${value}`),
    realizedLabel: (value: string) => (isZh ? `已实现：${value}` : `Realized: ${value}`),
    noStrategyRecords: isZh
      ? "暂时还没有跟单分析记录。请至少先配置一条交易账户与带单员的跟单关系。"
      : "No copy analytics records yet. Configure at least one account-to-lead-trader copy relationship first.",
    copyRelationship: (account: string, trader: string, mode: string) =>
      isZh
        ? `${account} 跟单 ${trader} · 模式 ${mode}`
        : `${account} copies ${trader} · mode ${mode}`,
    referenceHint: isZh
      ? "带单员参考基于带单员公开历史持仓重建，用于对比你的实际跟单表现。"
      : "Lead trader reference is rebuilt from public history positions for comparison with your copy results.",
    noMineAnalytics: isZh
      ? "所选时间范围内还没有跟单成交记录。切换到「交易明细」查看运行时历史，或等待跟单执行产生数据。"
      : "No copy fills in the selected range yet. Check Trades for runtime history, or wait for copy execution data.",
    noReferenceAnalytics: isZh
      ? "该带单员暂无可用历史持仓，无法生成参考分析。"
      : "No lead trader history is available to build reference analytics.",
    boardDescription: isZh
      ? "「我的表现」基于你的跟单成交；「带单员参考」基于带单员公开历史，便于对比复盘。"
      : "My performance uses your copy fills; Lead trader reference uses public history for side-by-side review.",
    closedTrades: isZh ? "已平仓交易" : "Closed trades",
    winRate: isZh ? "胜率" : "Win rate",
    realizedProfit: isZh ? "已实现收益" : "Realized profit",
    profitRate: isZh ? "收益率" : "Profit rate",
    averageTradeProfit: isZh ? "平均单笔收益" : "Avg trade profit",
    profitFactor: isZh ? "盈亏因子" : "Profit factor",
    maxDrawdown: isZh ? "最大回撤" : "Max drawdown",
    averageDuration: isZh ? "平均持仓时长" : "Avg duration",
    analyticsSource: isZh ? "分析来源" : "Analytics source",
    traderHistory: isZh ? "带单员历史" : "Lead trader history",
    copyHistory: isZh ? "跟单执行历史" : "Copy execution history",
    cumulativeRealizedProfit: isZh ? "累计已实现收益" : "Cumulative realized profit",
    noClosedFillsForRange: isZh
      ? "这个时间范围内还没有已平仓策略成交记录。"
      : "No closed strategy fills recorded yet for this range.",
    profitVsDrawdown: isZh ? "收益与回撤摘要" : "Profit vs drawdown summary",
    largestGain: isZh ? "最大盈利" : "Largest gain",
    largestLoss: isZh ? "最大亏损" : "Largest loss",
    grossProfit: isZh ? "总盈利" : "Gross profit",
    grossLoss: isZh ? "总亏损" : "Gross loss",
    openUnrealized: isZh ? "持仓未实现" : "Open unrealized",
    configuredStopLoss: isZh ? "配置止损" : "Configured stop loss",
    cumulativeProfitRate: isZh ? "累计收益率" : "Cumulative profit rate",
    profitRateEmpty: isZh
      ? "当策略产生已平仓成交后，这里会显示收益率曲线。"
      : "Profit rate will appear after the strategy records closed fills.",
    perTradeRealizedProfit: isZh ? "单笔已实现收益" : "Per-trade realized profit",
    noPerTradeResults: isZh
      ? "暂时还没有单笔交易结果可展示。"
      : "No per-trade results available yet.",
    openHourDistribution: isZh ? "开仓小时分布" : "Open hour distribution",
    openHourDistributionEmpty: isZh
      ? "出现已平仓交易后，这里会显示开仓小时分布。"
      : "Open hour distribution will appear after closed trades exist.",
    openWeekdayDistribution: isZh ? "开仓星期分布" : "Open weekday distribution",
    openWeekdayDistributionEmpty: isZh
      ? "出现已平仓交易后，这里会显示开仓星期分布。"
      : "Weekday distribution will appear after closed trades exist.",
    holdingDuration: isZh ? "持仓时长分布" : "Holding duration",
    holdingDurationEmpty: isZh
      ? "出现已平仓交易后，这里会显示持仓时长分布。"
      : "Holding durations will appear after closed trades exist.",
    strategyConfiguration: isZh ? "跟单配置" : "Follow config",
    funds: isZh ? "资金" : "Funds",
    fixedFunds: isZh ? "固定资金" : "Fixed funds",
    traceRatio: isZh ? "跟单比例" : "Trace ratio",
    stopLossRate: isZh ? "止损比例" : "Stop loss rate",
    openRelations: isZh ? "开仓关系数" : "Open relations",
    liveTraderPositions: isZh ? "带单员实时持仓" : "Live lead trader positions",
    traderHistoryRows: isZh ? "带单员历史条数" : "Lead trader history rows",
    closedTradeDetails: isZh ? "已平仓交易明细" : "Closed trade details",
    closedTradeSummary: (count: number, bucket: HistoryBucket) =>
      isZh ? `${bucket} 内重建出 ${count} 笔交易` : `${count} reconstructed trade(s) in ${bucket}`,
    runtimeTeacherHistory: isZh ? "跟单执行历史" : "Copy execution history",
    runtimeEntrySummary: (count: number) =>
      isZh ? `${count} 条运行时记录` : `${count} runtime entr${count === 1 ? "y" : "ies"}`,
    waitingForStrategyData: isZh
      ? "跟单表现正在等待数据。先添加带单员并配置交易账户跟单关系后，这个页面就会有内容。"
      : "Copy performance is waiting for data. Add lead traders and configure account copy relationships to populate this page.",
    na: isZh ? "暂无" : "n/a",
    noLiveTraderPositions: isZh
      ? "这个跟单组合当前没有带单员实时持仓。"
      : "No live lead trader positions are currently open for this copy pair.",
    symbol: isZh ? "交易对" : "Symbol",
    side: isZh ? "方向" : "Side",
    entry: isZh ? "开仓价" : "Entry",
    amount: isZh ? "数量" : "Amount",
    margin: isZh ? "保证金" : "Margin",
    pnl: isZh ? "盈亏" : "PnL",
    opened: isZh ? "开仓时间" : "Opened",
    noClosedTrades: isZh
      ? "所选时间范围内还没有可重建的已平仓交易。"
      : "No reconstructed closed trades are available for the selected time range.",
    open: isZh ? "开仓" : "Open",
    close: isZh ? "平仓" : "Close",
    duration: isZh ? "持仓时长" : "Duration",
    closePrice: isZh ? "平仓价" : "Close px",
    profit: isZh ? "收益" : "Profit",
    noRuntimeHistory: isZh
      ? "所选时间范围内还没有运行时跟单历史。"
      : "No runtime follow history is available for the selected time range.",
    time: isZh ? "时间" : "Time",
    action: isZh ? "动作" : "Action",
    order: isZh ? "订单" : "Order",
    worth: isZh ? "名义价值" : "Worth",
    result: isZh ? "结果" : "Result",
    reason: isZh ? "原因" : "Reason",
    ok: isZh ? "成功" : "ok",
    partial: isZh ? "部分成功" : "partial",
    rejected: isZh ? "拒绝" : "rejected",
    following: isZh ? "跟随中" : "following",
    unfollow: isZh ? "停止跟随" : "unfollow",
    ratio: isZh ? "按比例" : "ratio",
    fixed: isZh ? "固定金额" : "fixed",
    long: isZh ? "多" : "long",
    short: isZh ? "空" : "short",
  };
}

function formatFollowStatus(status: string, text: ReturnType<typeof useStrategyBoardText>) {
  if (status === "following") {
    return text.following;
  }

  if (status === "unfollow") {
    return text.unfollow;
  }

  return status;
}

function formatTraceOrderMode(mode: string, text: ReturnType<typeof useStrategyBoardText>) {
  if (mode === "ratio") {
    return text.ratio;
  }

  if (mode === "fixed") {
    return text.fixed;
  }

  return mode;
}

function formatPositionSide(
  side: TraderRecord["positions"][number]["positionSide"],
  text: ReturnType<typeof useStrategyBoardText>,
) {
  return side === "long" ? text.long : text.short;
}

function formatTradeSide(
  side: ReconstructedTrade["side"] | TeacherPositionHistoryEntry["side"],
  text: ReturnType<typeof useStrategyBoardText>,
) {
  return side === "long" ? text.long : text.short;
}
