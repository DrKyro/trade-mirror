import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

import { TradingPageShell } from "#/components/trading/page-shell";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { useI18n } from "#/lib/i18n";
import {
  buildTraderBacktestAnalytics,
  formatDurationLabel,
} from "#/lib/trading/backtest-analytics";
import {
  $fetchTraderDeepAnalysis,
  $listTraderBacktests,
  $runTraderBacktest,
} from "#/lib/trading/discover-repository";
import type { TraderDeepAnalysis } from "#/lib/trading/trader-rank-types";
import type {
  TraderBacktestMode,
  TraderBacktestRunRecord,
  TraderBacktestWindow,
  TraderPlatform,
} from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/backtest/$platform/$traderId")({
  component: TraderBacktestPage,
});

const BACKTEST_MODE_OPTIONS: Array<{ value: TraderBacktestMode; labelKey: string }> = [
  { value: "fixed", labelKey: "discover.backtestModeFixed" },
  { value: "compound", labelKey: "discover.backtestModeCompound" },
];

const BACKTEST_WINDOW_OPTIONS: Array<{ value: TraderBacktestWindow; labelKey: string }> = [
  { value: "30d", labelKey: "discover.backtestWindow30d" },
  { value: "90d", labelKey: "discover.backtestWindow90d" },
  { value: "all", labelKey: "discover.backtestWindowAll" },
];

const PLATFORMS: { value: TraderPlatform; label: string }[] = [
  { value: "okx", label: "OKX" },
  { value: "bitget", label: "Bitget" },
  { value: "binanceFutures", label: "Binance Futures" },
  { value: "bybit", label: "Bybit" },
];

function TraderBacktestPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const params = Route.useParams();
  const platform = params.platform as TraderPlatform;
  const traderId = params.traderId;
  const [mode, setMode] = useState<TraderBacktestMode>("fixed");
  const [window, setWindow] = useState<TraderBacktestWindow>("90d");
  const [initialBalanceInput, setInitialBalanceInput] = useState("1000");
  const [latestBacktest, setLatestBacktest] = useState<TraderBacktestRunRecord | null>(null);

  const analysisQuery = useQuery({
    queryKey: ["discover", "deep", platform, traderId, window],
    queryFn: ({ signal }) =>
      $fetchTraderDeepAnalysis({
        signal,
        data: { platform, traderId, window },
      }),
  });

  const backtestsQuery = useQuery({
    queryKey: ["discover", "backtests", platform, traderId],
    queryFn: ({ signal }) =>
      $listTraderBacktests({
        signal,
        data: { platform, traderId, limit: 12 },
      }),
  });

  const runBacktestMutation = useMutation({
    mutationFn: async () => {
      const data = analysisQuery.data;
      if (!data) {
        throw new Error("Deep analysis is not ready");
      }

      return $runTraderBacktest({
        data: {
          platform,
          traderId,
          uniqueName: data.uniqueName,
          nickName: data.nickName,
          mode,
          window,
          initialBalance: Number(initialBalanceInput),
        },
      });
    },
    onSuccess: async (run) => {
      setLatestBacktest(run);
      toast.success(t("discover.backtestSaved"));
      await queryClient.invalidateQueries({
        queryKey: ["discover", "backtests", platform, traderId],
      });
    },
    onError: () => {
      toast.error(t("discover.backtestFailed"));
    },
  });

  const data = analysisQuery.data ?? null;
  const savedRuns = backtestsQuery.data ?? [];
  const currentBacktest = latestBacktest ?? savedRuns[0] ?? null;
  const initialBalance = Number(initialBalanceInput);
  const canRunBacktest =
    data !== null &&
    data.historyPositions.length > 0 &&
    Number.isFinite(initialBalance) &&
    initialBalance > 0;

  const pageTitle = data?.nickName
    ? `${data.nickName} · ${t("discover.backtestTitle")}`
    : t("discover.backtestTitle");
  const pageDescription = data
    ? `${platformLabel(platform)} · @${data.uniqueName}`
    : `${platformLabel(platform)} · ${traderId}`;

  return (
    <TradingPageShell
      title={pageTitle}
      description={pageDescription}
      actions={
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/app/discover" />}
          nativeButton={false}
        >
          {t("discover.backToDiscover")}
        </Button>
      }
    >
      {analysisQuery.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : analysisQuery.isError || !data ? (
        <div className="rounded-lg border border-destructive/50 p-8 text-center text-destructive">
          {t("discover.error")}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.5fr]">
          <div className="space-y-6">
            <TraderOverviewCard data={data} />
            <SummaryStats data={data} />
            <HistoryPreview data={data} />
          </div>

          <BacktestWorkspace
            platform={platform}
            data={data}
            mode={mode}
            window={window}
            initialBalanceInput={initialBalanceInput}
            savedRuns={savedRuns}
            currentBacktest={currentBacktest}
            isRunning={runBacktestMutation.isPending}
            canRun={canRunBacktest}
            onModeChange={setMode}
            onWindowChange={setWindow}
            onInitialBalanceChange={setInitialBalanceInput}
            onRun={() => runBacktestMutation.mutate()}
            onSelectRun={setLatestBacktest}
          />
        </div>
      )}
    </TradingPageShell>
  );
}

