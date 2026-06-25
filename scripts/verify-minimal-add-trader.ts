import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { user } from "../src/lib/db/schema/auth.schema";
import { getTradingRuntime } from "../src/lib/trading/runtime";
import { prepareTraderRecordForCreation } from "../src/lib/trading/trader-draft-service";

async function ensureUser() {
  const email = "minimal-add-trader-verify@example.com";
  const existing = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.email, email),
  });

  if (existing) {
    return existing;
  }

  const id = `minimal-add-trader-${crypto.randomUUID()}`;
  await db.insert(user).values({
    id,
    email,
    name: "Minimal Add Trader Verify",
    emailVerified: true,
    image: null,
  });

  const created = await db.query.user.findFirst({
    where: (table, { eq }) => eq(table.id, id),
  });

  if (!created) {
    throw new Error("Failed to create minimal add trader verification user.");
  }

  return created;
}

async function main() {
  const runtime = getTradingRuntime();
  const verifyUser = await ensureUser();
  const traderId = `minimal-add-${crypto.randomUUID().slice(0, 8)}`;
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("okx.com/priapi/v5/ecotrade/public/basic-info")) {
        return new Response(
          JSON.stringify({
            code: "0",
            data: [
              {
                nickName: "Minimal Inferred Trader",
                portrait: "https://static.okx.com/example/minimal-inferred.png",
                sign: "minimal inferred sign",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }

      throw new Error(`Unexpected fetch URL in minimal add trader verification: ${url}`);
    }) as typeof fetch;

    const trader = await prepareTraderRecordForCreation({
      id: traderId,
      name: "Minimal Trader",
      platform: "okx",
    });
    await runtime.addTraderForUser(verifyUser.id, trader);

    const created = (await runtime.getTradersForUser(verifyUser.id)).find(
      (item) => item.id === traderId,
    );
    if (!created) {
      throw new Error("Minimal trader was not found after add.");
    }

    console.log(
      JSON.stringify(
        {
          traderId: created.id,
          name: created.name,
          nickName: created.nickName ?? null,
          link: created.link,
          strategyName: created.strategyName,
          strategyStatus: created.strategyStatus,
          strategyRiskRate: created.strategyRiskRate,
          avatar: created.avatar,
          sign: created.sign ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
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
