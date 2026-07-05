import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  BacktestBarChart,
  BacktestLineChart,
  downsampleChartPoints,
} from "#/components/trading/backtest-charts";
import { DiscoverFavoriteButton } from "#/components/trading/discover-favorite-button";
import { TradingPageShell } from "#/components/trading/page-shell";
import { useDiscoverDeepAnalysis } from "#/components/trading/use-discover-deep-analysis";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { useI18n, type AppLocale } from "#/lib/i18n";
import {
  buildTraderBacktestAnalytics,
  formatDurationLabel,
} from "#/lib/trading/backtest-analytics";
import {
  formatBacktestCompactDateTime,
  formatBacktestDateWithWeekday,
  formatBacktestTimeOnly,
} from "#/lib/trading/backtest-time-format";
import {
  formatBacktestWindowRangeLabel,
  summarizeBacktestWindow,
  type BacktestWindowPreview,
} from "#/lib/trading/discover-backtests";
import { isDiscoverFavorite } from "#/lib/trading/discover-favorites";
import {
  $listDiscoverFavorites,
  $listTraderBacktests,
  $runTraderBacktest,
} from "#/lib/trading/discover-repository";
import type {
  TraderDeepAnalysis,
  TraderDeepAnalysisResponse,
} from "#/lib/trading/trader-rank-types";
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
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const params = Route.useParams();
  const platform = params.platform as TraderPlatform;
  const traderId = params.traderId;
  const [mode, setMode] = useState<TraderBacktestMode>("fixed");
  const [window, setWindow] = useState<TraderBacktestWindow>("90d");
  const [initialBalanceInput, setInitialBalanceInput] = useState("1000");
  const [latestBacktest, setLatestBacktest] = useState<TraderBacktestRunRecord | null>(null);
  const [runProgress, setRunProgress] = useState<number | null>(null);
  const [runProgressLabel, setRunProgressLabel] = useState("");
  const runProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runProgressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { query: analysisQuery, isRefreshing } = useDiscoverDeepAnalysis(platform, traderId, true);

  const backtestsQuery = useQuery({
    queryKey: ["discover", "backtests", platform, traderId],
    queryFn: ({ signal }) =>
      $listTraderBacktests({
        signal,
        data: { platform, traderId, limit: 12 },
      }),
  });

  const favoritesQuery = useQuery({
    queryKey: ["discover", "favorites"],
    queryFn: ({ signal }) => $listDiscoverFavorites({ signal }),
  });

  const clearRunProgressTimers = () => {
    if (runProgressTimerRef.current) {
      clearInterval(runProgressTimerRef.current);
      runProgressTimerRef.current = null;
    }
    if (runProgressResetTimerRef.current) {
      clearTimeout(runProgressResetTimerRef.current);
      runProgressResetTimerRef.current = null;
    }
  };

  useEffect(() => () => clearRunProgressTimers(), []);

  const runBacktestMutation = useMutation({
    mutationFn: async () => {
      const response = analysisQuery.data;
      if (!response || response.status !== "ready") {
        throw new Error("Deep analysis is not ready");
      }

      return $runTraderBacktest({
        data: {
          platform,
          traderId,
          uniqueName: response.analysis.uniqueName,
          nickName: response.analysis.nickName,
          mode,
          window,
          initialBalance: parseInitialBalance(initialBalanceInput),
          historyPositions: response.analysis.historyPositions,
        },
      });
    },
    onMutate: () => {
      clearRunProgressTimers();
      setRunProgress(8);
      setRunProgressLabel(t("discover.backtestProgressPrepare"));
      toast.loading(t("discover.backtestProgressPrepare"), { id: "backtest-run" });

      runProgressTimerRef.current = setInterval(() => {
        setRunProgress((current) => {
          if (current === null || current >= 92) return current;

          const next = Math.min(current + 4 + Math.random() * 5, 92);
          if (next >= 72) {
            setRunProgressLabel(t("discover.backtestProgressSave"));
          } else if (next >= 38) {
            setRunProgressLabel(t("discover.backtestProgressCompute"));
          }
          return next;
        });
      }, 350);
    },
    onSuccess: async (run) => {
      clearRunProgressTimers();
      setRunProgress(100);
      setRunProgressLabel(t("discover.backtestProgressDone"));
      setLatestBacktest(run);
      toast.success(t("discover.backtestSaved"), { id: "backtest-run" });
      await queryClient.invalidateQueries({
        queryKey: ["discover", "backtests", platform, traderId],
      });
      runProgressResetTimerRef.current = setTimeout(() => {
        setRunProgress(null);
        setRunProgressLabel("");
      }, 900);
    },
    onError: (error) => {
      clearRunProgressTimers();
      setRunProgress(null);
      setRunProgressLabel("");
      const message = error instanceof Error ? error.message : t("discover.backtestFailed");
      toast.error(message, { id: "backtest-run" });
    },
  });

  const analysisResponse: TraderDeepAnalysisResponse | null = analysisQuery.data ?? null;
  const data = analysisResponse?.status === "ready" ? analysisResponse.analysis : null;
  const dataCachedAt = analysisResponse?.status === "ready" ? analysisResponse.crawledAt : null;
  const savedRuns = backtestsQuery.data ?? [];
  const currentBacktest = latestBacktest ?? savedRuns[0] ?? null;
  const initialBalance = parseInitialBalance(initialBalanceInput);
  const windowPreview = useMemo(
    () => (data ? summarizeBacktestWindow(data.historyPositions, window) : null),
    [data, window],
  );
  const tradeablePositionCount = windowPreview?.tradeableCount ?? 0;
  const canRunBacktest =
    data !== null &&
    tradeablePositionCount > 0 &&
    Number.isFinite(initialBalance) &&
    initialBalance > 0;
  const isAnalysisLoading = (analysisQuery.isPending && analysisResponse === null) || isRefreshing;
  const isAnalysisPending = analysisResponse?.status === "pending" && !isRefreshing;

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
      {isAnalysisLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : analysisQuery.isError ? (
        <div className="rounded-lg border border-destructive/50 p-8 text-center text-destructive">
          {t("discover.error")}
        </div>
      ) : isAnalysisPending || !data ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p>{t("discover.deepDataPending")}</p>
          <p className="mt-2 text-sm">{t("discover.deepDataPendingHint")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {dataCachedAt ? (
              <p>
                {t("discover.dataCachedAt", {
                  time: formatBacktestCompactDateTime(dataCachedAt, locale),
                })}
              </p>
            ) : null}
            <p className={dataCachedAt ? "mt-1" : undefined}>{t("discover.deepDataScopeNote")}</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <TraderOverviewCard
              data={data}
              favorites={favoritesQuery.data ?? []}
              dataCachedAt={dataCachedAt}
              locale={locale}
            />
            <SummaryStats data={data} />
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
            windowPreview={windowPreview}
            tradeablePositionCount={tradeablePositionCount}
            runProgress={runProgress}
            runProgressLabel={runProgressLabel}
            onModeChange={setMode}
            onWindowChange={setWindow}
            onInitialBalanceChange={setInitialBalanceInput}
            onRun={() => {
              if (!canRunBacktest || runBacktestMutation.isPending) return;
              runBacktestMutation.mutate();
            }}
            onSelectRun={setLatestBacktest}
          />

          <HistoryPreview data={data} />
        </div>
      )}
    </TradingPageShell>
  );
}

