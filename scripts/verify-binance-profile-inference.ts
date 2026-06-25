import { createTraderRecordFromDraft } from "../src/lib/trading/trader-defaults";
import { inferTraderProfile } from "../src/lib/trading/trader-profile-inference";

async function main() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (
      !url.includes("binance.com/bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/detail")
    ) {
      throw new Error(`Unexpected fetch URL in binance profile inference verification: ${url}`);
    }

    return new Response(
      JSON.stringify({
        code: "000000",
        success: true,
        data: {
          nickname: "Inferred Binance Trader",
          avatarUrl: "https://binance.com/example/inferred-avatar.png",
          description: "inferred binance sign",
        },
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
      id: "BINANCE-INFER-1",
      platform: "binance",
    });
    const trader = createTraderRecordFromDraft(
      {
        id: "BINANCE-INFER-1",
        name: "Fallback Binance Name",
        platform: "binance",
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
