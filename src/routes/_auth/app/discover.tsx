import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ExternalLinkIcon,
  FilterIcon,
  LayoutGridIcon,
  Loader2Icon,
  SearchIcon,
  Table2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DiscoverFavoriteButton } from "#/components/trading/discover-favorite-button";
import { DiscoverTrackButton } from "#/components/trading/discover-track-button";
import { TradingPageShell } from "#/components/trading/page-shell";
import { useDiscoverDeepAnalysis } from "#/components/trading/use-discover-deep-analysis";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Skeleton } from "#/components/ui/skeleton";
import { useI18n } from "#/lib/i18n";
import { formatBacktestCompactDateTime } from "#/lib/trading/backtest-time-format";
import { isDiscoverFavorite, mergeFavoriteWithRankItems } from "#/lib/trading/discover-favorites";
import {
  DISCOVER_LEADERBOARD_SORTS,
  DISCOVER_LOCAL_SORTS,
  DISCOVER_RANK_TIME_RANGES,
  isDiscoverLeaderboardSort,
} from "#/lib/trading/discover-rank-config";
import { $fetchTraderRankList, $listDiscoverFavorites } from "#/lib/trading/discover-repository";
import { tradersQueryOptions } from "#/lib/trading/queries";
import { isTraderTracked } from "#/lib/trading/track-trader-from-discover";
import { SUPPORTED_RANK_PLATFORMS } from "#/lib/trading/trader-rank-adapters";
import type {
  DiscoverFavoriteRecord,
  RankSortBy,
  RankTimeRange,
  TraderDeepAnalysis,
  TraderDeepAnalysisResponse,
  TraderRankPlatformError,
  TraderRankItem,
} from "#/lib/trading/trader-rank-types";
import type { TraderPlatform } from "#/lib/trading/types";

export const Route = createFileRoute("/_auth/app/discover")({
  component: DiscoverPage,
});

const LEADERBOARD_SORT_OPTIONS: { value: RankSortBy; labelKey: string }[] =
  DISCOVER_LEADERBOARD_SORTS.map((value) => ({
    value,
    labelKey:
      value === "yieldRatio"
        ? "discover.yieldRatio"
        : value === "pnl"
          ? "discover.pnl"
          : "discover.yieldRatio",
  }));

const LOCAL_SORT_OPTIONS: { value: RankSortBy; labelKey: string }[] = DISCOVER_LOCAL_SORTS.map(
  (value) => ({
    value,
    labelKey:
      value === "aum"
        ? "discover.aum"
        : value === "followers"
          ? "discover.followers"
          : value === "maxDrawdown"
            ? "discover.maxDrawdown"
            : "discover.winRate",
  }),
);

const TIME_OPTIONS: { value: RankTimeRange; labelKey: string }[] = DISCOVER_RANK_TIME_RANGES.map(
  (value) => ({
    value,
    labelKey:
      value === "7" ? "discover.days7" : value === "30" ? "discover.days30" : "discover.days90",
  }),
);

const VIEW_MODES = [
  { value: "cards", labelKey: "discover.cardsView", icon: LayoutGridIcon },
  { value: "table", labelKey: "discover.tableView", icon: Table2Icon },
] as const;

const PLATFORMS: { value: TraderPlatform; label: string; comingSoon?: boolean }[] = [
  { value: "okx", label: "OKX" },
  { value: "bitget", label: "Bitget" },
  { value: "binanceFutures", label: "Binance Futures" },
  { value: "bybit", label: "Bybit", comingSoon: true },
];

type DiscoverViewMode = (typeof VIEW_MODES)[number]["value"];
type DiscoverScope = "all" | "favorites";

function compareRankItems(left: TraderRankItem, right: TraderRankItem, sortBy: RankSortBy) {
  if (sortBy === "maxDrawdown") {
    const leftValue = left.maxDrawdown ?? Number.POSITIVE_INFINITY;
    const rightValue = right.maxDrawdown ?? Number.POSITIVE_INFINITY;
    if (leftValue !== rightValue) return leftValue - rightValue;
  } else {
    const leftValue = left[sortBy] ?? 0;
    const rightValue = right[sortBy] ?? 0;
    if (leftValue !== rightValue) return rightValue - leftValue;
  }

  return left.nickName.localeCompare(right.nickName);
}

