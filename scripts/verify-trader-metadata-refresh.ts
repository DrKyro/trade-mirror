import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "trader-metadata-refresh-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `trader-metadata-refresh-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Trader Metadata Refresh Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create trader metadata verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const traderId = `okx-metadata-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;
  const now = Date.now();

  const trader: TraderRecord = {
    id: traderId,
    name: "OKX Metadata Verify",
    platform: "okx",
    link: `https://example.com/${traderId}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=M",
    strategyStatus: "follow",
    strategyName: "Metadata Verify",
    strategyRiskRate: 0.1,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: 0,
    positionUpdateTime: null,
    positions: [],
  };

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.includes("okx.com/priapi/v5/ecotrade/public/position-detail")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              tradeItemId: "okx-meta-pos-1",
              instId: "BTC-USDT-SWAP",
              openAvgPx: "100000",
              markPx: "100500",
              margin: "50",
              lever: "20",
              openTime: String(now - 5 * 60 * 1000),
              closeTime: null,
              mgnMode: "cross",
              pnl: "10",
              pnlRatio: "0.02",
              posSide: "long",
              availSubPos: 1,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/basic-info")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              nickName: "Leak Crypto Verify",
              portrait: "https://static.okx.com/example/portrait.png",
              sign: "Metadata refresh verification signature",
              uniqueName: traderId,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/trade-stat")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: {
            pnl: "500",
            yieldRatio: "0.25",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/yield-pnl")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              pnl: "0",
              ratio: "0",
              statTime: String(now - 75 * 24 * 60 * 60 * 1_000),
            },
            {
              pnl: "200",
              ratio: "0.1",
              statTime: String(now - 45 * 24 * 60 * 60 * 1_000),
            },
            {
              pnl: "-100",
              ratio: "-0.05",
              statTime: String(now - 15 * 24 * 60 * 60 * 1_000),
            },
            {
              pnl: "500",
              ratio: "0.25",
              statTime: String(now - 2 * 24 * 60 * 60 * 1_000),
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/position-history")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              id: "history-1",
              instId: "BTC-USDT-SWAP",
              contractVal: "1",
              subPos: "0.5",
              openAvgPx: "20000",
              openTime: String(now - 10 * 24 * 60 * 60 * 1_000),
              uTime: String(now - 9 * 24 * 60 * 60 * 1_000),
            },
            {
              id: "history-2",
              instId: "ETH-USDT-SWAP",
              contractVal: "1",
              subPos: "3",
              openAvgPx: "3000",
              openTime: String(now - 20 * 24 * 60 * 60 * 1_000),
              uTime: String(now - 19 * 24 * 60 * 60 * 1_000),
            },
            {
              id: "history-3",
              instId: "SOL-USDT-SWAP",
              contractVal: "1",
              subPos: "50",
              openAvgPx: "100",
              openTime: String(now - 60 * 24 * 60 * 60 * 1_000),
              uTime: String(now - 59 * 24 * 60 * 60 * 1_000),
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    throw new Error(`Unexpected fetch URL in metadata refresh verification: ${url}`);
  }) as typeof fetch;

  try {
    await runtime.addTraderForUser(verifyUser.id, trader);
    await runtime.refreshTraderPositions(traderId);

    const refreshed = (await runtime.getTraders()).find((item) => item.id === traderId);
    if (!refreshed) {
      throw new Error("Refreshed trader was not found.");
    }

    console.log(
      JSON.stringify(
        {
          traderId,
          nickName: refreshed.nickName ?? null,
          avatar: refreshed.avatar,
          sign: refreshed.sign ?? null,
          balance: refreshed.balance,
          monthlyAveragePositionValue: refreshed.monthlyAveragePositionValue,
          threeMonthMaxDrawdown: refreshed.threeMonthMaxDrawdown,
          positionCount: refreshed.positions.length,
          firstPositionId: refreshed.positions[0]?.id ?? null,
          historyPositionCount: refreshed.historyPositions?.length ?? 0,
          historySymbols: refreshed.historyPositions?.map((item) => item.symbol) ?? [],
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.deleteTrader(traderId);
    await db.execute(sql`delete from "user" where id = ${verifyUser.id}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
