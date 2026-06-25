import "@tanstack/react-start/server-only";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { Browser } from "puppeteer";

import { BybitRuntimeError } from "#/lib/trading/adapters/bybit-runtime";

const BYBIT_API_ENDPOINT = "https://api2.bybit.com/fapi/beehive/public/v1/common/order/list-detail";

let browserPromise: Promise<Browser> | null = null;

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function getScreenshotPath(fileName: string) {
  const directory = process.env.BYBIT_PUPPETEER_SCREENSHOT_DIR || path.join(process.cwd(), "logs");
  return {
    directory,
    filePath: path.join(directory, fileName),
  };
}

async function ensureBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const puppeteer = await import("puppeteer");
      const executablePath =
        process.env.BYBIT_PUPPETEER_EXECUTABLE_PATH ||
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        undefined;

      try {
        return await puppeteer.launch({
          executablePath,
          headless: parseBoolean(process.env.BYBIT_PUPPETEER_HEADLESS, true),
          userDataDir: process.env.BYBIT_PUPPETEER_USER_DATA_DIR || undefined,
          defaultViewport: {
            width: 1440,
            height: 1200,
          },
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } catch (error) {
        browserPromise = null;
        throw new BybitRuntimeError({
          status: "browser-launch-failed",
          mode: "browser-fallback",
          traderId: "unknown",
          detail: `Bybit browser fallback could not start Chrome. Configure BYBIT_PUPPETEER_EXECUTABLE_PATH or approve/install a Puppeteer browser binary. ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    })();
  }

  return browserPromise;
}

function extractJsonFromHtml(html: string) {
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch?.[1]) {
    return JSON.parse(preMatch[1]);
  }

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) {
    const text = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (text.startsWith("{") || text.startsWith("[")) {
      return JSON.parse(text);
    }
  }

  return null;
}

function detectAccessDenied(html: string) {
  const normalized = html.toLowerCase();
  return (
    normalized.includes("access denied") ||
    normalized.includes("you don't have permission to access") ||
    normalized.includes("errors.edgesuite.net")
  );
}

async function captureBybitLoginScreenshot(browser: Browser, traderId: string) {
  const page = await browser.newPage();
  try {
    const { directory, filePath } = getScreenshotPath(`bybit-login-${traderId}.png`);
    await mkdir(directory, { recursive: true });
    await page.goto(
      `https://www.bybit.com/copyTrade/trade-center/detail?leaderMark=${encodeURIComponent(traderId)}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      },
    );
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  } finally {
    await page.close();
  }
}

export async function fetchBybitPositionsWithBrowserFallback(traderId: string) {
  const browser = await ensureBrowser();
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/json",
      lang: "en-us",
      platform: "pc",
      referer: "https://www.bybit.com/",
      ...(process.env.BYBIT_API_USERTOKEN ? { usertoken: process.env.BYBIT_API_USERTOKEN } : {}),
      ...(process.env.BYBIT_API_COOKIE ? { cookie: process.env.BYBIT_API_COOKIE } : {}),
    });

    await page.goto(
      `${BYBIT_API_ENDPOINT}?leaderMark=${encodeURIComponent(traderId)}&pageSize=100&page=1`,
      {
        waitUntil: "networkidle0",
        timeout: 30_000,
      },
    );

    const content = await page.content();
    if (detectAccessDenied(content)) {
      const { directory, filePath } = getScreenshotPath(`bybit-access-denied-${traderId}.png`);
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: filePath, fullPage: true });
      throw new BybitRuntimeError({
        status: "access-denied",
        mode: "browser-fallback",
        traderId,
        detail: "Bybit browser fallback was blocked by upstream access controls on this machine.",
        screenshotPath: filePath,
      });
    }

    const payload = extractJsonFromHtml(content) as {
      retCode: number;
      retMsg?: string;
      result?: {
        openTradeInfoProtection?: number;
        data?: unknown[];
      };
    } | null;

    if (!payload) {
      throw new BybitRuntimeError({
        status: "payload-error",
        mode: "browser-fallback",
        traderId,
        detail: "Bybit browser fallback did not return JSON.",
      });
    }

    if (payload.retCode !== 0) {
      throw new BybitRuntimeError({
        status: "payload-error",
        mode: "browser-fallback",
        traderId,
        detail: payload.retMsg ?? `Bybit browser payload error: ${JSON.stringify(payload)}`,
      });
    }

    if (payload.result?.openTradeInfoProtection === 1) {
      const screenshotPath = await captureBybitLoginScreenshot(browser, traderId);
      throw new BybitRuntimeError({
        status: "login-required",
        mode: "browser-fallback",
        traderId,
        detail:
          "Bybit browser fallback still requires login. Reuse a persistent BYBIT_PUPPETEER_USER_DATA_DIR or set BYBIT_API_COOKIE.",
        screenshotPath,
      });
    }

    return payload.result?.data ?? [];
  } finally {
    await page.close();
  }
}
