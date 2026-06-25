import "@tanstack/react-start/server-only";
import ccxt from "ccxt";

import { normalizeSwapSymbol, resolveCredentials } from "#/lib/trading/execution/common";
import type { CloseFill, ExecutionFill, TeacherCredentials } from "#/lib/trading/types";

function getExchange(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret } = resolveCredentials(credentials, "BINANCE");

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Binance live execution requires teacher credentials or BINANCE_API_KEY / BINANCE_API_SECRET",
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

export async function createBinanceLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}) {
  const exchange = getExchange(input.credentials);
  const side = input.positionSide === "long" ? "BUY" : "SELL";
  const positionSide = input.positionSide === "long" ? "LONG" : "SHORT";

  const order = await exchange.createOrder(
    normalizeSwapSymbol(input.symbol),
    "MARKET",
    side,
    input.amount,
    undefined,
    { positionSide },
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

export async function closeBinanceLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  orderId: string;
}) {
  const exchange = getExchange(input.credentials);
  const side = input.positionSide === "long" ? "SELL" : "BUY";
  const positionSide = input.positionSide === "long" ? "LONG" : "SHORT";

  await exchange.createOrder(
    normalizeSwapSymbol(input.symbol),
    "MARKET",
    side,
    input.amount,
    undefined,
    { positionSide },
  );

  return {
    orderId: input.orderId,
    closedAmount: input.amount,
    closeTime: Date.now(),
  } satisfies CloseFill;
}