function parseNumericFilter(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function DiscoverPage() {
  const { t, locale } = useI18n();
  const [selectedPlatforms, setSelectedPlatforms] = useState<TraderPlatform[]>([
    ...SUPPORTED_RANK_PLATFORMS,
  ]);
  const [viewMode, setViewMode] = useState<DiscoverViewMode>("cards");
  const [sortBy, setSortBy] = useState<RankSortBy>("yieldRatio");
  const [timeRange, setTimeRange] = useState<RankTimeRange>("90");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [minYieldRatioInput, setMinYieldRatioInput] = useState("");
  const [minPnlInput, setMinPnlInput] = useState("");
  const [minAumInput, setMinAumInput] = useState("");
  const [minFollowersInput, setMinFollowersInput] = useState("");
  const [minWinRateInput, setMinWinRateInput] = useState("");
  const [maxDrawdownInput, setMaxDrawdownInput] = useState("");
  const [selectedTrader, setSelectedTrader] = useState<TraderRankItem | null>(null);
  const [discoverScope, setDiscoverScope] = useState<DiscoverScope>("all");

  const selectedPlatformKey = useMemo(
    () => [...selectedPlatforms].sort().join(","),
    [selectedPlatforms],
  );
  const pageSize = viewMode === "table" ? 20 : 12;

  const rankQuery = useQuery({
    queryKey: ["discover", "rank", selectedPlatformKey, sortBy, timeRange],
    queryFn: ({ signal }) =>
      $fetchTraderRankList({
        signal,
        data: { platforms: selectedPlatforms, sortBy, timeRange },
      }),
    enabled: selectedPlatforms.length > 0,
  });

  const favoritesQuery = useQuery({
    queryKey: ["discover", "favorites"],
    queryFn: ({ signal }) => $listDiscoverFavorites({ signal }),
  });

  const trackedQuery = useQuery(tradersQueryOptions());
  const trackedIds = useMemo(
    () => new Set((trackedQuery.data ?? []).map((trader) => trader.id)),
    [trackedQuery.data],
  );

  const minYieldRatio = parseNumericFilter(minYieldRatioInput);
  const minPnl = parseNumericFilter(minPnlInput);
  const minAum = parseNumericFilter(minAumInput);
  const minFollowers = parseNumericFilter(minFollowersInput);
  const minWinRate = parseNumericFilter(minWinRateInput);
  const maxDrawdown = parseNumericFilter(maxDrawdownInput);

  useEffect(() => {
    setPage(1);
  }, [
    selectedPlatformKey,
    sortBy,
    timeRange,
    search,
    minYieldRatioInput,
    minPnlInput,
    minAumInput,
    minFollowersInput,
    minWinRateInput,
    maxDrawdownInput,
    viewMode,
    discoverScope,
  ]);

  const favoriteItems = useMemo(
    () => mergeFavoriteWithRankItems(favoritesQuery.data ?? [], rankQuery.data?.items ?? []),
    [favoritesQuery.data, rankQuery.data?.items],
  );

  const filteredItems = useMemo(() => {
    const items =
      discoverScope === "favorites"
        ? [...favoriteItems]
        : [...(rankQuery.data?.items ?? [])].sort((left, right) =>
            compareRankItems(left, right, sortBy),
          );

    if (discoverScope === "favorites") {
      items.sort((left, right) => compareRankItems(left, right, sortBy));
    }

    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      if (!selectedPlatforms.includes(item.platform)) return false;

      if (q) {
        const matchesText =
          item.nickName.toLowerCase().includes(q) ||
          item.uniqueName.toLowerCase().includes(q) ||
          item.platform.toLowerCase().includes(q);
        if (!matchesText) return false;
      }

      if (minYieldRatio !== null && item.yieldRatio < minYieldRatio / 100) return false;
      if (minPnl !== null && item.pnl < minPnl) return false;
      if (minAum !== null && item.aum < minAum) return false;
      if (minFollowers !== null && item.followers < minFollowers) return false;
      if (minWinRate !== null && (item.winRate ?? -1) < minWinRate / 100) return false;
      if (
        maxDrawdown !== null &&
        item.maxDrawdown !== null &&
        item.maxDrawdown > maxDrawdown / 100
      ) {
        return false;
      }

      return true;
    });
  }, [
    maxDrawdown,
    minAum,
    minFollowers,
    minPnl,
    minWinRate,
    minYieldRatio,
    discoverScope,
    favoriteItems,
    rankQuery.data?.items,
    search,
    selectedPlatforms,
    sortBy,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const platformErrors = rankQuery.data?.platformErrors ?? [];
  const hasPartialResults = pagedItems.length > 0;
  const allPlatformsFailed =
    selectedPlatforms.length > 0 &&
    filteredItems.length === 0 &&
    platformErrors.length >= selectedPlatforms.length;
  const onlyComingSoonSelected =
    selectedPlatforms.length > 0 && selectedPlatforms.every((platform) => platform === "bybit");
  const isRankCacheSyncing =
    discoverScope === "all" &&
    rankQuery.isSuccess &&
    (rankQuery.data?.items.length ?? 0) === 0 &&
    rankQuery.data?.crawledAt == null &&
    !onlyComingSoonSelected;

  const clearExtraFilters = () => {
    setSearch("");
    setMinYieldRatioInput("");
    setMinPnlInput("");
    setMinAumInput("");
    setMinFollowersInput("");
    setMinWinRateInput("");
    setMaxDrawdownInput("");
  };

  return (
    <TradingPageShell title={t("discover.title")} description={t("discover.description")}>
      <div className="flex flex-col gap-4">
        <FilterBar
          selectedPlatforms={selectedPlatforms}
          sortBy={sortBy}
          timeRange={timeRange}
          viewMode={viewMode}
          search={search}
          minYieldRatioInput={minYieldRatioInput}
          minPnlInput={minPnlInput}
          minAumInput={minAumInput}
          minFollowersInput={minFollowersInput}
          minWinRateInput={minWinRateInput}
          maxDrawdownInput={maxDrawdownInput}
          onTogglePlatform={(platform) => {
            if (PLATFORMS.find((item) => item.value === platform)?.comingSoon) return;
            setSelectedPlatforms((current) =>
              current.includes(platform)
                ? current.filter((item) => item !== platform)
                : [...current, platform],
            );
          }}
          onSelectAllPlatforms={() => setSelectedPlatforms([...SUPPORTED_RANK_PLATFORMS])}
          onClearPlatforms={() => setSelectedPlatforms([])}
          onSortByChange={setSortBy}
          onTimeRangeChange={setTimeRange}
          onViewModeChange={setViewMode}
          onSearchChange={setSearch}
          onMinYieldRatioChange={setMinYieldRatioInput}
          onMinPnlChange={setMinPnlInput}
          onMinAumChange={setMinAumInput}
          onMinFollowersChange={setMinFollowersInput}
          onMinWinRateChange={setMinWinRateInput}
          onMaxDrawdownChange={setMaxDrawdownInput}
          onClearExtraFilters={clearExtraFilters}
        />

        <DiscoverScopeBar
          scope={discoverScope}
          favoriteCount={favoritesQuery.data?.length ?? 0}
          onScopeChange={setDiscoverScope}
        />

        {!isDiscoverLeaderboardSort(sortBy) ? <SortScopeHint /> : null}

        <ResultsSummary
          total={filteredItems.length}
          currentPage={currentPage}
          pageSize={pageSize}
          timeRange={timeRange}
          rankCrawledAt={rankQuery.data?.crawledAt ?? null}
          locale={locale}
        />

        {platformErrors.length > 0 ? <PlatformErrorsBanner errors={platformErrors} /> : null}

        {discoverScope === "favorites" && favoritesQuery.isPending ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : discoverScope === "favorites" && (favoritesQuery.data?.length ?? 0) === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t("discover.noFavorites")}
          </div>
        ) : selectedPlatforms.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            {t("discover.selectPlatformFirst")}
          </div>
        ) : discoverScope === "all" && rankQuery.isPending ? (
          viewMode === "cards" ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <Skeleton key={index} className="h-48 rounded-lg" />
              ))}
            </div>
          ) : (
            <Skeleton className="h-96 rounded-lg" />
          )
        ) : rankQuery.isError || (allPlatformsFailed && !hasPartialResults) ? (
          <div className="rounded-lg border border-destructive/50 p-8 text-center text-destructive">
            {t("discover.error")}
          </div>
        ) : onlyComingSoonSelected ? (
          <EmptyStatePanel title={t("discover.platformComingSoon")} />
        ) : isRankCacheSyncing ? (
          <EmptyStatePanel
            title={t("discover.rankDataSyncing")}
            hint={t("discover.rankDataSyncingHint")}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyStatePanel title={t("discover.noResults")} />
        ) : (
          <>
            {viewMode === "cards" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pagedItems.map((item) => (
                  <TraderCard
                    key={`${item.platform}-${item.traderId}`}
                    item={item}
                    favorited={isDiscoverFavorite(
                      favoritesQuery.data ?? [],
                      item.platform,
                      item.traderId,
                    )}
                    tracked={isTraderTracked(trackedIds, item)}
                    onClick={() => setSelectedTrader(item)}
                  />
                ))}
              </div>
            ) : (
              <TraderTable
                items={pagedItems}
                favorites={favoritesQuery.data ?? []}
                trackedIds={trackedIds}
                onRowClick={setSelectedTrader}
              />
            )}

            <Pagination
              page={currentPage}
              total={filteredItems.length}
              pageSize={pageSize}
              onPrev={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
            />
          </>
        )}
      </div>

      {selectedTrader ? (
        <DeepAnalysisSheet
          trader={selectedTrader}
          favorites={favoritesQuery.data ?? []}
          trackedIds={trackedIds}
          timeRange={timeRange}
          rankCrawledAt={rankQuery.data?.crawledAt ?? null}
          onClose={() => setSelectedTrader(null)}
        />
      ) : null}
    </TradingPageShell>
  );
}

