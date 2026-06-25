import "@tanstack/react-start/server-only";
import type { TeacherCredentials } from "#/lib/trading/types";

export function normalizeSwapSymbol(symbol: string) {
  return symbol.includes("/") ? `${symbol}:USDT` : `${symbol.replace("USDT", "/USDT")}:USDT`;
}

export function resolveCredentials(
  credentials: TeacherCredentials | null | undefined,
  envPrefix: "BITGET" | "OKX" | "BINANCE" | "HUOBI",
) {
  const apiKey = credentials?.apiKey || process.env[`${envPrefix}_API_KEY`];
  const apiSecret = credentials?.apiSecret || process.env[`${envPrefix}_API_SECRET`];
  const apiPassword = credentials?.apiPassword || process.env[`${envPrefix}_API_PASSWORD`] || null;

  return {
    apiKey,
    apiSecret,
    apiPassword,
  };
}
