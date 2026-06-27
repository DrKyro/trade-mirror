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
  envPrefix: "BITGET" | "OKX" | "BINANCE",
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

export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;
export const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1_000;
