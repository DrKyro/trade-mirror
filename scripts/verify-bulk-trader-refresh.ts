import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "bulk-trader-refresh-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `bulk-trader-refresh-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Bulk Trader Refresh Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create bulk trader refresh verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const okxTraderId = `bulk-okx-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;

  const okxTrader: TraderRecord = {
    id: okxTraderId,
    name: "Bulk OKX Trader",
    platform: "okx",
    link: `https://example.com/${okxTraderId}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=O",
    strategyStatus: "follow",
    strategyName: "Bulk OKX",
    strategyRiskRate: 0.1,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: -100,
    positionUpdateTime: null,
    positions: [],
  };

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.includes("okx.com/priapi/v5/ecotrade/public/position-detail")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              tradeItemId: "okx-pos-1",
              instId: "BTC-USDT-SWAP",
              openAvgPx: "100000",
              markPx: "100500",
              margin: "50",
              lever: "20",
              openTime: "1714000000000",
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
              nickName: "Bulk OKX Alias",
              portrait: "https://dummyimage.com/96x96/111827/ffffff&text=OKX",
              sign: "Bulk refresh metadata verification",
              uniqueName: okxTraderId,
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
            pnl: "100",
            yieldRatio: "0.1",
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
              pnl: "50",
              ratio: "0.05",
              statTime: String(Date.now() - 10 * 24 * 60 * 60 * 1_000),
            },
            {
              pnl: "100",
              ratio: "0.1",
              statTime: String(Date.now() - 2 * 24 * 60 * 60 * 1_000),
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
              id: "okx-history-1",
              instId: "BTC-USDT-SWAP",
              contractVal: "1",
              subPos: "0.25",
              openAvgPx: "100000",
              openTime: String(Date.now() - 7 * 24 * 60 * 60 * 1_000),
              uTime: String(Date.now() - 6 * 24 * 60 * 60 * 1_000),
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

    if (init?.method === "POST" && url.includes("binance.com")) {
      return new Response(
        JSON.stringify({
          code: "000000",
          data: {
            otherPositionRetList: [],
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

    throw new Error(`Unexpected fetch URL in bulk refresh verification: ${url}`);
  }) as typeof fetch;

  try {
    await runtime.addTraderForUser(verifyUser.id, okxTrader);

    const result = await runtime.refreshAllSupportedTraderPositions();
    const traders = await runtime.getTraders();
    const refreshedOkx = traders.find((trader) => trader.id === okxTraderId);

    console.log(
      JSON.stringify(
        {
          total: result.total,
          refreshedCount: result.refreshedTraderIds.length,
          failedCount: result.failed.length,
          okxUpdated: refreshedOkx?.positions.length ?? 0,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.deleteTrader(okxTraderId);
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
