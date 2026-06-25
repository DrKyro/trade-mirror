import "@tanstack/react-start/server-only";
import ccxt from "ccxt";

import { resolveCredentials } from "#/lib/trading/execution/common";
import type { PositionSnapshot, TeacherCredentials, TeacherRecord } from "#/lib/trading/types";

interface TeacherAccountSnapshot {
  balance: number;
  equity: number;
  freeUsdt: number;
  unrealizedPnl: number;
  teacherPositions: PositionSnapshot[];
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    return Number(value);
  }

  return 0;
}

function normalizeTeacherSymbol(symbol: string) {
  return symbol
    .replace(":USDT", "")
    .replace("/USDT", "USDT")
    .replace("-USDT", "USDT")
    .replace("/", "");
}

function normalizePositionSide(side: unknown): "long" | "short" {
  const normalized = String(side ?? "").toLowerCase();
  if (normalized === "short" || normalized === "sell") {
    return "short";
  }

  return "long";
}

function buildPositionSnapshot(
  input: Partial<PositionSnapshot> & Pick<PositionSnapshot, "symbol">,
) {
  return {
    id: input.id ?? `${input.symbol}-${crypto.randomUUID().slice(0, 8)}`,
    symbol: input.symbol,
    entryPrice: input.entryPrice ?? 0,
    markPrice: input.markPrice ?? null,
    amount: input.amount ?? 0,
    leverage: input.leverage ?? 0,
    openTime: input.openTime ?? null,
    closeTime: input.closeTime ?? null,
    margin: input.margin ?? null,
    marginMode: input.marginMode ?? null,
    pnl: input.pnl ?? null,
    pnlRatio: input.pnlRatio ?? null,
    positionSide: input.positionSide ?? "long",
    closeAvgPrice: input.closeAvgPrice ?? null,
    contractValue: input.contractValue ?? null,
  } satisfies PositionSnapshot;
}

function mapCcxtPositionToSnapshot(position: Record<string, unknown>) {
  const info =
    position.info && typeof position.info === "object"
      ? (position.info as Record<string, unknown>)
      : {};
  const symbol = normalizeTeacherSymbol(String(position.symbol ?? info.symbol ?? ""));
  const contracts = toNumber(
    position.contracts ?? info.positionAmt ?? info.total ?? info.available,
  );
  const contractSize = toNumber(position.contractSize ?? 1);
  const amount = Math.abs(contracts * (contractSize || 1));

  return buildPositionSnapshot({
    id:
      typeof position.id === "string" || typeof position.id === "number"
        ? String(position.id)
        : typeof info.posId === "string" || typeof info.trackingNo === "string"
          ? String(info.posId ?? info.trackingNo)
          : `${symbol}-${String(info.openTime ?? position.timestamp ?? crypto.randomUUID())}`,
    symbol,
    entryPrice: toNumber(
      position.entryPrice ?? info.averageOpenPrice ?? info.avgPx ?? info.openPrice,
    ),
    markPrice:
      position.markPrice == null
        ? toNumber(info.marketPrice ?? info.markPx) || null
        : toNumber(position.markPrice),
    amount,
    leverage: toNumber(position.leverage ?? info.leverage ?? info.lever ?? info.openLeverage),
    openTime: toNumber(position.timestamp ?? info.cTime ?? info.openTime) || null,
    margin:
      position.initialMargin == null
        ? toNumber(info.margin ?? info.bondAmount) || null
        : toNumber(position.initialMargin),
    marginMode:
      typeof position.marginMode === "string"
        ? position.marginMode
        : typeof info.marginMode === "string"
          ? info.marginMode
          : typeof info.mgnMode === "string"
            ? info.mgnMode
            : null,
    pnl:
      position.unrealizedPnl == null
        ? toNumber(info.unrealizedPL ?? info.unRealizedProfit ?? info.openProfit) || null
        : toNumber(position.unrealizedPnl),
    pnlRatio: position.percentage == null ? null : toNumber(position.percentage) / 100,
    positionSide: normalizePositionSide(
      position.side ?? info.holdSide ?? info.posSide ?? info.direction,
    ),
    contractValue: position.notional == null ? null : toNumber(position.notional),
  });
}

