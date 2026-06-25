import { createServer } from "node:net";

import WebSocket from "ws";

import { ensureLegacyWsBridge } from "../src/lib/trading/legacy-ws-bridge";
import { getTradingRuntime } from "../src/lib/trading/runtime";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to resolve ephemeral port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function main() {
  const runtime = getTradingRuntime();
  const bridgePort = await getFreePort();
  const tradersBefore = await runtime.getTraders();
  const existing = tradersBefore.find((trader) => trader.id === "legacy-ws-verify");

  if (existing) {
    await runtime.deleteTrader(existing.id);
  }

  const bridge = await ensureLegacyWsBridge({
    port: bridgePort,
    onLegacyPositionChange: async ({ trader, changes }) => {
      await runtime.ingestLegacyPositionChange({
        trader,
        changes,
      });
    },
  });

  if (!bridge) {
    throw new Error("Legacy WS bridge failed to start for verification");
  }

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${bridgePort}`);
    client.once("open", () => resolve(client));
    client.once("error", reject);
  });

  ws.send(
    JSON.stringify({
      topic: "trader",
      data: {
        type: "positionChange",
        changes: [
          {
            id: "legacy-ws-order-1",
            symbol: "BTCUSDT",
            entryPrice: 101000,
            markPrice: 101250,
            amount: 0.12,
            leverage: 20,
            openTime: Date.now() - 60_000,
            closeTime: null,
            margin: 606,
            marginMode: "cross",
            pnl: 30,
            pnlRatio: 0.024,
            positionSide: "long",
            closeAvgPrice: null,
            contractValue: null,
            added: true,
            message: "BTCUSDT 开多",
          },
        ],
        trader: {
          id: "legacy-ws-verify",
          name: "Legacy WS Verify",
          platform: "okx",
          link: "https://www.okx.com/copy-trading/account/legacy-ws-verify",
          avatar: "https://example.com/legacy-ws-verify.png",
          strategyStatus: "watch",
          strategyName: "Legacy WS Verify",
        },
      },
    }),
  );

  await sleep(250);
  ws.close();

  let trader = null as Awaited<ReturnType<typeof runtime.getTraders>>[number] | null;
  let events = await runtime.getEvents();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const tradersAfter = await runtime.getTraders();
    trader = tradersAfter.find((item) => item.id === "legacy-ws-verify") ?? null;
    events = await runtime.getEvents();
    if (trader?.positions.length) {
      break;
    }
    await sleep(250);
  }

  console.log(
    JSON.stringify(
      {
        traderCreated: Boolean(trader),
        traderPositionCount: trader?.positions.length ?? 0,
        ingestedOrderId: trader?.positions[0]?.id ?? null,
        lastEventTitles: events.slice(0, 6).map((event) => event.title),
        hasLegacyBridgeEvent: events.some((event) =>
          event.title.includes("legacy traderSpy websocket bridge"),
        ),
        hasLegacyPayloadEvent: events.some((event) => event.title === "legacy ws payload ingested"),
        hasSnapshotIngestedEvent: events.some((event) => event.title === "snapshot ingested"),
      },
      null,
      2,
    ),
  );

  await bridge.close();
  if (trader) {
    await runtime.deleteTrader(trader.id);
  }
}

void main();
