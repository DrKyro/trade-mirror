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
import {
  BACKTEST_WINDOW_30D_MS,
  BACKTEST_WINDOW_90D_MS,
  resolveBacktestWindowCutoff,
} from "#/lib/trading/backtest-window";
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
  TraderHistoryPosition,
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

const BITGET_HEADERS: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  "accept-language": "zh-CN,zh;q=0.9",
  "content-type": "application/json;charset=UTF-8",
  lang: "zh-CN",
  website: "copy",
};

function bitgetHeaders(traderId: string): Record<string, string> {
  return {
    ...BITGET_HEADERS,
    Referer: `https://www.bitget.com/copy-trading/futures-trader-v1/${traderId}`,
  };
}

const BITGET_TRADER_MODEL: TraderPlatformModel = {
  platform: "bitget",
  displayName: "Bitget",
  sampleTraderId: "bdb34f7e8eb23e53a690",
  sections: [
    {
      id: "profile",
      label: "Profile",
      note: "Bitget still lacks a dedicated public profile endpoint in the adapter.",
      fields: [
        {
          id: "nickName",
          label: "Nickname",
          status: "partial",
          source: "historyList fallback",
          note: "Comes from recent history rows instead of a profile API.",
        },
        {
          id: "avatar",
          label: "Avatar",
          status: "partial",
          source: "historyList fallback",
          note: "Comes from recent history rows instead of a profile API.",
        },
        {
          id: "sign",
          label: "Signature",
          status: "missing",
          source: "not integrated",
          note: "Need the trader profile intro/signature field.",
          pageHint: "交易员主页顶部的简介/签名区域",
        },
        { id: "link", label: "Trader Link", status: "ready", source: "buildTraderLink" },
      ],
    },
    {
      id: "leaderboard",
      label: "Leaderboard Summary",
      fields: [
        { id: "yieldRatio", label: "Yield Ratio", status: "ready", source: "uta/traderView" },
        { id: "pnl", label: "PnL", status: "ready", source: "uta/traderView / cycleData" },
        { id: "aum", label: "AUM", status: "ready", source: "uta/traderView / cycleData" },
        {
          id: "followers",
          label: "Followers",
          status: "ready",
          source: "uta/traderView / cycleData",
        },
        {
          id: "maxDrawdown",
          label: "Max Drawdown",
          status: "ready",
          source: "uta/traderView / cycleData",
        },
        { id: "winRate", label: "Win Rate", status: "ready", source: "uta/traderView / cycleData" },
      ],
    },
    {
      id: "overview",
      label: "Deep Overview",
      fields: [
        {
          id: "balance",
          label: "Balance",
          status: "partial",
          source: "cycleData.statisticsDTO.aum",
          note: "Currently proxied from AUM; a true trader account balance endpoint would be better.",
          pageHint: "交易员主页资产/账户余额卡片",
        },
        {
          id: "monthlyAveragePositionValue",
          label: "Monthly Avg Position Value",
          status: "ready",
          source: "historyList derived",
        },
      ],
    },
    {
      id: "positions",
      label: "Current Positions",
      note: "Current implementation can degrade gracefully when credentials are absent.",
      fields: [
        {
          id: "positions",
          label: "Open Positions",
          status: "partial",
          source: "CCXT privateMixPostMixV1TraceReportOrderCurrentList",
          note: "Works with API credentials; still missing a reliable public fallback.",
          pageHint: "交易员主页当前持仓列表对应的公开接口",
        },
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
          source: "order/historyList",
        },
      ],
    },
    {
      id: "charts",
      label: "Charts",
      fields: [
        {
          id: "yieldCurve",
          label: "Yield Curve",
          status: "ready",
          source: "cycleData.roiRows + netProfitKlineDTO",
        },
      ],
    },
    {
      id: "extras",
      label: "Extra Stats",
      fields: [
        {
          id: "extraStats",
          label: "Metric Cards",
          status: "ready",
          source: "cycleData.statisticsDTO + pageScoreDTO",
        },
      ],
    },
  ],
};

