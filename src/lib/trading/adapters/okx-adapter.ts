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
// ── shared utils ──
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

function normalizeSymbol(instId: string) {
  if (!instId.includes("-")) return instId;
  const [base, quote] = instId.split("-");
  return `${base}${quote}`;
}

function finiteOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function findMetric(metrics: OkxTradeDataMetric[], functionId: string) {
  return metrics.find((metric) => metric.functionId === functionId);
}

function metricValueAsNumber(metric: OkxTradeDataMetric | undefined) {
  return finiteOrNull(metric?.value);
}

function position(input: PositionSnapshot): PositionSnapshot {
  return { ...input };
}

// ── headers ──

function okxHeaders(traderId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "accept-language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    "app-type": "web",
    devId: process.env.OKX_DEVID ?? "95829674-6cd6-4909-a00e-d4ebd89d7a71",
    "sec-ch-ua": '"Chromium";v="149", "Not)A;Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-cdn": "https://www.okx.com",
    "x-locale": "zh_CN",
    "x-utc": "8",
    "x-zkdex-env": "0",
    Referer: traderId
      ? `https://www.okx.com/zh-hans/copy-trading/account/${traderId}`
      : "https://www.okx.com/zh-hans/copy-trading",
  };

  if (process.env.OKX_AUTHORIZATION) {
    headers.authorization = process.env.OKX_AUTHORIZATION;
  }
  if (process.env.OKX_X_CLIENT_SIGNATURE) {
    headers["x-client-signature"] = process.env.OKX_X_CLIENT_SIGNATURE;
  }
  if (process.env.OKX_X_CLIENT_SIGNATURE_VERSION) {
    headers["x-client-signature-version"] = process.env.OKX_X_CLIENT_SIGNATURE_VERSION;
  }
  if (process.env.OKX_X_REQUEST_TIMESTAMP) {
    headers["x-request-timestamp"] = process.env.OKX_X_REQUEST_TIMESTAMP;
  }
  if (process.env.OKX_X_SITE_INFO) {
    headers["x-site-info"] = process.env.OKX_X_SITE_INFO;
  }
  if (process.env.OKX_COOKIE) {
    headers.cookie = process.env.OKX_COOKIE;
  }

  return headers;
}

const OKX_BASE = "https://www.okx.com/priapi/v5/ecotrade/public";

const OKX_TRADER_MODEL: TraderPlatformModel = {
  platform: "okx",
  displayName: "OKX",
  sampleTraderId: "721A7DFF5AE7AA8C",
  sections: [
    {
      id: "profile",
      label: "Profile",
      fields: [
        { id: "nickName", label: "Nickname", status: "ready", source: "basic-info" },
        { id: "avatar", label: "Avatar", status: "ready", source: "basic-info" },
        { id: "sign", label: "Signature", status: "ready", source: "basic-info" },
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
          source: "follow-rank / trade-stat",
        },
        { id: "pnl", label: "PnL", status: "ready", source: "follow-rank / trade-stat" },
        { id: "aum", label: "AUM", status: "ready", source: "follow-rank / trade-stat" },
        {
          id: "followers",
          label: "Followers",
          status: "ready",
          source: "follow-rank / trade-data",
        },
        {
          id: "maxDrawdown",
          label: "Max Drawdown",
          status: "ready",
          source: "follow-rank / trade-stat",
        },
        { id: "winRate", label: "Win Rate", status: "ready", source: "follow-rank / trade-stat" },
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
          source: "trade-data asset / yield-pnl",
        },
        {
          id: "monthlyAveragePositionValue",
          label: "Monthly Avg Position Value",
          status: "ready",
          source: "trade-data avgPositionValue / position-history",
        },
      ],
    },
    {
      id: "positions",
      label: "Current Positions",
      fields: [
        { id: "positions", label: "Open Positions", status: "ready", source: "position-detail" },
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
      fields: [{ id: "yieldCurve", label: "Yield Curve", status: "ready", source: "yield-pnl" }],
    },
    {
      id: "extras",
      label: "Extra Stats",
      fields: [
        { id: "extraStats", label: "Metric Cards", status: "ready", source: "trader/trade-data" },
      ],
    },
  ],
};

// ── types ──