function EmptyStatePanel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
      <p>{title}</p>
      {hint ? <p className="mt-2 text-sm">{hint}</p> : null}
    </div>
  );
}

function SortScopeHint() {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-950 dark:text-sky-100">
      {t("discover.sortScopeLocalHint")}
    </div>
  );
}

function timeRangeLabel(timeRange: RankTimeRange, t: (key: string) => string) {
  if (timeRange === "7") return t("discover.days7");
  if (timeRange === "30") return t("discover.days30");
  return t("discover.days90");
}

function DiscoverScopeBar(props: {
  scope: DiscoverScope;
  favoriteCount: number;
  onScopeChange: (scope: DiscoverScope) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-lg border bg-muted/20 p-1">
        <Button
          type="button"
          size="sm"
          variant={props.scope === "all" ? "default" : "ghost"}
          className="h-8 rounded-md px-3"
          onClick={() => props.onScopeChange("all")}
        >
          {t("discover.scopeAll")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={props.scope === "favorites" ? "default" : "ghost"}
          className="h-8 rounded-md px-3"
          onClick={() => props.onScopeChange("favorites")}
        >
          {t("discover.scopeFavorites")}
        </Button>
      </div>
      {props.favoriteCount > 0 ? (
        <span className="text-xs text-muted-foreground">
          {t("discover.favoritesCount", { count: props.favoriteCount })}
        </span>
      ) : null}
    </div>
  );
}

function PlatformErrorsBanner({ errors }: { errors: TraderRankPlatformError[] }) {
  const { t } = useI18n();
  const failedPlatforms = errors.map((item) => platformLabel(item.platform)).join(" / ");
  const messages = errors.map((item) => item.message).join(" | ");

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
      <div className="font-medium">{t("discover.partialWarning")}</div>
      <div className="mt-1 text-amber-800/90">
        {t("discover.partialWarningDetail", {
          platforms: failedPlatforms,
          messages,
        })}
      </div>
    </div>
  );
}

