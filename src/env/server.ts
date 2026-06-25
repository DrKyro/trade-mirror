import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    VITE_BASE_URL: z.url().default("http://localhost:3001"),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().optional(),

    // OAuth2 providers, optional, update as needed
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    ALERT_FEISHU_WEBHOOK_URL: z.string().url().optional(),
    ALERT_FEISHU_APP_ID: z.string().optional(),
    ALERT_FEISHU_APP_SECRET: z.string().optional(),
    ALERT_TELEGRAM_BOT_TOKEN: z.string().optional(),
    ALERT_TELEGRAM_CHAT_ID: z.string().optional(),
    ALERT_DISCORD_WEBHOOK_URL: z.string().url().optional(),
    ALERT_NOTIFY_TRADER_CHANGES: z.enum(["true", "false", "1", "0"]).optional(),
    ALERT_NOTIFY_WARNINGS: z.enum(["true", "false", "1", "0"]).optional(),
    ALERT_NOTIFY_STARTUP: z.enum(["true", "false", "1", "0"]).optional(),
    ALERT_ROUTE_DEFAULT: z.string().optional(),
    ALERT_ROUTE_TRADER_CHANGE: z.string().optional(),
    ALERT_ROUTE_RUNTIME_WARNING: z.string().optional(),
    ALERT_ROUTE_STARTUP: z.string().optional(),
    ALERT_ROUTE_BYBIT_ATTENTION: z.string().optional(),
  },
  runtimeEnv: process.env,
});
