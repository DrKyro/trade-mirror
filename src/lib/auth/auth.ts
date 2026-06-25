import "@tanstack/react-start/server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { env } from "#/env/server";
import { db } from "#/lib/db";
import * as schema from "#/lib/db/schema";

function getTrustedOrigins(request?: Request) {
  const trustedOrigins = new Set<string>([
    env.VITE_BASE_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ]);

  const configuredOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of configuredOrigins ?? []) {
    trustedOrigins.add(origin);
  }

  const requestOrigin = request?.headers.get("origin");
  if (requestOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u.test(requestOrigin)) {
    trustedOrigins.add(requestOrigin);
  }

  return [...trustedOrigins];
}

export const auth = betterAuth({
  baseURL: env.VITE_BASE_URL,
  trustedOrigins: async (request) => getTrustedOrigins(request),
  telemetry: {
    enabled: false,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  // https://better-auth.com/docs/integrations/tanstack#usage-tips
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    tanstackStartCookies(),
  ],

  // https://better-auth.com/docs/concepts/session-management#session-caching
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },

  // https://better-auth.com/docs/concepts/oauth
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // https://better-auth.com/docs/authentication/email-password
  emailAndPassword: {
    enabled: true,
  },

  experimental: {
    // https://better-auth.com/docs/adapters/drizzle#joins-experimental
    joins: true,
  },
});
