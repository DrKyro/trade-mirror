import "@tanstack/react-start/server-only";
import ccxt from "ccxt";

import { fetchBybitPositionsWithBrowserFallback } from "#/lib/trading/adapters/bybit-browser-fallback";
import { BybitRuntimeError } from "#/lib/trading/adapters/bybit-runtime";
import type { PositionSnapshot, TraderHistoryPosition, TraderRecord } from "#/lib/trading/types";

export interface TraderLiveSnapshot {
  positions: PositionSnapshot[];
  traderPatch?: Partial<TraderRecord>;
}

function position(input: PositionSnapshot): PositionSnapshot {
  return {
    id: input.id,
    symbol: input.symbol,
    entryPrice: input.entryPrice,
    markPrice: input.markPrice,
    amount: input.amount,
    leverage: input.leverage,
    openTime: input.openTime,
    closeTime: input.closeTime,
    margin: input.margin,
    marginMode: input.marginMode,
    pnl: input.pnl,
    pnlRatio: input.pnlRatio,
    positionSide: input.positionSide,
    closeAvgPrice: input.closeAvgPrice,
    contractValue: input.contractValue,
  };
}

function normalizeSymbol(instId: string) {
  if (!instId.includes("-")) {
    return instId;
  }

  const [base, quote] = instId.split("-");
  return `${base}${quote}`;
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }
  return 0;
}