// ── types ──

type BitgetTracePosition = {
  trackingNo: string;
  holdMode: string;
  leverage: string;
  holdSide: "long" | "short";
  symbol: string;
  openPrice: string;
  openTime: string;
  openAmount: string;
  marginAmount: string;
};

type BitgetCycleData = {
  statisticsDTO?: {
    aum?: string;
    maxRetracement?: string;
    profit?: string;
    profitRate?: string;
    winningRate?: string;
    totalTrades?: number;
    profitTrades?: number;
    lossTrades?: number;
    largestLoss?: string;
    largestProfit?: string;
    totalFollowers?: number;
    totalFollowProfit?: string;
  };
  pageScoreDTO?: {
    traderUserDetail?: {
      winRate?: string;
      profitFactor?: string;
      profitRate?: string;
      averageWin?: string;
      averageLoss?: string;
      totalProfit?: string;
      totalLoss?: string;
    };
  };
  pnlRows?: { rows?: Array<{ amount: string; dataTime: number }> };
  netProfitKlineDTO?: { rows?: Array<{ amount: string; dataTime: number }> };
  roiRows?: { rows?: Array<{ amount: string; dataTime: number }> };
};

type BitgetHistoryOrder = {
  orderNo: string;
  productCode: string;
  symbolDisplayName: string;
  openAvgPrice: string;
  closeAvgPrice: string;
  openTime: string;
  closeTime: string;
  netProfit: string;
  returnRate: string;
  openLevel: number;
  openDealCount: string;
  positionDesc: string;
  marginMode: number;
  teacherHeadPic?: string;
  teacherName?: string;
  displayName?: string;
};

type BitgetRankEntry = {
  traderUid: string;
  traderNickName: string;
  headPic?: string;
  followCount?: number;
  itemVoList?: Array<{
    showColumnCode: string;
    comparedValue?: string;
    showColumnDesc?: string;
  }>;
  klineProfit?: {
    rows?: Array<{ amount: string; dataTime: number }>;
  };
};

// ── positions (CCXT) ──

async function fetchBitgetPositions(traderId: string): Promise<PositionSnapshot[]> {
  const apiKey = process.env.BITGET_API_KEY;
  const apiSecret = process.env.BITGET_API_SECRET;
  const password = process.env.BITGET_API_PASSWORD;

  if (!apiKey || !apiSecret || !password) {
    throw new Error(
      "Bitget adapter requires BITGET_API_KEY / BITGET_API_SECRET / BITGET_API_PASSWORD",
    );
  }

  const exchange = new ccxt.bitget({
    apiKey,
    secret: apiSecret,
    password,
    options: { defaultType: "swap" },
  });

  const payload = (await exchange.privateMixPostMixV1TraceReportOrderCurrentList({
    traderId,
  })) as { code: string; data?: BitgetTracePosition[] };

  if (payload.code !== "00000") {
    throw new Error(`Bitget payload error: ${JSON.stringify(payload)}`);
  }

  return (payload.data ?? []).map((item) =>
    position({
      id: item.trackingNo,
      symbol: item.symbol,
      entryPrice: Number(item.openPrice),
      markPrice: null,
      amount: Number(item.openAmount),
      leverage: Number(item.leverage),
      openTime: Number(item.openTime),
      closeTime: null,
      margin: Number(item.marginAmount),
      marginMode: item.holdMode,
      pnl: null,
      pnlRatio: null,
      positionSide: item.holdSide,
      closeAvgPrice: null,
      contractValue: null,
    }),
  );
}

// ── cycle data ──

async function fetchBitgetCycleData(traderId: string): Promise<BitgetCycleData | null> {
  try {
    const result = await fetchJson<{ code: string; data?: BitgetCycleData }>(
      "https://www.bitget.com/v1/trigger/trace/public/cycleData",
      {
        method: "POST",
        headers: bitgetHeaders(traderId),
        body: { languageType: 0, triggerUserId: traderId, cycleTime: 90 },
        isSuccessCode: (p) => (p as { code?: string }).code === "00000",
      },
    );
    return result.data?.data ?? null;
  } catch {
    return null;
  }
}

