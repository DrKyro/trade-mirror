import "@tanstack/react-start/server-only";
import { readFile } from "node:fs/promises";

import type {
  NotificationConfigState,
  PositionChange,
  PositionSnapshot,
  TraderRecord,
} from "#/lib/trading/types";

type NotificationProvider = "feishu" | "telegram" | "discord";
export type NotificationRouteKey =
  | "default"
  | "trader-change"
  | "runtime-warning"
  | "startup"
  | "bybit-attention";

export type NotificationConfigSummary = NotificationConfigState;

interface NotificationSendResult {
  provider: NotificationProvider;
  delivered: boolean;
  detail?: string;
}

interface NotificationAttachment {
  kind: "local-image";
  path: string;
}

function envValue(name: string) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function envFlag(name: string, defaultValue: boolean) {
  const value = envValue(name);
  if (!value) {
    return defaultValue;
  }

  return value === "1" || value.toLowerCase() === "true";
}

function getNotificationConfig() {
  const feishuWebhookUrl = envValue("ALERT_FEISHU_WEBHOOK_URL");
  const feishuAppId = envValue("ALERT_FEISHU_APP_ID");
  const feishuAppSecret = envValue("ALERT_FEISHU_APP_SECRET");
  const telegramBotToken = envValue("ALERT_TELEGRAM_BOT_TOKEN");
  const telegramChatId = envValue("ALERT_TELEGRAM_CHAT_ID");
  const discordWebhookUrl = envValue("ALERT_DISCORD_WEBHOOK_URL");
  const feishuEnabled = Boolean(feishuWebhookUrl);
  const telegramEnabled = Boolean(telegramBotToken && telegramChatId);
  const discordEnabled = Boolean(discordWebhookUrl);
  const defaultProviders = getEnabledProviders({
    feishuEnabled,
    telegramEnabled,
    discordEnabled,
  });

  return {
    feishuWebhookUrl,
    feishuAppId,
    feishuAppSecret,
    telegramBotToken,
    telegramChatId,
    discordWebhookUrl,
    feishuEnabled,
    telegramEnabled,
    discordEnabled,
    routeSummary: {
      default: parseRouteProviders("ALERT_ROUTE_DEFAULT", defaultProviders),
      "trader-change": parseRouteProviders("ALERT_ROUTE_TRADER_CHANGE", defaultProviders),
      "runtime-warning": parseRouteProviders("ALERT_ROUTE_RUNTIME_WARNING", defaultProviders),
      startup: parseRouteProviders("ALERT_ROUTE_STARTUP", defaultProviders),
      "bybit-attention": parseRouteProviders("ALERT_ROUTE_BYBIT_ATTENTION", defaultProviders),
    } satisfies Record<NotificationRouteKey, NotificationProvider[]>,
    traderChangeAlertsEnabled: envFlag("ALERT_NOTIFY_TRADER_CHANGES", true),
    warningAlertsEnabled: envFlag("ALERT_NOTIFY_WARNINGS", true),
    startupAlertsEnabled: envFlag("ALERT_NOTIFY_STARTUP", false),
  };
}

export function getNotificationRouteKeys(): NotificationRouteKey[] {
  return ["default", "trader-change", "runtime-warning", "startup", "bybit-attention"];
}

function getEnabledProviders(input: {
  feishuEnabled: boolean;
  telegramEnabled: boolean;
  discordEnabled: boolean;
}) {
  const enabledProviders: NotificationProvider[] = [];

  if (input.feishuEnabled) {
    enabledProviders.push("feishu");
  }
  if (input.telegramEnabled) {
    enabledProviders.push("telegram");
  }
  if (input.discordEnabled) {
    enabledProviders.push("discord");
  }

  return enabledProviders;
}

function parseRouteProviders(
  envName: string,
  fallbackProviders: NotificationProvider[],
): NotificationProvider[] {
  const raw = envValue(envName);
  if (!raw) {
    return [...fallbackProviders];
  }

  const allowed: NotificationProvider[] = ["feishu", "telegram", "discord"];
  const parsed = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is NotificationProvider => allowed.includes(item as NotificationProvider));

  return parsed.length > 0 ? parsed : [...fallbackProviders];
}

export function getNotificationConfigSummary(): NotificationConfigSummary {
  const config = getNotificationConfig();

  return {
    enabledProviders: getEnabledProviders(config),
    feishuEnabled: config.feishuEnabled,
    telegramEnabled: config.telegramEnabled,
    discordEnabled: config.discordEnabled,
    routeSummary: config.routeSummary,
    traderChangeAlertsEnabled: config.traderChangeAlertsEnabled,
    warningAlertsEnabled: config.warningAlertsEnabled,
    startupAlertsEnabled: config.startupAlertsEnabled,
  };
}

export function mergeNotificationRouteSummary(
  overrides?: Partial<Record<string, NotificationProvider[]>> | null,
) {
  const config = getNotificationConfigSummary();
  const nextRouteSummary = {
    ...config.routeSummary,
  };

  for (const routeKey of getNotificationRouteKeys()) {
    const override = overrides?.[routeKey];
    if (override && override.length > 0) {
      nextRouteSummary[routeKey] = [...override];
    }
  }

  return {
    ...config,
    routeSummary: nextRouteSummary,
    runtimeRouteOverrides: overrides ?? null,
  };
}