type OkxPosition = {
  tradeItemId: string;
  instId: string;
  openAvgPx: string;
  markPx: string;
  margin: string;
  lever: string;
  openTime: string | null;
  closeTime: string | null;
  mgnMode: string | null;
  pnl: string | null;
  pnlRatio: string | null;
  posSide: string;
  availSubPos: number;
};

type OkxCommunityPosition = {
  posId: string;
  instId: string;
  instType: string;
  posSide: string;
  pos: string;
  posCcy: string;
  avgPx: string;
  markPx: string;
  last: string;
  lever: string;
  margin: string;
  marginCcy: string;
  mgnMode: string;
  cTime: string;
  upl: string;
  uplRatio: string;
  notionalUsd: string;
  fee: string;
  fundingFee: string;
  realizedPnl: string;
  pnl: string;
};

type OkxBasicInfo = {
  nickName?: string;
  portrait?: string;
  sign?: string;
  uniqueName: string;
};

type OkxTradeStat = {
  pnl?: string;
  yieldRatio?: string;
  aum?: string;
  followerCount?: string;
  maxDrawdown?: string;
  winRate?: string;
};

type OkxTradeDataMetric = {
  desc: string;
  functionId: string;
  learnMoreUrl: string;
  order: number;
  title: string;
  type: string;
  value: string;
};

type OkxTradeDataSection = {
  nonPeriodicPart?: OkxTradeDataMetric[];
  periodicPart?: OkxTradeDataMetric[];
};

type OkxYieldPnlPoint = {
  pnl: string;
  ratio: string;
  statTime: string;
};

type OkxPositionHistoryEntry = {
  id: string;
  instId: string;
  contractVal?: string;
  subPos?: string;
  openAvgPx?: string;
  closeAvgPx?: string;
  openTime?: string;
  uTime?: string;
  pnl?: string;
  pnlRatio?: string;
  posSide?: string;
  lever?: string;
};

type OkxRankEntry = {
  uniqueName: string;
  nickName?: string;
  portrait?: string;
  sign?: string;
  yieldRatio?: string;
  pnl?: string;
  aum?: string;
  followerNum?: string;
  maxDrawdown?: string;
  winRatio?: string;
  totalLeadInstNum?: string;
  rates?: Array<{ ratio: string; statTime: string }>;
};

// ── fetch helpers ──

async function fetchOkxData<T>(url: string, traderId?: string): Promise<T | undefined> {
  const result = await fetchJson<{ code: string; data?: T; msg?: string }>(url, {
    headers: okxHeaders(traderId),
    isSuccessCode: (p) => (p as { code?: string }).code === "0",
  });
  return result.data?.data;
}

// ── positions ──

async function fetchOkxPositions(traderId: string): Promise<PositionSnapshot[]> {
  const data = await fetchOkxData<OkxPosition[]>(
    `${OKX_BASE}/position-detail?uniqueName=${traderId}`,
    traderId,
  );

  const positions = (data ?? []).map((item) => {
    let side = item.posSide;
    let size = item.availSubPos;
    if (side === "net") {
      if (size > 0) side = "long";
      else if (size < 0) {
        side = "short";
        size = -size;
      }
    }
    const entryPrice = Number(item.openAvgPx);
    const margin = Number(item.margin);
    const leverage = Number(item.lever);
    const computedAmount =
      entryPrice > 0 && leverage > 0 ? (margin * leverage) / entryPrice : Math.abs(size);

    return position({
      id: item.tradeItemId,
      symbol: normalizeSymbol(item.instId),
      entryPrice,
      markPrice: Number(item.markPx),
      amount: computedAmount,
      leverage,
      openTime: item.openTime ? Number(item.openTime) : null,
      closeTime: item.closeTime ? Number(item.closeTime) : null,
      margin,
      marginMode: item.mgnMode,
      pnl: item.pnl === null ? null : Number(item.pnl),
      pnlRatio: item.pnlRatio === null ? null : Number(item.pnlRatio),
      positionSide: (side === "short" ? "short" : "long") as PositionSide,
      closeAvgPrice: null,
      contractValue: null,
    });
  });

  if (positions.length > 0) return positions;
  return fetchOkxPositionsFromCommunity(traderId);
}