// ── history orders ──

async function fetchBitgetHistoryOrders(
  traderId: string,
  cutoffTime: number | null,
): Promise<BitgetHistoryOrder[]> {
  const allOrders: BitgetHistoryOrder[] = [];
  const seenOrderIds = new Set<string>();

  for (let page = 1; ; page++) {
    try {
      const result = await fetchJson<{
        code: string;
        data?: { rows?: BitgetHistoryOrder[]; nextFlag?: boolean };
      }>("https://www.bitget.com/v1/trigger/trace/order/historyList", {
        method: "POST",
        headers: {
          ...BITGET_HEADERS,
          Referer: `https://www.bitget.com/copy-trading/futures-trader-v1/${traderId}/order`,
        },
        body: { languageType: 0, pageNo: page, pageSize: 50, traderUid: traderId },
        isSuccessCode: (p) => (p as { code?: string }).code === "00000",
      });

      const rows = result.data?.data?.rows;
      if (!rows) break;

      let addedRows = 0;
      for (const row of rows) {
        if (seenOrderIds.has(row.orderNo)) continue;
        seenOrderIds.add(row.orderNo);
        allOrders.push(row);
        addedRows += 1;
      }

      const oldestEffectiveTime = rows.reduce<number | null>((oldest, row) => {
        const effectiveTime = finiteOrNull(row.closeTime) ?? finiteOrNull(row.openTime);
        if (effectiveTime === null) return oldest;
        return oldest === null ? effectiveTime : Math.min(oldest, effectiveTime);
      }, null);
      const reachedCutoff =
        cutoffTime !== null && oldestEffectiveTime !== null && oldestEffectiveTime < cutoffTime;

      if (!result.data?.data?.nextFlag || rows.length < 50 || addedRows === 0 || reachedCutoff)
        break;

      await paginateDelay();
    } catch {
      break;
    }
  }

  return allOrders;
}

// ── derivation ──

function deriveBalance(cycleData: BitgetCycleData | null): number | null {
  if (!cycleData?.statisticsDTO?.aum) return null;
  return finiteOrNull(cycleData.statisticsDTO.aum);
}

function deriveThreeMonthMaxDrawdown(cycleData: BitgetCycleData | null): number | null {
  if (!cycleData?.statisticsDTO?.maxRetracement) return null;
  const maxRetracement = finiteOrNull(cycleData.statisticsDTO.maxRetracement);
  if (maxRetracement === null) return null;
  return -maxRetracement;
}

function deriveMonthlyAvgPositionValue(history: BitgetHistoryOrder[]): number | null {
  const cutoff = Date.now() - BACKTEST_WINDOW_30D_MS;
  const notionals = history
    .map((order) => {
      const closeTime = finiteOrNull(order.closeTime);
      const openTime = finiteOrNull(order.openTime);
      const effectiveTime = closeTime ?? openTime;
      if (effectiveTime === null || effectiveTime < cutoff) return null;
      const entryPrice = finiteOrNull(order.openAvgPrice);
      const contracts = finiteOrNull(order.openDealCount);
      if (entryPrice === null || contracts === null) return null;
      return Math.abs(entryPrice * contracts);
    })
    .filter((v): v is number => v !== null);
  if (notionals.length === 0) return null;
  return notionals.reduce((sum, v) => sum + v, 0) / notionals.length;
}

