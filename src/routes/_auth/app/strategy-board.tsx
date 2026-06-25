import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { useI18n } from "#/lib/i18n";
import { allTradersQueryOptions, teachersQueryOptions } from "#/lib/trading/queries";
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
} from "#/lib/trading/strategy-analytics";
import type { TeacherPositionHistoryEntry, TeacherRecord, TraderRecord } from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/strategy-board")({
  loader: async ({ context }) => {
    const [teachers, traders] = await Promise.all([
      context.queryClient.ensureQueryData(teachersQueryOptions()),
      context.queryClient.ensureQueryData(allTradersQueryOptions()),
    ]);

    return { teachers, traders };
  },
  component: StrategyBoardPage,
});

type StrategyBoardRecord = {
  key: string;
  teacherName: string;
  teacherPlatform: TeacherRecord["platform"];
  traderName: string;
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

function StrategyBoardPage() {
  const { teachers, traders } = Route.useLoaderData();
  const { t } = useI18n();
  const text = useStrategyBoardText();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bucket, setBucket] = useState<HistoryBucket>("30d");

  const records = useMemo(() => buildStrategyBoardRecords(teachers, traders), [teachers, traders]);

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

  const closedTrades = useMemo(() => {
    if (!selectedRecord) {
      return [];
    }

    if (selectedRecord.analyticsSource === "trader-history") {
      return buildReconstructedTradesFromTraderHistory(
        filterTraderHistoryByBucket(selectedRecord.traderHistoryPositions, bucket),
      );
    }

    return reconstructClosedTrades(filteredEntries);
  }, [bucket, filteredEntries, selectedRecord]);

  const performance = useMemo(
    () =>
      buildStrategyPerformanceSeries(
        closedTrades,
        selectedRecord
          ? selectedRecord.traceOrderMode === "fixed"
            ? selectedRecord.fixedFunds || selectedRecord.funds || 1
            : selectedRecord.funds || 1
          : 1,
      ),
    [closedTrades, selectedRecord],
  );

  const summary = useMemo(() => buildStrategyTradeSummary(closedTrades), [closedTrades]);

  const openHourDistribution = useMemo(
    () => buildOpenHourDistribution(closedTrades),
    [closedTrades],
  );

  const openWeekdayDistribution = useMemo(
    () => buildOpenWeekdayDistribution(closedTrades),
    [closedTrades],
  );

  const durationDistribution = useMemo(
    () => buildHoldingDurationDistribution(closedTrades),
    [closedTrades],
  );

  return (
    <TradingPageShell title={t("strategyBoard.title")} description={t("strategyBoard.description")}>
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
                    onClick={() => setSelectedKey(record.key)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{record.strategyName}</div>
                      <Badge>{record.teacherPlatform}</Badge>
                      <Badge tone={record.followStatus === "following" ? "success" : "muted"}>
                        {formatFollowStatus(record.followStatus, text)}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {record.teacherName} {"->"} {record.traderName}
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
                      <Badge>{selectedRecord.teacherPlatform}</Badge>
                      <Badge
                        tone={selectedRecord.followStatus === "following" ? "success" : "muted"}
                      >
                        {formatFollowStatus(selectedRecord.followStatus, text)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {text.teacherFollowsTrader(
                        selectedRecord.teacherName,
                        selectedRecord.traderName,
                        formatTraceOrderMode(selectedRecord.traceOrderMode, text),
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{text.boardDescription}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
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

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label={text.closedTrades} value={String(summary.closedTrades)} />
                  <Metric label={text.winRate} value={`${(summary.winRate * 100).toFixed(2)}%`} />
                  <Metric label={text.realizedProfit} value={summary.realizedProfit.toFixed(2)} />
                  <Metric
                    label={text.profitRate}
                    value={`${(summary.profitRate * 100).toFixed(2)}%`}
                  />
                  <Metric
                    label={text.averageTradeProfit}
                    value={summary.averageTradeProfit.toFixed(2)}
                  />
                  <Metric label={text.profitFactor} value={summary.profitFactorLabel} />
                  <Metric label={text.maxDrawdown} value={summary.maxDrawdown.toFixed(2)} />
                  <Metric label={text.averageDuration} value={summary.averageDurationLabel} />
                  <Metric
                    label={text.analyticsSource}
                    value={
                      selectedRecord.analyticsSource === "trader-history"
                        ? text.traderHistory
                        : text.teacherHistory
                    }
                  />
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.cumulativeRealizedProfit}</h3>
                  <div className="mt-4">
                    <LineChartPanel
                      points={performance.map((point) => ({
                        value: point.cumulativeProfit,
                        label: point.label,
                      }))}
                      colorClassName="text-emerald-500"
                      emptyMessage={text.noClosedFillsForRange}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.profitVsDrawdown}</h3>
                  <div className="mt-4 grid gap-4">
                    <StatRow
                      label={text.largestGain}
                      value={summary.largestGain.toFixed(2)}
                      positive={summary.largestGain >= 0}
                    />
                    <StatRow
                      label={text.largestLoss}
                      value={summary.largestLoss.toFixed(2)}
                      positive={summary.largestLoss >= 0}
                    />
                    <StatRow
                      label={text.grossProfit}
                      value={summary.grossProfit.toFixed(2)}
                      positive
                    />
                    <StatRow
                      label={text.grossLoss}
                      value={summary.grossLoss.toFixed(2)}
                      positive={false}
                    />
                    <StatRow
                      label={text.openUnrealized}
                      value={selectedRecord.unrealizedProfitSum.toFixed(2)}
                      positive={selectedRecord.unrealizedProfitSum >= 0}
                    />
                    <StatRow
                      label={text.configuredStopLoss}
                      value={selectedRecord.stopLossUsdt.toFixed(2)}
                      positive={false}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.cumulativeProfitRate}</h3>
                  <div className="mt-4">
                    <LineChartPanel
                      points={performance.map((point) => ({
                        value: point.cumulativeProfitRate,
                        label: point.label,
                      }))}
                      colorClassName="text-sky-500"
                      asPercent
                      emptyMessage={text.profitRateEmpty}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.perTradeRealizedProfit}</h3>
                  <div className="mt-4">
                    <BarChartPanel
                      points={performance.map((point) => ({
                        value: point.tradeProfit,
                        label: point.label,
                      }))}
                      emptyMessage={text.noPerTradeResults}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr_1fr_1fr]">
                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.openHourDistribution}</h3>
                  <div className="mt-4">
                    <BarChartPanel
                      points={openHourDistribution}
                      emptyMessage={text.openHourDistributionEmpty}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.openWeekdayDistribution}</h3>
                  <div className="mt-4">
                    <BarChartPanel
                      points={openWeekdayDistribution}
                      emptyMessage={text.openWeekdayDistributionEmpty}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.holdingDuration}</h3>
                  <div className="mt-4">
                    <BarChartPanel
                      points={durationDistribution}
                      emptyMessage={text.holdingDurationEmpty}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border bg-card p-6 shadow-sm">
                  <h3 className="text-sm font-semibold">{text.strategyConfiguration}</h3>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Metric label={text.funds} value={selectedRecord.funds.toFixed(2)} />
                    <Metric label={text.fixedFunds} value={selectedRecord.fixedFunds.toFixed(2)} />
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

              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold">{text.closedTradeDetails}</h3>
                  <div className="text-xs text-muted-foreground">
                    {text.closedTradeSummary(closedTrades.length, bucket)}
                  </div>
                </div>
                <div className="mt-4">
                  <ClosedTradeTable trades={closedTrades} />
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold">{text.runtimeTeacherHistory}</h3>
                  <div className="text-xs text-muted-foreground">
                    {text.runtimeEntrySummary(filteredEntries.length)}
                  </div>
                </div>
                <div className="mt-4">
                  <StrategyOrderHistoryTable entries={filteredEntries} />
                </div>
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
  teachers: TeacherRecord[],
  traders: TraderRecord[],
): StrategyBoardRecord[] {
  const traderMap = new Map(traders.map((trader) => [trader.id, trader]));

  return teachers.flatMap((teacher) =>
    teacher.traceTraderList.map((setting) => {
      const trader = traderMap.get(setting.id);
      const recentEntries = teacher.positionHistory
        .filter((entry) => entry.traderId === setting.id)
        .sort((a, b) => a.t - b.t);
      const openRelations = teacher.followRelations.filter(
        (relation) => relation.followTraderId === setting.id,
      );
      const traderHistoryPositions = trader?.historyPositions ?? [];

      return {
        key: `${teacher.id}:${setting.id}`,
        teacherName: teacher.name,
        teacherPlatform: teacher.platform,
        traderName: trader?.name ?? setting.name,
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

function LineChartPanel(props: {
  points: Array<{ value: number; label: string }>;
  colorClassName: string;
  emptyMessage: string;
  asPercent?: boolean;
}) {
  const text = useStrategyBoardText();
  const path = buildLineChartPoints(props.points.map((point) => point.value));

  if (props.points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
        {props.emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="h-56 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            points={path}
            className={props.colorClassName}
          />
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{props.points[0]?.label ?? text.na}</span>
        <span>{formatMetricValue(props.points.at(-1)?.value ?? 0, props.asPercent)}</span>
      </div>
    </div>
  );
}

function BarChartPanel(props: {
  points: Array<{ value: number; label: string }>;
  emptyMessage: string;
}) {
  const text = useStrategyBoardText();

  if (props.points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
        {props.emptyMessage}
      </div>
    );
  }

  const values = props.points.map((point) => point.value);
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);

  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="flex h-56 items-end gap-2 overflow-hidden">
        {props.points.map((point, index) => {
          const height = Math.max((Math.abs(point.value) / maxAbs) * 100, 4);
          return (
            <div
              key={`${point.label}-${index}`}
              className="flex min-w-0 flex-1 flex-col justify-end gap-2"
            >
              <div
                className={`rounded-t-md ${point.value >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                style={{ height: `${height}%` }}
                title={`${point.label}: ${point.value.toFixed(2)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{props.points[0]?.label ?? text.na}</span>
        <span>{props.points.at(-1)?.label ?? text.na}</span>
      </div>
    </div>
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

function buildLineChartPoints(values: number[]) {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function formatMetricValue(value: number, asPercent = false) {
  return asPercent ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
}

function useStrategyBoardText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    strategySelector: isZh ? "策略选择器" : "Strategy selector",
    strategySelectorDescription: isZh
      ? "当前已经配置到跟单执行链路里的交易员与交易员组合。"
      : "Trader and trader combinations currently configured for follow execution.",
    openRelationsLabel: (count: number) =>
      isZh ? `开仓关系：${count}` : `Open relations: ${count}`,
    trackedFillsLabel: (count: number) => (isZh ? `跟踪成交：${count}` : `Tracked fills: ${count}`),
    unrealizedLabel: (value: string) => (isZh ? `未实现：${value}` : `Unrealized: ${value}`),
    realizedLabel: (value: string) => (isZh ? `已实现：${value}` : `Realized: ${value}`),
    noStrategyRecords: isZh
      ? "暂时还没有策略记录。请至少先配置一条交易员与 trace trader 的关系。"
      : "No strategy records available yet. Configure at least one trader trace-trader relationship first.",
    teacherFollowsTrader: (teacher: string, trader: string, mode: string) =>
      isZh
        ? `交易员 ${teacher} 跟随交易员 ${trader} · 模式 ${mode}`
        : `Trader ${teacher} follows trader ${trader} · mode ${mode}`,
    boardDescription: isZh
      ? "这个内部看板会优先使用持久化的交易员历史；如果没有历史数据，则回退到运行时交易员跟单历史，从而在不依赖旧 Streamlit iframe 的前提下展示策略分析。"
      : "This internal board now prefers persisted trader history when available and falls back to runtime trader follow history otherwise, so we can surface trader-centric analytics without the old external Streamlit iframe.",
    closedTrades: isZh ? "已平仓交易" : "Closed trades",
    winRate: isZh ? "胜率" : "Win rate",
    realizedProfit: isZh ? "已实现收益" : "Realized profit",
    profitRate: isZh ? "收益率" : "Profit rate",
    averageTradeProfit: isZh ? "平均单笔收益" : "Avg trade profit",
    profitFactor: isZh ? "盈亏因子" : "Profit factor",
    maxDrawdown: isZh ? "最大回撤" : "Max drawdown",
    averageDuration: isZh ? "平均持仓时长" : "Avg duration",
    analyticsSource: isZh ? "分析来源" : "Analytics source",
    traderHistory: isZh ? "交易员历史" : "trader history",
    teacherHistory: isZh ? "交易员历史" : "trader history",
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
    strategyConfiguration: isZh ? "策略配置" : "Strategy configuration",
    funds: isZh ? "资金" : "Funds",
    fixedFunds: isZh ? "固定资金" : "Fixed funds",
    traceRatio: isZh ? "跟单比例" : "Trace ratio",
    stopLossRate: isZh ? "止损比例" : "Stop loss rate",
    openRelations: isZh ? "开仓关系数" : "Open relations",
    liveTraderPositions: isZh ? "交易员实时持仓" : "Live trader positions",
    traderHistoryRows: isZh ? "交易员历史条数" : "Trader history rows",
    closedTradeDetails: isZh ? "已平仓交易明细" : "Closed trade details",
    closedTradeSummary: (count: number, bucket: HistoryBucket) =>
      isZh ? `${bucket} 内重建出 ${count} 笔交易` : `${count} reconstructed trade(s) in ${bucket}`,
    runtimeTeacherHistory: isZh ? "运行时交易员历史" : "Runtime trader history",
    runtimeEntrySummary: (count: number) =>
      isZh ? `${count} 条运行时记录` : `${count} runtime entr${count === 1 ? "y" : "ies"}`,
    waitingForStrategyData: isZh
      ? "策略看板正在等待策略数据。先添加交易员并绑定到交易员后，这个页面就会有内容。"
      : "Strategy board is waiting for strategy data. Add traders and bind them to a trader to populate this page.",
    na: isZh ? "暂无" : "n/a",
    noLiveTraderPositions: isZh
      ? "这个策略当前没有交易员实时持仓。"
      : "No live trader positions are currently open for this strategy.",
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
