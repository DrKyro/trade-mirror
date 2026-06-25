import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "teacher-auto-refresh-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `teacher-auto-refresh-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Teacher Auto Refresh Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create teacher auto-refresh verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const teacherId = `teacher-auto-refresh-${crypto.randomUUID().slice(0, 8)}`;
  const traderId = `teacher-auto-trader-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/copytrading/user-profit")) {
      return new Response(
        JSON.stringify({
          data: {
            totalAsset: 456.78,
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

    if (url.includes("/copytrading/trader/open-unmatch-orders")) {
      return new Response(
        JSON.stringify({
          data: {
            orders: [
              {
                id: "auto-refresh-order",
                symbol: "ETH-USDT",
                direction: "short",
                openAmount: "0.08",
                lever: "20",
                bondAmount: "7.2",
                openPrice: "3500",
                openProfit: "-1.2",
                marketPrice: "3515",
                openTime: 1711000000000,
              },
            ],
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

    throw new Error(`Unexpected fetch URL in auto refresh verification: ${url}`);
  }) as typeof fetch;

  const trader: TraderRecord = {
    id: traderId,
    name: "Teacher Auto Refresh Trader",
    platform: "okx",
    link: `https://example.com/${traderId}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=A",
    strategyStatus: "follow",
    strategyName: "Auto Refresh Strategy",
    strategyRiskRate: 0.12,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: -100,
    positionUpdateTime: null,
    positions: [],
  };

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: teacherId,
      name: "Huobi Auto Refresh Verify",
      platform: "huobi",
      executionMode: "live",
      credentials: {
        apiKey: "verify-key",
        apiSecret: "verify-secret",
        apiPassword: "verify-cookie",
      },
    });

    await runtime.addTraderForUser(verifyUser.id, trader);
    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, teacherId, [
      {
        id: trader.id,
        name: trader.name,
        funds: 0,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.2,
        stopLossUsdt: 20,
        stopLossPositionValueRate: 0.1,
        followStatus: "following",
        unrealizedProfitSum: 0,
        followProfit: 0,
      },
    ]);

    await runtime.ingestTraderSnapshot(trader.id, [
      {
        id: "signal-position-1",
        symbol: "ETHUSDT",
        entryPrice: 3500,
        markPrice: 3515,
        amount: 0.4,
        leverage: 20,
        openTime: 1711000000000,
        closeTime: null,
        margin: 7,
        marginMode: "cross",
        pnl: 6,
        pnlRatio: 0.04,
        positionSide: "short",
        closeAvgPrice: null,
        contractValue: null,
      },
    ]);

    const refreshedTeacher = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (teacher) => teacher.id === teacherId,
    );

    console.log(
      JSON.stringify(
        {
          teacherId,
          liveBalanceRefreshed: refreshedTeacher?.balance ?? null,
          liveEquityRefreshed: refreshedTeacher?.equity ?? null,
          liveTeacherPositions: refreshedTeacher?.teacherPositions.length ?? 0,
          liveTeacherPositionSymbol: refreshedTeacher?.teacherPositions[0]?.symbol ?? null,
          liveTeacherPositionSide: refreshedTeacher?.teacherPositions[0]?.positionSide ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.removeTeacherForUser(verifyUser.id, teacherId);
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