function mapHistoryPositions(history: BitgetHistoryOrder[]): TraderHistoryPosition[] {
  return history
    .map((order) => {
      const entryPrice = finiteOrNull(order.openAvgPrice);
      const closePrice = finiteOrNull(order.closeAvgPrice);
      const contracts = finiteOrNull(order.openDealCount);
      const leverage = finiteOrNull(order.openLevel);
      if (entryPrice === null || closePrice === null || contracts === null || leverage === null)
        return null;

      const side: PositionSide =
        order.positionDesc.includes("\u7a7a\u4ed3") ||
        order.positionDesc.toLowerCase().includes("short")
          ? "short"
          : "long";

      const result: TraderHistoryPosition = {
        id: order.orderNo,
        symbol: order.productCode || order.symbolDisplayName,
        side,
        leverage,
        amount: Math.abs(contracts),
        entryPrice,
        closePrice,
        openTime: finiteOrNull(order.openTime),
        closeTime: finiteOrNull(order.closeTime),
        profit: finiteOrNull(order.netProfit),
        profitRate:
          finiteOrNull(order.returnRate) !== null ? finiteOrNull(order.returnRate)! / 100 : null,
        contractValue: null,
        source: "bitget",
      };
      return result;
    })
    .filter((item): item is TraderHistoryPosition => item !== null)
    .sort((a, b) => {
      const at = a.closeTime ?? a.openTime ?? 0;
      const bt = b.closeTime ?? b.openTime ?? 0;
      return bt - at;
    });
}

