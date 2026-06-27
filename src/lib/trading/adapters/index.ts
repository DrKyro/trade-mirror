import "@tanstack/react-start/server-only";
import { binanceAdapter } from "#/lib/trading/adapters/binance-adapter";
import { bitgetAdapter } from "#/lib/trading/adapters/bitget-adapter";
import { bybitAdapter } from "#/lib/trading/adapters/bybit-adapter";
import { okxAdapter } from "#/lib/trading/adapters/okx-adapter";
import { registerAdapter } from "#/lib/trading/adapters/registry";

registerAdapter(okxAdapter);
registerAdapter(bitgetAdapter);
registerAdapter(binanceAdapter);
registerAdapter(bybitAdapter);

export {
  getAdapter,
  getAllAdapters,
  getAllEndpoints,
  getAllTraderModels,
  getSupportedRankPlatforms,
} from "#/lib/trading/adapters/registry";
export type {
  PlatformAdapter,
  EndpointDefinition,
  TraderLiveSnapshot,
} from "#/lib/trading/adapters/platform-adapter";
export { fetchJson, FetchError } from "#/lib/trading/adapters/fetch-utils";
