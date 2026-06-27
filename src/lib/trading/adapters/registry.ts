import "@tanstack/react-start/server-only";
import type { EndpointDefinition, PlatformAdapter } from "#/lib/trading/adapters/platform-adapter";
import type { TraderPlatformModel } from "#/lib/trading/trader-data-model";
import type { TraderPlatform } from "#/lib/trading/types";

const adapters = new Map<TraderPlatform, PlatformAdapter>();

export function registerAdapter(adapter: PlatformAdapter) {
  adapters.set(adapter.platform, adapter);
}

export function getAdapter(platform: TraderPlatform): PlatformAdapter {
  const adapter = adapters.get(platform);
  if (!adapter) {
    throw new Error(`No adapter registered for platform ${platform}`);
  }
  return adapter;
}

export function getAllAdapters(): PlatformAdapter[] {
  return Array.from(adapters.values());
}

export function getAllTraderModels(): TraderPlatformModel[] {
  return getAllAdapters().map((adapter) => adapter.traderModel);
}

export function getAllEndpoints(): Array<
  EndpointDefinition & { platform: TraderPlatform; displayName: string; sampleTraderId: string }
> {
  return getAllAdapters().flatMap((adapter) =>
    adapter.endpoints.map((ep) => ({
      ...ep,
      platform: adapter.platform,
      displayName: adapter.displayName,
      sampleTraderId: adapter.traderModel.sampleTraderId,
    })),
  );
}

export function getSupportedRankPlatforms(): TraderPlatform[] {
  return getAllAdapters()
    .filter((adapter) => adapter.fetchRankList !== undefined)
    .map((adapter) => adapter.platform);
}
