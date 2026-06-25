import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import type { TraderRecord } from "../src/lib/trading/types";

async function ensureUser() {
  const email = "workspace-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `workspace-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Workspace Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const verifyTraderId = `verify-trader-${crypto.randomUUID().slice(0, 8)}`;
  const verifyTeacherId = `verify-teacher-${crypto.randomUUID().slice(0, 8)}`;

  const trader: TraderRecord = {
    id: verifyTraderId,
    name: "Workspace Verify Trader",
    platform: "okx",
    link: `https://example.com/${verifyTraderId}`,
    avatar: "https://dummyimage.com/96x96/111827/ffffff&text=V",
    strategyStatus: "follow",
    strategyName: "Verify Strategy",
    strategyRiskRate: 0.15,
    balance: 0,
    monthlyAveragePositionValue: 0,
    threeMonthMaxDrawdown: -100,
    positionUpdateTime: null,
    positions: [],
  };

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: verifyTeacherId,
      name: "Workspace Verify Teacher",
      platform: "bitget",
    });

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

    const linked = await runtime.addTraderForUser(verifyUser.id, trader);
    const linkedIds = linked.map((item) => item.id);

    const removed = await runtime.removeTraderForUser(verifyUser.id, verifyTraderId);
    const removedIds = (removed ?? []).map((item) => item.id);

    await runtime.addTraderForUser(verifyUser.id, trader);
    await runtime.deleteTrader(verifyTraderId);

    const afterDelete = await runtime.getTradersForUser(verifyUser.id);
    const teachersAfterDelete = await runtime.getTeachersForUser(verifyUser.id);
    const teacherAfterDelete = teachersAfterDelete.find((item) => item.id === verifyTeacherId);

    console.log(
      JSON.stringify(
        {
          verifyUserId: verifyUser.id,
          linkedToUser: linkedIds.includes(verifyTraderId),
          removedFromWorkspace: !removedIds.includes(verifyTraderId),
          deletedFromSharedPool: !afterDelete.some((item) => item.id === verifyTraderId),
          teacherTraceCleared: !teacherAfterDelete?.traceTraderList.some(
            (item) => item.id === verifyTraderId,
          ),
          teacherRelationsCleared: !teacherAfterDelete?.followRelations.some(
            (item) => item.followTraderId === verifyTraderId,
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.removeTeacherForUser(verifyUser.id, verifyTeacherId);
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