function createBitgetMetric(
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

function buildBitgetYieldCurve(
  cycleData: BitgetCycleData | null,
): TraderDeepAnalysis["yieldCurve"] {
  const roiRows = cycleData?.roiRows?.rows ?? [];
  const pnlRows = cycleData?.netProfitKlineDTO?.rows ?? cycleData?.pnlRows?.rows ?? [];
  const pnlByTime = new Map<number, number>();

  for (const row of pnlRows) {
    const time = finiteOrNull(row.dataTime);
    const pnl = finiteOrNull(row.amount);
    if (time === null || pnl === null) continue;
    pnlByTime.set(time, pnl);
  }

  return roiRows
    .map((row) => {
      const time = finiteOrNull(row.dataTime);
      const ratio = finiteOrNull(row.amount);
      if (time === null || ratio === null) return null;
      return {
        time,
        ratio: ratio / 100,
        pnl: pnlByTime.get(time) ?? 0,
      };
    })
    .filter((item): item is TraderDeepAnalysis["yieldCurve"][number] => item !== null);
}

function buildBitgetExtraStats(
  cycleData: BitgetCycleData | null,
): TraderDeepAnalysis["extraStats"] {
  const stats = cycleData?.statisticsDTO;
  const detail = cycleData?.pageScoreDTO?.traderUserDetail;

  return {
    nonPeriodicPart: [
      createBitgetMetric("totalFollowers", "总跟随人数", stats?.totalFollowers, 1, "2"),
      createBitgetMetric("totalFollowProfit", "跟单者收益 (USDT)", stats?.totalFollowProfit, 2),
      createBitgetMetric("largestProfit", "最大单笔盈利 (USDT)", stats?.largestProfit, 3),
      createBitgetMetric("largestLoss", "最大单笔亏损 (USDT)", stats?.largestLoss, 4),
      createBitgetMetric("averageWin", "平均盈利 (USDT)", detail?.averageWin, 5),
      createBitgetMetric("averageLoss", "平均亏损 (USDT)", detail?.averageLoss, 6),
    ].filter(
      (item): item is TraderDeepAnalysis["extraStats"]["nonPeriodicPart"][number] => item !== null,
    ),
    periodicPart: [
      createBitgetMetric("totalTrades", "总交易次数", stats?.totalTrades, 1, "2"),
      createBitgetMetric("profitTrades", "盈利次数", stats?.profitTrades, 2, "2"),
      createBitgetMetric("lossTrades", "亏损次数", stats?.lossTrades, 3, "2"),
      createBitgetMetric("winningRate", "胜率", stats?.winningRate, 4, "1"),
      createBitgetMetric("profitFactor", "盈亏比", detail?.profitFactor, 5, "3"),
      createBitgetMetric("profitRate", "利润/亏损比", detail?.profitRate, 6, "3"),
    ].filter(
      (item): item is TraderDeepAnalysis["extraStats"]["periodicPart"][number] => item !== null,
    ),
  };
}

async function fetchBitgetDeepAnalysis(
  traderId: string,
  options?: FetchTraderDeepAnalysisOptions,
): Promise<TraderDeepAnalysis> {
  const historyCutoffTime = resolveHistoryCutoffTime(options?.historyWindow);
  const [positions, cycleData, history] = await Promise.all([
    fetchBitgetPositions(traderId).catch(() => []),
    fetchBitgetCycleData(traderId),
    fetchBitgetHistoryOrders(traderId, historyCutoffTime),
  ]);

  const stats = cycleData?.statisticsDTO;
  const historyPositions = mapHistoryPositions(history).map((item) => ({
    id: item.id,
    symbol: item.symbol,
    side: item.side,
    leverage: item.leverage,
    amount: item.amount,
    entryPrice: item.entryPrice,
    closePrice: item.closePrice,
    openTime: item.openTime,
    closeTime: item.closeTime,
    profit: item.profit,
    profitRate: item.profitRate,
  }));
  const yieldCurve = buildBitgetYieldCurve(cycleData);
  const latestYieldPoint = yieldCurve.at(-1) ?? null;
  const profileSource = history[0] ?? null;

  return {
    traderId,
    uniqueName: traderId,
    nickName: profileSource?.teacherName ?? profileSource?.displayName ?? traderId,
    avatar: profileSource?.teacherHeadPic ?? "",
    sign: "",
    platform: "bitget",
    link: `https://www.bitget.com/copy-trading/futures/${traderId}`,
    balance: deriveBalance(cycleData),
    yieldRatio:
      (finiteOrNull(stats?.profitRate) ?? latestYieldPoint?.ratio ?? null) === null
        ? null
        : (finiteOrNull(stats?.profitRate) ?? latestYieldPoint?.ratio ?? 0) /
          (finiteOrNull(stats?.profitRate) !== null ? 100 : 1),
    pnl: finiteOrNull(stats?.profit) ?? latestYieldPoint?.pnl ?? null,
    aum: finiteOrNull(stats?.aum),
    followers: stats?.totalFollowers ?? null,
    maxDrawdown:
      finiteOrNull(stats?.maxRetracement) !== null
        ? finiteOrNull(stats?.maxRetracement)! / 100
        : null,
    winRate:
      finiteOrNull(stats?.winningRate) !== null ? finiteOrNull(stats?.winningRate)! / 100 : null,
    monthlyAveragePositionValue: deriveMonthlyAvgPositionValue(history),
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
    extraStats: buildBitgetExtraStats(cycleData),
  };
}

// ── snapshot ──

async function fetchBitgetSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot> {
  const historyCutoffTime = Date.now() - BACKTEST_WINDOW_90D_MS;
  const [positions, cycleData, history] = await Promise.all([
    fetchBitgetPositions(trader.id),
    fetchBitgetCycleData(trader.id),
    fetchBitgetHistoryOrders(trader.id, historyCutoffTime),
  ]);

  const balance = deriveBalance(cycleData);
  const threeMonthMaxDrawdown = deriveThreeMonthMaxDrawdown(cycleData);
  const monthlyAveragePositionValue = deriveMonthlyAvgPositionValue(history);

  const traderPatch: Partial<TraderRecord> = {
    ...(balance !== null ? { balance } : {}),
    ...(threeMonthMaxDrawdown !== null ? { threeMonthMaxDrawdown } : {}),
    ...(monthlyAveragePositionValue !== null ? { monthlyAveragePositionValue } : {}),
    historyPositions: mapHistoryPositions(history),
  };

  return { positions, traderPatch };
}

// ── rank ──

const BITGET_SORT_MAP: Record<RankSortBy, number> = {
  yieldRatio: 2,
  pnl: 3,
  aum: 4,
  followers: 5,
  maxDrawdown: 6,
  winRate: 1,
};

const BITGET_TIME_MAP: Record<RankTimeRange, number> = {
  "7": 7,
  "30": 30,
  "90": 90,
};

function bitgetItemValue(entry: BitgetRankEntry, code: string): number | null {
  const item = entry.itemVoList?.find((i) => i.showColumnCode === code);
  if (!item?.comparedValue) return null;
  const n = Number(item.comparedValue);
  return Number.isFinite(n) ? n : null;
}

async function fetchBitgetRankList(query: TraderRankQuery): Promise<TraderRankResult> {
  const result = await fetchJson<{
    code: string;
    msg?: string;
    data?: { rows: BitgetRankEntry[]; maxShowSizes: number };
  }>("https://www.bitget.com/v1/trigger/public/uta/traderView", {
    method: "POST",
    headers: {
      accept: "application/json",
      "accept-language": "zh-CN,zh;q=0.9",
      "content-type": "application/json;charset=UTF-8",
      lang: "zh-CN",
      Referer: "https://www.bitget.com/copy-trading/futures",
    },
    body: {
      languageType: 0,
      pageNo: query.page,
      pageSize: query.pageSize,
      sortRule: BITGET_SORT_MAP[query.sortBy],
      sortFlag: 0,
      dataCycle: BITGET_TIME_MAP[query.timeRange],
      fullStatus: 1,
    },
    isSuccessCode: (p) => (p as { code?: string }).code === "200",
  });

  const rows = result.data?.data?.rows ?? [];
  const total = result.data?.data?.maxShowSizes ?? 0;

  const items: TraderRankItem[] = rows.map((entry) => ({
    traderId: entry.traderUid,
    uniqueName: entry.traderUid,
    nickName: entry.traderNickName,
    avatar: entry.headPic ?? "",
    sign: "",
    platform: "bitget",
    yieldRatio: (bitgetItemValue(entry, "profit_rate") ?? 0) / 100,
    pnl: bitgetItemValue(entry, "total_income") ?? 0,
    aum: bitgetItemValue(entry, "total_follow_trade_amount") ?? 0,
    followers: entry.followCount ?? 0,
    maxDrawdown:
      bitgetItemValue(entry, "max_retracement") !== null
        ? bitgetItemValue(entry, "max_retracement")! / 100
        : null,
    winRate:
      bitgetItemValue(entry, "winning_rate") !== null
        ? bitgetItemValue(entry, "winning_rate")! / 100
        : null,
    instNum: null,
    link: `https://www.bitget.com/copy-trading/futures/${entry.traderUid}`,
    yieldCurve: (entry.klineProfit?.rows ?? []).map((r) => Number(r.amount) / 100),
  }));

  return { items, total, platform: "bitget" };
}

// ── endpoint definitions ──

const BITGET_ENDPOINTS: EndpointDefinition[] = [
  {
    id: "bitget-rank",
    name: "traderView (排行榜)",
    method: "POST",
    buildUrl: () => "https://www.bitget.com/v1/trigger/public/uta/traderView",
    buildBody: () => ({
      languageType: 0,
      pageNo: 1,
      pageSize: 5,
      sortRule: 2,
      sortFlag: 0,
      dataCycle: 30,
      fullStatus: 1,
    }),
    extraHeaders: {
      accept: "application/json",
      "content-type": "application/json;charset=UTF-8",
      lang: "zh-CN",
      Referer: "https://www.bitget.com/copy-trading/futures",
    },
    extractCount: (data) => {
      const obj = data as { rows?: unknown[] };
      return obj?.rows?.length ?? null;
    },
    integrated: true,
  },
  {
    id: "bitget-cycle-data",
    name: "cycleData (周期数据)",
    method: "POST",
    buildUrl: () => "https://www.bitget.com/v1/trigger/trace/public/cycleData",
    buildBody: (p) => ({ languageType: 0, triggerUserId: String(p.traderId), cycleTime: 90 }),
    extraHeaders: { ...BITGET_HEADERS },
    extractCount: (data) => (data ? 1 : 0),
    integrated: true,
  },
  {
    id: "bitget-history-list",
    name: "order/historyList (历史订单)",
    method: "POST",
    buildUrl: () => "https://www.bitget.com/v1/trigger/trace/order/historyList",
    buildBody: (p) => ({ languageType: 0, pageNo: 1, pageSize: 10, traderUid: String(p.traderId) }),
    extraHeaders: { ...BITGET_HEADERS },
    extractCount: (data) => {
      const obj = data as { rows?: unknown[] };
      return obj?.rows?.length ?? null;
    },
    integrated: true,
  },
];

// ── execution ──

async function createBitgetLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}): Promise<ExecutionFill> {
  const exchange = createTeacherExchange(
    "bitget",
    input.credentials,
    input.executionMode ?? "live",
  );
  const marketSide = input.positionSide === "long" ? "buy" : "sell";
  const order = await exchange.createMarketOrder(
    normalizeSwapSymbol(input.symbol),
    marketSide,
    input.amount,
  );
  return {
    orderId: String(order.id),
    followOrderId: input.followOrderId,
    symbol: input.symbol,
    amount: input.amount,
    positionSide: input.positionSide,
    openAvgPrice: order.average ?? order.price ?? 0,
    openTime: order.timestamp ?? Date.now(),
  };
}

