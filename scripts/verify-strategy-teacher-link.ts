import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "strategy-teacher-link-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `strategy-teacher-link-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Strategy Teacher Link Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create strategy-teacher verification user.");
  }

  return created;
}

function buildTrader(id: string): TraderRecord {
  return {
    id,
    name: "Strategy Teacher Link Trader",
    platform: "okx",
    link: `https://example.com/${id}`,
    avatar: "https://dummyimage.com/96x96/0f172a/ffffff&text=SL",
    strategyStatus: "watch",
    strategyName: "Link Verify Strategy",
    strategyRiskRate: 0.12,
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
  const verifyTeacherId = `verify-strategy-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const verifyTraderId = `verify-strategy-trader-${crypto.randomUUID().slice(0, 8)}`;
  const trader = buildTrader(verifyTraderId);

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: verifyTeacherId,
      name: "Strategy Link Verify Teacher",
      platform: "bitget",
    });

    await runtime.addTraderForUser(verifyUser.id, trader);

    const teachersBefore = await runtime.getTeachersForUser(verifyUser.id);
    const teacherBefore = teachersBefore.find((entry) => entry.id === verifyTeacherId);
    if (!teacherBefore) {
      throw new Error("Teacher missing before link verification.");
    }

    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, verifyTeacherId, [
      ...teacherBefore.traceTraderList,
      {
        id: trader.id,
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

    const teachersAfter = await runtime.getTeachersForUser(verifyUser.id);
    const teacherAfter = teachersAfter.find((entry) => entry.id === verifyTeacherId);

    console.log(
      JSON.stringify(
        {
          verifyUserId: verifyUser.id,
          teacherId: verifyTeacherId,
          traderId: verifyTraderId,
          teacherFound: Boolean(teacherAfter),
          traceTraderLinked: Boolean(
            teacherAfter?.traceTraderList.some((entry) => entry.id === verifyTraderId),
          ),
          linkedSetting:
            teacherAfter?.traceTraderList.find((entry) => entry.id === verifyTraderId) ?? null,
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
