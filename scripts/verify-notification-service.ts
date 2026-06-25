import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getNotificationConfigSummary,
  sendRuntimeWarningNotification,
  sendTraderChangeNotification,
} from "../src/lib/system/notification-service";

async function main() {
  const calls: Array<{ url: string; bodyType: string; body: string }> = [];
  const originalFetch = globalThis.fetch;
  const tempDir = await mkdtemp(path.join(tmpdir(), "notify-verify-"));
  const screenshotPath = path.join(tempDir, "bybit-login.png");
  const previousEnv = {
    ALERT_FEISHU_WEBHOOK_URL: process.env.ALERT_FEISHU_WEBHOOK_URL,
    ALERT_FEISHU_APP_ID: process.env.ALERT_FEISHU_APP_ID,
    ALERT_FEISHU_APP_SECRET: process.env.ALERT_FEISHU_APP_SECRET,
    ALERT_TELEGRAM_BOT_TOKEN: process.env.ALERT_TELEGRAM_BOT_TOKEN,
    ALERT_TELEGRAM_CHAT_ID: process.env.ALERT_TELEGRAM_CHAT_ID,
    ALERT_DISCORD_WEBHOOK_URL: process.env.ALERT_DISCORD_WEBHOOK_URL,
    ALERT_NOTIFY_TRADER_CHANGES: process.env.ALERT_NOTIFY_TRADER_CHANGES,
    ALERT_NOTIFY_WARNINGS: process.env.ALERT_NOTIFY_WARNINGS,
    ALERT_ROUTE_TRADER_CHANGE: process.env.ALERT_ROUTE_TRADER_CHANGE,
    ALERT_ROUTE_RUNTIME_WARNING: process.env.ALERT_ROUTE_RUNTIME_WARNING,
    ALERT_ROUTE_BYBIT_ATTENTION: process.env.ALERT_ROUTE_BYBIT_ATTENTION,
  };

  process.env.ALERT_FEISHU_WEBHOOK_URL = "https://feishu.example.test/hook";
  process.env.ALERT_FEISHU_APP_ID = "cli_test_app";
  process.env.ALERT_FEISHU_APP_SECRET = "test_secret";
  process.env.ALERT_TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.ALERT_TELEGRAM_CHAT_ID = "chat-1";
  process.env.ALERT_DISCORD_WEBHOOK_URL = "https://discord.example.test/webhook";
  process.env.ALERT_NOTIFY_TRADER_CHANGES = "true";
  process.env.ALERT_NOTIFY_WARNINGS = "true";
  process.env.ALERT_ROUTE_TRADER_CHANGE = "feishu";
  process.env.ALERT_ROUTE_RUNTIME_WARNING = "telegram";
  process.env.ALERT_ROUTE_BYBIT_ATTENTION = "discord";

  await writeFile(screenshotPath, "fake image payload");

  globalThis.fetch = (async (input, init) => {
    calls.push({
      url: String(input),
      bodyType:
        init?.body instanceof FormData
          ? "form-data"
          : typeof init?.body === "string"
            ? "string"
            : "other",
      body: typeof init?.body === "string" ? init.body : "",
    });

    if (String(input).includes("tenant_access_token")) {
      return new Response(
        JSON.stringify({
          code: 0,
          tenant_access_token: "tenant-token",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (String(input).includes("/im/v1/images")) {
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            image_key: "img_v3_test_key",
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    const config = getNotificationConfigSummary();

    await sendTraderChangeNotification({
      trader: {
        name: "Notify Verify Trader",
        platform: "okx",
        link: "https://www.okx.com/copy-trading/trader/notify-verify",
      },
      changes: [
        {
          id: "verify-pos-1",
          symbol: "BTCUSDT",
          entryPrice: 100000,
          markPrice: 100500,
          amount: 0.1,
          leverage: 20,
          openTime: Date.now() - 60000,
          closeTime: null,
          margin: 500,
          marginMode: "cross",
          pnl: 50,
          pnlRatio: 0.1,
          positionSide: "long",
          closeAvgPrice: null,
          contractValue: null,
          added: true,
          message: "BTCUSDT 开多",
        },
      ],
      positions: [
        {
          id: "verify-pos-1",
          symbol: "BTCUSDT",
          entryPrice: 100000,
          markPrice: 100500,
          amount: 0.1,
          leverage: 20,
          openTime: Date.now() - 60000,
          closeTime: null,
          margin: 500,
          marginMode: "cross",
          pnl: 50,
          pnlRatio: 0.1,
          positionSide: "long",
          closeAvgPrice: null,
          contractValue: null,
        },
      ],
    });

    await sendRuntimeWarningNotification({
      scope: "follow-engine",
      title: "teacher account auto-refresh failed",
      detail: "verification warning detail",
    });

    await sendRuntimeWarningNotification({
      scope: "trader-spy",
      title: "bybit browser fallback attention required",
      detail: "verification bybit detail",
      route: "bybit-attention",
      screenshotPath,
    });

    await sendRuntimeWarningNotification({
      scope: "trader-spy",
      title: "telegram screenshot verify",
      detail: "verification telegram screenshot detail",
      route: "bybit-attention",
      screenshotPath,
      routeSummaryOverride: {
        "bybit-attention": ["telegram"],
      },
    });

    console.log(
      JSON.stringify(
        {
          enabledProviders: config.enabledProviders,
          feishuEnabled: config.feishuEnabled,
          telegramEnabled: config.telegramEnabled,
          discordEnabled: config.discordEnabled,
          totalCalls: calls.length,
          urls: calls.map((call) => call.url),
          bodyTypes: calls.map((call) => call.bodyType),
          routeSummary: config.routeSummary,
          traderMessageContainsTrader: calls.some((call) =>
            call.body.includes("交易员：Notify Verify Trader"),
          ),
          warningMessageContainsTitle: calls.some((call) =>
            call.body.includes("teacher account auto-refresh failed"),
          ),
          traderChangeRoutesOnlyToFeishu:
            calls.filter((call) => call.body.includes("交易员：Notify Verify Trader")).length ===
              1 &&
            calls.some(
              (call) =>
                call.url === "https://feishu.example.test/hook" &&
                call.body.includes("交易员：Notify Verify Trader"),
            ),
          runtimeWarningRoutesOnlyToTelegram:
            calls.filter((call) => call.body.includes("teacher account auto-refresh failed"))
              .length === 1 &&
            calls.some(
              (call) =>
                call.url.includes("api.telegram.org") &&
                call.body.includes("teacher account auto-refresh failed"),
            ),
          bybitAttentionRoutesOnlyToDiscord:
            calls.filter((call) => call.url === "https://discord.example.test/webhook").length ===
            1,
          bybitAttentionRouteUsesFeishu: config.routeSummary["bybit-attention"].includes("feishu"),
          bybitAttentionTriggeredFeishuImageUpload:
            calls.filter((call) => call.url.includes("/im/v1/images")).length === 1,
          bybitAttentionTriggeredDiscordMultipart: calls.some(
            (call) =>
              call.url === "https://discord.example.test/webhook" && call.bodyType === "form-data",
          ),
          telegramAttachmentSentViaPhotoEndpoint:
            calls.filter((call) => call.url.includes("/sendPhoto")).length === 1,
          telegramAttachmentUsedMultipart: calls.some(
            (call) => call.url.includes("/sendPhoto") && call.bodyType === "form-data",
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
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
