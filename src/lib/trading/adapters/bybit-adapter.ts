import "@tanstack/react-start/server-only";
import { fetchBybitPositionsWithBrowserFallback } from "#/lib/trading/adapters/bybit-browser-fallback";
import { BybitRuntimeError } from "#/lib/trading/adapters/bybit-runtime";
import { fetchJson } from "#/lib/trading/adapters/fetch-utils";
import type {
  EndpointDefinition,
  PlatformAdapter,
  TeacherAccountSnapshot,
  TraderLiveSnapshot,
} from "#/lib/trading/adapters/platform-adapter";
import {
  mapCcxtPositionsToSnapshots,
  normalizeSwapSymbol,
} from "#/lib/trading/adapters/shared-utils";
import { createTeacherExchange } from "#/lib/trading/exchange-client";
import type { TraderPlatformModel } from "#/lib/trading/trader-data-model";
import type {
  RankSortBy,
  RankTimeRange,
  TraderRankItem,
  TraderRankQuery,
  TraderRankResult,
} from "#/lib/trading/trader-rank-types";
import type {
  CloseFill,
  ExecutionFill,
  ExecutionMode,
  PositionSide,
  PositionSnapshot,
  TeacherCredentials,
  TraderRecord,
} from "#/lib/trading/types";

function position(input: PositionSnapshot): PositionSnapshot {
  return { ...input };
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0) return Number(value);
  return 0;
}

const BYBIT_HEADERS: Record<string, string> = {
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/json",
  lang: "en-us",
  platform: "pc",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://www.bybit.com/",
};

const BYBIT_TRADER_MODEL: TraderPlatformModel = {
  platform: "bybit",
  displayName: "Bybit",
  sampleTraderId: "test",
  sections: [
    {
      id: "profile",
      label: "Profile",
      note: "Bybit trader profile metadata is not yet integrated.",
      fields: [
        {
          id: "nickName",
          label: "Nickname",
          status: "missing",
          source: "not integrated",
          pageHint: "交易员详情页顶部昵称字段",
        },
        {
          id: "avatar",
          label: "Avatar",
          status: "missing",
          source: "not integrated",
          pageHint: "交易员详情页头像图片字段",
        },
        {
          id: "sign",
          label: "Signature",
          status: "missing",
          source: "not integrated",
          pageHint: "交易员详情页简介/签名区域",
        },
        { id: "link", label: "Trader Link", status: "ready", source: "buildTraderLink" },
      ],
    },
    {
      id: "leaderboard",
      label: "Leaderboard Summary",
      fields: [
        { id: "yieldRatio", label: "Yield Ratio", status: "ready", source: "dynamic-leader-list" },
        { id: "pnl", label: "PnL", status: "ready", source: "dynamic-leader-list" },
        { id: "aum", label: "AUM", status: "ready", source: "dynamic-leader-list" },
        { id: "followers", label: "Followers", status: "ready", source: "dynamic-leader-list" },
        {
          id: "maxDrawdown",
          label: "Max Drawdown",
          status: "ready",
          source: "dynamic-leader-list",
        },
        { id: "winRate", label: "Win Rate", status: "ready", source: "dynamic-leader-list" },
      ],
    },
    {
      id: "overview",
      label: "Deep Overview",
      note: "No deep analysis API is connected for Bybit yet.",
      fields: [
        {
          id: "balance",
          label: "Balance",
          status: "missing",
          source: "not integrated",
          pageHint: "交易员主页资产/账户余额区域",
        },
        {
          id: "monthlyAveragePositionValue",
          label: "Monthly Avg Position Value",
          status: "missing",
          source: "not integrated",
          pageHint: "交易员历史仓位或统计卡片",
        },
      ],
    },
    {
      id: "positions",
      label: "Current Positions",
      note: "Public API is flaky and often requires authenticated browsing fallback.",
      fields: [
        {
          id: "positions",
          label: "Open Positions",
          status: "partial",
          source: "order/list-detail + browser fallback",
          note: "Health probe can still be blocked by edge access controls.",
          pageHint: "网页网络请求里当前持仓列表接口",
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
          status: "missing",
          source: "not integrated",
          pageHint: "交易员历史仓位/历史订单列表接口",
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
          status: "missing",
          source: "not integrated",
          pageHint: "交易员收益率曲线接口",
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
          status: "missing",
          source: "not integrated",
          pageHint: "交易员详情页顶部统计卡片接口",
        },
      ],
    },
  ],
};

// ── types ──

type BybitLeaderboardPosition = {
  symbol: string;
  entryPrice: string;
  side: "Buy" | "Sell";
  leverageE2: string;
  transactTimeE3: string;
  positionEntryPrice: string;
  closeFreeQtyX: string;
  orderCostE8: string;
  isIsolated: boolean;
};

type BybitRankEntry = {
  leaderId: string;
  nickname?: string;
  avatar?: string;
  roi?: number;
  pnl?: number;
  aum?: number;
  maxDrawDown?: number;
  winRate?: number;
  followerCount?: number;
};

