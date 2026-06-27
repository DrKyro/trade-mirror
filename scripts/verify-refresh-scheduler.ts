import { getTradingRuntime } from "../src/lib/trading/runtime";

async function main() {
  const runtime = getTradingRuntime();

  const started = await runtime.startRefreshScheduler();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const runningSnapshot = await runtime.getRefreshScheduler();
  const stopped = await runtime.stopRefreshScheduler();

  console.log(
    JSON.stringify(
      {
        startedRunning: started.running,
        runningSnapshot: runningSnapshot.running,
        stoppedRunning: stopped.running,
        supportedPlatforms: started.supportedPlatforms,
        hasBybit: started.supportedPlatforms.includes("bybit"),
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