async function sendFeishuMessage(webhookUrl: string, text: string) {
  return sendFeishuMessageWithAttachments(webhookUrl, text, []);
}

async function getFeishuTenantAccessToken(appId: string, appSecret: string) {
  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Feishu tenant token request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: number;
    tenant_access_token?: string;
    msg?: string;
  };

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(payload.msg ?? "Feishu tenant token request did not return a token.");
  }

  return payload.tenant_access_token;
}

async function uploadFeishuImage(tenantAccessToken: string, attachment: NotificationAttachment) {
  const buffer = await readFile(attachment.path);
  const formData = new FormData();
  formData.append("image_type", "message");
  formData.append(
    "image",
    new Blob([buffer], { type: "image/png" }),
    attachment.path.split("/").pop() ?? "image.png",
  );

  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Feishu image upload failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    code: number;
    data?: {
      image_key?: string;
    };
    msg?: string;
  };

  if (payload.code !== 0 || !payload.data?.image_key) {
    throw new Error(payload.msg ?? "Feishu image upload did not return image_key.");
  }

  return payload.data.image_key;
}

async function sendFeishuMessageWithAttachments(
  webhookUrl: string,
  text: string,
  attachments: NotificationAttachment[],
) {
  const config = getNotificationConfig();
  const imageKeys: string[] = [];

  if (attachments.length > 0) {
    if (!config.feishuAppId || !config.feishuAppSecret) {
      throw new Error(
        "Feishu image delivery requires ALERT_FEISHU_APP_ID and ALERT_FEISHU_APP_SECRET.",
      );
    }

    const tenantAccessToken = await getFeishuTenantAccessToken(
      config.feishuAppId,
      config.feishuAppSecret,
    );
    for (const attachment of attachments) {
      imageKeys.push(await uploadFeishuImage(tenantAccessToken, attachment));
    }
  }

  const postContent: Array<Array<Record<string, string>>> = [
    [
      {
        tag: "text",
        text,
      },
    ],
  ];

  if (imageKeys.length > 0) {
    postContent.push(
      imageKeys.map((imageKey) => ({
        tag: "img",
        image_key: imageKey,
      })),
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      msg_type: "post",
      content: {
        post: {
          zh_cn: {
            content: postContent,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Feishu webhook responded with ${response.status}`);
  }
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  return sendTelegramMessageWithAttachments(botToken, chatId, text, []);
}

async function sendTelegramMessageWithAttachments(
  botToken: string,
  chatId: string,
  text: string,
  attachments: NotificationAttachment[],
) {
  if (attachments.length === 0) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API responded with ${response.status}`);
    }

    return;
  }

  for (const [index, attachment] of attachments.entries()) {
    const formData = new FormData();
    const buffer = await readFile(attachment.path);

    formData.append("chat_id", chatId);
    formData.append(
      "photo",
      new Blob([buffer], { type: "image/png" }),
      attachment.path.split("/").pop() ?? `attachment-${index}.png`,
    );
    if (index === 0) {
      formData.append("caption", text);
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Telegram photo API responded with ${response.status}`);
    }
  }
}

async function sendDiscordMessage(webhookUrl: string, text: string) {
  return sendDiscordMessageWithAttachments(webhookUrl, text, []);
}

async function sendDiscordMessageWithAttachments(
  webhookUrl: string,
  text: string,
  attachments: NotificationAttachment[],
) {
  if (attachments.length === 0) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook responded with ${response.status}`);
    }

    return;
  }

  const formData = new FormData();
  formData.append(
    "payload_json",
    JSON.stringify({
      content: text,
    }),
  );

  for (const [index, attachment] of attachments.entries()) {
    const buffer = await readFile(attachment.path);
    formData.append(
      `files[${index}]`,
      new Blob([buffer], { type: "image/png" }),
      attachment.path.split("/").pop() ?? `attachment-${index}.png`,
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Discord webhook responded with ${response.status}`);
  }
}

async function deliverTextNotification(
  text: string,
  route: NotificationRouteKey = "default",
  attachments: NotificationAttachment[] = [],
  routeSummaryOverride?: Partial<Record<string, NotificationProvider[]>> | null,
) {
  const config = routeSummaryOverride
    ? mergeNotificationRouteSummary(routeSummaryOverride)
    : getNotificationConfigSummary();
  const rawConfig = getNotificationConfig();
  const routeProviders = config.routeSummary[route] ?? config.routeSummary.default;
  const jobs: Promise<NotificationSendResult>[] = [];

  if (routeProviders.includes("feishu") && config.feishuEnabled && rawConfig.feishuWebhookUrl) {
    jobs.push(
      sendFeishuMessageWithAttachments(rawConfig.feishuWebhookUrl, text, attachments)
        .then(() => ({ provider: "feishu" as const, delivered: true }))
        .catch((error) => ({
          provider: "feishu" as const,
          delivered: false,
          detail: error instanceof Error ? error.message : "unknown feishu delivery error",
        })),
    );
  }

  if (
    routeProviders.includes("telegram") &&
    config.telegramEnabled &&
    rawConfig.telegramBotToken &&
    rawConfig.telegramChatId
  ) {
    jobs.push(
      sendTelegramMessageWithAttachments(
        rawConfig.telegramBotToken,
        rawConfig.telegramChatId,
        text,
        attachments,
      )
        .then(() => ({ provider: "telegram" as const, delivered: true }))
        .catch((error) => ({
          provider: "telegram" as const,
          delivered: false,
          detail: error instanceof Error ? error.message : "unknown telegram delivery error",
        })),
    );
  }

  if (routeProviders.includes("discord") && config.discordEnabled && rawConfig.discordWebhookUrl) {
    jobs.push(
      sendDiscordMessageWithAttachments(rawConfig.discordWebhookUrl, text, attachments)
        .then(() => ({ provider: "discord" as const, delivered: true }))
        .catch((error) => ({
          provider: "discord" as const,
          delivered: false,
          detail: error instanceof Error ? error.message : "unknown discord delivery error",
        })),
    );
  }

  const results = await Promise.all(jobs);
  for (const result of results) {
    if (!result.delivered) {
      console.error(`[notification:${result.provider}] ${result.detail}`);
    }
  }

  return results;
}

function positionSideLabel(value: PositionSnapshot["positionSide"]) {
  return value === "long" ? "多" : "空";
}

function formatNumber(value: number | null | undefined, digits = 6) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }

  return Number(value.toFixed(digits)).toString();
}

function formatPositionLines(positions: PositionSnapshot[]) {
  if (positions.length === 0) {
    return ["当前持仓：无"];
  }

  const lines = ["当前持仓："];
  for (const position of positions) {
    lines.push(
      [
        `${position.symbol}`,
        `${positionSideLabel(position.positionSide)}`,
        `数量:${formatNumber(position.amount)}`,
        `开仓:${formatNumber(position.entryPrice)}`,
        `现价:${formatNumber(position.markPrice)}`,
        `杠杆:${formatNumber(position.leverage, 2)}`,
      ].join(" "),
    );
  }

  return lines;
}

function formatChangeLines(changes: PositionChange[]) {
  const lines = ["仓位变化："];
  for (const change of changes) {
    lines.push(change.message);
  }
  return lines;
}

function buildTraderChangeMessage(
  trader: Pick<TraderRecord, "name" | "platform" | "link">,
  changes: PositionChange[],
  positions: PositionSnapshot[],
) {
  return [
    "交易员仓位变更",
    `交易员：${trader.name}`,
    ...formatChangeLines(changes),
    "---------------------",
    `平台：${trader.platform}`,
    `链接：${trader.link}`,
    "---------------------",
    ...formatPositionLines(positions),
  ].join("\n");
}

export async function sendTraderChangeNotification(input: {
  trader: Pick<TraderRecord, "name" | "platform" | "link">;
  changes: PositionChange[];
  positions: PositionSnapshot[];
  routeSummaryOverride?: Partial<Record<string, NotificationProvider[]>> | null;
}) {
  const config = getNotificationConfig();
  if (!config.traderChangeAlertsEnabled) {
    return [];
  }

  const summary = getNotificationConfigSummary();
  if (summary.enabledProviders.length === 0) {
    return [];
  }

  const text = buildTraderChangeMessage(input.trader, input.changes, input.positions);
  return deliverTextNotification(text, "trader-change", [], input.routeSummaryOverride);
}

export async function sendRuntimeWarningNotification(input: {
  title: string;
  detail: string;
  scope?: string;
  route?: "runtime-warning" | "bybit-attention";
  screenshotPath?: string | null;
  routeSummaryOverride?: Partial<Record<string, NotificationProvider[]>> | null;
}) {
  const config = getNotificationConfig();
  if (!config.warningAlertsEnabled) {
    return [];
  }

  const summary = getNotificationConfigSummary();
  if (summary.enabledProviders.length === 0) {
    return [];
  }

  const text = [
    "运行告警",
    input.scope ? `范围：${input.scope}` : null,
    `标题：${input.title}`,
    `详情：${input.detail}`,
  ]
    .filter(Boolean)
    .join("\n");

  return deliverTextNotification(
    text,
    input.route ?? "runtime-warning",
    input.screenshotPath
      ? [
          {
            kind: "local-image",
            path: input.screenshotPath,
          },
        ]
      : [],
    input.routeSummaryOverride,
  );
}

export async function sendStartupNotification(detail: string) {
  const config = getNotificationConfig();
  if (!config.startupAlertsEnabled) {
    return [];
  }

  const summary = getNotificationConfigSummary();
  if (summary.enabledProviders.length === 0) {
    return [];
  }

  return deliverTextNotification(
    ["系统启动", "标题：Merged trader runtime started", `详情：${detail}`].join("\n"),
    "startup",
  );
}
