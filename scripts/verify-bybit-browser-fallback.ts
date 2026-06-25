import { fetchBybitPositionsWithBrowserFallback } from "../src/lib/trading/adapters/bybit-browser-fallback";

async function main() {
  const traderId = process.env.BYBIT_VERIFY_TRADER_ID || "x97dwd+UULkEnbzk83ErVQ==";
  const positions = await fetchBybitPositionsWithBrowserFallback(traderId);

  console.log(
    JSON.stringify(
      {
        traderId,
        positionCount: positions.length,
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
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
