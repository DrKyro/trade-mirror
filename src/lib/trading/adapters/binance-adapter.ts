import "@tanstack/react-start/server-only";
import ccxt from "ccxt";

import { fetchJson } from "#/lib/trading/adapters/fetch-utils";
import type {
  EndpointDefinition,
  FetchTraderDeepAnalysisOptions,
  PlatformAdapter,
  TeacherAccountSnapshot,
  TraderLiveSnapshot,
} from "#/lib/trading/adapters/platform-adapter";
import {
  mapCcxtPositionsToSnapshots,
  normalizeSwapSymbol,
} from "#/lib/trading/adapters/shared-utils";
import { BACKTEST_WINDOW_30D_MS, resolveBacktestWindowCutoff } from "#/lib/trading/backtest-window";
import { paginateDelay } from "#/lib/trading/crawl-rate-limit";
import { createTeacherExchange } from "#/lib/trading/exchange-client";
import type { TraderPlatformModel } from "#/lib/trading/trader-data-model";
import type { TraderProfileInference } from "#/lib/trading/trader-profile-inference";
import type {
  RankSortBy,
  RankTimeRange,
  TraderDeepAnalysis,
  TraderRankItem,
  TraderRankQuery,
  TraderRankResult,
} from "#/lib/trading/trader-rank-types";
import type { ExecutionMode } from "#/lib/trading/types";
import type {
  CloseFill,
  ExecutionFill,
  PositionSide,
  PositionSnapshot,
  TeacherCredentials,
  TraderRecord,
} from "#/lib/trading/types";

function resolveHistoryCutoffTime(
  window: FetchTraderDeepAnalysisOptions["historyWindow"],
): number | null {
  return resolveBacktestWindowCutoff(window ?? "all");
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function position(input: PositionSnapshot): PositionSnapshot {
  return { ...input };
}

const BINANCE_BASE = "https://www.binance.com/bapi/futures/v1";

const BINANCE_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "content-type": "application/json",
  clienttype: "web",
  lang: "en",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
};

function binanceDetailHeaders(portfolioId: string): Record<string, string> {
  return {
    ...BINANCE_HEADERS,
    lang: "zh-CN",
    Referer: `https://www.binance.com/zh-CN/copy-trading/lead-details/${portfolioId}`,
  };
}

const BINANCE_TRADER_MODEL: TraderPlatformModel = {
  platform: "binanceFutures",
  displayName: "Binance",
  sampleTraderId: "5042441194923900672",
  sections: [
    {
      id: "profile",
      label: "Profile",
      fields: [
        { id: "nickName", label: "Nickname", status: "ready", source: "lead-portfolio/detail" },
        { id: "avatar", label: "Avatar", status: "ready", source: "lead-portfolio/detail" },
        {
          id: "sign",
          label: "Signature",
          status: "ready",
          source: "lead-portfolio/detail.description",
        },
        { id: "link", label: "Trader Link", status: "ready", source: "buildTraderLink" },
      ],
    },
    {
      id: "leaderboard",
      label: "Leaderboard Summary",
      fields: [
        {
          id: "yieldRatio",
          label: "Yield Ratio",
          status: "ready",
          source: "query-list / performance",
        },
        { id: "pnl", label: "PnL", status: "ready", source: "query-list / performance" },
        { id: "aum", label: "AUM", status: "ready", source: "query-list / detail" },
        { id: "followers", label: "Followers", status: "ready", source: "query-list / detail" },
        {
          id: "maxDrawdown",
          label: "Max Drawdown",
          status: "ready",
          source: "query-list / performance",
        },
        { id: "winRate", label: "Win Rate", status: "ready", source: "query-list / performance" },
      ],
    },
    {
      id: "overview",
      label: "Deep Overview",
      fields: [
        {
          id: "balance",
          label: "Balance",
          status: "ready",
          source: "lead-portfolio/detail.marginBalance",
        },
        {
          id: "monthlyAveragePositionValue",
          label: "Monthly Avg Position Value",
          status: "ready",
          source: "position-history derived",
        },
      ],
    },
    {
      id: "positions",
      label: "Current Positions",
      fields: [
        { id: "positions", label: "Open Positions", status: "ready", source: "getOtherPosition" },
      ],
    },
    {
      id: "history",
      label: "History Positions",
      fields: [
        {
          id: "historyPositions",
          label: "Closed Positions",
          status: "ready",
          source: "position-history",
        },
      ],
    },
    {
      id: "charts",
      label: "Charts",
      fields: [
        { id: "yieldCurve", label: "Yield Curve", status: "ready", source: "chart-data ROI + PNL" },
      ],
    },
    {
      id: "extras",
      label: "Extra Stats",
      note: "Core discover sidebar fields are covered; more niche cards can still be added later if needed.",
      fields: [
        {
          id: "extraStats",
          label: "Metric Cards",
          status: "partial",
          source: "detail + performance",
          note: "Currently composed from accessible public metrics rather than a single card endpoint.",
        },
      ],
    },
  ],
};

