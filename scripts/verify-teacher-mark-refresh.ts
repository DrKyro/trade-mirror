import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "teacher-mark-refresh-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `teacher-mark-refresh-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Teacher Mark Refresh Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create teacher mark refresh verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const teacherId = `teacher-mark-${crypto.randomUUID().slice(0, 8)}`;
  const traderId = `teacher-mark-trader-${crypto.randomUUID().slice(0, 8)}`;

  const trader: TraderRecord = {
    id: traderId,
    name: "Teacher Mark Trader",
    platform: "okx",
    link: `https://example.com/${traderId}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=M",
    strategyStatus: "follow",
    strategyName: "Mark Refresh Strategy",
    strategyRiskRate: 0.1,
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
      name: "Teacher Mark Refresh",
      platform: "bitget",
      executionMode: "dry-run",
    });

    await runtime.addTraderForUser(verifyUser.id, trader);
    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, teacherId, [
      {
        id: trader.id,
        name: trader.name,
        funds: 0,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.5,
        stopLossUsdt: 0,
        stopLossPositionValueRate: 0.5,
        followStatus: "following",
        unrealizedProfitSum: 0,
        followProfit: 0,
      },
    ]);

    await runtime.ingestTraderSnapshot(trader.id, [
      {
        id: "mark-position-1",
        symbol: "BTCUSDT",
        entryPrice: 100,
        markPrice: 100,
        amount: 2,
        leverage: 10,
        openTime: 1712000000000,
        closeTime: null,
        margin: 20,
        marginMode: "cross",
        pnl: 0,
        pnlRatio: 0,
        positionSide: "long",
        closeAvgPrice: null,
        contractValue: null,
      },
    ]);

    const beforeRefresh = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (teacher) => teacher.id === teacherId,
    );

    await runtime.ingestTraderSnapshot(trader.id, [
      {
        id: "mark-position-1",
        symbol: "BTCUSDT",
        entryPrice: 100,
        markPrice: 94,
        amount: 2,
        leverage: 10,
        openTime: 1712000000000,
        closeTime: null,
        margin: 20,
        marginMode: "cross",
        pnl: -12,
        pnlRatio: -0.06,
        positionSide: "long",
        closeAvgPrice: null,
        contractValue: null,
      },
    ]);

    const afterRefresh = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (teacher) => teacher.id === teacherId,
    );

    console.log(
      JSON.stringify(
        {
          teacherId,
          relationCreated: (beforeRefresh?.followRelations.length ?? 0) === 1,
          markPriceUpdatedWithoutAmountChange: afterRefresh?.followRelations[0]?.markPrice ?? null,
          unrealizedProfitUpdated: afterRefresh?.followRelations[0]?.unrealizedProfit ?? null,
          relationStillOpenAfterMarkOnlyUpdate: (afterRefresh?.followRelations.length ?? 0) === 1,
          followProfitAfterStopLoss: afterRefresh?.traceTraderList[0]?.followProfit ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
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