async function fetchOkxPositionsFromCommunity(traderId: string): Promise<PositionSnapshot[]> {
  try {
    const data = await fetchOkxData<Array<{ posData?: OkxCommunityPosition[] }>>(
      `${OKX_BASE}/community/user/position-current?uniqueName=${traderId}`,
      traderId,
    );

    const allPositions = (data ?? []).flatMap((group) => group.posData ?? []);

    return allPositions.map((item) => {
      const entryPrice = Number(item.avgPx);
      const markPrice = Number(item.markPx);
      const margin = Number(item.margin);
      const leverage = Number(item.lever);
      const rawAmount = Number(item.pos);
      const amount = Math.abs(rawAmount);

      return position({
        id: item.posId,
        symbol: normalizeSymbol(item.instId),
        entryPrice,
        markPrice: Number.isFinite(markPrice) ? markPrice : null,
        amount,
        leverage,
        openTime: Number(item.cTime) || null,
        closeTime: null,
        margin: Number.isFinite(margin) ? margin : null,
        marginMode: item.mgnMode,
        pnl: Number(item.upl) || null,
        pnlRatio: Number(item.uplRatio) || null,
        positionSide: (item.posSide === "short" ? "short" : "long") as PositionSide,
        closeAvgPrice: null,
        contractValue: null,
      });
    });
  } catch {
    return [];
  }
}

// ── metadata ──

async function fetchOkxBasicInfo(traderId: string): Promise<OkxBasicInfo | null> {
  const data = await fetchOkxData<OkxBasicInfo[]>(
    `${OKX_BASE}/basic-info?uniqueName=${traderId}`,
    traderId,
  );
  return data?.[0] ?? null;
}

async function fetchOkxTradeStat(traderId: string): Promise<OkxTradeStat | null> {
  const data = await fetchOkxData<OkxTradeStat>(
    `${OKX_BASE}/trade-stat?uniqueName=${traderId}&latestNum=0`,
    traderId,
  );
  return data ?? null;
}

async function fetchOkxYieldPnl(traderId: string): Promise<OkxYieldPnlPoint[]> {
  const data = await fetchOkxData<OkxYieldPnlPoint[]>(
    `${OKX_BASE}/yield-pnl?uniqueName=${traderId}&latestNum=0`,
    traderId,
  );
  return data ?? [];
}

async function fetchOkxPositionHistory(
  traderId: string,
  cutoffTime: number | null,
): Promise<OkxPositionHistoryEntry[]> {
  const history: OkxPositionHistoryEntry[] = [];
  let after: string | null = null;

  while (true) {
    const query = new URLSearchParams({ uniqueName: traderId, size: "200" });
    if (after) query.set("after", after);

    const page =
      (await fetchOkxData<OkxPositionHistoryEntry[]>(
        `${OKX_BASE}/position-history?${query.toString()}`,
        traderId,
      )) ?? [];

    if (page.length === 0) break;
    history.push(...page);

    const oldestCloseTime = finiteOrNull(page[page.length - 1]?.uTime);
    if (
      page.length < 200 ||
      (cutoffTime !== null && oldestCloseTime !== null && oldestCloseTime < cutoffTime)
    ) {
      break;
    }

    after = page[page.length - 1]?.id ?? null;
    if (!after) break;

    await paginateDelay();
  }

  return history;
}

// ── derivation ──

function deriveEquity(pnlValue: unknown, ratioValue: unknown): number | null {
  const pnl = finiteOrNull(pnlValue);
  const ratio = finiteOrNull(ratioValue);
  if (pnl === null || ratio === null) return null;
  if (ratio === 0) return pnl === 0 ? 0 : null;
  const equity = pnl / ratio + pnl;
  return Number.isFinite(equity) ? equity : null;
}

function deriveBalance(points: OkxYieldPnlPoint[], tradeStat: OkxTradeStat | null): number | null {
  for (const point of [...points].reverse()) {
    const equity = deriveEquity(point.pnl, point.ratio);
    if (equity !== null) return equity;
  }
  if (tradeStat) return deriveEquity(tradeStat.pnl, tradeStat.yieldRatio);
  return null;
}

