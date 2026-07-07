import type { Exchange } from "ccxt";

import { normalizeSwapSymbol } from "#/lib/trading/adapters/shared-utils";

function roundAmount(exchange: Exchange, symbol: string, amount: number) {
  const normalized = normalizeSwapSymbol(symbol);
  return Number(exchange.amountToPrecision(normalized, amount));
}

export async function loadMarket(exchange: Exchange, symbol: string) {
  await exchange.loadMarkets();
  return exchange.market(normalizeSwapSymbol(symbol));
}

export async function prepareMarketOrderAmount(exchange: Exchange, symbol: string, amount: number) {
  if (!(amount > 0)) {
    throw new Error(`Order amount must be positive, received ${amount}`);
  }

  const market = await loadMarket(exchange, symbol);
  const normalizedSymbol = market.symbol;
  const rounded = roundAmount(exchange, symbol, amount);

  if (!(rounded > 0)) {
    throw new Error(
      `Order amount ${amount} rounds to zero for ${normalizedSymbol} (precision ${market.precision?.amount ?? "unknown"})`,
    );
  }

  const minAmount = market.limits?.amount?.min;
  if (typeof minAmount === "number" && minAmount > 0 && rounded < minAmount) {
    throw new Error(
      `Order amount ${rounded} is below minimum ${minAmount} for ${normalizedSymbol}`,
    );
  }

  const minCost = market.limits?.cost?.min;
  const markPrice =
    market.info && typeof market.info === "object"
      ? Number((market.info as Record<string, unknown>).markPx)
      : NaN;
  if (
    typeof minCost === "number" &&
    minCost > 0 &&
    Number.isFinite(markPrice) &&
    markPrice > 0 &&
    rounded * markPrice < minCost
  ) {
    throw new Error(
      `Order notional ${(rounded * markPrice).toFixed(4)} is below minimum ${minCost} for ${normalizedSymbol}`,
    );
  }

  return rounded;
}

export async function ensureSymbolLeverage(
  exchange: Exchange,
  symbol: string,
  leverage?: number | null,
) {
  const normalized = Math.max(1, Math.round(leverage ?? 20));
  if (typeof exchange.setLeverage !== "function") {
    return normalized;
  }

  const market = await loadMarket(exchange, symbol);
  await exchange.setLeverage(normalized, market.symbol);
  return normalized;
}

export function buildOkxOrderParams(positionSide: "long" | "short", marginMode?: string | null) {
  const tdMode = marginMode === "isolated" ? "isolated" : "cross";
  return {
    tdMode,
    posSide: positionSide,
  } satisfies Record<string, string>;
}

export function buildBinanceOrderParams(positionSide: "long" | "short") {
  return {
    positionSide: positionSide === "long" ? "LONG" : "SHORT",
  } satisfies Record<string, string>;
}
