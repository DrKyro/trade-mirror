import "@tanstack/react-start/server-only";
import {
  type NotificationAttachment,
  type NotificationProvider,
  type NotificationRouteKey,
  type NotificationSendResult,
  getEnabledProviders,
  getNotificationConfig,
} from "#/lib/system/notification/config";
import {
  buildRuntimeWarningMessage,
  buildStartupMessage,
  buildTraderChangeMessage,
} from "#/lib/system/notification/messages";
import {
  sendDiscordMessageWithAttachments,
  sendFeishuMessageWithAttachments,
  sendTelegramMessageWithAttachments,
} from "#/lib/system/notification/providers";
import type {
  NotificationConfigState,
  PositionChange,
  PositionSnapshot,
  TraderRecord,
} from "#/lib/trading/types";

export type { NotificationProvider, NotificationRouteKey };
export type NotificationConfigSummary = NotificationConfigState;

export function getNotificationRouteKeys(): NotificationRouteKey[] {
  return ["default", "trader-change", "runtime-warning", "startup", "bybit-attention"];
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
  const nextRouteSummary = { ...config.routeSummary };

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

  const text = buildRuntimeWarningMessage(input.scope, input.title, input.detail);

  return deliverTextNotification(
    text,
    input.route ?? "runtime-warning",
    input.screenshotPath ? [{ kind: "local-image", path: input.screenshotPath }] : [],
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

  return deliverTextNotification(buildStartupMessage(detail), "startup");
}