function FilterBar(props: {
  selectedPlatforms: TraderPlatform[];
  sortBy: RankSortBy;
  timeRange: RankTimeRange;
  viewMode: DiscoverViewMode;
  search: string;
  minYieldRatioInput: string;
  minPnlInput: string;
  minAumInput: string;
  minFollowersInput: string;
  minWinRateInput: string;
  maxDrawdownInput: string;
  onTogglePlatform: (platform: TraderPlatform) => void;
  onSelectAllPlatforms: () => void;
  onClearPlatforms: () => void;
  onSortByChange: (value: RankSortBy) => void;
  onTimeRangeChange: (value: RankTimeRange) => void;
  onViewModeChange: (value: DiscoverViewMode) => void;
  onSearchChange: (value: string) => void;
  onMinYieldRatioChange: (value: string) => void;
  onMinPnlChange: (value: string) => void;
  onMinAumChange: (value: string) => void;
  onMinFollowersChange: (value: string) => void;
  onMinWinRateChange: (value: string) => void;
  onMaxDrawdownChange: (value: string) => void;
  onClearExtraFilters: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FilterIcon className="size-4" />
        {t("discover.filterTitle")}
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("discover.platforms")}
            </span>
            <Button variant="outline" size="sm" onClick={props.onSelectAllPlatforms}>
              {t("discover.selectAllPlatforms")}
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onClearPlatforms}>
              {t("discover.clearPlatformSelection")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => (
              <Button
                key={platform.value}
                variant={props.selectedPlatforms.includes(platform.value) ? "default" : "outline"}
                size="sm"
                disabled={platform.comingSoon}
                onClick={() => props.onTogglePlatform(platform.value)}
              >
                {platform.label}
                {platform.comingSoon ? (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {t("discover.platformComingSoon")}
                  </Badge>
                ) : null}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder={t("discover.searchPlaceholder")}
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
            />
          </div>

          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={props.sortBy}
            onChange={(event) => props.onSortByChange(event.target.value as RankSortBy)}
          >
            <optgroup label={t("discover.sortGroupLeaderboard")}>
              {LEADERBOARD_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("discover.sortGroupCollected")}>
              {LOCAL_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </optgroup>
          </select>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {t("discover.timeRange")}
            </span>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={props.timeRange}
              onChange={(event) => props.onTimeRangeChange(event.target.value as RankTimeRange)}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {VIEW_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Button
                key={mode.value}
                variant={props.viewMode === mode.value ? "default" : "outline"}
                size="sm"
                onClick={() => props.onViewModeChange(mode.value)}
              >
                <Icon className="size-4" />
                {t(mode.labelKey)}
              </Button>
            );
          })}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <FilterInput
            label={t("discover.minYieldRatio")}
            value={props.minYieldRatioInput}
            placeholder="30"
            suffix="%"
            onChange={props.onMinYieldRatioChange}
          />
          <FilterInput
            label={t("discover.minPnl")}
            value={props.minPnlInput}
            placeholder="1000"
            prefix="$"
            onChange={props.onMinPnlChange}
          />
          <FilterInput
            label={t("discover.minAum")}
            value={props.minAumInput}
            placeholder="10000"
            prefix="$"
            onChange={props.onMinAumChange}
          />
          <FilterInput
            label={t("discover.minFollowers")}
            value={props.minFollowersInput}
            placeholder="50"
            onChange={props.onMinFollowersChange}
          />
          <FilterInput
            label={t("discover.minWinRate")}
            value={props.minWinRateInput}
            placeholder="50"
            suffix="%"
            onChange={props.onMinWinRateChange}
          />
          <FilterInput
            label={t("discover.maxDrawdownCeiling")}
            value={props.maxDrawdownInput}
            placeholder="20"
            suffix="%"
            onChange={props.onMaxDrawdownChange}
          />
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={props.onClearExtraFilters}>
            {t("discover.clearFilters")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{props.label}</span>
      <div className="relative">
        {props.prefix ? (
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
            {props.prefix}
          </span>
        ) : null}
        <Input
          className={`h-9 ${props.prefix ? "pl-7" : ""} ${props.suffix ? "pr-9" : ""}`}
          inputMode="decimal"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
        />
        {props.suffix ? (
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            {props.suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function ResultsSummary({
  total,
  currentPage,
  pageSize,
  timeRange,
  rankCrawledAt,
  locale,
}: {
  total: number;
  currentPage: number;
  pageSize: number;
  timeRange: RankTimeRange;
  rankCrawledAt: number | null;
  locale: "zh-CN" | "en";
}) {
  const { t } = useI18n();
  if (total === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(total, currentPage * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
      <span>{t("discover.resultsCount", { count: total })}</span>
      <div className="flex flex-wrap items-center gap-3">
        {rankCrawledAt ? (
          <span>
            {t("discover.rankDataCachedAt", {
              range: timeRangeLabel(timeRange, t),
              time: formatBacktestCompactDateTime(rankCrawledAt, locale),
            })}
          </span>
        ) : null}
        <span>{t("discover.resultsRange", { start, end, total })}</span>
      </div>
    </div>
  );
}

function formatFixed2(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${formatFixed2(value * 100)}%`;
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) >= 1_000_000) return `$${formatFixed2(value / 1_000_000)}M`;
  if (Math.abs(value) >= 1_000) return `$${formatFixed2(value / 1_000)}K`;
  return `$${formatFixed2(value)}`;
}

function formatDrawdownRatio(
  dataValue: number | null | undefined,
  summaryValue: number | null | undefined,
): string {
  for (const value of [dataValue, summaryValue]) {
    if (value === null || value === undefined) continue;
    const abs = Math.abs(value);
    if (abs <= 1) return formatPercent(abs);
    if (abs <= 100) return formatPercent(abs / 100);
  }
  return "—";
}

function formatMetricValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "—";

  const colonRatio = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/);
  if (colonRatio) {
    return `${formatFixed2(Number(colonRatio[1]))}:${formatFixed2(Number(colonRatio[2]))}`;
  }

  const slashFraction = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (slashFraction) {
    const left = Number(slashFraction[1]);
    const right = Number(slashFraction[2]);
    const formatCount = (value: number) =>
      Number.isInteger(value) ? String(value) : formatFixed2(value);
    return `${formatCount(left)}/${formatCount(right)}`;
  }

  if (trimmed.endsWith("%")) {
    const parsed = Number(trimmed.slice(0, -1).trim());
    return Number.isFinite(parsed) ? `${formatFixed2(parsed)}%` : trimmed;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    return Number.isInteger(parsed) ? String(parsed) : formatFixed2(parsed);
  }

  return trimmed.replace(/-?\d+\.\d+/g, (match) => formatFixed2(Number(match)));
}

function platformLabel(platform: TraderPlatform) {
  return PLATFORMS.find((item) => item.value === platform)?.label ?? platform;
}

function Sparkline({
  data,
  width = 120,
  height = 36,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-foreground ${className ?? ""}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const baselineY = height - ((0 - min) / range) * height;

  const points = data.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * height;
    return { x, y };
  });

  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  const areaPath =
    `M 0 ${height} ` + points.map((p) => `L ${p.x} ${p.y}`).join(" ") + ` L ${width} ${height} Z`;

  const isPositive = data[data.length - 1] >= data[0];
  const color = isPositive ? "rgb(5 150 105)" : "rgb(225 29 72)";
  const fillColor = isPositive ? "rgb(5 150 105 / 0.12)" : "rgb(225 29 72 / 0.12)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill={fillColor} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {min < 0 && max > 0 ? (
        <line
          x1={0}
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke="currentColor"
          strokeWidth={0.5}
          strokeDasharray="2 2"
          className="text-muted-foreground"
        />
      ) : null}
    </svg>
  );
}

function TraderCard({
  item,
  favorited,
  tracked,
  onClick,
}: {
  item: TraderRankItem;
  favorited: boolean;
  tracked: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-3 rounded-lg border p-4 text-left transition hover:border-primary/50 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {item.avatar ? (
          <img
            src={item.avatar}
            alt={item.nickName}
            className="size-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {item.nickName.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{item.nickName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {platformLabel(item.platform)} · @{item.uniqueName}
          </div>
        </div>
        <DiscoverFavoriteButton
          trader={{
            platform: item.platform,
            traderId: item.traderId,
            uniqueName: item.uniqueName,
            nickName: item.nickName,
            avatar: item.avatar,
            link: item.link,
          }}
          favorited={favorited}
        />
      </div>

      {item.sign ? <p className="line-clamp-2 text-xs text-muted-foreground">{item.sign}</p> : null}

      {item.yieldCurve.length >= 2 ? (
        <Sparkline data={item.yieldCurve} width={260} height={48} className="w-full" />
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Metric label={t("discover.yieldRatio")} value={formatPercent(item.yieldRatio)} highlight />
        <Metric label={t("discover.pnl")} value={formatUsd(item.pnl)} />
        <Metric label={t("discover.aum")} value={formatUsd(item.aum)} />
        <Metric label={t("discover.followers")} value={String(item.followers)} />
        {item.maxDrawdown !== null ? (
          <Metric label={t("discover.maxDrawdown")} value={formatPercent(item.maxDrawdown)} />
        ) : null}
        {item.winRate !== null ? (
          <Metric label={t("discover.winRate")} value={formatPercent(item.winRate)} />
        ) : null}
      </div>

      <DiscoverTrackButton item={item} tracked={tracked} className="w-full" />
    </button>
  );
}

function TraderTable({
  items,
  favorites,
  trackedIds,
  onRowClick,
}: {
  items: TraderRankItem[];
  favorites: DiscoverFavoriteRecord[];
  trackedIds: Set<string>;
  onRowClick: (item: TraderRankItem) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="w-10 px-3 py-3" />
            <th className="px-3 py-3">{t("common.name")}</th>
            <th className="px-3 py-3">{t("discover.yieldCurve")}</th>
            <th className="px-3 py-3">{t("discover.yieldRatio")}</th>
            <th className="px-3 py-3">{t("discover.pnl")}</th>
            <th className="px-3 py-3">{t("discover.aum")}</th>
            <th className="px-3 py-3">{t("discover.followers")}</th>
            <th className="px-3 py-3">{t("discover.maxDrawdown")}</th>
            <th className="px-3 py-3">{t("discover.winRate")}</th>
            <th className="px-3 py-3">{t("discover.instNum")}</th>
            <th className="px-3 py-3">{t("discover.track")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${item.platform}-${item.traderId}`}
              className="cursor-pointer border-b transition last:border-0 hover:bg-muted/30"
              onClick={() => onRowClick(item)}
            >
              <td className="px-3 py-3">
                <DiscoverFavoriteButton
                  trader={{
                    platform: item.platform,
                    traderId: item.traderId,
                    uniqueName: item.uniqueName,
                    nickName: item.nickName,
                    avatar: item.avatar,
                    link: item.link,
                  }}
                  favorited={isDiscoverFavorite(favorites, item.platform, item.traderId)}
                />
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  {item.avatar ? (
                    <img
                      src={item.avatar}
                      alt={item.nickName}
                      className="size-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {item.nickName.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.nickName}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {platformLabel(item.platform)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">@{item.uniqueName}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <Sparkline data={item.yieldCurve} width={120} height={36} />
              </td>
              <td className="px-3 py-3">
                <span className={item.yieldRatio >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {formatPercent(item.yieldRatio)}
                </span>
              </td>
              <td className="px-3 py-3">
                <span className={item.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {formatUsd(item.pnl)}
                </span>
              </td>
              <td className="px-3 py-3">{formatUsd(item.aum)}</td>
              <td className="px-3 py-3">{item.followers}</td>
              <td className="px-3 py-3">
                <span
                  className={
                    item.maxDrawdown !== null && item.maxDrawdown > 0.2 ? "text-rose-600" : ""
                  }
                >
                  {formatPercent(item.maxDrawdown)}
                </span>
              </td>
              <td className="px-3 py-3">
                <span
                  className={item.winRate !== null && item.winRate >= 0.5 ? "text-emerald-600" : ""}
                >
                  {formatPercent(item.winRate)}
                </span>
              </td>
              <td className="px-3 py-3 text-muted-foreground">{item.instNum ?? "—"}</td>
              <td className="px-3 py-3">
                <DiscoverTrackButton item={item} tracked={isTraderTracked(trackedIds, item)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={highlight ? "font-semibold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPrev,
  onNext,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex items-center justify-center gap-4 pt-4">
      <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
        {t("discover.prev")}
      </Button>
      <span className="text-sm text-muted-foreground">{t("discover.page", { page })}</span>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
        {t("discover.next")}
      </Button>
    </div>
  );
}

function DeepAnalysisSheet({
  trader,
  favorites,
  trackedIds,
  timeRange,
  rankCrawledAt,
  onClose,
}: {
  trader: TraderRankItem;
  favorites: DiscoverFavoriteRecord[];
  trackedIds: Set<string>;
  timeRange: RankTimeRange;
  rankCrawledAt: number | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();

  const {
    query: analysisQuery,
    isRefreshing,
    refreshFailed,
  } = useDiscoverDeepAnalysis(trader.platform, trader.traderId, true);

  const response: TraderDeepAnalysisResponse | null = analysisQuery.data ?? null;
  const data = response?.status === "ready" ? response.analysis : null;
  const dataCachedAt = response?.status === "ready" ? response.crawledAt : null;

  return (
    <Sheet open onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
        <>
          <SheetHeader>
            <div className="flex items-center gap-3">
              {trader.avatar ? (
                <img
                  src={trader.avatar}
                  alt={trader.nickName}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full bg-muted font-medium">
                  {trader.nickName.slice(0, 2)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{trader.nickName}</SheetTitle>
                <SheetDescription>
                  {platformLabel(trader.platform)} · @{trader.uniqueName}
                </SheetDescription>
              </div>
              <DiscoverFavoriteButton
                trader={{
                  platform: trader.platform,
                  traderId: trader.traderId,
                  uniqueName: trader.uniqueName,
                  nickName: trader.nickName,
                  avatar: trader.avatar,
                  link: trader.link,
                }}
                favorited={isDiscoverFavorite(favorites, trader.platform, trader.traderId)}
                size="sm"
              />
              <Button
                variant="ghost"
                size="sm"
                render={<a href={trader.link} target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
              >
                <ExternalLinkIcon className="size-4" />
                <span className="sr-only">{t("discover.viewOnExchange")}</span>
              </Button>
            </div>
            {trader.sign ? <p className="text-sm text-muted-foreground">{trader.sign}</p> : null}
          </SheetHeader>

          <div className="flex flex-col gap-6 px-6 pb-6">
            <DeepDataScopeNote
              timeRange={timeRange}
              rankCrawledAt={rankCrawledAt}
              deepCachedAt={dataCachedAt}
              locale={locale}
            />

            {analysisQuery.isPending || isRefreshing ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {isRefreshing ? t("discover.refreshingDeepData") : t("discover.analyzing")}
              </div>
            ) : analysisQuery.isError || refreshFailed ? (
              <div className="text-destructive">{t("discover.error")}</div>
            ) : response?.status === "pending" ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                <p>{t("discover.deepDataPending")}</p>
                <p className="mt-2 text-xs">{t("discover.deepDataPendingHint")}</p>
              </div>
            ) : data ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <DiscoverTrackButton
                    item={trader}
                    tracked={isTraderTracked(trackedIds, trader)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link
                        to="/app/backtest/$platform/$traderId"
                        preload={false}
                        params={{
                          platform: trader.platform,
                          traderId: trader.traderId,
                        }}
                      />
                    }
                    nativeButton={false}
                  >
                    {t("discover.backtestButton")}
                  </Button>
                </div>

                <DeepStats data={data} summary={trader} />
                <ExtraStatsSection data={data} />
                <YieldCurveSection data={data} />
                <PositionsSection data={data} />
                <HistorySection data={data} />
              </>
            ) : null}
          </div>
        </>
      </SheetContent>
    </Sheet>
  );
}

function DeepDataScopeNote({
  timeRange,
  rankCrawledAt,
  deepCachedAt,
  locale,
}: {
  timeRange: RankTimeRange;
  rankCrawledAt: number | null;
  deepCachedAt: number | null;
  locale: "zh-CN" | "en";
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <p>{t("discover.rankMetricsWindow", { range: timeRangeLabel(timeRange, t) })}</p>
      {rankCrawledAt ? (
        <p className="mt-1">
          {t("discover.rankDataCachedAt", {
            range: timeRangeLabel(timeRange, t),
            time: formatBacktestCompactDateTime(rankCrawledAt, locale),
          })}
        </p>
      ) : null}
      {deepCachedAt ? (
        <p className="mt-1">
          {t("discover.dataCachedAt", {
            time: formatBacktestCompactDateTime(deepCachedAt, locale),
          })}
        </p>
      ) : null}
      <p className="mt-1">{t("discover.deepDataScopeNote")}</p>
    </div>
  );
}

function DeepStats({ data, summary }: { data: TraderDeepAnalysis; summary: TraderRankItem }) {
  const { t } = useI18n();
  const yieldRatio = data.yieldRatio ?? summary.yieldRatio;
  const pnl = data.pnl ?? summary.pnl;
  const aum = data.aum ?? summary.aum;
  const followers = data.followers ?? summary.followers;
  const winRate = data.winRate ?? summary.winRate;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label={t("discover.yieldRatio")} value={formatPercent(yieldRatio)} highlight />
      <StatCard label={t("discover.pnl")} value={formatUsd(pnl)} />
      <StatCard label={t("discover.aum")} value={formatUsd(aum)} />
      <StatCard label={t("discover.followers")} value={followers?.toString() ?? "—"} />
      <StatCard
        label={t("discover.maxDrawdown")}
        value={formatDrawdownRatio(data.maxDrawdown, summary.maxDrawdown)}
      />
      <StatCard label={t("discover.winRate")} value={formatPercent(winRate)} />
      <StatCard label={t("discover.balance")} value={formatUsd(data.balance)} />
      <StatCard
        label={t("discover.monthlyAvg")}
        value={formatUsd(data.monthlyAveragePositionValue)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 truncate text-sm font-medium ${highlight ? "text-primary" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ExtraStatsSection({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();
  const hasNonPeriodic = data.extraStats.nonPeriodicPart.length > 0;
  const hasPeriodic = data.extraStats.periodicPart.length > 0;

  if (!hasNonPeriodic && !hasPeriodic) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t("discover.extraStats")}</h3>
      {hasNonPeriodic ? (
        <MetricGroup
          title={t("discover.nonPeriodicStats")}
          metrics={data.extraStats.nonPeriodicPart}
        />
      ) : null}
      {hasPeriodic ? (
        <MetricGroup title={t("discover.periodicStats")} metrics={data.extraStats.periodicPart} />
      ) : null}
    </div>
  );
}

function MetricGroup({
  title,
  metrics,
}: {
  title: string;
  metrics: TraderDeepAnalysis["extraStats"]["nonPeriodicPart"];
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h4>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {metrics.map((metric) => (
          <div key={`${metric.functionId}-${metric.order}`} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{metric.title}</div>
            <div className="mt-1 truncate text-sm font-medium" title={metric.value}>
              {formatMetricValue(metric.value)}
            </div>
            {metric.desc ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.desc}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function YieldCurveSection({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();

  if (data.yieldCurve.length === 0) return null;

  const points = data.yieldCurve;
  const ratios = points.map((point) => point.ratio);
  const minRatio = Math.min(...ratios, 0);
  const maxRatio = Math.max(...ratios, 0);
  const range = maxRatio - minRatio || 1;
  const width = 100;
  const height = 30;
  const pathData = points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - ((point.ratio - minRatio) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("discover.yieldCurve")}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" preserveAspectRatio="none">
        <path
          d={pathData}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-primary"
        />
      </svg>
    </div>
  );
}

function PositionsSection({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();

  if (data.positions.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("discover.currentPositions")}</h3>
        <p className="text-sm text-muted-foreground">{t("discover.noPositions")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {t("discover.currentPositions")} ({data.positions.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pr-2 pb-1 font-medium">Symbol</th>
              <th className="pr-2 pb-1 font-medium">Side</th>
              <th className="pr-2 pb-1 font-medium">Size</th>
              <th className="pr-2 pb-1 font-medium">{t("discover.entryPrice")}</th>
              <th className="pr-2 pb-1 font-medium">Lev</th>
              <th className="pr-2 pb-1 font-medium">PnL</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((position) => (
              <tr key={position.id} className="border-b last:border-0">
                <td className="py-1 pr-2 font-medium">{position.symbol}</td>
                <td
                  className={`py-1 pr-2 ${position.positionSide === "short" ? "text-red-500" : "text-green-500"}`}
                >
                  {position.positionSide}
                </td>
                <td className="py-1 pr-2">{formatFixed2(position.amount)}</td>
                <td className="py-1 pr-2">{formatFixed2(position.entryPrice)}</td>
                <td className="py-1 pr-2">{position.leverage}x</td>
                <td
                  className={`py-1 pr-2 ${(position.pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {position.pnl !== null ? formatUsd(position.pnl) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistorySection({ data }: { data: TraderDeepAnalysis }) {
  const { t } = useI18n();

  if (data.historyPositions.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{t("discover.historyPositions")}</h3>
        <p className="text-sm text-muted-foreground">{t("discover.noHistory")}</p>
      </div>
    );
  }

  const recent = data.historyPositions.slice(0, 50);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {t("discover.historyPositions")} ({data.historyPositions.length})
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pr-2 pb-1 font-medium">Symbol</th>
              <th className="pr-2 pb-1 font-medium">Side</th>
              <th className="pr-2 pb-1 font-medium">Size</th>
              <th className="pr-2 pb-1 font-medium">{t("discover.entryPrice")}</th>
              <th className="pr-2 pb-1 font-medium">{t("discover.closePrice")}</th>
              <th className="pr-2 pb-1 font-medium">PnL</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((position) => (
              <tr key={position.id} className="border-b last:border-0">
                <td className="py-1 pr-2 font-medium">{position.symbol}</td>
                <td
                  className={`py-1 pr-2 ${position.side === "short" ? "text-red-500" : "text-green-500"}`}
                >
                  {position.side}
                </td>
                <td className="py-1 pr-2">{formatFixed2(position.amount)}</td>
                <td className="py-1 pr-2">{formatFixed2(position.entryPrice)}</td>
                <td className="py-1 pr-2">{formatFixed2(position.closePrice)}</td>
                <td
                  className={`py-1 pr-2 ${(position.profit ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  {position.profit !== null ? formatUsd(position.profit) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
