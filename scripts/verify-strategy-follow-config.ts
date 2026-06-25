import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "strategy-follow-config-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `strategy-follow-config-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Strategy Follow Config Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create strategy-follow-config verification user.");
  }

  return created;
}

function buildTrader(id: string): TraderRecord {
  return {
    id,
    name: "Strategy Follow Config Trader",
    platform: "okx",
    link: `https://example.com/${id}`,
    avatar: "https://dummyimage.com/96x96/1e293b/ffffff&text=FC",
    strategyStatus: "follow",
    strategyName: "Follow Config Verify",
    strategyRiskRate: 0.18,
    balance: 0,
    monthlyAveragePositionValue: 2000,
    threeMonthMaxDrawdown: -250,
    positionUpdateTime: null,
    positions: [],
  };
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const verifyTeacherId = `verify-follow-config-teacher-${crypto.randomUUID().slice(0, 8)}`;
  const verifyTraderId = `verify-follow-config-trader-${crypto.randomUUID().slice(0, 8)}`;
  const trader = buildTrader(verifyTraderId);

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: verifyTeacherId,
      name: "Follow Config Verify Teacher",
      platform: "bitget",
    });

    await runtime.addTraderForUser(verifyUser.id, trader);

    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, verifyTeacherId, [
      {
        id: verifyTraderId,
        name: trader.name,
        funds: 1200,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.44,
        stopLossUsdt: 110,
        stopLossPositionValueRate: 0.07,
        followStatus: "following",
        unrealizedProfitSum: 0,
        followProfit: 0,
      },
    ]);

    const teachers = await runtime.getTeachersForUser(verifyUser.id);
    const teacher = teachers.find((entry) => entry.id === verifyTeacherId);
    const setting = teacher?.traceTraderList.find((entry) => entry.id === verifyTraderId);

    console.log(
      JSON.stringify(
        {
          teacherId: verifyTeacherId,
          traderId: verifyTraderId,
          teacherFound: Boolean(teacher),
          settingFound: Boolean(setting),
          traceOrderMode: setting?.traceOrderMode ?? null,
          tracePerRatio: setting?.tracePerRatio ?? null,
          stopLossUsdt: setting?.stopLossUsdt ?? null,
          stopLossPositionValueRate: setting?.stopLossPositionValueRate ?? null,
          funds: setting?.funds ?? null,
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
