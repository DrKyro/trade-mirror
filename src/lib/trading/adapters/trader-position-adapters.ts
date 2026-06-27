import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import { getAdapter } from "#/lib/trading/adapters/registry";
import type { TraderRecord } from "#/lib/trading/types";

export type { TraderLiveSnapshot } from "#/lib/trading/adapters/platform-adapter";

export async function fetchTraderLiveSnapshot(
  trader: TraderRecord,
): Promise<import("#/lib/trading/adapters/platform-adapter").TraderLiveSnapshot> {
  return getAdapter(trader.platform).fetchLiveSnapshot(trader);
}

export async function fetchTraderPositions(trader: TraderRecord) {
  return (await fetchTraderLiveSnapshot(trader)).positions;
}
