import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getTradingRuntime } from "#/lib/trading/runtime";

const requestSchema = z.object({
  traderId: z.string().min(1),
});

export const Route = createFileRoute("/api/trading/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = requestSchema.parse(await request.json());
        const runtime = getTradingRuntime();
        const trader = await runtime.refreshTraderPositions(payload.traderId);
        return Response.json({ ok: true, trader });
      },
    },
  },
});
