import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { PositionSnapshot, TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "teacher-history-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `teacher-history-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Teacher History Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create teacher history verification user.");
  }

  return created;
}

function buildTrader(id: string): TraderRecord {
  return {
    id,
    name: "Teacher History Verify Trader",
    platform: "okx",
    link: `https://example.com/${id}`,
    avatar: "https://dummyimage.com/96x96/1f2937/ffffff&text=TH",
    strategyStatus: "follow",
    strategyName: "Teacher History Verify Strategy",
    strategyRiskRate: 0.15,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: -200,
    positionUpdateTime: null,
    positions: [],
  };
}

function buildPosition(markPrice: number): PositionSnapshot {
  return {
    id: "verify-btc-position",
    symbol: "BTCUSDT",
    entryPrice: 100_000,
    markPrice,
    amount: 1,
    leverage: 20,
    openTime: Date.now(),
    closeTime: null,
    margin: 5000,
    marginMode: "cross",
    pnl: markPrice - 100_000,
    pnlRatio: (markPrice - 100_000) / 100_000,
    positionSide: "long",
    closeAvgPrice: null,
    contractValue: null,
  };
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const verifyTeacherId = `verify-history-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const verifyTraderId = `verify-history-trader-${crypto.randomUUID().slice(0, 8)}`;
  const trader = buildTrader(verifyTraderId);

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: verifyTeacherId,
      name: "Teacher History Verify Account",
      platform: "bitget",
      executionMode: "dry-run",
    });

    await runtime.addTraderForUser(verifyUser.id, trader);

    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, verifyTeacherId, [
      {
        id: verifyTraderId,
        name: trader.name,
        funds: 0,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.1,
        stopLossUsdt: 0,
        stopLossPositionValueRate: 0.05,
        followStatus: "following",
        unrealizedProfitSum: 0,
        followProfit: 0,
      },
    ]);

    await runtime.ingestTraderSnapshot(verifyTraderId, [buildPosition(100_250)]);
    await runtime.ingestTraderSnapshot(verifyTraderId, []);

    await runtime.updateTeacherSettingsForUser(verifyUser.id, verifyTeacherId, {
      accountMaxRiskRate: 0.2,
      safeMarginRate: 1.1,
      limitRiskRatio: 0.4,
    });

    await runtime.ingestTraderSnapshot(verifyTraderId, [buildPosition(100_100)]);

    const teachers = await runtime.getTeachersForUser(verifyUser.id);
    const teacherRecord = teachers.find((entry) => entry.id === verifyTeacherId);

    if (!teacherRecord) {
      throw new Error("Teacher record missing after verification flow.");
    }

    const openEntries = teacherRecord.positionHistory.filter(
      (entry) => entry.action === 1 && entry.success === 1,
    );
    const closeEntries = teacherRecord.positionHistory.filter(
      (entry) => entry.action === 0 && entry.success === 1,
    );
    const rejectedEntries = teacherRecord.positionHistory.filter((entry) => entry.success === -1);

    console.log(
      JSON.stringify(
        {
          verifyUserId: verifyUser.id,
          teacherId: verifyTeacherId,
          minEquitySamples: teacherRecord.equityHistory.min.length,
          hourEquitySamples: teacherRecord.equityHistory.hour.length,
          dayEquitySamples: teacherRecord.equityHistory.day.length,
          openHistoryRecorded: openEntries.length > 0,
          closeHistoryRecorded: closeEntries.length > 0,
          rejectionHistoryRecorded: rejectedEntries.length > 0,
          lastPositionHistory: teacherRecord.positionHistory.at(-1) ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.removeTeacherForUser(verifyUser.id, verifyTeacherId);
    await runtime.deleteTrader(verifyTraderId);
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
