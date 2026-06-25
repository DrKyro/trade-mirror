import { getTradingRuntime } from "../src/lib/trading/runtime";

async function main() {
  const runtime = getTradingRuntime();

  await runtime.updateNotificationRouteOverrides({
    default: ["feishu"],
    "trader-change": ["telegram"],
    "runtime-warning": ["discord"],
    startup: ["feishu", "discord"],
    "bybit-attention": ["telegram", "discord"],
  });

  const config = await runtime.getNotificationConfig();

  console.log(
    JSON.stringify(
      {
        defaultRoute: config.routeSummary.default,
        traderChangeRoute: config.routeSummary["trader-change"],
        runtimeWarningRoute: config.routeSummary["runtime-warning"],
        startupRoute: config.routeSummary.startup,
        bybitAttentionRoute: config.routeSummary["bybit-attention"],
        hasRuntimeOverrides: Boolean(config.runtimeRouteOverrides),
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