// ── types ──

type BinanceLeaderboardPosition = {
  symbol: string;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  roe: number;
  amount: number;
  updateTimeStamp: number;
  leverage: number;
};

type BinanceProfilePayload = {
  code?: string;
  success?: boolean;
  message?: string | null;
  data?: {
    nickname?: string;
    avatarUrl?: string;
    description?: string;
    currentCopyCount?: number;
    maxCopyCount?: number;
    favoriteCount?: number;
    marginBalance?: string;
    aumAmount?: string;
    profitSharingRate?: string;
    sharpRatio?: string;
  } | null;
};

type BinanceChartPoint = {
  value: number | string;
  dataType?: string;
  dateTime: number;
};

type BinancePerformancePayload = {
  code?: string;
  success?: boolean;
  message?: string | null;
  data?: {
    roi?: number;
    pnl?: number;
    mdd?: number;
    winRate?: number;
    winOrders?: number;
    totalOrder?: number;
    sharpRatio?: string;
  } | null;
};

type BinancePositionHistoryEntry = {
  id: number | string;
  symbol: string;
  opened?: number;
  closed?: number;
  avgCost?: number | string;
  avgClosePrice?: number | string;
  closingPnl?: number | string;
  maxOpenInterest?: number | string;
  closedVolume?: number | string;
  side?: string;
  leverage?: string | number;
  roi?: string | number;
  updateTime?: number;
};

type BinanceRankEntry = {
  leadPortfolioId: string;
  nickname: string;
  avatarUrl?: string;
  roi?: number;
  pnl?: number;
  aum?: number;
  mdd?: number;
  winRate?: number;
  currentCopyCount?: number;
  maxCopyCount?: number;
  sharpRatio?: number;
  portfolioType?: string;
  chartItems?: Array<{ value: number; dataType: string; dateTime: number }>;
};

// ── positions ──

async function fetchBinanceFuturesPositions(traderId: string): Promise<PositionSnapshot[]> {
  const result = await fetchJson<{
    code: string;
    msg?: string;
    data?: { otherPositionRetList?: BinanceLeaderboardPosition[] };
  }>("https://www.binance.com/bapi/futures/v2/private/future/leaderboard/getOtherPosition", {
    method: "POST",
    headers: { "content-type": "application/json", clienttype: "web", lang: "en" },
    body: { encryptedUid: traderId, tradeType: "PERPETUAL" },
    isSuccessCode: (p) => (p as { code?: string }).code === "000000",
  });

  return (result.data?.data?.otherPositionRetList ?? []).map((item) => {
    const side: PositionSide = item.amount >= 0 ? "long" : "short";
    return position({
      id: `${item.symbol}${item.entryPrice}`,
      symbol: item.symbol,
      entryPrice: item.entryPrice,
      markPrice: item.markPrice,
      amount: Math.abs(item.amount),
      leverage: item.leverage,
      openTime: item.updateTimeStamp,
      closeTime: null,
      margin:
        item.entryPrice > 0 && item.leverage > 0
          ? (item.entryPrice * Math.abs(item.amount)) / item.leverage
          : null,
      marginMode: null,
      pnl: item.pnl,
      pnlRatio: item.roe,
      positionSide: side,
      closeAvgPrice: null,
      contractValue: null,
    });
  });
}

