import { createTraderRecordFromDraft } from "../src/lib/trading/trader-defaults";
import { inferTraderProfile } from "../src/lib/trading/trader-profile-inference";

async function main() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (!url.includes("okx.com/priapi/v5/ecotrade/public/basic-info")) {
      throw new Error(`Unexpected fetch URL in okx profile inference verification: ${url}`);
    }

    return new Response(
      JSON.stringify({
        code: "0",
        data: [
          {
            nickName: "Inferred OKX Trader",
            portrait: "https://static.okx.com/example/inferred-avatar.png",
            sign: "inferred sign",
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
  }) as typeof fetch;

  try {
    const profile = await inferTraderProfile({
      id: "OKX-INFER-1",
      platform: "okx",
    });
    const trader = createTraderRecordFromDraft(
      {
        id: "OKX-INFER-1",
        name: "Fallback Name",
        platform: "okx",
      },
      {
        profile,
      },
    );

    console.log(
      JSON.stringify(
        {
          profile,
          trader: {
            name: trader.name,
            nickName: trader.nickName ?? null,
            avatar: trader.avatar,
            sign: trader.sign ?? null,
            strategyName: trader.strategyName,
            link: trader.link,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
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
