import "@tanstack/react-start/server-only";
import ccxt from "ccxt";

import { normalizeSwapSymbol, resolveCredentials } from "#/lib/trading/execution/common";
import type { CloseFill, ExecutionFill, TeacherCredentials } from "#/lib/trading/types";

function getExchange(credentials: TeacherCredentials | null | undefined) {
  const { apiKey, apiSecret, apiPassword } = resolveCredentials(credentials, "OKX");

  if (!apiKey || !apiSecret || !apiPassword) {
    throw new Error(
      "OKX live execution requires teacher credentials or OKX_API_* environment variables",
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

export async function createOkxLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  followOrderId: string;
}) {
  const exchange = getExchange(input.credentials);
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
  } satisfies ExecutionFill;
}

export async function closeOkxLiveOrder(input: {
  credentials: TeacherCredentials | null | undefined;
  symbol: string;
  amount: number;
  positionSide: "long" | "short";
  orderId: string;
}) {
  const exchange = getExchange(input.credentials);
  const side = input.positionSide === "long" ? "sell" : "buy";

  await exchange.createMarketOrder(normalizeSwapSymbol(input.symbol), side, input.amount);

  return {
    orderId: input.orderId,
    closedAmount: input.amount,
    closeTime: Date.now(),
  } satisfies CloseFill;
}
