import ccxt from "ccxt";

import { resolveCredentials } from "#/lib/trading/adapters/shared-utils";
import { applyExecutionModeToExchange } from "#/lib/trading/exchange-demo";
import type { ExecutionMode, TeacherCredentials, TraderPlatform } from "#/lib/trading/types";

const ENV_PREFIX = {
  okx: "OKX",
  bitget: "BITGET",
  binanceFutures: "BINANCE",
  bybit: "BYBIT",
} as const satisfies Record<TraderPlatform, "OKX" | "BITGET" | "BINANCE" | "BYBIT">;

const SWAP_OPTIONS = { defaultType: "swap" as const };

export function createTeacherExchange(
  platform: TraderPlatform,
  credentials: TeacherCredentials | null | undefined,
  executionMode: ExecutionMode = "live",
) {
  const envPrefix = ENV_PREFIX[platform];
  const { apiKey, apiSecret, apiPassword } = resolveCredentials(credentials, envPrefix);

  if (!apiKey || !apiSecret) {
    throw new Error(
      `${platform} requires teacher API credentials or ${envPrefix}_API_* environment variables`,
    );
  }

  let exchange: ccxt.Exchange;
  switch (platform) {
    case "okx": {
      if (!apiPassword) {
        throw new Error("OKX requires API passphrase");
      }
      exchange = new ccxt.okx({
        apiKey,
        secret: apiSecret,
        password: apiPassword,
        options: SWAP_OPTIONS,
      });
      break;
    }
    case "bitget": {
      if (!apiPassword) {
        throw new Error("Bitget requires API passphrase");
      }
      exchange = new ccxt.bitget({
        apiKey,
        secret: apiSecret,
        password: apiPassword,
        options: SWAP_OPTIONS,
      });
      break;
    }
    case "binanceFutures": {
      exchange = new ccxt.binance({
        apiKey,
        secret: apiSecret,
        options: SWAP_OPTIONS,
      });
      break;
    }
    case "bybit": {
      exchange = new ccxt.bybit({
        apiKey,
        secret: apiSecret,
        options: SWAP_OPTIONS,
      });
      break;
    }
    default: {
      const unsupported: never = platform;
      throw new Error(`Unsupported teacher exchange platform: ${unsupported}`);
    }
  }

  applyExecutionModeToExchange(exchange, platform, executionMode);
  return exchange;
}