// ── positions ──

async function fetchBybitPositions(traderId: string): Promise<PositionSnapshot[]> {
  const headers: Record<string, string> = { ...BYBIT_HEADERS };

  if (process.env.BYBIT_API_USERTOKEN) {
    headers.usertoken = process.env.BYBIT_API_USERTOKEN;
  }
  if (process.env.BYBIT_API_COOKIE) {
    headers.cookie = process.env.BYBIT_API_COOKIE;
  }

  const result = await fetchJson<{
    retCode: number;
    retMsg?: string;
    result?: {
      openTradeInfoProtection?: number;
      data?: BybitLeaderboardPosition[];
    };
  }>(
    `https://api2.bybit.com/fapi/beehive/public/v1/common/order/list-detail?leaderMark=${encodeURIComponent(traderId)}&pageSize=100&page=1`,
    { headers, isSuccessCode: (p) => (p as { retCode?: number }).retCode === 0 },
  );

  if (result.data?.result?.openTradeInfoProtection === 1) {
    throw new Error(
      "Bybit trader data requires authenticated browsing. Falling back to browser fetch.",
    );
  }

  return (result.data?.result?.data ?? []).map((item) => {
    const side: PositionSide = item.side === "Sell" ? "short" : "long";
    const amount = numberFromUnknown(item.closeFreeQtyX) / 10 ** 8;
    const leverage = numberFromUnknown(item.leverageE2) / 100;
    const entryPrice = numberFromUnknown(item.positionEntryPrice || item.entryPrice);
    const margin = numberFromUnknown(item.orderCostE8) / 10 ** 8;

    return position({
      id: `${item.symbol}_${item.transactTimeE3}`,
      symbol: item.symbol,
      entryPrice,
      markPrice: null,
      amount,
      leverage,
      openTime: numberFromUnknown(item.transactTimeE3),
      closeTime: null,
      margin,
      marginMode: item.isIsolated ? "isolated" : "cross",
      pnl: null,
      pnlRatio: null,
      positionSide: side,
      closeAvgPrice: null,
      contractValue: null,
    });
  });
}

function normalizeBybitPositionsFromBrowserPayload(data: unknown[]): PositionSnapshot[] {
  return data.map((item) => {
    const candidate = item as BybitLeaderboardPosition;
    const side: PositionSide = candidate.side === "Sell" ? "short" : "long";
    const amount = numberFromUnknown(candidate.closeFreeQtyX) / 10 ** 8;
    const leverage = numberFromUnknown(candidate.leverageE2) / 100;
    const entryPrice = numberFromUnknown(candidate.positionEntryPrice || candidate.entryPrice);
    const margin = numberFromUnknown(candidate.orderCostE8) / 10 ** 8;

    return position({
      id: `${candidate.symbol}_${candidate.transactTimeE3}`,
      symbol: candidate.symbol,
      entryPrice,
      markPrice: null,
      amount,
      leverage,
      openTime: numberFromUnknown(candidate.transactTimeE3),
      closeTime: null,
      margin,
      marginMode: candidate.isIsolated ? "isolated" : "cross",
      pnl: null,
      pnlRatio: null,
      positionSide: side,
      closeAvgPrice: null,
      contractValue: null,
    });
  });
}

// ── snapshot ──

async function fetchBybitSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot> {
  try {
    return { positions: await fetchBybitPositions(trader.id) };
  } catch {
    let browserData: unknown[];
    try {
      browserData = await fetchBybitPositionsWithBrowserFallback(trader.id);
    } catch (error) {
      if (error instanceof BybitRuntimeError && error.report.traderId === "unknown") {
        throw new BybitRuntimeError({
          ...error.report,
          traderId: trader.id,
        });
      }
      throw error;
    }
    return { positions: normalizeBybitPositionsFromBrowserPayload(browserData) };
  }
}

// ── rank ──

const BYBIT_TIME_MAP: Record<RankTimeRange, string> = {
  "7": "DATA_DURATION_SEVEN_DAY",
  "30": "DATA_DURATION_30_DAY",
  "90": "DATA_DURATION_90_DAY",
};