function TraderOverviewCard({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {data.avatar ? (
          <img
            src={data.avatar}
            alt={data.nickName}
            className="size-14 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {data.nickName.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold">{data.nickName}</div>
          <div className="text-sm text-muted-foreground">
            {platformLabel(data.platform)} · @{data.uniqueName}
          </div>
          {data.sign ? <p className="mt-2 text-sm text-muted-foreground">{data.sign}</p> : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          render={<a href={data.link} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
        >
          <ExternalLinkIcon className="size-4" />
          <span className="sr-only">{t("discover.viewOnExchange")}</span>
        </Button>
      </div>
    </div>
  );
}

function BacktestWorkspace(props: {
  platform: TraderPlatform;
  data: TraderDeepAnalysis;
  mode: TraderBacktestMode;
  window: TraderBacktestWindow;
  initialBalanceInput: string;
  savedRuns: TraderBacktestRunRecord[];
  currentBacktest: TraderBacktestRunRecord | null;
  isRunning: boolean;
  canRun: boolean;
  onModeChange: (value: TraderBacktestMode) => void;
  onWindowChange: (value: TraderBacktestWindow) => void;
  onInitialBalanceChange: (value: string) => void;
  onRun: () => void;
  onSelectRun: (run: TraderBacktestRunRecord) => void;
}) {
  const { t } = useI18n();
  const text = useBacktestText();
  const analytics = useMemo(
    () => (props.currentBacktest ? buildTraderBacktestAnalytics(props.currentBacktest) : null),
    [props.currentBacktest],
  );
  const hourDistribution = analytics
    ? analytics.openHourCounts.map((value, hour) => ({
        label: hour.toString().padStart(2, "0"),
        value,
      }))
    : [];
  const weekdayDistribution = analytics
    ? analytics.openWeekdayCounts.map((value, index) => ({
        label: text.weekdayLabels[index] ?? `${index + 1}`,
        value,
      }))
    : [];

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("discover.backtestTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("discover.backtestDescription")}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("discover.backtestHistoryRows", { count: props.data.historyPositions.length })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("discover.backtestMode")}
          </span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={props.mode}
            onChange={(event) => props.onModeChange(event.target.value as TraderBacktestMode)}
          >
            {BACKTEST_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("discover.backtestWindow")}
          </span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={props.window}
            onChange={(event) => props.onWindowChange(event.target.value as TraderBacktestWindow)}
          >
            {BACKTEST_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("discover.backtestInitialBalance")}
          </span>
          <Input
            className="h-9"
            inputMode="decimal"
            value={props.initialBalanceInput}
            onChange={(event) => props.onInitialBalanceChange(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={!props.canRun || props.isRunning}
            onClick={props.onRun}
          >
            {props.isRunning ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {t("discover.backtesting")}
              </>
            ) : (
              t("discover.startBacktest")
            )}
          </Button>
        </div>
      </div>

      {!props.canRun ? (
        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          {props.data.historyPositions.length === 0
            ? t("discover.noHistoryForBacktest")
            : t("discover.invalidBacktestInput")}
        </div>
      ) : null}

      {props.savedRuns.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.savedRuns.map((run) => (
            <Button
              key={run.id}
              size="sm"
              variant={props.currentBacktest?.id === run.id ? "default" : "outline"}
              onClick={() => props.onSelectRun(run)}
            >
              {formatSavedRunLabel(run, t)}
            </Button>
          ))}
        </div>
      ) : null}

      {props.currentBacktest && analytics ? (
        <>
          <div className="rounded-xl border bg-background p-4">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <RunMetaChip
                label={text.runCreatedAt}
                value={formatLocalDateTime(props.currentBacktest.createdAt)}
              />
              <RunMetaChip
                label={t("discover.backtestMode")}
                value={backtestModeLabel(props.currentBacktest.mode, t)}
              />
              <RunMetaChip
                label={t("discover.backtestWindow")}
                value={backtestWindowLabel(props.currentBacktest.window, t)}
              />
              <RunMetaChip
                label={t("discover.backtestInitialBalance")}
                value={formatUsdDetailed(props.currentBacktest.initialBalance)}
              />
              <RunMetaChip
                label={text.tradeCount}
                value={String(props.currentBacktest.trades.length)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard
              label={t("discover.backtestFinalEquity")}
              value={formatUsd(props.currentBacktest.summary.finalEquity)}
              highlight
            />
            <StatCard
              label={t("discover.backtestReturn")}
              value={formatPercent(props.currentBacktest.summary.totalReturn)}
            />
            <StatCard
              label={t("discover.backtestProfit")}
              value={formatUsd(props.currentBacktest.summary.realizedProfit)}
            />
            <StatCard
              label={t("discover.backtestMaxDrawdown")}
              value={formatUsd(props.currentBacktest.summary.maxDrawdown)}
            />
            <StatCard
              label={t("discover.backtestMaxDrawdownRate")}
              value={formatPercent(props.currentBacktest.summary.maxDrawdownRate)}
            />
            <StatCard
              label={t("discover.winRate")}
              value={formatPercent(props.currentBacktest.summary.winRate)}
            />
            <StatCard
              label={text.averageTradeProfit}
              value={formatUsd(analytics.averageTradeProfit)}
            />
            <StatCard
              label={text.averageTradeReturn}
              value={formatPercent(analytics.averageTradeReturn)}
            />
            <StatCard
              label={text.averageHoldingDuration}
              value={formatDurationLabel(analytics.averageHoldingDurationMs)}
            />
            <StatCard
              label={text.averageNotional}
              value={formatUsd(analytics.averageNotionalUsd)}
            />
            <StatCard label={text.totalNotional} value={formatUsd(analytics.totalNotionalUsd)} />
            <StatCard
              label={text.grossProfit}
              value={formatUsd(props.currentBacktest.summary.grossProfit)}
            />
            <StatCard
              label={text.grossLoss}
              value={formatUsd(props.currentBacktest.summary.grossLoss)}
            />
            <StatCard
              label={text.largestGain}
              value={formatUsd(props.currentBacktest.summary.largestGain)}
            />
            <StatCard
              label={text.largestLoss}
              value={formatUsd(props.currentBacktest.summary.largestLoss)}
            />
            <StatCard
              label={text.profitFactor}
              value={props.currentBacktest.summary.profitFactorLabel}
            />
            <StatCard label={text.profitableTrades} value={String(analytics.profitableTrades)} />
            <StatCard label={text.losingTrades} value={String(analytics.losingTrades)} />
            <StatCard
              label={text.averageDrawdownRate}
              value={formatPercent(analytics.averageDrawdownRate)}
            />
            <StatCard
              label={text.closedTrades}
              value={String(props.currentBacktest.summary.closedTrades)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title={t("discover.backtestEquityCurve")}
              subtitle={text.chartCloseTimeSubtitle}
            >
              <LineChartPanel
                points={analytics.equitySeries}
                colorClassName="text-primary"
                emptyMessage={text.noData}
                valueFormatter={formatUsdDetailed}
              />
            </ChartCard>

            <ChartCard title={text.cumulativeProfit} subtitle={text.chartCloseTimeSubtitle}>
              <LineChartPanel
                points={analytics.cumulativeProfitSeries}
                colorClassName="text-emerald-500"
                emptyMessage={text.noData}
                valueFormatter={formatUsdDetailed}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title={text.cumulativeReturn} subtitle={text.chartCloseTimeSubtitle}>
              <LineChartPanel
                points={analytics.cumulativeReturnSeries}
                colorClassName="text-sky-500"
                emptyMessage={text.noData}
                asPercent
              />
            </ChartCard>

            <ChartCard title={text.perTradeProfit} subtitle={text.chartTradeOrderSubtitle}>
              <StickChartPanel
                points={analytics.tradeProfitSeries}
                emptyMessage={text.noData}
                valueFormatter={formatUsdDetailed}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title={text.profitVsDrawdown} subtitle={text.profitVsDrawdownSubtitle}>
              <ComparisonDotChartPanel
                points={analytics.profitVsDrawdownSeries}
                primaryLabel={text.tradeProfitShort}
                secondaryLabel={text.drawdownShort}
                primaryColorClassName="text-emerald-500"
                secondaryColorClassName="text-rose-500"
                emptyMessage={text.noData}
                valueFormatter={formatUsdDetailed}
              />
            </ChartCard>

            <ChartCard
              title={text.returnVsDrawdownRate}
              subtitle={text.returnVsDrawdownRateSubtitle}
            >
              <ComparisonDotChartPanel
                points={analytics.returnVsDrawdownRateSeries}
                primaryLabel={text.tradeReturnShort}
                secondaryLabel={text.drawdownRateShort}
                primaryColorClassName="text-sky-500"
                secondaryColorClassName="text-rose-500"
                emptyMessage={text.noData}
                valueFormatter={(value) => formatPercent(value)}
              />
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1.2fr]">
            <ChartCard title={text.openHourDistribution}>
              <StickChartPanel
                points={hourDistribution}
                emptyMessage={text.noData}
                valueFormatter={formatCount}
                domainMode="positive"
              />
            </ChartCard>

            <ChartCard title={text.openWeekdayDistribution}>
              <StickChartPanel
                points={weekdayDistribution}
                emptyMessage={text.noData}
                valueFormatter={formatCount}
                domainMode="positive"
              />
            </ChartCard>

            <ChartCard title={text.openDayDistribution}>
              <StickChartPanel
                points={analytics.openDayDistribution}
                emptyMessage={text.noData}
                valueFormatter={formatCount}
                domainMode="positive"
              />
            </ChartCard>
          </div>

          <ChartCard title={text.notionalPerTrade} subtitle={text.chartTradeOrderSubtitle}>
            <StickChartPanel
              points={analytics.tradeNotionalSeries}
              emptyMessage={text.noData}
              valueFormatter={formatUsdDetailed}
              domainMode="positive"
            />
          </ChartCard>

          <BacktestTradesSection platform={props.platform} analytics={analytics} />
        </>
      ) : null}
    </div>
  );
}

function SummaryStats({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label={t("discover.yieldRatio")} value={formatPercent(data.yieldRatio)} highlight />
      <StatCard label={t("discover.pnl")} value={formatUsd(data.pnl)} />
      <StatCard label={t("discover.aum")} value={formatUsd(data.aum)} />
      <StatCard label={t("discover.followers")} value={data.followers?.toString() ?? "—"} />
      <StatCard label={t("discover.maxDrawdown")} value={formatPercent(data.maxDrawdown)} />
      <StatCard label={t("discover.winRate")} value={formatPercent(data.winRate)} />
      <StatCard label={t("discover.balance")} value={formatUsd(data.balance)} />
      <StatCard
        label={t("discover.monthlyAvg")}
        value={formatUsd(data.monthlyAveragePositionValue)}
      />
    </div>
  );
}

function HistoryPreview({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();
  const text = useBacktestText();
  const recent = useMemo(() => data.historyPositions.slice(0, 20), [data.historyPositions]);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">
          {t("discover.historyPositions")} ({data.historyPositions.length})
        </h3>
      </div>

      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("discover.noHistory")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pr-2 pb-2 font-medium">Symbol</th>
                <th className="pr-2 pb-2 font-medium">Side</th>
                <th className="pr-2 pb-2 font-medium">{text.openTime}</th>
                <th className="pr-2 pb-2 font-medium">{text.closeTime}</th>
                <th className="pr-2 pb-2 font-medium">{text.holdingDuration}</th>
                <th className="pr-2 pb-2 font-medium">{text.leverage}</th>
                <th className="pr-2 pb-2 font-medium">{text.amount}</th>
                <th className="pr-2 pb-2 font-medium">{t("discover.entryPrice")}</th>
                <th className="pr-2 pb-2 font-medium">{t("discover.closePrice")}</th>
                <th className="pr-2 pb-2 font-medium">{text.notional}</th>
                <th className="pr-2 pb-2 font-medium">{t("discover.pnl")}</th>
                <th className="pr-2 pb-2 font-medium">{text.tradeReturn}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((position) => (
                <tr key={position.id} className="border-b last:border-0">
                  <td className="py-2 pr-2 font-medium">{position.symbol}</td>
                  <td
                    className={`py-2 pr-2 ${position.side === "short" ? "text-red-500" : "text-green-500"}`}
                  >
                    {position.side}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">
                    {formatMaybeDateTime(position.openTime)}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap text-muted-foreground">
                    {formatMaybeDateTime(position.closeTime)}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {formatMaybeDuration(position.openTime, position.closeTime)}
                  </td>
                  <td className="py-2 pr-2">{position.leverage.toFixed(1)}x</td>
                  <td className="py-2 pr-2">{formatCompactNumber(position.amount, 3)}</td>
                  <td className="py-2 pr-2">{position.entryPrice.toFixed(4)}</td>
                  <td className="py-2 pr-2">{position.closePrice.toFixed(4)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    {formatUsdDetailed(Math.abs(position.amount * position.entryPrice))}
                  </td>
                  <td
                    className={`py-2 pr-2 whitespace-nowrap ${(position.profit ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {position.profit !== null ? formatUsdDetailed(position.profit) : "—"}
                  </td>
                  <td
                    className={`py-2 pr-2 whitespace-nowrap ${(position.profitRate ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {position.profitRate !== null ? formatPercent(position.profitRate) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BacktestTradesSection({
  platform,
  analytics,
}: {
  platform: TraderPlatform;
  analytics: ReturnType<typeof buildTraderBacktestAnalytics>;
}) {
  const { t } = useI18n();
  const text = useBacktestText();
  const rows = [...analytics.trades].reverse().slice(0, 80);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("discover.backtestTradeDetails")}</h3>
        <span className="text-xs text-muted-foreground">
          {platformLabel(platform)} · {rows.length}/{analytics.trades.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1320px] text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">Symbol</th>
              <th className="px-2 py-2 font-medium">Side</th>
              <th className="px-2 py-2 font-medium">{text.openTime}</th>
              <th className="px-2 py-2 font-medium">{text.closeTime}</th>
              <th className="px-2 py-2 font-medium">{text.holdingDuration}</th>
              <th className="px-2 py-2 font-medium">{text.leverage}</th>
              <th className="px-2 py-2 font-medium">{text.amount}</th>
              <th className="px-2 py-2 font-medium">{t("discover.entryPrice")}</th>
              <th className="px-2 py-2 font-medium">{t("discover.closePrice")}</th>
              <th className="px-2 py-2 font-medium">{text.notional}</th>
              <th className="px-2 py-2 font-medium">{text.sourceProfit}</th>
              <th className="px-2 py-2 font-medium">{text.backtestProfit}</th>
              <th className="px-2 py-2 font-medium">{text.tradeReturn}</th>
              <th className="px-2 py-2 font-medium">{t("discover.backtestEquity")}</th>
              <th className="px-2 py-2 font-medium">{text.drawdownAmount}</th>
              <th className="px-2 py-2 font-medium">{t("discover.backtestMaxDrawdownRate")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trade) => (
              <tr key={`${trade.id}-${trade.closeTime}`} className="border-b last:border-0">
                <td className="px-2 py-2 font-medium">{trade.symbol}</td>
                <td
                  className={`px-2 py-2 ${trade.side === "short" ? "text-red-500" : "text-green-500"}`}
                >
                  {trade.side}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                  {formatLocalDateTime(trade.openTime)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">
                  {formatLocalDateTime(trade.closeTime)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatDurationLabel(trade.holdingDurationMs)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{trade.leverage.toFixed(1)}x</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatCompactNumber(trade.amount, 3)}
                </td>
                <td className="px-2 py-2">{trade.entryPrice.toFixed(4)}</td>
                <td className="px-2 py-2">{trade.closePrice.toFixed(4)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatUsdDetailed(trade.notionalUsd)}
                </td>
                <td
                  className={`px-2 py-2 whitespace-nowrap ${trade.sourceProfit >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {formatUsdDetailed(trade.sourceProfit)}
                </td>
                <td
                  className={`px-2 py-2 whitespace-nowrap ${trade.simulatedProfit >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {formatUsdDetailed(trade.simulatedProfit)}
                </td>
                <td
                  className={`px-2 py-2 whitespace-nowrap ${trade.sourceProfitRate >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {formatPercent(trade.sourceProfitRate)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formatUsdDetailed(trade.equityAfter)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-red-500">
                  {formatUsdDetailed(trade.drawdown)}
                </td>
                <td className="px-2 py-2 whitespace-nowrap text-red-500">
                  {formatPercent(trade.drawdownRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartCard(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.subtitle ? (
          <p className="mt-1 text-xs text-muted-foreground">{props.subtitle}</p>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function LineChartPanel(props: {
  points: Array<{ value: number; label: string }>;
  colorClassName: string;
  emptyMessage: string;
  asPercent?: boolean;
  valueFormatter?: (value: number) => string;
}) {
  const text = useBacktestText();
  const path = buildLineChartPoints(props.points.map((point) => point.value));

  if (props.points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
        {props.emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="h-56 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <line
            x1="0"
            x2="100"
            y1="100"
            y2="100"
            className="stroke-border"
            strokeWidth="0.8"
            opacity="0.6"
          />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            points={path}
            className={props.colorClassName}
          />
          {buildLineChartDots(props.points.map((point) => point.value)).map((dot, index) => (
            <circle
              key={`${props.points[index]?.label ?? index}-dot`}
              cx={dot.x}
              cy={dot.y}
              r="1.1"
              className={props.colorClassName}
              fill="currentColor"
            >
              <title>
                {props.points[index]?.label}:{" "}
                {props.valueFormatter
                  ? props.valueFormatter(props.points[index]?.value ?? 0)
                  : formatMetricValue(props.points[index]?.value ?? 0, props.asPercent)}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{props.points[0]?.label ?? text.na}</span>
        <span>
          {props.valueFormatter
            ? props.valueFormatter(props.points.at(-1)?.value ?? 0)
            : formatMetricValue(props.points.at(-1)?.value ?? 0, props.asPercent)}
        </span>
      </div>
    </div>
  );
}

function StickChartPanel(props: {
  points: Array<{ value: number; label: string }>;
  emptyMessage: string;
  valueFormatter?: (value: number) => string;
  domainMode?: "centered" | "positive";
}) {
  const text = useBacktestText();

  if (props.points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
        {props.emptyMessage}
      </div>
    );
  }

  const values = props.points.map((point) => point.value);
  const domainMode = props.domainMode ?? "centered";
  const min = domainMode === "positive" ? 0 : Math.min(...values, 0);
  const max = Math.max(...values, domainMode === "positive" ? 1 : 0);
  const range = max - min || 1;
  const baselineValue = domainMode === "positive" ? 0 : 0;
  const baselineY = clampSvgY(100 - ((baselineValue - min) / range) * 100);

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="h-56 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <line
            x1="0"
            x2="100"
            y1={baselineY}
            y2={baselineY}
            className="stroke-border"
            strokeWidth="0.8"
            opacity="0.7"
          />
          {props.points.map((point, index) => {
            const x = props.points.length === 1 ? 50 : (index / (props.points.length - 1)) * 100;
            const y = clampSvgY(100 - ((point.value - min) / range) * 100);
            const colorClassName =
              point.value >= baselineValue || domainMode === "positive"
                ? "text-emerald-500"
                : "text-rose-500";
            return (
              <g key={`${point.label}-${index}`} className={colorClassName}>
                <line
                  x1={x}
                  x2={x}
                  y1={baselineY}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="1.1"
                  opacity="0.9"
                />
                <circle cx={x} cy={y} r="1.25" fill="currentColor">
                  <title>
                    {point.label}: {props.valueFormatter?.(point.value) ?? point.value.toFixed(2)}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{props.points[0]?.label ?? text.na}</span>
        <span>{props.points.at(-1)?.label ?? text.na}</span>
      </div>
    </div>
  );
}

function ComparisonDotChartPanel(props: {
  points: Array<{ label: string; primary: number; secondary: number }>;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColorClassName: string;
  secondaryColorClassName: string;
  emptyMessage: string;
  valueFormatter?: (value: number) => string;
}) {
  if (props.points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
        {props.emptyMessage}
      </div>
    );
  }

  const values = props.points.flatMap((point) => [point.primary, point.secondary, 0]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const zeroY = 100 - ((0 - min) / range) * 100;
  const primaryPoints = buildLineChartPointsFromValues(
    props.points.map((point) => point.primary),
    min,
    range,
  );
  const secondaryPoints = buildLineChartPointsFromValues(
    props.points.map((point) => point.secondary),
    min,
    range,
  );

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="h-56 w-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
          <line x1="0" x2="100" y1={zeroY} y2={zeroY} className="stroke-border" strokeWidth="0.8" />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.05"
            points={primaryPoints}
            className={props.primaryColorClassName}
          />
          <polyline
            fill="none"
            stroke="currentColor"
            strokeWidth="1.05"
            points={secondaryPoints}
            className={props.secondaryColorClassName}
          />
          {props.points.map((point, index) => {
            const x = props.points.length === 1 ? 50 : (index / (props.points.length - 1)) * 100;
            const primaryY = 100 - ((point.primary - min) / range) * 100;
            const secondaryY = 100 - ((point.secondary - min) / range) * 100;
            return (
              <g key={`${point.label}-${index}`}>
                <circle
                  cx={x}
                  cy={primaryY}
                  r="1.15"
                  className={props.primaryColorClassName}
                  fill="currentColor"
                >
                  <title>
                    {props.primaryLabel}:{" "}
                    {props.valueFormatter?.(point.primary) ?? point.primary.toFixed(2)}
                  </title>
                </circle>
                <circle
                  cx={x}
                  cy={secondaryY}
                  r="1.15"
                  className={props.secondaryColorClassName}
                  fill="currentColor"
                >
                  <title>
                    {props.secondaryLabel}:{" "}
                    {props.valueFormatter?.(point.secondary) ?? point.secondary.toFixed(2)}
                  </title>
                </circle>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <LegendDot colorClassName={props.primaryColorClassName} label={props.primaryLabel} />
        <LegendDot colorClassName={props.secondaryColorClassName} label={props.secondaryLabel} />
      </div>
    </div>
  );
}

function LegendDot(props: { colorClassName: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2 rounded-full ${props.colorClassName.replace("text-", "bg-")}`} />
      {props.label}
    </span>
  );
}

function RunMetaChip(props: { label: string; value: string }) {
  return (
    <span className="rounded-full border px-2.5 py-1">
      <span className="text-foreground">{props.label}</span>
      <span className="mx-1">:</span>
      <span>{props.value}</span>
    </span>
  );
}

function StatCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className={`mt-1 text-sm font-medium ${props.highlight ? "text-primary" : ""}`}>
        {props.value}
      </div>
    </div>
  );
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatUsdDetailed(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCount(value: number) {
  return `${value}`;
}

function formatLocalDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatMaybeDateTime(timestamp: number | null | undefined) {
  return typeof timestamp === "number" ? formatLocalDateTime(timestamp) : "—";
}

function formatMaybeDuration(
  openTime: number | null | undefined,
  closeTime: number | null | undefined,
) {
  if (typeof openTime !== "number" || typeof closeTime !== "number") {
    return "—";
  }
  return formatDurationLabel(Math.max(closeTime - openTime, 0));
}

function formatCompactNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatSavedRunLabel(run: TraderBacktestRunRecord, t: ReturnType<typeof useI18n>["t"]) {
  return `${new Date(run.createdAt).toLocaleString()} · ${backtestModeLabel(run.mode, t)} · ${backtestWindowLabel(run.window, t)}`;
}

function backtestModeLabel(mode: TraderBacktestMode, t: ReturnType<typeof useI18n>["t"]) {
  const option = BACKTEST_MODE_OPTIONS.find((item) => item.value === mode);
  return option ? t(option.labelKey) : mode;
}

function backtestWindowLabel(window: TraderBacktestWindow, t: ReturnType<typeof useI18n>["t"]) {
  const option = BACKTEST_WINDOW_OPTIONS.find((item) => item.value === window);
  return option ? t(option.labelKey) : window;
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

function buildLineChartDots(values: number[]) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = clampSvgY(100 - ((value - min) / range) * 100);
    return { x, y };
  });
}

function buildLineChartPointsFromValues(values: number[], min: number, range: number) {
  if (values.length === 0) {
    return "";
  }

  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

function clampSvgY(value: number) {
  return Math.max(1, Math.min(99, value));
}

function formatMetricValue(value: number, asPercent = false) {
  return asPercent ? `${(value * 100).toFixed(2)}%` : value.toFixed(2);
}

function platformLabel(platform: TraderPlatform) {
  return PLATFORMS.find((item) => item.value === platform)?.label ?? platform;
}

function useBacktestText() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  return {
    na: isZh ? "暂无" : "N/A",
    noData: isZh
      ? "当前回测记录还没有足够的数据可展示。"
      : "This backtest record does not have enough data yet.",
    runCreatedAt: isZh ? "生成时间" : "Created at",
    tradeCount: isZh ? "成交笔数" : "Trades",
    averageTradeProfit: isZh ? "平均单笔收益" : "Avg trade profit",
    averageTradeReturn: isZh ? "平均单笔收益率" : "Avg trade return",
    averageHoldingDuration: isZh ? "平均持仓时长" : "Avg holding time",
    averageNotional: isZh ? "平均名义仓位" : "Avg notional",
    totalNotional: isZh ? "累计名义仓位" : "Total notional",
    grossProfit: isZh ? "总盈利" : "Gross profit",
    grossLoss: isZh ? "总亏损" : "Gross loss",
    largestGain: isZh ? "最大单笔盈利" : "Largest gain",
    largestLoss: isZh ? "最大单笔亏损" : "Largest loss",
    profitFactor: isZh ? "盈亏因子" : "Profit factor",
    profitableTrades: isZh ? "盈利笔数" : "Winning trades",
    losingTrades: isZh ? "亏损笔数" : "Losing trades",
    averageDrawdownRate: isZh ? "平均回撤率" : "Avg drawdown rate",
    closedTrades: isZh ? "已平仓笔数" : "Closed trades",
    cumulativeProfit: isZh ? "累计收益曲线" : "Cumulative profit",
    cumulativeReturn: isZh ? "累计收益率曲线" : "Cumulative return",
    perTradeProfit: isZh ? "逐单收益分布" : "Per-trade profit",
    profitVsDrawdown: isZh ? "逐单收益 vs 回撤金额" : "Profit vs drawdown amount",
    returnVsDrawdownRate: isZh ? "逐单收益率 vs 回撤率" : "Return vs drawdown rate",
    openHourDistribution: isZh ? "开仓时间 24 小时分布" : "Open hour distribution",
    openWeekdayDistribution: isZh ? "开仓星期分布" : "Open weekday distribution",
    openDayDistribution: isZh ? "开仓日期分布" : "Open date distribution",
    notionalPerTrade: isZh ? "逐单名义仓位" : "Per-trade notional",
    chartCloseTimeSubtitle: isZh ? "按平仓时间累计" : "Accumulated by close time",
    chartTradeOrderSubtitle: isZh ? "按成交顺序查看" : "Ordered by trade sequence",
    profitVsDrawdownSubtitle: isZh
      ? "绿色是逐单收益，红色是当前权益相对峰值的回撤金额"
      : "Green shows per-trade profit and red shows drawdown from the running equity peak.",
    returnVsDrawdownRateSubtitle: isZh
      ? "蓝色是逐单收益率，红色是当前权益相对峰值的回撤率"
      : "Blue shows per-trade return and red shows drawdown rate from the running equity peak.",
    tradeProfitShort: isZh ? "收益" : "Profit",
    drawdownShort: isZh ? "回撤" : "Drawdown",
    tradeReturnShort: isZh ? "收益率" : "Return",
    drawdownRateShort: isZh ? "回撤率" : "Drawdown rate",
    openTime: isZh ? "开仓时间" : "Open time",
    closeTime: isZh ? "平仓时间" : "Close time",
    holdingDuration: isZh ? "持仓时长" : "Holding time",
    notional: isZh ? "名义仓位" : "Notional",
    sourceProfit: isZh ? "原始收益" : "Source profit",
    backtestProfit: isZh ? "回测收益" : "Backtest profit",
    tradeReturn: isZh ? "回测收益率" : "Backtest return",
    drawdownAmount: isZh ? "回撤金额" : "Drawdown amount",
    leverage: isZh ? "杠杆" : "Leverage",
    amount: isZh ? "数量" : "Amount",
    weekdayLabels: isZh
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  };
}
