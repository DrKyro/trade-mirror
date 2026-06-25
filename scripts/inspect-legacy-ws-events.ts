import { getTradingRuntime } from "../src/lib/trading/runtime";

async function main() {
  const runtime = getTradingRuntime();
  const events = await runtime.getEvents();
  console.log(JSON.stringify(events.slice(0, 12), null, 2));
}

void main();
