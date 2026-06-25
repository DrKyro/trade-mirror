import { prepareTraderRecordForCreation } from "../src/lib/trading/trader-draft-service";

async function main() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (
      !url.includes("binance.com/bapi/futures/v1/friendly/future/copy-trade/lead-portfolio/detail")
    ) {
      throw new Error(
        `Unexpected fetch URL in binance trader draft preparation verification: ${url}`,
      );
    }

    return new Response(
      JSON.stringify({
        code: "000000",
        success: true,
        data: {
          nickname: "Prepared Binance Trader",
          avatarUrl: "https://binance.com/example/prepared-avatar.png",
          description: "prepared binance sign",
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
    const trader = await prepareTraderRecordForCreation({
      id: "BINANCE-PREP-1",
      name: "Fallback Binance Draft Name",
      platform: "binance",
    });

    console.log(
      JSON.stringify(
        {
          name: trader.name,
          nickName: trader.nickName ?? null,
          avatar: trader.avatar,
          sign: trader.sign ?? null,
          strategyName: trader.strategyName,
          link: trader.link,
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
