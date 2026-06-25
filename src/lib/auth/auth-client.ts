import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { env } from "#/env/client";

/**
 * https://better-auth.com/docs/concepts/client
 *
 * Our better-auth server instance lives in the TanStack Start server,
 * so authClient should only be used on the client (event handlers, effects, etc).
 *
 * For server/SSR operations, prefer `auth.api` instead, and wrap in a serverFn if needed.
 */
export const authClient = createAuthClient({
  // In local development we sometimes run on a different port than the configured
  // public base URL, so prefer the current browser origin when available.
  baseURL: typeof window === "undefined" ? env.VITE_BASE_URL : window.location.origin,
  plugins: [adminClient()],
});
