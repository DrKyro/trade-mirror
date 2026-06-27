import "@tanstack/react-start/server-only";
import type { BybitRuntimeState } from "#/lib/trading/types";

export const BYBIT_RUNTIME_METADATA_KEY = "bybitRuntime";

export function createDefaultBybitRuntimeState(): BybitRuntimeState {
  return {
    lastStatus: "idle",
    lastMode: null,
    lastTraderId: null,
    lastDetail: null,
    lastScreenshotPath: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
  };
}

export function parseBybitRuntimeState(rawState: unknown): BybitRuntimeState {
  if (!rawState || typeof rawState !== "object") {
    return createDefaultBybitRuntimeState();
  }
  const candidate = rawState as Partial<BybitRuntimeState>;
  return {
    ...createDefaultBybitRuntimeState(),
    ...candidate,
    lastStatus:
      typeof candidate.lastStatus === "string"
        ? candidate.lastStatus
        : createDefaultBybitRuntimeState().lastStatus,
    lastMode:
      candidate.lastMode === "api" || candidate.lastMode === "browser-fallback"
        ? candidate.lastMode
        : null,
    lastTraderId: typeof candidate.lastTraderId === "string" ? candidate.lastTraderId : null,
    lastDetail: typeof candidate.lastDetail === "string" ? candidate.lastDetail : null,
    lastScreenshotPath:
      typeof candidate.lastScreenshotPath === "string" ? candidate.lastScreenshotPath : null,
    lastAttemptAt: typeof candidate.lastAttemptAt === "number" ? candidate.lastAttemptAt : null,
    lastSuccessAt: typeof candidate.lastSuccessAt === "number" ? candidate.lastSuccessAt : null,
  };
}