// ── snapshot ──

async function fetchBinanceSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot> {
  return { positions: await fetchBinanceFuturesPositions(trader.id) };
}

async function fetchBinanceProfileDetail(
  traderId: string,
): Promise<NonNullable<BinanceProfilePayload["data"]> | null> {
  try {
    const result = await fetchJson<BinanceProfilePayload>(
      `${BINANCE_BASE}/friendly/future/copy-trade/lead-portfolio/detail?portfolioId=${encodeURIComponent(traderId)}`,
      {
        headers: binanceDetailHeaders(traderId),
        isSuccessCode: (p) => (p as { code?: string }).code === "000000",
      },
    );
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchBinanceChartData(
  traderId: string,
  dataType: "ROI" | "PNL",
  timeRange: "30D" | "90D" = "90D",
): Promise<BinanceChartPoint[]> {
  try {
    const result = await fetchJson<{
      code?: string;
      success?: boolean;
      data?: BinanceChartPoint[];
    }>(
      `${BINANCE_BASE}/public/future/copy-trade/lead-portfolio/chart-data?dataType=${dataType}&portfolioId=${encodeURIComponent(traderId)}&timeRange=${timeRange}`,
      {
        headers: binanceDetailHeaders(traderId),
        isSuccessCode: (p) => (p as { code?: string }).code === "000000",
      },
    );
    return result.data?.data ?? [];
  } catch {
    return [];
  }
}

async function fetchBinancePerformance(
  traderId: string,
): Promise<NonNullable<BinancePerformancePayload["data"]> | null> {
  try {
    const result = await fetchJson<BinancePerformancePayload>(
      `${BINANCE_BASE}/public/future/copy-trade/lead-portfolio/performance?portfolioId=${encodeURIComponent(traderId)}&timeRange=90D`,
      {
        headers: binanceDetailHeaders(traderId),
        isSuccessCode: (p) => (p as { code?: string }).code === "000000",
      },
    );
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchBinancePositionHistory(
  traderId: string,
  cutoffTime: number | null,
): Promise<BinancePositionHistoryEntry[]> {
  const allRows: BinancePositionHistoryEntry[] = [];
  const seenIds = new Set<string>();

  for (let page = 1; ; page++) {
    try {
      const result = await fetchJson<{
        code?: string;
        success?: boolean;
        data?: { total?: number; list?: BinancePositionHistoryEntry[] } | null;
      }>(`${BINANCE_BASE}/friendly/future/copy-trade/lead-portfolio/position-history`, {
        method: "POST",
        headers: binanceDetailHeaders(traderId),
        body: { pageNumber: page, pageSize: 50, portfolioId: traderId, sort: "OPENING" },
        isSuccessCode: (p) => (p as { code?: string }).code === "000000",
      });

      const rows = result.data?.data?.list ?? [];
      if (rows.length === 0) break;

      let addedRows = 0;
      for (const row of rows) {
        const rowId =
          row.id != null
            ? String(row.id)
            : `${row.symbol}_${row.opened ?? ""}_${row.closed ?? ""}_${row.updateTime ?? ""}`;
        if (seenIds.has(rowId)) continue;
        seenIds.add(rowId);
        allRows.push(row);
        addedRows += 1;
      }

      const total = result.data?.data?.total ?? 0;
      const oldestEffectiveTime = rows.reduce<number | null>((oldest, row) => {
        const effectiveTime =
          finiteOrNull(row.closed) ?? finiteOrNull(row.opened) ?? finiteOrNull(row.updateTime);
        if (effectiveTime === null) return oldest;
        return oldest === null ? effectiveTime : Math.min(oldest, effectiveTime);
      }, null);
      const reachedCutoff =
        cutoffTime !== null && oldestEffectiveTime !== null && oldestEffectiveTime < cutoffTime;

      if (
        rows.length < 50 ||
        (total > 0 && seenIds.size >= total) ||
        addedRows === 0 ||
        reachedCutoff
      ) {
        break;
      }

      await paginateDelay();
    } catch {
      break;
    }
  }

  return allRows;
}

function deriveBinanceMonthlyAveragePositionValue(
  history: BinancePositionHistoryEntry[],
): number | null {
  const cutoff = Date.now() - BACKTEST_WINDOW_30D_MS;
  const notionals = history
    .map((item) => {
      const closed = finiteOrNull(item.closed);
      const opened = finiteOrNull(item.opened);
      const effectiveTime = closed ?? opened;
      if (effectiveTime === null || effectiveTime < cutoff) return null;
      const price = finiteOrNull(item.avgCost);
      const size = finiteOrNull(item.maxOpenInterest) ?? finiteOrNull(item.closedVolume);
      if (price === null || size === null) return null;
      return Math.abs(price * size);
    })
    .filter((item): item is number => item !== null);

  if (notionals.length === 0) return null;
  return notionals.reduce((sum, item) => sum + item, 0) / notionals.length;
}

function mapBinanceHistoryPositions(
  history: BinancePositionHistoryEntry[],
): TraderDeepAnalysis["historyPositions"] {
  return history
    .map((item) => {
      const entryPrice = finiteOrNull(item.avgCost);
      const closePrice = finiteOrNull(item.avgClosePrice);
      const leverage = finiteOrNull(item.leverage);
      const amount = finiteOrNull(item.closedVolume) ?? finiteOrNull(item.maxOpenInterest);
      if (entryPrice === null || closePrice === null || leverage === null || amount === null)
        return null;

      return {
        id: String(item.id),
        symbol: item.symbol,
        side: item.side?.toLowerCase() === "short" ? "short" : "long",
        leverage,
        amount: Math.abs(amount),
        entryPrice,
        closePrice,
        openTime: finiteOrNull(item.opened),
        closeTime: finiteOrNull(item.closed) ?? finiteOrNull(item.updateTime),
        profit: finiteOrNull(item.closingPnl),
        profitRate: finiteOrNull(item.roi) !== null ? finiteOrNull(item.roi)! / 100 : null,
      };
    })
    .filter((item): item is TraderDeepAnalysis["historyPositions"][number] => item !== null)
    .sort((a, b) => {
      const at = a.closeTime ?? a.openTime ?? 0;
      const bt = b.closeTime ?? b.openTime ?? 0;
      return bt - at;
    });
}

function buildBinanceYieldCurve(
  roiPoints: BinanceChartPoint[],
  pnlPoints: BinanceChartPoint[],
): TraderDeepAnalysis["yieldCurve"] {
  const merged = new Map<number, { ratio: number | null; pnl: number | null }>();

  for (const point of roiPoints) {
    const time = finiteOrNull(point.dateTime);
    const ratio = finiteOrNull(point.value);
    if (time === null || ratio === null) continue;
    const current = merged.get(time) ?? { ratio: null, pnl: null };
    current.ratio = ratio / 100;
    merged.set(time, current);
  }

  for (const point of pnlPoints) {
    const time = finiteOrNull(point.dateTime);
    const pnl = finiteOrNull(point.value);
    if (time === null || pnl === null) continue;
    const current = merged.get(time) ?? { ratio: null, pnl: null };
    current.pnl = pnl;
    merged.set(time, current);
  }

  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, point]) => ({
      time,
      ratio: point.ratio ?? 0,
      pnl: point.pnl ?? 0,
    }));
}

function createBinanceMetric(
  functionId: string,
  title: string,
  value: string | number | null | undefined,
  order: number,
  type = "0",
  desc = "",
): TraderDeepAnalysis["extraStats"]["nonPeriodicPart"][number] | null {
  if (value === null || value === undefined || value === "") return null;
  return {
    functionId,
    title,
    value: String(value),
    desc,
    type,
    order,
    learnMoreUrl: "",
  };
}

async function fetchBinanceDeepAnalysis(
  traderId: string,
  options?: FetchTraderDeepAnalysisOptions,
): Promise<TraderDeepAnalysis> {
  const historyCutoffTime = resolveHistoryCutoffTime(options?.historyWindow);
  const [detail, performance, roiPoints, pnlPoints, positions, history] = await Promise.all([
    fetchBinanceProfileDetail(traderId),
    fetchBinancePerformance(traderId),
    fetchBinanceChartData(traderId, "ROI"),
    fetchBinanceChartData(traderId, "PNL"),
    fetchBinanceFuturesPositions(traderId).catch(() => []),
    fetchBinancePositionHistory(traderId, historyCutoffTime),
  ]);

  const yieldCurve = buildBinanceYieldCurve(roiPoints, pnlPoints);
  const latestYieldPoint = yieldCurve.at(-1) ?? null;
  const historyPositions = mapBinanceHistoryPositions(history);

  return {
    traderId,
    uniqueName: traderId,
    nickName: detail?.nickname ?? traderId,
    avatar: detail?.avatarUrl ?? "",
    sign: detail?.description ?? "",
    platform: "binanceFutures",
    link: `https://www.binance.com/zh-CN/copy-trading/lead-details/${traderId}`,
    balance: finiteOrNull(detail?.marginBalance),
    yieldRatio:
      performance?.roi !== undefined ? performance.roi / 100 : (latestYieldPoint?.ratio ?? null),
    pnl: finiteOrNull(performance?.pnl) ?? latestYieldPoint?.pnl ?? null,
    aum: finiteOrNull(detail?.aumAmount),
    followers: detail?.currentCopyCount ?? null,
    maxDrawdown:
      performance?.mdd !== undefined && performance.mdd !== null ? performance.mdd / 100 : null,
    winRate:
      performance?.winRate !== undefined && performance.winRate !== null
        ? performance.winRate / 100
        : null,
    monthlyAveragePositionValue: deriveBinanceMonthlyAveragePositionValue(history),
    positions: positions.map((item) => ({
      id: item.id,
      symbol: item.symbol,
      entryPrice: item.entryPrice,
      markPrice: item.markPrice,
      amount: item.amount,
      leverage: item.leverage,
      openTime: item.openTime,
      margin: item.margin,
      pnl: item.pnl,
      pnlRatio: item.pnlRatio,
      positionSide: item.positionSide,
    })),
    historyPositions,
    yieldCurve,
    extraStats: {
      nonPeriodicPart: [
        createBinanceMetric("favoriteCount", "收藏数", detail?.favoriteCount, 1, "2"),
        createBinanceMetric(
          "copyCount",
          "跟单人数",
          detail?.currentCopyCount !== undefined && detail?.maxCopyCount !== undefined
            ? `${detail.currentCopyCount}/${detail.maxCopyCount}`
            : detail?.currentCopyCount,
          2,
          "4",
        ),
        createBinanceMetric("profitSharingRate", "利润分成比例", detail?.profitSharingRate, 3, "1"),
        createBinanceMetric(
          "sharpRatio",
          "夏普比率",
          detail?.sharpRatio ?? performance?.sharpRatio,
          4,
          "3",
        ),
      ].filter(
        (item): item is TraderDeepAnalysis["extraStats"]["nonPeriodicPart"][number] =>
          item !== null,
      ),
      periodicPart: [
        createBinanceMetric("winOrders", "盈利订单", performance?.winOrders, 1, "2"),
        createBinanceMetric("totalOrder", "总订单数", performance?.totalOrder, 2, "2"),
        createBinanceMetric("currentAum", "当前管理资产 (USDT)", detail?.aumAmount, 3),
      ].filter(
        (item): item is TraderDeepAnalysis["extraStats"]["periodicPart"][number] => item !== null,
      ),
    },
  };
}

// ── rank ──

const BINANCE_SORT_MAP: Record<RankSortBy, string> = {
  yieldRatio: "ROI",
  pnl: "PNL",
  aum: "AUM",
  followers: "COPYCOUNT",
  maxDrawdown: "MDD",
  winRate: "WINRATE",
};

const BINANCE_TIME_MAP: Record<RankTimeRange, string> = {
  "7": "7D",
  "30": "30D",
  "90": "90D",
};

async function fetchBinanceFuturesRankList(query: TraderRankQuery): Promise<TraderRankResult> {
  const result = await fetchJson<{
    code: string;
    msg?: string;
    data?: { list: BinanceRankEntry[]; total: number };
  }>("https://www.binance.com/bapi/futures/v1/friendly/future/copy-trade/home-page/query-list", {
    method: "POST",
    headers: {
      ...BINANCE_HEADERS,
      lang: "zh-CN",
      Referer: "https://www.binance.com/zh-CN/copy-trading",
    },
    body: {
      pageNumber: query.page,
      pageSize: query.pageSize,
      timeRange: BINANCE_TIME_MAP[query.timeRange],
      dataType: BINANCE_SORT_MAP[query.sortBy],
      favoriteOnly: false,
      hideFull: false,
      nickname: "",
      order: "DESC",
      userAsset: 0,
      portfolioType: "ALL",
      useAiRecommended: false,
      PAGE_SIZE: query.pageSize,
    },
    isSuccessCode: (p) => (p as { code?: string }).code === "000000",
  });

  const list = result.data?.data?.list ?? [];
  const total = result.data?.data?.total ?? 0;

  const items: TraderRankItem[] = list.map((entry) => ({
    traderId: entry.leadPortfolioId,
    uniqueName: entry.leadPortfolioId,
    nickName: entry.nickname,
    avatar: entry.avatarUrl ?? "",
    sign: "",
    platform: "binanceFutures",
    yieldRatio: (entry.roi ?? 0) / 100,
    pnl: entry.pnl ?? 0,
    aum: entry.aum ?? 0,
    followers: entry.currentCopyCount ?? 0,
    maxDrawdown: entry.mdd !== undefined ? entry.mdd / 100 : null,
    winRate: entry.winRate !== undefined ? entry.winRate / 100 : null,
    instNum: null,
    link: `https://www.binance.com/zh-CN/copy-trading/lead-details/${entry.leadPortfolioId}`,
    yieldCurve: (entry.chartItems ?? []).map((p) => p.value / 100),
  }));

  return { items, total, platform: "binanceFutures" };
}

// ── profile inference ──

async function fetchBinanceProfile(traderId: string): Promise<TraderProfileInference | null> {
  const detail = await fetchBinanceProfileDetail(traderId);
  if (!detail) return null;

  return {
    name: detail.nickname,
    nickName: detail.nickname,
    avatar: detail.avatarUrl,
    sign: detail.description,
  };
}

// ── endpoint definitions ──

const BINANCE_ENDPOINTS: EndpointDefinition[] = [
  {
    id: "binance-position",
    name: "getOtherPosition (当前持仓)",
    method: "POST",
    buildUrl: () =>
      "https://www.binance.com/bapi/futures/v2/private/future/leaderboard/getOtherPosition",
    buildBody: (p) => ({ encryptedUid: String(p.traderId), tradeType: "PERPETUAL" }),
    extraHeaders: { "content-type": "application/json", clienttype: "web", lang: "en" },
    extractCount: (data) => {
      const obj = data as { otherPositionRetList?: unknown[] };
      return obj?.otherPositionRetList?.length ?? null;
    },
    integrated: true,
  },
  {
    id: "binance-rank",
    name: "query-list (排行榜)",
    method: "POST",
    buildUrl: () =>
      "https://www.binance.com/bapi/futures/v1/friendly/future/copy-trade/home-page/query-list",
    buildBody: () => ({ pageNo: 1, pageSize: 5 }),
    extraHeaders: {
      ...BINANCE_HEADERS,
      lang: "zh-CN",
      Referer: "https://www.binance.com/zh-CN/copy-trading",
    },
    extractCount: (data) => {
      const obj = data as { list?: unknown[] };
      return obj?.list?.length ?? null;
    },
    integrated: true,
  },
  {
    id: "binance-portfolio-detail",
    name: "lead-portfolio/detail (交易员详情)",
    method: "GET",
    buildUrl: (p) =>
      `${BINANCE_BASE}/friendly/future/copy-trade/lead-portfolio/detail?portfolioId=${p.traderId}`,
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => (data ? 1 : 0),
    integrated: true,
  },
  {
    id: "binance-chart-roi",
    name: "chart-data ROI (收益率曲线)",
    method: "GET",
    buildUrl: (p) =>
      `${BINANCE_BASE}/public/future/copy-trade/lead-portfolio/chart-data?dataType=ROI&portfolioId=${p.traderId}&timeRange=30D`,
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
  {
    id: "binance-chart-pnl",
    name: "chart-data PNL (PnL曲线)",
    method: "GET",
    buildUrl: (p) =>
      `${BINANCE_BASE}/public/future/copy-trade/lead-portfolio/chart-data?dataType=PNL&portfolioId=${p.traderId}&timeRange=90D`,
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
  {
    id: "binance-lead-positions",
    name: "lead-data/positions (当前持仓v2)",
    method: "GET",
    buildUrl: (p) =>
      `${BINANCE_BASE}/friendly/future/copy-trade/lead-data/positions?portfolioId=${p.traderId}`,
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
  {
    id: "binance-position-history",
    name: "position-history (历史持仓)",
    method: "POST",
    buildUrl: () => `${BINANCE_BASE}/friendly/future/copy-trade/lead-portfolio/position-history`,
    buildBody: (p) => ({
      pageNumber: 1,
      pageSize: 10,
      portfolioId: String(p.traderId),
      sort: "OPENING",
    }),
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => {
      const obj = data as { list?: unknown[] };
      return obj?.list?.length ?? null;
    },
    integrated: false,
  },
  {
    id: "binance-order-history",
    name: "order-history (订单历史)",
    method: "POST",
    buildUrl: () => `${BINANCE_BASE}/friendly/future/copy-trade/lead-portfolio/order-history`,
    buildBody: (p) => ({
      portfolioId: String(p.traderId),
      startTime: Date.now() - 7 * 86400000,
      endTime: Date.now(),
      pageSize: 10,
    }),
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => {
      const obj = data as { list?: unknown[] };
      return obj?.list?.length ?? null;
    },
    integrated: false,
  },
  {
    id: "binance-transfer-history",
    name: "transfer-history (转账记录)",
    method: "POST",
    buildUrl: () => `${BINANCE_BASE}/friendly/future/copy-trade/lead-portfolio/transfer-history`,
    buildBody: (p) => ({ pageNumber: 1, pageSize: 10, portfolioId: String(p.traderId) }),
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => {
      const obj = data as { list?: unknown[] };
      return obj?.list?.length ?? null;
    },
    integrated: false,
  },
  {
    id: "binance-performance",
    name: "performance (项目表现)",
    method: "GET",
    buildUrl: (p) =>
      `${BINANCE_BASE}/public/future/copy-trade/lead-portfolio/performance?portfolioId=${p.traderId}&timeRange=90D`,
    extraHeaders: { ...BINANCE_HEADERS, lang: "zh-CN" },
    extractCount: (data) => (data ? 1 : 0),
    integrated: false,
  },
];

// ── execution ──

async function createBinanceLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
  leverage?: number;
  marginMode?: string | null;
}): Promise<ExecutionFill> {
  const { buildBinanceOrderParams, ensureSymbolLeverage, prepareMarketOrderAmount } =
    await import("#/lib/trading/execution/exchange-order");
  const exchange = createTeacherExchange(
    "binanceFutures",
    input.credentials,
    input.executionMode ?? "live",
  );
  const symbol = normalizeSwapSymbol(input.symbol);
  await ensureSymbolLeverage(exchange, symbol, input.leverage);
  const amount = await prepareMarketOrderAmount(exchange, symbol, input.amount);
  const side = input.positionSide === "long" ? "buy" : "sell";
  const order = await exchange.createOrder(
    symbol,
    "market",
    side,
    amount,
    undefined,
    buildBinanceOrderParams(input.positionSide),
  );
  return {
    orderId: String(order.id),
    followOrderId: input.followOrderId,
    symbol: input.symbol,
    amount,
    positionSide: input.positionSide,
    openAvgPrice: order.average ?? order.price ?? 0,
    openTime: order.timestamp ?? Date.now(),
  };
}

async function closeBinanceLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  orderId: string;
  leverage?: number;
  marginMode?: string | null;
}): Promise<CloseFill> {
  const { buildBinanceOrderParams, ensureSymbolLeverage, prepareMarketOrderAmount } =
    await import("#/lib/trading/execution/exchange-order");
  const exchange = createTeacherExchange(
    "binanceFutures",
    input.credentials,
    input.executionMode ?? "live",
  );
  const symbol = normalizeSwapSymbol(input.symbol);
  await ensureSymbolLeverage(exchange, symbol, input.leverage);
  const amount = await prepareMarketOrderAmount(exchange, symbol, input.amount);
  const side = input.positionSide === "long" ? "sell" : "buy";
  await exchange.createOrder(
    symbol,
    "market",
    side,
    amount,
    undefined,
    buildBinanceOrderParams(input.positionSide),
  );
  return { orderId: input.orderId, closedAmount: amount, closeTime: Date.now() };
}

