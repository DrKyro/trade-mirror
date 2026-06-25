import { createTraderRecordFromDraft } from "../src/lib/trading/trader-defaults";

function main() {
  const samples = [
    createTraderRecordFromDraft({
      id: "OKX123",
      name: "OKX Trader",
      platform: "okx",
    }),
    createTraderRecordFromDraft({
      id: "BITGET123",
      name: "Bitget Trader",
      platform: "bitget",
    }),
    createTraderRecordFromDraft({
      id: "11585",
      name: "TraderWagon Trader",
      platform: "traderWagon",
    }),
    createTraderRecordFromDraft({
      id: "mark-123",
      name: "Bybit Trader",
      platform: "bybit",
    }),
    createTraderRecordFromDraft({
      id: "ENC123",
      name: "Binance Futures Trader",
      platform: "binanceFutures",
    }),
    createTraderRecordFromDraft({
      id: "PORT123",
      name: "Binance Copy Trader",
      platform: "binance",
    }),
  ];

  console.log(
    JSON.stringify(
      samples.map((sample) => ({
        platform: sample.platform,
        id: sample.id,
        link: sample.link,
      })),
      null,
      2,
    ),
  );
}

main();
