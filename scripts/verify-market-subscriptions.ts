import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";

async function ensureUser() {
  const email = "market-subscription-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `market-subscription-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Market Subscription Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create market subscription verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const teacherId = `market-teacher-${crypto.randomUUID().slice(0, 8)}`;

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: teacherId,
      name: "Market Verify Teacher",
      platform: "bitget",
      executionMode: "dry-run",
    });

    await runtime.updateTeacherTraceTradersForUser(verifyUser.id, teacherId, [
      {
        id: "EAE06055569E8B1A",
        name: "OKX Alpha Rider",
        funds: 0,
        traceOrderMode: "ratio",
        fixedFunds: 0,
        tracePerRatio: 0.1,
        stopLossUsdt: 100,
        stopLossPositionValueRate: 0.05,
        followStatus: "following",
        unrealizedProfitSum: 0,
        followProfit: 0,
      },
    ]);

    await runtime.updateTeacherFollowRelationsForUser(verifyUser.id, teacherId, [
      {
        orderId: "market-local-1",
        followOrderId: "btc-long-1",
        followTraderId: "EAE06055569E8B1A",
        symbol: "BTCUSDT",
        amount: 0.02,
        positionSide: "long",
        openAvgPrice: 104250,
        markPrice: 105100,
        unrealizedProfit: 17,
        updateTime: Date.now(),
        openTime: Date.now() - 60000,
      },
    ]);

    const marketSubscriptions = await runtime.getMarketSubscriptions();
    const bitgetState =
      marketSubscriptions.platforms.find((platform) => platform.platform === "bitget") ?? null;

    console.log(
      JSON.stringify(
        {
          activePlatforms: marketSubscriptions.activePlatforms,
          totalSymbols: marketSubscriptions.totalSymbols,
          totalRelations: marketSubscriptions.totalRelations,
          bitgetSymbols: bitgetState?.symbols ?? [],
          bitgetTeacherIds: bitgetState?.teacherIds ?? [],
          bitgetRelationCount: bitgetState?.relationCount ?? 0,
          bitgetLastTraderSnapshotAt: bitgetState?.lastTraderSnapshotAt ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.removeTeacherForUser(verifyUser.id, teacherId);
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
