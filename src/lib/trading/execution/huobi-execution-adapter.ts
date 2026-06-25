import "@tanstack/react-start/server-only";
import type { CloseFill, ExecutionFill, TeacherCredentials } from "#/lib/trading/types";

interface HuobiOpenOrderPayload {
  id: number | string;
  symbol: string;
  direction: "long" | "short";
  openAmount: string | number;
  openPrice: string | number;
  openTime: number;
}

interface HuobiOpenOrdersResponse {
  code: number;
  data?: {
    orders?: HuobiOpenOrderPayload[];
  };
  success?: boolean;
}

interface HuobiCloseResponse {
  code: number;
  success?: boolean;
}

function resolveHuobiCredentials(credentials: TeacherCredentials | null | undefined) {
  const apiKey = credentials?.apiKey || process.env.HUOBI_API_KEY;
  const apiSecret = credentials?.apiSecret || process.env.HUOBI_API_SECRET;
  const apiPassword = credentials?.apiPassword || process.env.HUOBI_API_PASSWORD;

  if (!apiKey || !apiSecret || !apiPassword) {
    throw new Error(
      "Huobi live execution requires teacher credentials or HUOBI_API_* environment variables",
    );
  }

  return {
    apiKey,
    apiSecret,
    apiPassword,
  };
}

function normalizeHuobiSymbol(symbol: string) {
  return symbol.replace("USDT", "-USDT");
}

const huobiLeverageBySymbol: Record<string, number> = {
  BTCUSDT: 100,
  ETHUSDT: 100,
  LTCUSDT: 50,
  DOGEUSDT: 50,
  LINKUSDT: 50,
  ARBUSDT: 50,
  OPUSDT: 20,
};

const HUOBI_POSITION_POLL_DELAY_MS = 5_000;
const HUOBI_POSITION_POLL_ATTEMPTS = 8;

function toNumber(value: string | number | null | undefined) {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchHuobiTickerPrice(symbol: string) {
  const normalized = normalizeHuobiSymbol(symbol);
  const tickerResponse = await fetch(
    `https://www.huobi.com/market/detail/merged?symbol=${normalized.toLowerCase().replace("-", "")}`,
  );
  const tickerPayload = (await tickerResponse.json()) as {
    tick?: { close?: number };
  };
  const price = tickerPayload.tick?.close;

  if (!price) {
    throw new Error(`Huobi ticker fetch failed for ${symbol}`);
  }

  return price;
}

async function fetchHuobiOpenOrders(credentials: ReturnType<typeof resolveHuobiCredentials>) {
  const payload = await huobiFetch<HuobiOpenOrdersResponse>(
    `https://www.huobi.com/futures/api/-/x/hbg/v1/copytrading/trader/open-unmatch-orders?userSign=NDU5ODIzNzM&pageNo=1&pageSize=100&x-b3-traceid=${credentials.apiKey}`,
    {
      method: "GET",
    },
    credentials,
  );

  if (payload.code !== 200) {
    throw new Error(`Huobi open orders fetch failed: ${JSON.stringify(payload)}`);
  }

  return payload.data?.orders ?? [];
}

export function detectNewHuobiOrder(
  previousOrders: HuobiOpenOrderPayload[],
  nextOrders: HuobiOpenOrderPayload[],
) {
  const previousIds = new Set(previousOrders.map((order) => String(order.id)));
  return nextOrders.find((order) => !previousIds.has(String(order.id))) ?? null;
}

export async function createHuobiLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}) {
  const credentials = resolveHuobiCredentials(input.credentials);
  const leverage = huobiLeverageBySymbol[input.symbol];

  if (!leverage) {
    throw new Error(`Huobi leverage mapping missing for ${input.symbol}`);
  }

  const normalized = normalizeHuobiSymbol(input.symbol);
  const orderDirection = input.positionSide === "long" ? 1 : 2;
  const previousOrders = await fetchHuobiOpenOrders(credentials);

  for (let attempt = 0; attempt < HUOBI_POSITION_POLL_ATTEMPTS; attempt += 1) {
    const price = await fetchHuobiTickerPrice(input.symbol);
    const payload = await huobiFetch<{ code: number }>(
      `https://www.huobi.com/futures/api/-/x/hbg/v1/copytrading/trader/place-contract-order?x-b3-traceid=${credentials.apiKey}`,
      {
        method: "POST",
        body: JSON.stringify({
          symbol: normalized,
          price: String(price),
          amount: String(input.amount),
          orderPriceType: 8,
          orderDirection,
          leverRate: leverage,
          profitRate: "",
          lossRate: "",
          positionModel: 2,
        }),
      },
      credentials,
    );

    if (payload.code !== 200) {
      throw new Error(`Huobi live create failed: ${JSON.stringify(payload)}`);
    }

    await sleep(HUOBI_POSITION_POLL_DELAY_MS);

    const nextOrders = await fetchHuobiOpenOrders(credentials);
    const newOrder = detectNewHuobiOrder(previousOrders, nextOrders);
    if (!newOrder) {
      continue;
    }

    return {
      orderId: String(newOrder.id),
      followOrderId: input.followOrderId,
      symbol: input.symbol,
      amount: toNumber(newOrder.openAmount) || input.amount,
      positionSide: newOrder.direction,
      openAvgPrice: toNumber(newOrder.openPrice) || price,
      openTime: newOrder.openTime || Date.now(),
    } satisfies ExecutionFill;
  }

  throw new Error(
    `Huobi live create order was accepted but no new open order could be confirmed for ${input.symbol}.`,
  );
}

export async function closeHuobiLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  orderId: string;
  amount?: number;
}) {
  const credentials = resolveHuobiCredentials(input.credentials);
  const openOrders = await fetchHuobiOpenOrders(credentials);
  const matchingOrder = openOrders.find((order) => String(order.id) === String(input.orderId));

  const payload = await huobiFetch<HuobiCloseResponse>(
    `https://www.huobi.com/futures/api/-/x/hbg/v1/copytrading/trader/close-position?id=${input.orderId}&x-b3-traceid=${credentials.apiKey}`,
    {
      method: "POST",
      body: JSON.stringify({
        id: Number(input.orderId),
      }),
    },
    credentials,
  );

  if (payload.code !== 200) {
    throw new Error(`Huobi live close failed: ${JSON.stringify(payload)}`);
  }

  return {
    orderId: input.orderId,
    closedAmount: toNumber(matchingOrder?.openAmount) || input.amount || 0,
    closeTime: Date.now(),
  } satisfies CloseFill;
}
