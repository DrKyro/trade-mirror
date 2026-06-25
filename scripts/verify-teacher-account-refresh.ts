import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";

async function ensureUser() {
  const email = "teacher-refresh-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `teacher-refresh-verify-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Teacher Refresh Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create teacher refresh verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const teacherId = `teacher-refresh-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/copytrading/user-profit")) {
      return new Response(
        JSON.stringify({
          data: {
            totalAsset: 321.45,
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
                id: "order-1",
                symbol: "BTC-USDT",
                direction: "long",
                openAmount: "0.02",
                lever: "50",
                bondAmount: "12.5",
                openPrice: "65000",
                openProfit: "8.25",
                marketPrice: "65412",
                openTime: 1710000000000,
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

    throw new Error(`Unexpected fetch URL in teacher refresh verification: ${url}`);
  }) as typeof fetch;

  try {
    await runtime.addTeacher({
      ownerUserId: verifyUser.id,
      id: teacherId,
      name: "Huobi Refresh Verify",
      platform: "huobi",
      executionMode: "live",
      credentials: {
        apiKey: "verify-key",
        apiSecret: "verify-secret",
        apiPassword: "verify-cookie",
      },
    });

    const refreshed = await runtime.refreshTeacherAccountForUser(verifyUser.id, teacherId);
    const fetchedTeacher = (await runtime.getTeachersForUser(verifyUser.id)).find(
      (teacher) => teacher.id === teacherId,
    );

    console.log(
      JSON.stringify(
        {
          teacherId,
          refreshedBalance: refreshed?.balance ?? null,
          refreshedEquity: refreshed?.equity ?? null,
          refreshedFreeUsdt: refreshed?.freeUsdt ?? null,
          refreshedUnrealizedPnl: refreshed?.unrealizedPnl ?? null,
          hasTeacherPositions: (refreshed?.teacherPositions.length ?? 0) === 1,
          persistedTeacherPositions: (fetchedTeacher?.teacherPositions.length ?? 0) === 1,
          persistedSymbol: fetchedTeacher?.teacherPositions[0]?.symbol ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
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
