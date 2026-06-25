import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import { marketCandle } from "../src/lib/db/schema/trading.schema";
import { getMarketCandles, saveMarketCandles } from "../src/lib/trading/market-history";
import type { MarketCandle } from "../src/lib/trading/types";

async function main() {
  const base = Date.now() - 10 * 60 * 1000;
  const candles: MarketCandle[] = [
    {
      platform: "okx",
      symbol: "BTCUSDT",
      interval: "1m",
      datetime: base,
      open: 100,
      high: 101,
      low: 99.5,
      close: 100.5,
      volume: 12.5,
    },
    {
      platform: "okx",
      symbol: "BTCUSDT",
      interval: "1m",
      datetime: base + 60_000,
      open: 100.5,
      high: 102,
      low: 100.2,
      close: 101.3,
      volume: 13.2,
    },
  ];

  await saveMarketCandles(candles);
  const rows = await getMarketCandles("okx", "BTCUSDT", "1m", base - 1_000, base + 120_000);

  console.log(
    JSON.stringify(
      {
        count: rows.length,
        first: rows[0] ?? null,
        last: rows.at(-1) ?? null,
      },
      null,
      2,
    ),
  );

  await db.delete(marketCandle).where(sql`
    ${marketCandle.platform} = 'okx'
    and ${marketCandle.symbol} = 'BTCUSDT'
    and ${marketCandle.interval} = '1m'
    and ${marketCandle.datetime} >= to_timestamp(${(base - 1_000) / 1000})
  `);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
