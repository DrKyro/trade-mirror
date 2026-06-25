import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";

async function ensureUser() {
  const email = "bybit-runtime-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `bybit-runtime-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Bybit Runtime Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create bybit runtime verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const traderId = `bybit-verify-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.includes("api2.bybit.com")) {
      return new Response(
        JSON.stringify({
          retCode: 0,
          result: {
            openTradeInfoProtection: 1,
            data: [],
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

    throw new Error(`Unexpected fetch URL in bybit runtime verification: ${url}`);
  }) as typeof fetch;

  try {
    await runtime.addTraderForUser(verifyUser.id, {
      id: traderId,
      name: "Bybit Runtime Verify Trader",
      platform: "bybit",
      link: "https://www.bybit.com/copyTrade/trade-center/detail?leaderMark=test",
      avatar: "https://dummyimage.com/96x96/111827/ffffff&text=BY",
      strategyStatus: "follow",
      strategyName: "Bybit Verify",
      strategyRiskRate: 0.1,
      balance: 0,
      monthlyAveragePositionValue: 0,
      threeMonthMaxDrawdown: 0,
      positionUpdateTime: null,
      positions: [],
    });

    let errorMessage = null;
    try {
      await runtime.refreshTraderPositions(traderId);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const status = await runtime.getBybitRuntimeStatus();
    const events = await runtime.getEvents();
    const bybitWarnEvent =
      events.find((event) => event.title === "bybit browser fallback attention required") ?? null;

    console.log(
      JSON.stringify(
        {
          traderId,
          errorMessage,
          lastStatus: status.lastStatus,
          lastMode: status.lastMode,
          lastTraderId: status.lastTraderId,
          hasDetail: Boolean(status.lastDetail),
          hasScreenshotPath: Boolean(status.lastScreenshotPath),
          lastAttemptAt: status.lastAttemptAt,
          hasWarnEvent: Boolean(bybitWarnEvent),
          warnEventScope: bybitWarnEvent?.scope ?? null,
          warnEventLevel: bybitWarnEvent?.level ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.removeTraderForUser(verifyUser.id, traderId);
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