function filterNonZeroPositions(positions: PositionSnapshot[]) {
  return positions.filter((position) => position.amount > 0);
}

function getUsdtBalanceValue(balance: Record<string, unknown>, key: "total" | "free") {
  const value = balance[key];
  if (value && typeof value === "object") {
    return toNumber((value as Record<string, unknown>).USDT);
  }

  return 0;
}

function getBinanceExchange(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret } = resolveCredentials(credentials, "BINANCE");
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Binance teacher account refresh requires teacher credentials or BINANCE_API_* environment variables",
    );
  }

  return new ccxt.binance({
    apiKey,
    secret: apiSecret,
    options: {
      defaultType: "swap",
    },
  });
}

async function fetchBinanceTeacherAccount(credentials: TeacherCredentials | null | undefined) {
  const exchange = getBinanceExchange(credentials);
  const [balance, positionsRisk] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositionsRisk(),
  ]);

  const teacherPositions = filterNonZeroPositions(
    positionsRisk.map((position) =>
      mapCcxtPositionToSnapshot(position as unknown as Record<string, unknown>),
    ),
  );

  return {
    balance: toNumber(balance.info.totalWalletBalance ?? getUsdtBalanceValue(balance, "total")),
    equity: getUsdtBalanceValue(balance, "total") + toNumber(balance.info.totalUnrealizedProfit),
    freeUsdt: toNumber(balance.info.availableBalance ?? getUsdtBalanceValue(balance, "free")),
    unrealizedPnl: toNumber(balance.info.totalUnrealizedProfit),
    teacherPositions,
  } satisfies TeacherAccountSnapshot;
}

function getOkxExchange(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret, apiPassword } = resolveCredentials(credentials, "OKX");
  if (!apiKey || !apiSecret || !apiPassword) {
    throw new Error(
      "OKX teacher account refresh requires teacher credentials or OKX_API_* environment variables",
    );
  }

  return new ccxt.okx({
    apiKey,
    secret: apiSecret,
    password: apiPassword,
    options: {
      defaultType: "swap",
    },
  });
}

async function fetchOkxTeacherAccount(credentials: TeacherCredentials | null | undefined) {
  const exchange = getOkxExchange(credentials);
  const [balance, positions] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions(),
  ]);

  const usdtDetails =
    Array.isArray(balance.info?.data) && balance.info.data[0]?.details?.[0]
      ? balance.info.data[0].details[0]
      : null;

  return {
    balance: getUsdtBalanceValue(balance, "total"),
    equity: toNumber(usdtDetails?.eq ?? getUsdtBalanceValue(balance, "total")),
    freeUsdt: getUsdtBalanceValue(balance, "free"),
    unrealizedPnl: toNumber(usdtDetails?.upl),
    teacherPositions: filterNonZeroPositions(
      positions.map((position) =>
        mapCcxtPositionToSnapshot(position as unknown as Record<string, unknown>),
      ),
    ),
  } satisfies TeacherAccountSnapshot;
}

function getBitgetExchange(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret, apiPassword } = resolveCredentials(credentials, "BITGET");
  if (!apiKey || !apiSecret || !apiPassword) {
    throw new Error(
      "Bitget teacher account refresh requires teacher credentials or BITGET_API_* environment variables",
    );
  }

  return new ccxt.bitget({
    apiKey,
    secret: apiSecret,
    password: apiPassword,
    options: {
      defaultType: "swap",
    },
  });
}

async function fetchBitgetTeacherAccount(credentials: TeacherCredentials | null | undefined) {
  const exchange = getBitgetExchange(credentials);
  const [balance, positions] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchPositions(),
  ]);

  const usdtInfo = Array.isArray(balance.info) ? balance.info[0] : null;

  return {
    balance: getUsdtBalanceValue(balance, "total"),
    equity: toNumber(usdtInfo?.usdtEquity ?? getUsdtBalanceValue(balance, "total")),
    freeUsdt: toNumber(usdtInfo?.crossMaxAvailable ?? getUsdtBalanceValue(balance, "free")),
    unrealizedPnl: toNumber(usdtInfo?.unrealizedPL),
    teacherPositions: filterNonZeroPositions(
      positions.map((position) =>
        mapCcxtPositionToSnapshot(position as unknown as Record<string, unknown>),
      ),
    ),
  } satisfies TeacherAccountSnapshot;
}

