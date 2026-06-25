import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import { createTraderRecordFromDraft } from "../src/lib/trading/trader-defaults";

async function ensureUser() {
  const email = "add-trader-auto-hydration-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `add-trader-auto-hydration-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Add Trader Auto Hydration Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create add trader auto hydration verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const traderId = `auto-hydrate-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;
  const now = Date.now();

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.includes("okx.com/priapi/v5/ecotrade/public/position-detail")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              tradeItemId: "auto-hydrate-pos-1",
              instId: "BTC-USDT-SWAP",
              openAvgPx: "90000",
              markPx: "90500",
              margin: "60",
              lever: "15",
              openTime: String(now - 60_000),
              closeTime: null,
              mgnMode: "cross",
              pnl: "5",
              pnlRatio: "0.01",
              posSide: "long",
              availSubPos: 1,
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/basic-info")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              nickName: "Auto Hydrated Trader",
              portrait: "https://static.okx.com/example/auto-hydrated.png",
              sign: "hydrated on create",
              uniqueName: traderId,
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/trade-stat")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: {
            pnl: "240",
            yieldRatio: "0.12",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/yield-pnl")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              pnl: "120",
              ratio: "0.06",
              statTime: String(now - 10 * 24 * 60 * 60 * 1_000),
            },
            {
              pnl: "240",
              ratio: "0.12",
              statTime: String(now - 2 * 24 * 60 * 60 * 1_000),
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url.includes("okx.com/priapi/v5/ecotrade/public/position-history")) {
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              id: "auto-history-1",
              instId: "BTC-USDT-SWAP",
              contractVal: "1",
              subPos: "0.3",
              openAvgPx: "90000",
              openTime: String(now - 8 * 24 * 60 * 60 * 1_000),
              uTime: String(now - 7 * 24 * 60 * 60 * 1_000),
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected fetch URL in add trader auto hydration verification: ${url}`);
  }) as typeof fetch;

  try {
    await runtime.addTraderForUser(
      verifyUser.id,
      createTraderRecordFromDraft({
        id: traderId,
        name: "New OKX Trader",
        platform: "okx",
        link: `https://example.com/${traderId}`,
      }),
    );

    const created = (await runtime.getTradersForUser(verifyUser.id)).find(
      (item) => item.id === traderId,
    );
    if (!created) {
      throw new Error("Auto-hydrated trader was not found after add.");
    }

    console.log(
      JSON.stringify(
        {
          traderId: created.id,
          nickName: created.nickName ?? null,
          avatar: created.avatar,
          sign: created.sign ?? null,
          balance: created.balance,
          monthlyAveragePositionValue: created.monthlyAveragePositionValue,
          positionCount: created.positions.length,
          firstPositionId: created.positions[0]?.id ?? null,
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
