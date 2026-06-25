import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { PositionSnapshot, TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "follow-relation-remap-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `follow-relation-remap-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Follow Relation Remap Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create remap verification user.");
  }

  return created;
}

function buildTrader(id: string): TraderRecord {
  return {
    id,
    name: "Follow Relation Remap Trader",
    platform: "okx",
    link: `https://example.com/${id}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=RM",
    strategyStatus: "follow",
    strategyName: "Remap Verify Strategy",
    strategyRiskRate: 0.15,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: -100,
    positionUpdateTime: null,
    positions: [],
  };
}

function buildPosition(id: string): PositionSnapshot {
  return {
    id,
    symbol: "BTCUSDT",
    entryPrice: 100_000,
    markPrice: 100_150,
    amount: 1,
    leverage: 20,
    openTime: Date.now(),
    closeTime: null,
    margin: 5000,
    marginMode: "cross",
    pnl: 150,
    pnlRatio: 0.0015,
    positionSide: "long",
    closeAvgPrice: null,
    contractValue: null,
  };
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const verifyTeacherId = `verify-remap-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const verifyTraderId = `verify-remap-trader-${crypto.randomUUID().slice(0, 8)}`;
  const trader = buildTrader(verifyTraderId);

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: verifyTeacherId,
      name: "Remap Verify Teacher",
      platform: "bitget",
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

    await runtime.ingestTraderSnapshot(verifyTraderId, [buildPosition("follow-order-new")]);

    await runtime.updateTeacherFollowRelationsForUser(verifyUser.id, verifyTeacherId, [
      {
        orderId: "local-order-1",
        followOrderId: "follow-order-old",
        followTraderId: verifyTraderId,
        symbol: "BTCUSDT",
        amount: 0.1,
        positionSide: "long",
        openAvgPrice: 100_000,
        markPrice: 100_150,
        unrealizedProfit: 15,
        updateTime: Date.now(),
        openTime: Date.now(),
      },
    ]);

    await runtime.remapTeacherFollowRelationForUser(verifyUser.id, verifyTeacherId, {
      orderId: "local-order-1",
      nextFollowOrderId: "follow-order-new",
    });

    const remappedTeacher = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (entry) => entry.id === verifyTeacherId,
    );

    await runtime.remapTeacherFollowRelationForUser(verifyUser.id, verifyTeacherId, {
      orderId: "local-order-1",
      nextFollowOrderId: null,
    });

    const clearedTeacher = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (entry) => entry.id === verifyTeacherId,
    );

    console.log(
      JSON.stringify(
        {
          teacherId: verifyTeacherId,
          remappedFollowOrderId:
            remappedTeacher?.followRelations.find((entry) => entry.orderId === "local-order-1")
              ?.followOrderId ?? null,
          remappedFollowTraderId:
            remappedTeacher?.followRelations.find((entry) => entry.orderId === "local-order-1")
              ?.followTraderId ?? null,
          clearedRelationMissing: !clearedTeacher?.followRelations.some(
            (entry) => entry.orderId === "local-order-1",
          ),
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