async function closeBitgetLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  orderId: string;
}): Promise<CloseFill> {
  const exchange = createTeacherExchange(
    "bitget",
    input.credentials,
    input.executionMode ?? "live",
  );
  const marketSide = input.positionSide === "long" ? "sell" : "buy";
  await exchange.createMarketOrder(normalizeSwapSymbol(input.symbol), marketSide, input.amount);
  return { orderId: input.orderId, closedAmount: input.amount, closeTime: Date.now() };
}

// ── teacher account ──

async function fetchBitgetTeacherAccount(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
}): Promise<TeacherAccountSnapshot> {
  const exchange = createTeacherExchange(
    "bitget",
    input.credentials,
    input.executionMode ?? "live",
  );
  const [balance, positions] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions(),
  ]);
  const usdtInfo = Array.isArray(balance.info) ? balance.info[0] : null;
  const toNum = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : 0;
  const getUsdt = (key: "total" | "free") => {
    const val = balance[key as keyof typeof balance] as unknown;
    if (val && typeof val === "object") return toNum((val as Record<string, unknown>).USDT);
    return 0;
  };
  return {
    balance: getUsdt("total"),
    equity: toNum(usdtInfo?.usdtEquity ?? getUsdt("total")),
    freeUsdt: toNum(usdtInfo?.crossMaxAvailable ?? getUsdt("free")),
    unrealizedPnl: toNum(usdtInfo?.unrealizedPL),
    teacherPositions: mapCcxtPositionsToSnapshots(
      positions as unknown as Array<Record<string, unknown>>,
    ),
  };
}

// ── adapter ──

export const bitgetAdapter: PlatformAdapter = {
  platform: "bitget",
  displayName: "Bitget",
  traderModel: BITGET_TRADER_MODEL,
  headers: BITGET_HEADERS,
  isSuccessCode: (payload) => (payload as { code?: string }).code === "00000",
  endpoints: BITGET_ENDPOINTS,
  fetchLiveSnapshot: fetchBitgetSnapshot,
  fetchRankList: fetchBitgetRankList,
  fetchDeepAnalysis: fetchBitgetDeepAnalysis,
  createLiveOrder: createBitgetLiveOrder,
  closeLiveOrder: closeBitgetLiveOrder,
  fetchTeacherAccount: fetchBitgetTeacherAccount,
  buildTraderLink: (traderId) =>
    `https://www.bitget.com/zh-CN/copytrading/trader/${traderId}/futures`,
};
