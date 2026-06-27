export type NotificationProvider = "feishu" | "telegram" | "discord";

export type NotificationRouteKey =
  | "default"
  | "trader-change"
  | "runtime-warning"
  | "startup"
  | "bybit-attention";

export interface NotificationSendResult {
  provider: NotificationProvider;
  delivered: boolean;
  detail?: string;
}

export interface NotificationAttachment {
  kind: "local-image";
  path: string;
}

export function envValue(name: string) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function envFlag(name: string, defaultValue: boolean) {
  const value = envValue(name);
  if (!value) {
    return defaultValue;
  }

  return value === "1" || value.toLowerCase() === "true";
}

export function getEnabledProviders(input: {
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

export function parseRouteProviders(
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

export interface NotificationConfig {
  feishuWebhookUrl: string | undefined;
  feishuAppId: string | undefined;
  feishuAppSecret: string | undefined;
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  discordWebhookUrl: string | undefined;
  feishuEnabled: boolean;
  telegramEnabled: boolean;
  discordEnabled: boolean;
  routeSummary: Record<NotificationRouteKey, NotificationProvider[]>;
  traderChangeAlertsEnabled: boolean;
  warningAlertsEnabled: boolean;
  startupAlertsEnabled: boolean;
}

export function getNotificationConfig(): NotificationConfig {
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
    },
    traderChangeAlertsEnabled: envFlag("ALERT_NOTIFY_TRADER_CHANGES", true),
    warningAlertsEnabled: envFlag("ALERT_NOTIFY_WARNINGS", true),
    startupAlertsEnabled: envFlag("ALERT_NOTIFY_STARTUP", false),
  };
}
