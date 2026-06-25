import { prepareTraderRecordForCreation } from "../src/lib/trading/trader-draft-service";

async function main() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (!url.includes("okx.com/priapi/v5/ecotrade/public/basic-info")) {
      throw new Error(`Unexpected fetch URL in okx trader draft preparation verification: ${url}`);
    }

    return new Response(
      JSON.stringify({
        code: "0",
        data: [
          {
            nickName: "Prepared OKX Trader",
            portrait: "https://static.okx.com/example/prepared-avatar.png",
            sign: "prepared sign",
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
    const trader = await prepareTraderRecordForCreation({
      id: "OKX-PREP-1",
      name: "Fallback Draft Name",
      platform: "okx",
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
