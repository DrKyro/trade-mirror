import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "amount-change-follow-execution-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `amount-change-follow-execution-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Amount Change Follow Execution Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create amount-change verification user.");
  }

  return created;
}

function buildTrader(id: string): TraderRecord {
  return {
    id,
    name: "Amount Change Verify Trader",
    platform: "okx",
    link: `https://example.com/${id}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=AC",
    strategyStatus: "follow",
    strategyName: "Amount Change Verify",
    strategyRiskRate: 0.1,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: -100,
    positionUpdateTime: null,
    positions: [],
  };
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const teacherId = `amount-change-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const traderId = `amount-change-trader-${crypto.randomUUID().slice(0, 8)}`;
  const trader = buildTrader(traderId);

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: teacherId,
      name: "Amount Change Verify Teacher",
      platform: "bitget",
      executionMode: "dry-run",
      settings: {
        accountMaxRiskRate: 1,
        safeMarginRate: 0,
        limitRiskRatio: 1,
      },
    });

    await runtime.addTraderForUser(verifyUser.id, trader);
    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, teacherId, [
      {
        id: traderId,
        name: trader.name,
        funds: 0,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.1,
        stopLossUsdt: 0,
        stopLossPositionValueRate: 0.1,
        followStatus: "following",
        unrealizedProfitSum: 0,
        followProfit: 0,
      },
    ]);

    await runtime.ingestTraderSnapshot(traderId, [
      {
        id: "signal-position-1",
        symbol: "BTCUSDT",
        entryPrice: 100_000,
        markPrice: 100_100,
        amount: 10,
        leverage: 20,
        openTime: 1711000000000,
        closeTime: null,
        margin: 5_000,
        marginMode: "cross",
        pnl: 1_000,
        pnlRatio: 0.01,
        positionSide: "long",
        closeAvgPrice: null,
        contractValue: null,
      },
    ]);

    await runtime.ingestTraderSnapshot(traderId, [
      {
        id: "signal-position-1",
        symbol: "BTCUSDT",
        entryPrice: 100_000,
        markPrice: 100_120,
        amount: 14,
        leverage: 20,
        openTime: 1711000000000,
        closeTime: null,
        margin: 7_000,
        marginMode: "cross",
        pnl: 1_680,
        pnlRatio: 0.012,
        positionSide: "long",
        closeAvgPrice: null,
        contractValue: null,
      },
    ]);

    await runtime.ingestTraderSnapshot(traderId, [
      {
        id: "signal-position-1",
        symbol: "BTCUSDT",
        entryPrice: 100_000,
        markPrice: 100_090,
        amount: 11,
        leverage: 20,
        openTime: 1711000000000,
        closeTime: null,
        margin: 5_500,
        marginMode: "cross",
        pnl: 990,
        pnlRatio: 0.009,
        positionSide: "long",
        closeAvgPrice: null,
        contractValue: null,
      },
    ]);

    const teacher = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (entry) => entry.id === teacherId,
    );

    const followAmounts = teacher?.followRelations.map((relation) => relation.amount) ?? [];
    const totalFollowAmount = followAmounts.reduce((sum, amount) => sum + amount, 0);
    const lastHistory = teacher?.positionHistory.slice(-3) ?? [];

    console.log(
      JSON.stringify(
        {
          teacherId,
          relationCount: teacher?.followRelations.length ?? 0,
          followAmounts,
          totalFollowAmount,
          positionHistoryActions: lastHistory.map((entry) => entry.action),
          positionHistoryAmounts: lastHistory.map((entry) => entry.amount),
          finalTracePerRatio:
            teacher?.traceTraderList.find((entry) => entry.id === traderId)?.tracePerRatio ?? null,
          followProfit:
            teacher?.traceTraderList.find((entry) => entry.id === traderId)?.followProfit ?? null,
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
