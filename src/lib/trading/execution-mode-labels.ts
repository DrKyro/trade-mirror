import type { ExecutionMode, TraderPlatform } from "#/lib/trading/types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

const MODE_LABEL_KEY: Record<ExecutionMode, string> = {
  "dry-run": "accounts.executionMode.dryRun",
  demo: "accounts.executionMode.demo",
  live: "accounts.executionMode.live",
};

const MODE_HINT_KEY: Record<ExecutionMode, string> = {
  "dry-run": "accounts.executionMode.dryRunHint",
  demo: "accounts.executionMode.demoHint",
  live: "accounts.executionMode.liveHint",
};

const DEMO_HINT_KEY: Record<TraderPlatform, string> = {
  okx: "accounts.demoApiHint.okx",
  bitget: "accounts.demoApiHint.bitget",
  binanceFutures: "accounts.demoApiHint.binanceFutures",
  bybit: "accounts.demoApiHint.bybit",
};

export function getExecutionModeLabel(mode: ExecutionMode, t: Translate) {
  return t(MODE_LABEL_KEY[mode]);
}

export function getExecutionModeHint(mode: ExecutionMode, t: Translate) {
  return t(MODE_HINT_KEY[mode]);
}

export function getPlatformDemoApiHint(platform: TraderPlatform, t: Translate) {
  return t(DEMO_HINT_KEY[platform]);
}

export function getExecutionModeBadgeVariant(
  mode: ExecutionMode,
): "destructive" | "secondary" | "outline" {
  if (mode === "live") {
    return "destructive";
  }
  if (mode === "demo") {
    return "secondary";
  }
  return "outline";
}
