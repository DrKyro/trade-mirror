import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";

async function ensureUser() {
  const email = "teacher-scheduler-refresh-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `teacher-scheduler-refresh-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Teacher Scheduler Refresh Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create teacher scheduler refresh verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const teacherId = `teacher-scheduler-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/copytrading/user-profit")) {
      return new Response(
        JSON.stringify({
          data: {
            totalAsset: 789.01,
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
                id: "scheduler-order-1",
                symbol: "BTC-USDT",
                direction: "long",
                openAmount: "0.03",
                lever: "25",
                bondAmount: "15.1",
                openPrice: "61000",
                openProfit: "3.6",
                marketPrice: "61120",
                openTime: 1713000000000,
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

    throw new Error(`Unexpected fetch URL in scheduler refresh verification: ${url}`);
  }) as typeof fetch;

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: teacherId,
      name: "Huobi Scheduler Refresh Verify",
      platform: "huobi",
      executionMode: "live",
      credentials: {
        apiKey: "verify-key",
        apiSecret: "verify-secret",
        apiPassword: "verify-cookie",
      },
    });

    await runtime.startRefreshScheduler();
    let refreshedTeacher = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      refreshedTeacher =
        (await runtime.getTeachersForUser(verifyUser.id)).find(
          (teacher) => teacher.id === teacherId,
        ) ?? null;

      if ((refreshedTeacher?.balance ?? 0) > 0) {
        break;
      }
    }
    await runtime.stopRefreshScheduler();

    console.log(
      JSON.stringify(
        {
          teacherId,
          schedulerBalanceRefreshed: refreshedTeacher?.balance ?? null,
          schedulerEquityRefreshed: refreshedTeacher?.equity ?? null,
          schedulerTeacherPositions: refreshedTeacher?.teacherPositions.length ?? 0,
          schedulerTeacherPositionSymbol: refreshedTeacher?.teacherPositions[0]?.symbol ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await runtime.stopRefreshScheduler();
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
