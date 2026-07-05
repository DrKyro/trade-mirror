import type { ExecutionMode, TraderPlatform } from "#/lib/trading/types";

export type ExchangeDemoMethod = "sandbox" | "enableDemoTrading";

export interface ExchangeDemoInfo {
  supportsDemo: boolean;
  method: ExchangeDemoMethod;
  docsUrl: string;
}

export const EXCHANGE_DEMO_INFO: Record<TraderPlatform, ExchangeDemoInfo> = {
  okx: {
    supportsDemo: true,
    method: "sandbox",
    docsUrl: "https://www.okx.com/help/demo-trading-faq",
  },
  bitget: {
    supportsDemo: true,
    method: "sandbox",
    docsUrl: "https://www.bitget.com/support/articles/12560603820393",
  },
  binanceFutures: {
    supportsDemo: true,
    method: "enableDemoTrading",
    docsUrl: "https://demo.binance.com/",
  },
  bybit: {
    supportsDemo: true,
    method: "enableDemoTrading",
    docsUrl: "https://bybit-exchange.github.io/docs/v5/demo",
  },
};

export function platformSupportsDemo(platform: TraderPlatform) {
  return EXCHANGE_DEMO_INFO[platform].supportsDemo;
}

export function isExchangeBackedMode(
  mode: ExecutionMode | null | undefined,
): mode is "live" | "demo" {
  return mode === "live" || mode === "demo";
}

export function getNextExecutionMode(
  current: ExecutionMode,
  platform: TraderPlatform,
): ExecutionMode {
  if (current === "dry-run") {
    return platformSupportsDemo(platform) ? "demo" : "live";
  }
  if (current === "demo") {
    return "live";
  }
  return "dry-run";
}

export const EXECUTION_MODES: ExecutionMode[] = ["dry-run", "demo", "live"];
