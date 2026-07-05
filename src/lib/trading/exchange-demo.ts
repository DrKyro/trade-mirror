import type { Exchange } from "ccxt";

import {
  EXCHANGE_DEMO_INFO,
  platformSupportsDemo,
  type ExchangeDemoMethod,
} from "#/lib/trading/execution-mode";
import type { ExecutionMode, TraderPlatform } from "#/lib/trading/types";

type DemoCapableExchange = Exchange & {
  setSandboxMode?: (enabled: boolean) => void;
  enableDemoTrading?: (enabled: boolean) => void;
};

export function getExchangeDemoMethod(platform: TraderPlatform): ExchangeDemoMethod | null {
  if (!platformSupportsDemo(platform)) {
    return null;
  }
  return EXCHANGE_DEMO_INFO[platform].method;
}

export function applyExecutionModeToExchange(
  exchange: Exchange,
  platform: TraderPlatform,
  executionMode: ExecutionMode,
) {
  if (executionMode !== "demo") {
    return;
  }

  if (!platformSupportsDemo(platform)) {
    throw new Error(`${platform} does not support exchange demo trading`);
  }

  const demoExchange = exchange as DemoCapableExchange;
  const method = getExchangeDemoMethod(platform);

  if (method === "sandbox") {
    if (typeof demoExchange.setSandboxMode !== "function") {
      throw new Error(`${platform} ccxt adapter does not support setSandboxMode`);
    }
    demoExchange.setSandboxMode(true);
    return;
  }

  if (typeof demoExchange.enableDemoTrading !== "function") {
    throw new Error(`${platform} ccxt adapter does not support enableDemoTrading`);
  }
  demoExchange.enableDemoTrading(true);
}