function TraderOverviewCard({
  data,
  favorites,
  dataCachedAt,
  locale,
}: {
  data: TraderDeepAnalysis;
  favorites: Array<{ platform: TraderPlatform; traderId: string }>;
  dataCachedAt: number | null;
  locale: "zh-CN" | "en";
}) {
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
          {dataCachedAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("discover.dataCachedAt", {
                time: formatBacktestCompactDateTime(dataCachedAt, locale),
              })}
            </p>
          ) : null}
        </div>
        <DiscoverFavoriteButton
          trader={{
            platform: data.platform,
            traderId: data.traderId,
            uniqueName: data.uniqueName,
            nickName: data.nickName,
            avatar: data.avatar,
            link: data.link,
          }}
          favorited={isDiscoverFavorite(favorites, data.platform, data.traderId)}
          size="sm"
        />
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
  windowPreview: BacktestWindowPreview | null;
  tradeablePositionCount: number;
  runProgress: number | null;
  runProgressLabel: string;
  onModeChange: (value: TraderBacktestMode) => void;
  onWindowChange: (value: TraderBacktestWindow) => void;
  onInitialBalanceChange: (value: string) => void;
  onRun: () => void;
  onSelectRun: (run: TraderBacktestRunRecord) => void;
}) {
  const { t, locale } = useI18n();
  const text = useBacktestText();
  const analytics = useMemo(
    () => (props.currentBacktest ? buildTraderBacktestAnalytics(props.currentBacktest) : null),
    [props.currentBacktest],
  );
  const hourDistribution = analytics
    ? analytics.openHourCounts.map((value, hour) => {
        const hourLabel = hour.toString().padStart(2, "0");
        return {
          label: `${hourLabel}:00`,
          value,
          category: text.openHourRangeLabel(hourLabel),
        };
      })
    : [];
  const weekdayDistribution = analytics
    ? analytics.openWeekdayCounts.map((value, index) => ({
        label: text.weekdayLabels[index] ?? `${index + 1}`,
        value,
        category: text.openWeekdayLabel(text.weekdayLabels[index] ?? `${index + 1}`),
      }))
    : [];
  const windowRangeLabel = props.windowPreview
    ? formatBacktestWindowRangeLabel(props.windowPreview, locale)
    : null;
  const windowPreviewLabel =
    props.windowPreview && props.windowPreview.tradeableCount > 0 && windowRangeLabel
      ? t("discover.backtestWindowPreview", {
          range: windowRangeLabel,
          count: props.windowPreview.tradeableCount,
        })
      : t("discover.backtestWindowPreviewEmpty");
  const windowMismatch =
    props.currentBacktest !== null && props.currentBacktest.window !== props.window;

  return (
    <div className="min-w-0 space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("discover.backtestTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("discover.backtestDescription")}</p>
        </div>
        <div className="max-w-sm text-right text-xs text-muted-foreground">
          {windowPreviewLabel}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("discover.backtestMode")}
          </span>
          <select
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            value={props.mode}
            disabled={props.isRunning}
            onChange={(event) => props.onModeChange(event.target.value as TraderBacktestMode)}
          >
            {BACKTEST_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("discover.backtestWindow")}
          </span>
          <select
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            value={props.window}
            disabled={props.isRunning}
            onChange={(event) => props.onWindowChange(event.target.value as TraderBacktestWindow)}
          >
            {BACKTEST_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("discover.backtestInitialBalance")}
          </span>
          <Input
            className="h-9 rounded-lg shadow-sm"
            inputMode="decimal"
            value={props.initialBalanceInput}
            disabled={props.isRunning}
            onChange={(event) => props.onInitialBalanceChange(event.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button
            type="button"
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

      {props.mode === "compound" && props.window !== "all" ? (
        <p className="text-xs text-muted-foreground">{t("discover.backtestCompoundWindowNote")}</p>
      ) : null}

      {windowMismatch ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t("discover.backtestWindowStale", {
            runWindow: backtestWindowLabel(props.currentBacktest!.window, t),
            selectedWindow: backtestWindowLabel(props.window, t),
          })}
        </div>
      ) : null}

      {props.runProgress !== null ? (
        <BacktestRunProgress progress={props.runProgress} label={props.runProgressLabel} />
      ) : null}

      {!props.canRun ? (
        <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          {props.tradeablePositionCount === 0
            ? t("discover.noHistoryForBacktest")
            : t("discover.invalidBacktestInput")}
        </div>
      ) : null}

      {props.savedRuns.length > 0 ? (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {props.savedRuns.map((run) => (
              <Button
                key={run.id}
                size="sm"
                variant={props.currentBacktest?.id === run.id ? "default" : "outline"}
                className="rounded-full"
                onClick={() => props.onSelectRun(run)}
              >
                {formatSavedRunLabel(run, locale, t)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {props.currentBacktest && analytics ? (
        <BacktestResultsPanel
          platform={props.platform}
          backtest={props.currentBacktest}
          analytics={analytics}
          hourDistribution={hourDistribution}
          weekdayDistribution={weekdayDistribution}
          text={text}
          t={t}
        />
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
  const { t, locale } = useI18n();
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
                  <td className="py-2 pr-2 text-muted-foreground">
                    <BacktestDateTimeCell timestamp={position.openTime} locale={locale} />
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    <BacktestDateTimeCell timestamp={position.closeTime} locale={locale} />
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
  const { t, locale } = useI18n();
  const text = useBacktestText();
  const rows = [...analytics.trades].reverse().slice(0, 80);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <BacktestSectionHeader title={t("discover.backtestTradeDetails")} />
        <span className="text-xs text-muted-foreground">
          {platformLabel(platform)} · {rows.length}/{analytics.trades.length}
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card/40">
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
                <td className="px-2 py-2 text-muted-foreground">
                  <BacktestDateTimeCell timestamp={trade.openTime} locale={locale} />
                </td>
                <td className="px-2 py-2 text-muted-foreground">
                  <BacktestDateTimeCell timestamp={trade.closeTime} locale={locale} />
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

function BacktestResultsPanel(props: {
  platform: TraderPlatform;
  backtest: TraderBacktestRunRecord;
  analytics: ReturnType<typeof buildTraderBacktestAnalytics>;
  hourDistribution: Array<{ label: string; value: number; category?: string }>;
  weekdayDistribution: Array<{ label: string; value: number; category?: string }>;
  text: ReturnType<typeof useBacktestText>;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { locale } = useI18n();
  const { backtest, analytics, text, t } = props;
  const sampledTradeProfits = downsampleChartPoints(analytics.tradeProfitSeries, 72);
  const sampledNotional = downsampleChartPoints(analytics.tradeNotionalSeries, 72);

  return (
    <div className="space-y-8 border-t pt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{text.resultsOverview}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatBacktestCompactDateTime(backtest.createdAt, locale)} ·{" "}
            {backtestModeLabel(backtest.mode, t)} · {backtestWindowLabel(backtest.window, t)} ·{" "}
            {text.tradeCount} {backtest.trades.length}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {t("discover.backtestInitialBalance")}: {formatUsdDetailed(backtest.initialBalance)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeroStatCard
          label={t("discover.backtestFinalEquity")}
          value={formatUsdDetailed(backtest.summary.finalEquity)}
          tone="primary"
        />
        <HeroStatCard
          label={t("discover.backtestReturn")}
          value={formatPercent(backtest.summary.totalReturn)}
          tone={backtest.summary.totalReturn >= 0 ? "positive" : "negative"}
        />
        <HeroStatCard
          label={t("discover.backtestProfit")}
          value={formatUsdDetailed(backtest.summary.realizedProfit)}
          tone={backtest.summary.realizedProfit >= 0 ? "positive" : "negative"}
        />
        <HeroStatCard
          label={t("discover.backtestMaxDrawdownRate")}
          value={formatPercent(backtest.summary.maxDrawdownRate)}
          tone="negative"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricGroup
          title={text.performanceGroup}
          items={[
            { label: t("discover.winRate"), value: formatPercent(backtest.summary.winRate) },
            { label: text.profitFactor, value: backtest.summary.profitFactorLabel },
            {
              label: text.grossProfit,
              value: formatUsd(backtest.summary.grossProfit),
              tone: "positive",
            },
            {
              label: text.grossLoss,
              value: formatUsd(backtest.summary.grossLoss),
              tone: "negative",
            },
            {
              label: text.largestGain,
              value: formatUsd(backtest.summary.largestGain),
              tone: "positive",
            },
            {
              label: text.largestLoss,
              value: formatUsd(backtest.summary.largestLoss),
              tone: "negative",
            },
          ]}
        />
        <MetricGroup
          title={text.riskGroup}
          items={[
            {
              label: t("discover.backtestMaxDrawdown"),
              value: formatUsdDetailed(backtest.summary.maxDrawdown),
              tone: "negative",
            },
            {
              label: text.averageDrawdownRate,
              value: formatPercent(analytics.averageDrawdownRate),
              tone: "negative",
            },
            {
              label: text.averageTradeReturn,
              value: formatPercent(analytics.averageTradeReturn),
            },
            {
              label: text.averageHoldingDuration,
              value: formatDurationLabel(analytics.averageHoldingDurationMs),
            },
          ]}
        />
        <MetricGroup
          title={text.tradeGroup}
          items={[
            { label: text.closedTrades, value: String(backtest.summary.closedTrades) },
            {
              label: text.profitableTrades,
              value: String(analytics.profitableTrades),
              tone: "positive",
            },
            { label: text.losingTrades, value: String(analytics.losingTrades), tone: "negative" },
            { label: text.averageTradeProfit, value: formatUsd(analytics.averageTradeProfit) },
            { label: text.averageNotional, value: formatUsd(analytics.averageNotionalUsd) },
            { label: text.totalNotional, value: formatUsd(analytics.totalNotionalUsd) },
          ]}
        />
      </div>

      <BacktestSectionHeader title={text.curveGroup} />
      <ChartCard title={t("discover.backtestEquityCurve")} subtitle={text.chartCloseTimeSubtitle}>
        <BacktestLineChart
          points={analytics.equitySeries}
          color="var(--primary)"
          emptyMessage={text.noData}
          valueFormatter={formatUsdDetailed}
          valueLabel={t("discover.backtestEquity")}
          heightClassName="h-72"
          tradeSequenceLabel={text.tradeSequenceLabel}
        />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={text.cumulativeProfit} subtitle={text.chartCloseTimeSubtitle}>
          <BacktestLineChart
            points={analytics.cumulativeProfitSeries}
            color="hsl(142 71% 45%)"
            emptyMessage={text.noData}
            valueFormatter={formatUsdDetailed}
            valueLabel={text.cumulativeProfit}
            tradeSequenceLabel={text.tradeSequenceLabel}
          />
        </ChartCard>
        <ChartCard title={text.cumulativeReturn} subtitle={text.chartCloseTimeSubtitle}>
          <BacktestLineChart
            points={analytics.cumulativeReturnSeries}
            color="hsl(199 89% 48%)"
            emptyMessage={text.noData}
            valueLabel={text.cumulativeReturn}
            asPercent
            tradeSequenceLabel={text.tradeSequenceLabel}
          />
        </ChartCard>
      </div>

      <BacktestSectionHeader
        title={text.distributionGroup}
        subtitle={analytics.tradeProfitSeries.length > 72 ? text.sampledChartNote : undefined}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={text.perTradeProfit} subtitle={text.chartTradeOrderSubtitle}>
          <BacktestBarChart
            points={sampledTradeProfits}
            emptyMessage={text.noData}
            valueFormatter={formatUsdDetailed}
            valueLabel={text.backtestProfit}
            hoverLabelMode="trade"
            tradeSequenceLabel={text.tradeSequenceLabel}
          />
        </ChartCard>
        <ChartCard title={text.notionalPerTrade} subtitle={text.chartTradeOrderSubtitle}>
          <BacktestBarChart
            points={sampledNotional}
            emptyMessage={text.noData}
            valueFormatter={formatUsdDetailed}
            valueLabel={text.notional}
            domainMode="positive"
            hoverLabelMode="trade"
            tradeSequenceLabel={text.tradeSequenceLabel}
          />
        </ChartCard>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ChartCard title={text.openHourDistribution}>
          <BacktestBarChart
            points={props.hourDistribution}
            emptyMessage={text.noData}
            valueFormatter={formatCount}
            valueLabel={text.openCountLabel}
            domainMode="positive"
            heightClassName="h-48"
          />
        </ChartCard>
        <ChartCard title={text.openWeekdayDistribution}>
          <BacktestBarChart
            points={props.weekdayDistribution}
            emptyMessage={text.noData}
            valueFormatter={formatCount}
            valueLabel={text.openCountLabel}
            domainMode="positive"
            heightClassName="h-48"
          />
        </ChartCard>
        <ChartCard title={text.openDayDistribution}>
          <BacktestBarChart
            points={analytics.openDayDistribution}
            emptyMessage={text.noData}
            valueFormatter={formatCount}
            valueLabel={text.openCountLabel}
            domainMode="positive"
            heightClassName="h-48"
            hoverLabelMode="time"
            showTimeRange
            tradeSequenceLabel={text.tradeSequenceLabel}
          />
        </ChartCard>
      </div>

      <BacktestTradesSection platform={props.platform} analytics={analytics} />
    </div>
  );
}

function BacktestSectionHeader(props: { title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold tracking-wide text-foreground">{props.title}</h3>
      {props.subtitle ? <p className="text-xs text-muted-foreground">{props.subtitle}</p> : null}
    </div>
  );
}

function HeroStatCard(props: {
  label: string;
  value: string;
  tone?: "primary" | "positive" | "negative";
}) {
  const toneClassName =
    props.tone === "positive"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : props.tone === "negative"
        ? "border-rose-500/20 bg-rose-500/5"
        : "border-primary/20 bg-primary/5";
  const valueClassName =
    props.tone === "positive"
      ? "text-emerald-500"
      : props.tone === "negative"
        ? "text-rose-500"
        : "text-foreground";

  return (
    <div className={`rounded-2xl border p-4 ${toneClassName}`}>
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className={`mt-2 truncate text-2xl font-semibold tracking-tight ${valueClassName}`}>
        {props.value}
      </div>
    </div>
  );
}

function MetricGroup(props: {
  title: string;
  items: Array<{ label: string; value: string; tone?: "positive" | "negative" }>;
}) {
  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <h4 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {props.title}
      </h4>
      <div className="space-y-2.5">
        {props.items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span
              className={`truncate font-medium ${
                item.tone === "positive"
                  ? "text-emerald-500"
                  : item.tone === "negative"
                    ? "text-rose-500"
                    : "text-foreground"
              }`}
              title={item.value}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BacktestRunProgress(props: { progress: number; label: string }) {
  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary/5 p-4"
      role="status"
      aria-live="polite"
      aria-busy={props.progress < 100}
    >
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <Loader2Icon
            className={`size-4 shrink-0 ${props.progress < 100 ? "animate-spin text-primary" : "text-emerald-500"}`}
          />
          <span className="truncate">{props.label}</span>
        </span>
        <span className="shrink-0 text-muted-foreground">{Math.round(props.progress)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${props.progress}%` }}
        />
      </div>
    </div>
  );
}

function ChartCard(props: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card/60 p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        {props.subtitle ? (
          <p className="mt-1 text-xs text-muted-foreground">{props.subtitle}</p>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function StatCard(props: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border bg-muted/10 p-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div
        className={`mt-1 truncate text-sm font-medium ${props.highlight ? "text-primary" : ""}`}
        title={props.value}
      >
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

function BacktestDateTimeCell(props: { timestamp: number | null | undefined; locale: AppLocale }) {
  if (typeof props.timestamp !== "number") {
    return <span>—</span>;
  }

  return (
    <div className="min-w-[8.5rem] leading-tight whitespace-nowrap">
      <div>{formatBacktestDateWithWeekday(props.timestamp, props.locale)}</div>
      <div className="text-[10px] text-muted-foreground/80">
        {formatBacktestTimeOnly(props.timestamp, props.locale)}
      </div>
    </div>
  );
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

function formatSavedRunLabel(
  run: TraderBacktestRunRecord,
  locale: AppLocale,
  t: ReturnType<typeof useI18n>["t"],
) {
  return `${formatBacktestCompactDateTime(run.createdAt, locale)} · ${backtestModeLabel(run.mode, t)} · ${backtestWindowLabel(run.window, t)}`;
}

function backtestModeLabel(mode: TraderBacktestMode, t: ReturnType<typeof useI18n>["t"]) {
  const option = BACKTEST_MODE_OPTIONS.find((item) => item.value === mode);
  return option ? t(option.labelKey) : mode;
}

function backtestWindowLabel(window: TraderBacktestWindow, t: ReturnType<typeof useI18n>["t"]) {
  const option = BACKTEST_WINDOW_OPTIONS.find((item) => item.value === window);
  return option ? t(option.labelKey) : window;
}

function platformLabel(platform: TraderPlatform) {
  return PLATFORMS.find((item) => item.value === platform)?.label ?? platform;
}

function parseInitialBalance(input: string) {
  const normalized = input.trim().replace(/,/g, "");
  if (!normalized) return Number.NaN;
  return Number(normalized);
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
    resultsOverview: isZh ? "回测结果概览" : "Backtest overview",
    performanceGroup: isZh ? "收益表现" : "Performance",
    riskGroup: isZh ? "风险指标" : "Risk",
    tradeGroup: isZh ? "交易统计" : "Trade stats",
    curveGroup: isZh ? "权益与收益曲线" : "Equity & profit curves",
    distributionGroup: isZh ? "分布分析" : "Distribution analysis",
    sampledChartNote: isZh
      ? "逐笔图表已抽样展示，完整明细见下方表格。"
      : "Per-trade charts are sampled; see the table below for full details.",
    tradeCount: isZh ? "成交笔数" : "Trades",
    tradeSequenceLabel: (sequence: string) => (isZh ? `第 ${sequence} 笔` : `Trade #${sequence}`),
    openHourRangeLabel: (hour: string) =>
      isZh ? `${hour}:00 – ${hour}:59` : `${hour}:00 – ${hour}:59`,
    openWeekdayLabel: (weekday: string) => (isZh ? `${weekday} 开仓` : `Opens on ${weekday}`),
    openCountLabel: isZh ? "开仓次数" : "Open count",
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
