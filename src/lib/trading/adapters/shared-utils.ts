export function normalizeSymbol(instId: string) {
  if (!instId.includes("-")) return instId;
  const [base, quote] = instId.split("-");
  return `${base}${quote}`;
}

export function numberFromUnknown(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0) return Number(value);
  return 0;
}

export function finiteOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toTimestampOrNull(value: unknown) {
  const numeric = finiteOrNull(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

export function normalizePositionSide(value: unknown): "long" | "short" {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "short" || normalized === "sell") return "short";
  return "long";
}

export function normalizeTeacherSymbol(symbol: string) {
  return symbol
    .replace(":USDT", "")
    .replace("/USDT", "USDT")
    .replace("-USDT", "USDT")
    .replace("/", "");
}

export function normalizeSwapSymbol(symbol: string) {
  return symbol.includes("/") ? `${symbol}:USDT` : `${symbol.replace("USDT", "/USDT")}:USDT`;
}

export function resolveCredentials(
  credentials:
    | { apiKey?: string | null; apiSecret?: string | null; apiPassword?: string | null }
    | null
    | undefined,
  envPrefix: "BITGET" | "OKX" | "BINANCE" | "BYBIT",
) {
  const apiKey = credentials?.apiKey || process.env[`${envPrefix}_API_KEY`];
  const apiSecret = credentials?.apiSecret || process.env[`${envPrefix}_API_SECRET`];
  const apiPassword = credentials?.apiPassword || process.env[`${envPrefix}_API_PASSWORD`] || null;

  return { apiKey, apiSecret, apiPassword };
}

export function position(
  input: import("#/lib/trading/types").PositionSnapshot,
): import("#/lib/trading/types").PositionSnapshot {
  return { ...input };
}

export function mapCcxtPositionsToSnapshots(
  positions: Array<Record<string, unknown>>,
): import("#/lib/trading/types").PositionSnapshot[] {
  const results: import("#/lib/trading/types").PositionSnapshot[] = [];

  for (const pos of positions) {
    const contracts = numberFromUnknown(pos.contracts ?? pos.contractSize ?? pos.amount);
    if (!(Math.abs(contracts) > 0)) continue;

    const info =
      pos.info && typeof pos.info === "object" ? (pos.info as Record<string, unknown>) : null;
    const symbol = normalizeTeacherSymbol(String(pos.symbol ?? ""));
    const side = normalizePositionSide(pos.side ?? info?.posSide ?? info?.holdSide ?? info?.side);
    const entryPrice = numberFromUnknown(pos.entryPrice ?? pos.average);
    const markPrice = finiteOrNull(pos.markPrice);
    const leverage = numberFromUnknown(pos.leverage) || 1;
    const pnl = finiteOrNull(pos.unrealizedPnl ?? info?.unrealisedPnl ?? info?.upl);
    const notional = entryPrice * Math.abs(contracts);

    results.push({
      id: String(pos.id ?? `${symbol}-${side}`),
      symbol,
      entryPrice,
      markPrice,
      amount: Math.abs(contracts),
      leverage,
      openTime: toTimestampOrNull(pos.timestamp),
      closeTime: null,
      margin: finiteOrNull(pos.initialMargin ?? pos.collateral),
      marginMode: pos.marginMode ? String(pos.marginMode) : null,
      pnl,
      pnlRatio: pnl !== null && notional > 0 ? pnl / notional : null,
      positionSide: side,
      closeAvgPrice: null,
      contractValue: finiteOrNull(pos.contractSize),
    });
  }

  return results;
}

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;
