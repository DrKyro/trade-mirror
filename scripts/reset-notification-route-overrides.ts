import { getTradingRuntime } from "../src/lib/trading/runtime";

async function main() {
  const runtime = getTradingRuntime();
  await runtime.updateNotificationRouteOverrides(null);
  const config = await runtime.getNotificationConfig();

  console.log(
    JSON.stringify(
      {
        defaultRoute: config.routeSummary.default,
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