function deriveThreeMonthMaxDrawdown(points: OkxYieldPnlPoint[]): number | null {
  const normalized = points
    .map((point) => ({
      statTime: finiteOrNull(point.statTime),
      equity: deriveEquity(point.pnl, point.ratio),
    }))
    .filter(
      (p): p is { statTime: number; equity: number } => p.statTime !== null && p.equity !== null,
    )
    .sort((a, b) => a.statTime - b.statTime);

  if (normalized.length === 0) return null;

  const latestTime = normalized[normalized.length - 1]!.statTime;
  const recent = normalized.filter((p) => p.statTime >= latestTime - BACKTEST_WINDOW_90D_MS);
  const series = recent.length > 0 ? recent : normalized;

  let peak = series[0]!.equity;
  let maxDrawdown = 0;
  for (const point of series) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = point.equity - peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

function deriveThreeMonthMaxDrawdownRatio(points: OkxYieldPnlPoint[]): number | null {
  const normalized = points
    .map((point) => ({
      statTime: finiteOrNull(point.statTime),
      equity: deriveEquity(point.pnl, point.ratio),
    }))
    .filter(
      (p): p is { statTime: number; equity: number } => p.statTime !== null && p.equity !== null,
    )
    .sort((a, b) => a.statTime - b.statTime);

  if (normalized.length === 0) return null;

  const latestTime = normalized[normalized.length - 1]!.statTime;
  const recent = normalized.filter((p) => p.statTime >= latestTime - BACKTEST_WINDOW_90D_MS);
  const series = recent.length > 0 ? recent : normalized;

  let peak = series[0]!.equity;
  let maxDrawdown = 0;
  for (const point of series) {
    if (point.equity > peak) peak = point.equity;
    const drawdown = point.equity - peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  if (peak <= 0) return null;
  return Math.abs(maxDrawdown) / peak;
}

function parseOkxDrawdownRatio(value: string | undefined): number | null {
  const parsed = finiteOrNull(value);
  if (parsed === null) return null;
  const abs = Math.abs(parsed);
  if (abs <= 1) return abs;
  if (abs <= 100) return abs / 100;
  return null;
}

function deriveMonthlyAvgPositionValue(history: OkxPositionHistoryEntry[]): number | null {
  const cutoff = Date.now() - BACKTEST_WINDOW_30D_MS;
  const notionals = history
    .map((item) => {
      const closeTime = finiteOrNull(item.uTime);
      const openTime = finiteOrNull(item.openTime);
      const effectiveTime = closeTime ?? openTime;
      if (effectiveTime === null || effectiveTime < cutoff) return null;
      const entryPrice = finiteOrNull(item.openAvgPx);
      const contracts = finiteOrNull(item.subPos);
      const contractValue = finiteOrNull(item.contractVal) ?? 1;
      if (entryPrice === null || contracts === null) return null;
      return Math.abs(entryPrice * contracts * contractValue);
    })
    .filter((v): v is number => v !== null);
  if (notionals.length === 0) return null;
  return notionals.reduce((sum, v) => sum + v, 0) / notionals.length;
}

function mapHistoryPositions(
  trader: TraderRecord,
  history: OkxPositionHistoryEntry[],
): TraderHistoryPosition[] {
  return history
    .map((item) => {
      const entryPrice = finiteOrNull(item.openAvgPx);
      const closePrice = finiteOrNull(item.closeAvgPx);
      const contracts = finiteOrNull(item.subPos);
      const contractValue = finiteOrNull(item.contractVal);
      const leverage = finiteOrNull(item.lever);
      if (entryPrice === null || closePrice === null || contracts === null || leverage === null)
        return null;

      return {
        id: item.id,
        symbol: normalizeSymbol(item.instId),
        side: (item.posSide === "short" ? "short" : "long") as PositionSide,
        leverage,
        amount: Math.abs(contracts * (contractValue ?? 1)),
        entryPrice,
        closePrice,
        openTime: finiteOrNull(item.openTime),
        closeTime: finiteOrNull(item.uTime),
        profit: finiteOrNull(item.pnl),
        profitRate: finiteOrNull(item.pnlRatio),
        contractValue,
        source: trader.platform,
      } satisfies TraderHistoryPosition;
    })
    .filter((item): item is TraderHistoryPosition => item !== null)
    .sort((a, b) => {
      const at = a.closeTime ?? a.openTime ?? 0;
      const bt = b.closeTime ?? b.openTime ?? 0;
      return bt - at;
    });
}

// ── snapshot ──

async function fetchOkxSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot> {
  const historyCutoffTime = Date.now() - BACKTEST_WINDOW_90D_MS;
  const [positions, basicInfo, tradeStat, yieldPnl, history] = await Promise.all([
    fetchOkxPositions(trader.id),
    fetchOkxBasicInfo(trader.id),
    fetchOkxTradeStat(trader.id),
    fetchOkxYieldPnl(trader.id),
    fetchOkxPositionHistory(trader.id, historyCutoffTime),
  ]);

  const balance = deriveBalance(yieldPnl, tradeStat);
  const monthlyAveragePositionValue = deriveMonthlyAvgPositionValue(history);
  const threeMonthMaxDrawdown = deriveThreeMonthMaxDrawdown(yieldPnl);

  const traderPatch: Partial<TraderRecord> = {
    ...(basicInfo?.nickName ? { nickName: basicInfo.nickName } : {}),
    ...(basicInfo?.portrait ? { avatar: basicInfo.portrait } : {}),
    ...(typeof basicInfo?.sign === "string" ? { sign: basicInfo.sign } : {}),
    ...(balance !== null ? { balance } : {}),
    ...(monthlyAveragePositionValue !== null ? { monthlyAveragePositionValue } : {}),
    ...(threeMonthMaxDrawdown !== null ? { threeMonthMaxDrawdown } : {}),
    historyPositions: mapHistoryPositions(trader, history),
  };

  return { positions, traderPatch };
}

// ── rank ──

const OKX_RANK_TYPE_MAP: Record<RankSortBy, string> = {
  yieldRatio: "yieldRatio",
  pnl: "pnl",
  aum: "aum",
  followers: "followers",
  maxDrawdown: "maxDrawdown",
  winRate: "winRate",
};

const OKX_RANK_PAGE_SIZE = 20;

function deriveMaxDrawdownFromRates(rates: Array<{ ratio: string }>): number | null {
  const values = rates
    .map((point) => Number(point.ratio) / 100)
    .filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;

  let peak = values[0]!;
  let maxDrawdown = 0;
  for (const value of values) {
    if (value > peak) peak = value;
    const drawdown = value - peak;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return Math.abs(maxDrawdown);
}

function mapOkxRankEntry(entry: OkxRankEntry): TraderRankItem {
  const yieldCurve = (entry.rates ?? []).map((point) => Number(point.ratio) / 100);
  const maxDrawdown = entry.maxDrawdown
    ? Number(entry.maxDrawdown) / 100
    : deriveMaxDrawdownFromRates(entry.rates ?? []);

  return {
    traderId: entry.uniqueName,
    uniqueName: entry.uniqueName,
    nickName: entry.nickName ?? entry.uniqueName,
    avatar: entry.portrait ?? "",
    sign: entry.sign ?? "",
    platform: "okx",
    yieldRatio: Number(entry.yieldRatio ?? 0) / 100,
    pnl: Number(entry.pnl ?? 0),
    aum: Number(entry.aum ?? 0),
    followers: Number(entry.followerNum ?? 0),
    maxDrawdown,
    winRate: entry.winRatio ? Number(entry.winRatio) : null,
    instNum: entry.totalLeadInstNum ? Number(entry.totalLeadInstNum) : null,
    link: `https://www.okx.com/copy-trading/account/${entry.uniqueName}`,
    yieldCurve,
  };
}

async function fetchOkxRankList(query: TraderRankQuery): Promise<TraderRankResult> {
  const rankType = OKX_RANK_TYPE_MAP[query.sortBy] ?? "pnl";
  const targetCount = query.pageSize;
  const allEntries: OkxRankEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  let dataVersion: string | undefined;
  const startPage = Math.max(1, query.page);

  for (let start = startPage; allEntries.length < targetCount; start++) {
    const params = new URLSearchParams({
      size: String(OKX_RANK_PAGE_SIZE),
      type: rankType,
      start: String(start),
      latestNum: String(query.timeRange),
      fullState: "0",
      countryId: "CN",
      apiTrader: "0",
      instNumLimit: "4",
      t: String(Date.now()),
    });
    if (dataVersion) {
      params.set("dataVersion", dataVersion);
    }

    const url = `${OKX_BASE}/follow-rank?${params.toString()}`;
    const dataArr =
      await fetchOkxData<Array<{ ranks: OkxRankEntry[]; total: string; dataVersion?: string }>>(
        url,
      );
    const data = dataArr?.[0];
    const ranks = data?.ranks ?? [];

    if (!dataVersion && data?.dataVersion) {
      dataVersion = data.dataVersion;
    }

    if (start === startPage) {
      total = Number(data?.total ?? 0);
    }

    if (ranks.length === 0) break;

    for (const entry of ranks) {
      if (!seen.has(entry.uniqueName)) {
        seen.add(entry.uniqueName);
        allEntries.push(entry);
      }
    }

    if (allEntries.length < targetCount && ranks.length > 0) {
      await paginateDelay();
    }
  }

  const list = allEntries.slice(0, targetCount);

  return {
    items: list.map(mapOkxRankEntry),
    total,
    platform: "okx",
  };
}

// ── profile inference ──

async function fetchOkxProfile(traderId: string): Promise<TraderProfileInference | null> {
  const basicInfo = await fetchOkxBasicInfo(traderId);
  if (!basicInfo) return null;
  return {
    name: basicInfo.nickName,
    nickName: basicInfo.nickName,
    avatar: basicInfo.portrait,
    sign: basicInfo.sign,
  };
}

// ── deep analysis ──

async function fetchOkxDeepAnalysis(
  traderId: string,
  options?: FetchTraderDeepAnalysisOptions,
): Promise<TraderDeepAnalysis> {
  const historyCutoffTime = resolveHistoryCutoffTime(options?.historyWindow);
  const [basicInfoArr, tradeStat, tradeDataSections, yieldPnl, positionsArr, historyArr] =
    await Promise.all([
      fetchOkxData<OkxBasicInfo[]>(`${OKX_BASE}/basic-info?uniqueName=${traderId}`, traderId),
      fetchOkxData<OkxTradeStat>(
        `${OKX_BASE}/trade-stat?uniqueName=${traderId}&latestNum=0`,
        traderId,
      ),
      fetchOkxData<OkxTradeDataSection[]>(
        `${OKX_BASE}/trader/trade-data?latestNum=0&bizType=SWAP&uniqueName=${traderId}`,
        traderId,
      ),
      fetchOkxData<OkxYieldPnlPoint[]>(
        `${OKX_BASE}/yield-pnl?uniqueName=${traderId}&latestNum=0`,
        traderId,
      ),
      fetchOkxData<OkxPosition[]>(`${OKX_BASE}/position-detail?uniqueName=${traderId}`, traderId),
      fetchOkxPositionHistory(traderId, historyCutoffTime),
    ]);

  const basicInfo = basicInfoArr?.[0] ?? null;
  const tradeData = tradeDataSections?.[0];
  const nonPeriodicPart = (tradeData?.nonPeriodicPart ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);
  const periodicPart = (tradeData?.periodicPart ?? []).slice().sort((a, b) => a.order - b.order);
  const balanceMetric = findMetric(nonPeriodicPart, "asset");
  const aumMetric = findMetric(nonPeriodicPart, "aum");
  const followerMetric = findMetric(nonPeriodicPart, "followerNum");
  const winRatioMetric = findMetric(periodicPart, "winRatio");
  const avgPositionMetric = findMetric(periodicPart, "avgPositionValue");
  const yieldCurve = (yieldPnl ?? []).map((point) => ({
    time: Number(point.statTime),
    ratio: Number(point.ratio),
    pnl: Number(point.pnl),
  }));
  const latestYieldPoint = yieldCurve.at(-1) ?? null;

  const positions = (positionsArr ?? []).map((item) => {
    let side = item.posSide;
    let size = item.availSubPos;
    if (side === "net") {
      if (size > 0) side = "long";
      else if (size < 0) {
        side = "short";
        size = -size;
      }
    }
    const entryPrice = Number(item.openAvgPx);
    const margin = Number(item.margin);
    const leverage = Number(item.lever);
    const computedAmount =
      entryPrice > 0 && leverage > 0 ? (margin * leverage) / entryPrice : Math.abs(size);

    return {
      id: item.tradeItemId,
      symbol: normalizeSymbol(item.instId),
      entryPrice,
      markPrice: Number(item.markPx),
      amount: computedAmount,
      leverage,
      openTime: item.openTime ? Number(item.openTime) : null,
      margin,
      pnl: item.pnl === null ? null : Number(item.pnl),
      pnlRatio: item.pnlRatio === null ? null : Number(item.pnlRatio),
      positionSide: (side === "short" ? "short" : "long") as "long" | "short",
    };
  });

  const historyPositions = (historyArr ?? [])
    .map((item) => {
      const entryPrice = finiteOrNull(item.openAvgPx);
      const closePrice = finiteOrNull(item.closeAvgPx);
      const contracts = finiteOrNull(item.subPos);
      const leverage = finiteOrNull(item.lever);
      const contractValue = finiteOrNull(item.contractVal) ?? 1;
      if (entryPrice === null || closePrice === null || contracts === null || leverage === null)
        return null;
      return {
        id: item.id,
        symbol: normalizeSymbol(item.instId),
        side: (item.posSide === "short" ? "short" : "long") as "long" | "short",
        leverage,
        amount: Math.abs(contracts * contractValue),
        entryPrice,
        closePrice,
        openTime: finiteOrNull(item.openTime),
        closeTime: finiteOrNull(item.uTime),
        profit: finiteOrNull(item.pnl),
        profitRate: finiteOrNull(item.pnlRatio),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      const at = a.closeTime ?? a.openTime ?? 0;
      const bt = b.closeTime ?? b.openTime ?? 0;
      return bt - at;
    });

  return {
    traderId,
    uniqueName: traderId,
    nickName: basicInfo?.nickName ?? traderId,
    avatar: basicInfo?.portrait ?? "",
    sign: basicInfo?.sign ?? "",
    platform: "okx",
    link: `https://www.okx.com/copy-trading/account/${traderId}`,
    balance: metricValueAsNumber(balanceMetric) ?? deriveBalance(yieldPnl ?? [], tradeStat ?? null),
    yieldRatio: finiteOrNull(tradeStat?.yieldRatio) ?? latestYieldPoint?.ratio ?? null,
    pnl: finiteOrNull(tradeStat?.pnl) ?? latestYieldPoint?.pnl ?? null,
    aum: metricValueAsNumber(aumMetric) ?? finiteOrNull(tradeStat?.aum),
    followers:
      finiteOrNull(followerMetric?.value.split("/")[0]) ?? finiteOrNull(tradeStat?.followerCount),
    maxDrawdown:
      parseOkxDrawdownRatio(tradeStat?.maxDrawdown) ??
      deriveThreeMonthMaxDrawdownRatio(yieldPnl ?? []),
    winRate: metricValueAsNumber(winRatioMetric) ?? finiteOrNull(tradeStat?.winRate),
    monthlyAveragePositionValue:
      metricValueAsNumber(avgPositionMetric) ?? deriveMonthlyAvgPositionValue(historyArr ?? []),
    positions,
    historyPositions,
    yieldCurve,
    extraStats: {
      nonPeriodicPart: nonPeriodicPart.map((metric) => ({ ...metric })),
      periodicPart: periodicPart.map((metric) => ({ ...metric })),
    },
  };
}

// ── endpoint definitions ──

const OKX_ENDPOINTS: EndpointDefinition[] = [
  {
    id: "okx-rank",
    name: "follow-rank (排行榜)",
    method: "GET",
    buildUrl: () =>
      `${OKX_BASE}/follow-rank?size=5&type=pnl&start=1&latestNum=90&fullState=0&countryId=CN&apiTrader=0&instNumLimit=4&t=${Date.now()}`,
    extractCount: (data) => {
      if (Array.isArray(data) && data[0]?.ranks) return data[0].ranks.length;
      return null;
    },
    integrated: true,
  },
  {
    id: "okx-basic-info",
    name: "basic-info (基本信息)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/basic-info?uniqueName=${p.traderId}`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: true,
  },
  {
    id: "okx-trade-stat",
    name: "trade-stat (收益统计)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/trade-stat?uniqueName=${p.traderId}&latestNum=0`,
    extractCount: (data) => (data ? 1 : 0),
    integrated: true,
  },
  {
    id: "okx-yield-pnl",
    name: "yield-pnl (收益曲线)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/yield-pnl?uniqueName=${p.traderId}&latestNum=0`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: true,
  },
  {
    id: "okx-position-detail",
    name: "position-detail (当前持仓)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/position-detail?uniqueName=${p.traderId}`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: true,
  },
  {
    id: "okx-position-current",
    name: "position-current (策略保护回退)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/community/user/position-current?uniqueName=${p.traderId}`,
    extractCount: (data) => {
      if (Array.isArray(data)) {
        return data.reduce(
          (sum, group) => sum + ((group as { posData?: unknown[] })?.posData?.length ?? 0),
          0,
        );
      }
      return null;
    },
    integrated: true,
  },
  {
    id: "okx-position-history",
    name: "position-history (历史持仓)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/position-history?uniqueName=${p.traderId}&size=10`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: true,
  },
  {
    id: "okx-position-summary",
    name: "position-summary (带单仓位汇总)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/trader/position-summary?instType=SWAP&uniqueName=${p.traderId}`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
  {
    id: "okx-trade-data",
    name: "trade-data (统计数据)",
    method: "GET",
    buildUrl: (p) =>
      `${OKX_BASE}/trader/trade-data?latestNum=0&bizType=SWAP&uniqueName=${p.traderId}`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
  {
    id: "okx-week-pnl",
    name: "week-pnl (周度PnL)",
    method: "GET",
    buildUrl: (p) => `${OKX_BASE}/week-pnl?uniqueName=${p.traderId}`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
  {
    id: "okx-scatter",
    name: "position-history-scatter (散点图)",
    method: "GET",
    buildUrl: (p) =>
      `${OKX_BASE}/position-history-scatter?period=30D&instType=SWAP&uniqueName=${p.traderId}`,
    extractCount: (data) => (Array.isArray(data) ? data.length : null),
    integrated: false,
  },
];

// ── execution ──

async function createOkxLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}): Promise<ExecutionFill> {
  const exchange = createTeacherExchange("okx", input.credentials, input.executionMode ?? "live");
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

async function closeOkxLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  orderId: string;
}): Promise<CloseFill> {
  const exchange = createTeacherExchange("okx", input.credentials, input.executionMode ?? "live");
  const side = input.positionSide === "long" ? "sell" : "buy";
  await exchange.createMarketOrder(normalizeSwapSymbol(input.symbol), side, input.amount);
  return { orderId: input.orderId, closedAmount: input.amount, closeTime: Date.now() };
}

// ── teacher account ──

async function fetchOkxTeacherAccount(input: {
  credentials: TeacherCredentials | null | undefined;
  executionMode?: ExecutionMode;
}): Promise<TeacherAccountSnapshot> {
  const exchange = createTeacherExchange("okx", input.credentials, input.executionMode ?? "live");
  const [balance, positions] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions(),
  ]);
  const usdtDetails =
    Array.isArray(balance.info?.data) && balance.info.data[0]?.details?.[0]
      ? balance.info.data[0].details[0]
      : null;
  const toNum = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" && v ? Number(v) : 0;
  const getUsdt = (key: "total" | "free") => {
    const val = balance[key as keyof typeof balance] as unknown;
    if (val && typeof val === "object") return toNum((val as Record<string, unknown>).USDT);
    return 0;
  };
  return {
    balance: getUsdt("total"),
    equity: toNum(usdtDetails?.eq ?? getUsdt("total")),
    freeUsdt: getUsdt("free"),
    unrealizedPnl: toNum(usdtDetails?.upl),
    teacherPositions: mapCcxtPositionsToSnapshots(
      positions as unknown as Array<Record<string, unknown>>,
    ),
  };
}

// ── adapter ──

export const okxAdapter: PlatformAdapter = {
  platform: "okx",
  displayName: "OKX",
  traderModel: OKX_TRADER_MODEL,
  headers: okxHeaders(),
  isSuccessCode: (payload) => (payload as { code?: string }).code === "0",
  endpoints: OKX_ENDPOINTS,
  fetchLiveSnapshot: fetchOkxSnapshot,
  fetchRankList: fetchOkxRankList,
  inferProfile: fetchOkxProfile,
  fetchDeepAnalysis: fetchOkxDeepAnalysis,
  createLiveOrder: createOkxLiveOrder,
  closeLiveOrder: closeOkxLiveOrder,
  fetchTeacherAccount: fetchOkxTeacherAccount,
  buildTraderLink: (traderId) => `https://www.okx.com/cn/copy-trading/account/${traderId}`,
};
