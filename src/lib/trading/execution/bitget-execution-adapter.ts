import "@tanstack/react-start/server-only";
import ccxt from "ccxt";

import { normalizeSwapSymbol, resolveCredentials } from "#/lib/trading/execution/common";
import type { CloseFill, ExecutionFill, TeacherCredentials } from "#/lib/trading/types";

function ensureBitgetCredentials(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret, apiPassword } = resolveCredentials(credentials, "BITGET");

  if (!apiKey || !apiSecret || !apiPassword) {
    throw new Error(
      "Bitget live execution requires teacher credentials or BITGET_API_* environment variables",
    );
  }

  return {
    apiKey,
    apiSecret,
    apiPassword,
  };
}

function getExchange(credentials: TeacherCredentials | null | undefined) {
  const resolved = ensureBitgetCredentials(credentials);
  return new ccxt.bitget({
    apiKey: resolved.apiKey,
    secret: resolved.apiSecret,
    password: resolved.apiPassword,
    options: {
      defaultType: "swap",
    },
  });
}

export async function createBitgetLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}) {
  const exchange = getExchange(input.credentials);
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
  } satisfies ExecutionFill;
}

export async function closeBitgetLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  orderId: string;
  symbol: string;
  amount: number;
}) {
  const exchange = getExchange(input.credentials);
  const response = (await exchange.privateMixPostMixV1TraceCloseTrackOrder({
    symbol: `${input.symbol}_UMCBL`,
    trackingNo: input.orderId,
  })) as {
    code: string;
  };

  if (response.code !== "00000") {
    throw new Error(`Bitget close failed: ${JSON.stringify(response)}`);
  }

  return {
    orderId: input.orderId,
    closedAmount: input.amount,
    closeTime: Date.now(),
  } satisfies CloseFill;
}
