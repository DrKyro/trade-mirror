import { runDiscoverCrawler } from "../src/lib/trading/discover-crawler";

async function main() {
  const result = await runDiscoverCrawler();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