function resolveHuobiCredentials(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret, apiPassword } = resolveCredentials(credentials, "HUOBI");
  if (!apiKey || !apiSecret || !apiPassword) {
    throw new Error(
      "Huobi teacher account refresh requires teacher credentials or HUOBI_API_* environment variables",
    );
  }

  return {
    apiKey,
    apiSecret,
    apiPassword,
  };
}

async function huobiFetch<T>(
  url: string,
  init: RequestInit,
  credentials: ReturnType<typeof resolveHuobiCredentials>,
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "*/*",
      "accept-language": "zh-CN",
      "content-type": "application/json",
      "hb-pro-token": credentials.apiSecret,
      cookie: credentials.apiPassword,
      Referer: "https://www.huobi.com/zh-cn/futures/copytrading/trading",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Huobi request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

interface HuobiBalanceResponse {
  data?: {
    totalAsset?: number | string;
  };
}

interface HuobiOrderPayload {
  id: number | string;
  symbol: string;
  direction: "long" | "short";
  openAmount: string | number;
  lever: string | number;
  bondAmount: string | number;
  openPrice: string | number;
  openProfit: string | number;
  marketPrice: string | number;
  openTime: number;
}

interface HuobiOrdersResponse {
  data?: {
    orders?: HuobiOrderPayload[];
  };
}

async function fetchHuobiTeacherAccount(credentials: TeacherCredentials | null | undefined) {
  const resolved = resolveHuobiCredentials(credentials);
  const [balancePayload, ordersPayload] = await Promise.all([
    huobiFetch<HuobiBalanceResponse>(
      "https://www.huobi.com/futures/api/-/x/hbg/v1/copytrading/user-profit",
      {
        method: "GET",
      },
      resolved,
    ),
    huobiFetch<HuobiOrdersResponse>(
      `https://www.huobi.com/futures/api/-/x/hbg/v1/copytrading/trader/open-unmatch-orders?userSign=NDU5ODIzNzM&pageNo=1&pageSize=100&x-b3-traceid=${resolved.apiKey}`,
      {
        method: "GET",
      },
      resolved,
    ),
  ]);

  const teacherPositions = filterNonZeroPositions(
    (ordersPayload.data?.orders ?? []).map((order) =>
      buildPositionSnapshot({
        id: String(order.id),
        symbol: normalizeTeacherSymbol(order.symbol),
        entryPrice: toNumber(order.openPrice),
        markPrice: toNumber(order.marketPrice) || null,
        amount: Math.abs(toNumber(order.openAmount)),
        leverage: toNumber(order.lever),
        openTime: toNumber(order.openTime) || null,
        margin: toNumber(order.bondAmount) || null,
        pnl: toNumber(order.openProfit),
        positionSide: normalizePositionSide(order.direction),
      }),
    ),
  );

  const totalAsset = toNumber(balancePayload.data?.totalAsset);
  const unrealizedPnl = teacherPositions.reduce((sum, position) => sum + (position.pnl ?? 0), 0);

  return {
    balance: totalAsset,
    equity: totalAsset,
    freeUsdt: totalAsset,
    unrealizedPnl,
    teacherPositions,
  } satisfies TeacherAccountSnapshot;
}

export async function fetchTeacherAccountSnapshot(teacher: TeacherRecord) {
  switch (teacher.platform) {
    case "binance":
      return fetchBinanceTeacherAccount(teacher.credentials);
    case "bitget":
      return fetchBitgetTeacherAccount(teacher.credentials);
    case "okx":
      return fetchOkxTeacherAccount(teacher.credentials);
    case "huobi":
      return fetchHuobiTeacherAccount(teacher.credentials);
    default:
      throw new Error(`Teacher account refresh is not supported yet for ${teacher.platform}`);
  }
}