// ── teacher account ──

async function fetchBinanceTeacherAccount(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
}): Promise<TeacherAccountSnapshot> {
  const exchange = createTeacherExchange(
    "binanceFutures",
    input.credentials,
    input.executionMode ?? "live",
  );
  const [balance, positions] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions(),
  ]);
  const toNum = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : 0;
  const getUsdt = (key: "total" | "free") => {
    const val = balance[key as keyof typeof balance] as unknown;
    if (val && typeof val === "object") return toNum((val as Record<string, unknown>).USDT);
    return 0;
  };
  return {
    balance: toNum(balance.info?.totalWalletBalance ?? getUsdt("total")),
    equity: getUsdt("total") + toNum(balance.info?.totalUnrealizedProfit),
    freeUsdt: toNum(balance.info?.availableBalance ?? getUsdt("free")),
    unrealizedPnl: toNum(balance.info?.totalUnrealizedProfit),
    teacherPositions: mapCcxtPositionsToSnapshots(
      positions as unknown as Array<Record<string, unknown>>,
    ),
  };
}

// ── adapter ──

export const binanceAdapter: PlatformAdapter = {
  platform: "binanceFutures",
  displayName: "Binance",
  traderModel: BINANCE_TRADER_MODEL,
  headers: BINANCE_HEADERS,
  isSuccessCode: (payload) => (payload as { code?: string }).code === "000000",
  endpoints: BINANCE_ENDPOINTS,
  fetchLiveSnapshot: fetchBinanceSnapshot,
  fetchRankList: fetchBinanceFuturesRankList,
  inferProfile: fetchBinanceProfile,
  fetchDeepAnalysis: fetchBinanceDeepAnalysis,
  createLiveOrder: createBinanceLiveOrder,
  closeLiveOrder: closeBinanceLiveOrder,
  fetchTeacherAccount: fetchBinanceTeacherAccount,
  buildTraderLink: (traderId) =>
    `https://www.binance.com/zh-CN/copy-trading/lead-details/${encodeURIComponent(traderId)}`,
};
