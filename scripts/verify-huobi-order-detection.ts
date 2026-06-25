import { detectNewHuobiOrder } from "../src/lib/trading/execution/huobi-execution-adapter";

async function main() {
  const previous = [
    {
      id: 101,
      symbol: "BTC-USDT",
      direction: "long" as const,
      openAmount: "0.01",
      openPrice: "100000",
      openTime: 1,
    },
  ];

  const next = [
    ...previous,
    {
      id: 202,
      symbol: "ETH-USDT",
      direction: "short" as const,
      openAmount: "0.08",
      openPrice: "3500",
      openTime: 2,
    },
  ];

  const detected = detectNewHuobiOrder(previous, next);

  console.log(
    JSON.stringify(
      {
        found: Boolean(detected),
        orderId: detected?.id ?? null,
        symbol: detected?.symbol ?? null,
        direction: detected?.direction ?? null,
        openAmount: detected?.openAmount ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
