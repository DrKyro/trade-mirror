import puppeteer from "puppeteer";

async function main() {
  const executablePath =
    process.env.BYBIT_PUPPETEER_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const traderId = process.env.BYBIT_VERIFY_TRADER_ID || "x97dwd+UULkEnbzk83ErVQ==";

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      lang: "en-us",
      platform: "pc",
      referer: "https://www.bybit.com/",
    });
    await page.goto(
      `https://api2.bybit.com/fapi/beehive/public/v1/common/order/list-detail?leaderMark=${encodeURIComponent(
        traderId,
      )}&pageSize=5&page=1`,
      {
        waitUntil: "networkidle0",
        timeout: 30_000,
      },
    );

    const content = await page.content();
    console.log(content.slice(0, 4000));
    await page.close();
  } finally {
    await browser.close();
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