function finiteNumberOrNull(value: unknown) {
  const result = numberFromUnknown(value);
  return Number.isFinite(result) ? result : null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;

function buildOkxHeaders(traderId: string): HeadersInit {
  return {
    accept: "application/json",
    "accept-language": "zh-CN,zh;q=0.9",
    "app-type": "web",
    devId: "95829674-6cd6-4909-a00e-d4ebd89d7a71",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-cdn": "https://static.okx.com",
    "x-locale": "zh_CN",
    "x-utc": "8",
    "x-zkdex-env": "0",
    Referer: `https://www.okx.com/cn/copy-trading/account/${traderId}`,
  };
}

async function fetchOkxPayload<T>(url: string, traderId: string) {
  const response = await fetch(url, {
    headers: buildOkxHeaders(traderId),
  });

  if (!response.ok) {
    throw new Error(`OKX request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: string;
    data?: T;
    msg?: string;
  };

  if (payload.code !== "0") {
    throw new Error(`OKX payload error: ${payload.msg ?? JSON.stringify(payload)}`);
  }

  return payload.data;
}

async function fetchOkxPositions(traderId: string) {
  const data = await fetchOkxPayload<
    Array<{
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
    }>
  >(
    `https://www.okx.com/priapi/v5/ecotrade/public/position-detail?uniqueName=${traderId}`,
    traderId,
  );

  return (data ?? []).map((item) => {
    let side = item.posSide;
    let size = item.availSubPos;
    if (side === "net") {
      if (size > 0) {
        side = "long";
      } else if (size < 0) {
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
      positionSide: side === "short" ? "short" : "long",
      closeAvgPrice: null,
      contractValue: null,
    });
  });
}

type OkxBasicInfo = {
  nickName?: string;
  portrait?: string;
  sign?: string;
  uniqueName: string;
};

type OkxTradeStat = {
  pnl?: string;
  yieldRatio?: string;
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

async function fetchOkxBasicInfo(traderId: string) {
  const data = await fetchOkxPayload<OkxBasicInfo[]>(
    `https://www.okx.com/priapi/v5/ecotrade/public/basic-info?uniqueName=${traderId}`,
    traderId,
  );

  return data?.[0] ?? null;
}

async function fetchOkxTradeStat(traderId: string) {
  const data = await fetchOkxPayload<OkxTradeStat>(
    `https://www.okx.com/priapi/v5/ecotrade/public/trade-stat?uniqueName=${traderId}&latestNum=0`,
    traderId,
  );

  return data ?? null;
}

async function fetchOkxYieldPnl(traderId: string) {
  const data = await fetchOkxPayload<OkxYieldPnlPoint[]>(
    `https://www.okx.com/priapi/v5/ecotrade/public/yield-pnl?uniqueName=${traderId}&latestNum=0`,
    traderId,
  );

  return data ?? [];
}

async function fetchOkxPositionHistory(traderId: string, cutoffTime: number) {
  const history: OkxPositionHistoryEntry[] = [];
  let after: string | null = null;

  while (true) {
    const query = new URLSearchParams({
      uniqueName: traderId,
      size: "200",
    });
    if (after) {
      query.set("after", after);
    }

    const page =
      (await fetchOkxPayload<OkxPositionHistoryEntry[]>(
        `https://www.okx.com/priapi/v5/ecotrade/public/position-history?${query.toString()}`,
        traderId,
      )) ?? [];

    if (page.length === 0) {
      break;
    }

    history.push(...page);

    const oldestCloseTime = finiteNumberOrNull(page[page.length - 1]?.uTime);
    if (page.length < 200 || (oldestCloseTime !== null && oldestCloseTime < cutoffTime)) {
      break;
    }

    after = page[page.length - 1]?.id ?? null;
    if (!after) {
      break;
    }
  }

  return history;
}

function deriveOkxEquityFromPnlAndRatio(pnlValue: unknown, ratioValue: unknown) {
  const pnl = finiteNumberOrNull(pnlValue);
  const ratio = finiteNumberOrNull(ratioValue);

  if (pnl === null || ratio === null) {
    return null;
  }

  if (ratio === 0) {
    return pnl === 0 ? 0 : null;
  }

  const equity = pnl / ratio + pnl;
  return Number.isFinite(equity) ? equity : null;
}

function deriveOkxBalance(points: OkxYieldPnlPoint[], tradeStat: OkxTradeStat | null) {
  for (const point of [...points].reverse()) {
    const equity = deriveOkxEquityFromPnlAndRatio(point.pnl, point.ratio);
    if (equity !== null) {
      return equity;
    }
  }

  if (tradeStat) {
    return deriveOkxEquityFromPnlAndRatio(tradeStat.pnl, tradeStat.yieldRatio);
  }

  return null;
}

function deriveOkxThreeMonthMaxDrawdown(points: OkxYieldPnlPoint[]) {
  const normalized = points
    .map((point) => ({
      statTime: finiteNumberOrNull(point.statTime),
      equity: deriveOkxEquityFromPnlAndRatio(point.pnl, point.ratio),
    }))
    .filter(
      (point): point is { statTime: number; equity: number } =>
        point.statTime !== null && point.equity !== null,
    )
    .sort((left, right) => left.statTime - right.statTime);

  if (normalized.length === 0) {
    return null;
  }

  const latestTime = normalized[normalized.length - 1]!.statTime;
  const recent = normalized.filter((point) => point.statTime >= latestTime - NINETY_DAYS_MS);
  const series = recent.length > 0 ? recent : normalized;

  let peak = series[0]!.equity;
  let maxDrawdown = 0;

  for (const point of series) {
    if (point.equity > peak) {
      peak = point.equity;
    }

    const drawdown = point.equity - peak;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

function deriveOkxMonthlyAveragePositionValue(history: OkxPositionHistoryEntry[]) {
  const cutoffTime = Date.now() - THIRTY_DAYS_MS;
  const notionals = history
    .map((item) => {
      const openTime = finiteNumberOrNull(item.openTime);
      const closeTime = finiteNumberOrNull(item.uTime);
      const effectiveTime = closeTime ?? openTime;
      if (effectiveTime === null || effectiveTime < cutoffTime) {
        return null;
      }

      const entryPrice = finiteNumberOrNull(item.openAvgPx);
      const contracts = finiteNumberOrNull(item.subPos);
      const contractValue = finiteNumberOrNull(item.contractVal) ?? 1;
      if (entryPrice === null || contracts === null) {
        return null;
      }

      return Math.abs(entryPrice * contracts * contractValue);
    })
    .filter((value): value is number => value !== null);

  if (notionals.length === 0) {
    return null;
  }

  return notionals.reduce((sum, value) => sum + value, 0) / notionals.length;
}

function mapOkxHistoryPositions(
  trader: TraderRecord,
  history: OkxPositionHistoryEntry[],
): TraderHistoryPosition[] {
  return history
    .map((item) => {
      const entryPrice = finiteNumberOrNull(item.openAvgPx);
      const closePrice = finiteNumberOrNull(item.closeAvgPx);
      const contracts = finiteNumberOrNull(item.subPos);
      const contractValue = finiteNumberOrNull(item.contractVal);
      const leverage = finiteNumberOrNull(item.lever);
      if (entryPrice === null || closePrice === null || contracts === null || leverage === null) {
        return null;
      }

      return {
        id: item.id,
        symbol: normalizeSymbol(item.instId),
        side: item.posSide === "short" ? "short" : "long",
        leverage,
        amount: Math.abs(contracts * (contractValue ?? 1)),
        entryPrice,
        closePrice,
        openTime: finiteNumberOrNull(item.openTime),
        closeTime: finiteNumberOrNull(item.uTime),
        profit: finiteNumberOrNull(item.pnl),
        profitRate: finiteNumberOrNull(item.pnlRatio),
        contractValue,
        source: trader.platform,
      } satisfies TraderHistoryPosition;
    })
    .filter((item): item is TraderHistoryPosition => item !== null)
    .sort((left, right) => {
      const leftTime = left.closeTime ?? left.openTime ?? 0;
      const rightTime = right.closeTime ?? right.openTime ?? 0;
      return rightTime - leftTime;
    });
}

async function fetchOkxSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot> {
  const historyCutoffTime = Date.now() - NINETY_DAYS_MS;
  const [positions, basicInfo, tradeStat, yieldPnl, history] = await Promise.all([
    fetchOkxPositions(trader.id),
    fetchOkxBasicInfo(trader.id),
    fetchOkxTradeStat(trader.id),
    fetchOkxYieldPnl(trader.id),
    fetchOkxPositionHistory(trader.id, historyCutoffTime),
  ]);

  const balance = deriveOkxBalance(yieldPnl, tradeStat);
  const monthlyAveragePositionValue = deriveOkxMonthlyAveragePositionValue(history);
  const threeMonthMaxDrawdown = deriveOkxThreeMonthMaxDrawdown(yieldPnl);

  const traderPatch: Partial<TraderRecord> = {
    ...(basicInfo?.nickName ? { nickName: basicInfo.nickName } : {}),
    ...(basicInfo?.portrait ? { avatar: basicInfo.portrait } : {}),
    ...(typeof basicInfo?.sign === "string" ? { sign: basicInfo.sign } : {}),
    ...(balance !== null ? { balance } : {}),
    ...(monthlyAveragePositionValue !== null ? { monthlyAveragePositionValue } : {}),
    ...(threeMonthMaxDrawdown !== null ? { threeMonthMaxDrawdown } : {}),
    historyPositions: mapOkxHistoryPositions(trader, history),
  };

  return {
    positions,
    traderPatch,
  };
}

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

async function fetchBitgetPositions(traderId: string) {
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
    options: {
      defaultType: "swap",
    },
  });

  const payload = (await exchange.privateMixPostMixV1TraceReportOrderCurrentList({
    traderId,
  })) as {
    code: string;
    data?: BitgetTracePosition[];
  };

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

async function fetchBinanceFuturesPositions(traderId: string) {
  const response = await fetch(
    "https://www.binance.com/bapi/futures/v2/private/future/leaderboard/getOtherPosition",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        clienttype: "web",
        lang: "en",
      },
      body: JSON.stringify({
        encryptedUid: traderId,
        tradeType: "PERPETUAL",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Binance futures request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: string;
    msg?: string;
    data?: {
      otherPositionRetList?: BinanceLeaderboardPosition[];
    };
  };

  if (payload.code !== "000000") {
    throw new Error(`Binance futures payload error: ${payload.msg ?? JSON.stringify(payload)}`);
  }

  return (payload.data?.otherPositionRetList ?? []).map((item) => {
    const side = item.amount >= 0 ? "long" : "short";
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

async function fetchBybitPositions(traderId: string) {
  const headers: HeadersInit = {
    accept: "application/json",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    lang: "en-us",
    platform: "pc",
    referer: "https://www.bybit.com/",
  };

  if (process.env.BYBIT_API_USERTOKEN) {
    headers.usertoken = process.env.BYBIT_API_USERTOKEN;
  }
  if (process.env.BYBIT_API_COOKIE) {
    headers.cookie = process.env.BYBIT_API_COOKIE;
  }

  const response = await fetch(
    `https://api2.bybit.com/fapi/beehive/public/v1/common/order/list-detail?leaderMark=${encodeURIComponent(
      traderId,
    )}&pageSize=100&page=1`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Bybit position request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    retCode: number;
    retMsg?: string;
    result?: {
      openTradeInfoProtection?: number;
      data?: BybitLeaderboardPosition[];
    };
  };

  if (payload.retCode !== 0) {
    throw new Error(`Bybit payload error: ${payload.retMsg ?? JSON.stringify(payload)}`);
  }

  if (payload.result?.openTradeInfoProtection === 1) {
    throw new Error(
      "Bybit trader data requires authenticated browsing. Falling back to browser fetch.",
    );
  }

  return (payload.result?.data ?? []).map((item) => {
    const side = item.side === "Sell" ? "short" : "long";
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

function normalizeBybitPositionsFromBrowserPayload(data: unknown[]) {
  return data.map((item) => {
    const candidate = item as BybitLeaderboardPosition;
    const side = candidate.side === "Sell" ? "short" : "long";
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

type TraderWagonPosition = {
  id: string;
  symbol: string;
  entryPrice: string | number;
  markPrice: string | number;
  positionAmount: string | number;
  leverage: string | number;
  unrealizedProfit: string | number;
};

async function fetchTraderWagonPositions(traderId: string) {
  const response = await fetch(
    `https://www.traderwagon.com/v1/friendly/social-trading/lead-portfolio/get-position-info/${traderId}`,
    {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        clienttype: "web",
        "content-type": "application/json",
        lang: "en",
        referer: `https://www.traderwagon.com/en/portfolio/${traderId}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`TraderWagon position request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: string;
    msg?: string;
    data?: TraderWagonPosition[];
  };

  if (payload.code !== "000000") {
    throw new Error(`TraderWagon payload error: ${payload.msg ?? JSON.stringify(payload)}`);
  }

  return (payload.data ?? []).map((item) => {
    const rawAmount = numberFromUnknown(item.positionAmount);
    const amount = Math.abs(rawAmount);
    const entryPrice = numberFromUnknown(item.entryPrice);
    const leverage = numberFromUnknown(item.leverage);

    return position({
      id: item.id,
      symbol: item.symbol,
      entryPrice,
      markPrice: numberFromUnknown(item.markPrice),
      amount,
      leverage,
      openTime: null,
      closeTime: null,
      margin: entryPrice > 0 && leverage > 0 ? (entryPrice * amount) / leverage : null,
      marginMode: null,
      pnl: numberFromUnknown(item.unrealizedProfit),
      pnlRatio: null,
      positionSide: rawAmount >= 0 ? "long" : "short",
      closeAvgPrice: null,
      contractValue: null,
    });
  });
}

export async function fetchTraderLiveSnapshot(trader: TraderRecord): Promise<TraderLiveSnapshot> {
  switch (trader.platform) {
    case "okx":
      return fetchOkxSnapshot(trader);
    case "bitget":
      return {
        positions: await fetchBitgetPositions(trader.id),
      };
    case "binanceFutures":
      return {
        positions: await fetchBinanceFuturesPositions(trader.id),
      };
    case "bybit":
      try {
        return {
          positions: await fetchBybitPositions(trader.id),
        };
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
        return {
          positions: normalizeBybitPositionsFromBrowserPayload(browserData),
        };
      }
    case "traderWagon":
      return {
        positions: await fetchTraderWagonPositions(trader.id),
      };
    default:
      throw new Error(`No live adapter configured for platform ${trader.platform}`);
  }
}

export async function fetchTraderPositions(trader: TraderRecord) {
  return (await fetchTraderLiveSnapshot(trader)).positions;
}