async function fetchBybitRankList(query: TraderRankQuery): Promise<TraderRankResult> {
  const params = new URLSearchParams({
    pageNo: String(query.page),
    pageSize: String(query.pageSize),
    dataDuration: BYBIT_TIME_MAP[query.timeRange],
    userTag: "",
    leaderTag: "",
    code: "",
    leaderLevel: "",
  });

  const result = await fetchJson<{
    retCode: number;
    retMsg?: string;
    result?: { list: BybitRankEntry[]; total: number };
  }>(
    `https://api2.bybit.com/fapi/beehive/public/v1/common/dynamic-leader-list?${params.toString()}`,
    {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "accept-language": "en-US,en;q=0.9",
        lang: "zh-CN",
        platform: "pc",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Referer: "https://www.bybit.com/zh-MY/copyTrade/",
      },
      isSuccessCode: (p) => (p as { retCode?: number }).retCode === 0,
    },
  );

  const list = result.data?.result?.list ?? [];
  const total = result.data?.result?.total ?? 0;

  const items: TraderRankItem[] = list.map((entry) => ({
    traderId: entry.leaderId,
    uniqueName: entry.leaderId,
    nickName: entry.nickname ?? entry.leaderId,
    avatar: entry.avatar ?? "",
    sign: "",
    platform: "bybit",
    yieldRatio: (entry.roi ?? 0) / 100,
    pnl: entry.pnl ?? 0,
    aum: entry.aum ?? 0,
    followers: entry.followerCount ?? 0,
    maxDrawdown: entry.maxDrawDown !== undefined ? entry.maxDrawDown / 100 : null,
    winRate: entry.winRate !== undefined ? entry.winRate / 100 : null,
    instNum: null,
    link: `https://www.bybit.com/copyTrade/detail/${entry.leaderId}`,
    yieldCurve: [],
  }));

  return { items, total, platform: "bybit" };
}

// ── endpoint definitions ──

const BYBIT_ENDPOINTS: EndpointDefinition[] = [
  {
    id: "bybit-rank",
    name: "dynamic-leader-list (排行榜)",
    method: "GET",
    buildUrl: () =>
      `https://api2.bybit.com/fapi/beehive/public/v1/common/dynamic-leader-list?pageNo=1&pageSize=5&leaderLevel=&sortField=roi&t=${Date.now()}`,
    extraHeaders: { ...BYBIT_HEADERS, Referer: "https://www.bybit.com/zh-MY/copyTrade/" },
    extractCount: (data) => {
      const obj = data as { list?: unknown[] };
      return obj?.list?.length ?? null;
    },
    integrated: true,
  },
  {
    id: "bybit-position",
    name: "order/list-detail (当前持仓)",
    method: "GET",
    buildUrl: (p) =>
      `https://api2.bybit.com/fapi/beehive/public/v1/common/order/list-detail?leaderMark=${encodeURIComponent(String(p.traderId))}&pageSize=10&page=1`,
    extraHeaders: { ...BYBIT_HEADERS },
    extractCount: (data) => {
      const obj = data as { data?: unknown[] };
      return obj?.data?.length ?? null;
    },
    integrated: true,
  },
];

// ── teacher account / execution ──

async function createBybitLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}): Promise<ExecutionFill> {
  const exchange = createTeacherExchange("bybit", input.credentials, input.executionMode ?? "live");
  const side = input.positionSide === "long" ? "buy" : "sell";
  const order = await exchange.createMarketOrder(
    normalizeSwapSymbol(input.symbol),
    side,
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

async function closeBybitLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  orderId: string;
}): Promise<CloseFill> {
  const exchange = createTeacherExchange("bybit", input.credentials, input.executionMode ?? "live");
  const side = input.positionSide === "long" ? "sell" : "buy";
  await exchange.createMarketOrder(normalizeSwapSymbol(input.symbol), side, input.amount);
  return { orderId: input.orderId, closedAmount: input.amount, closeTime: Date.now() };
}

async function fetchBybitTeacherAccount(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
}): Promise<TeacherAccountSnapshot> {
  const exchange = createTeacherExchange("bybit", input.credentials, input.executionMode ?? "live");
  const [balance, positions] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions(),
  ]);
  const toNum = (value: unknown) =>
    typeof value === "number" ? value : typeof value === "string" && value ? Number(value) : 0;
  const getUsdt = (key: "total" | "free") => {
    const val = balance[key as keyof typeof balance] as unknown;
    if (val && typeof val === "object") {
      return toNum((val as Record<string, unknown>).USDT);
    }
    return 0;
  };

  const teacherPositions = mapCcxtPositionsToSnapshots(
    positions as unknown as Array<Record<string, unknown>>,
  );
  const unrealizedPnl = teacherPositions.reduce((sum, position) => sum + (position.pnl ?? 0), 0);

  return {
    balance: getUsdt("total"),
    equity: getUsdt("total") + unrealizedPnl,
    freeUsdt: getUsdt("free"),
    unrealizedPnl,
    teacherPositions,
  };
}

// ── adapter ──

export const bybitAdapter: PlatformAdapter = {
  platform: "bybit",
  displayName: "Bybit",
  traderModel: BYBIT_TRADER_MODEL,
  headers: BYBIT_HEADERS,
  isSuccessCode: (payload) => (payload as { retCode?: number }).retCode === 0,
  endpoints: BYBIT_ENDPOINTS,
  fetchLiveSnapshot: fetchBybitSnapshot,
  fetchRankList: fetchBybitRankList,
  createLiveOrder: createBybitLiveOrder,
  closeLiveOrder: closeBybitLiveOrder,
  fetchTeacherAccount: fetchBybitTeacherAccount,
  buildTraderLink: (traderId) =>
    `https://www.bybit.com/copyTrade/trade-center/detail?leaderMark=${encodeURIComponent(traderId)}`,
};
