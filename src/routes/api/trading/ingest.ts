import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getTradingRuntime } from "#/lib/trading/runtime";

const positionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  entryPrice: z.number(),
  markPrice: z.number().nullable(),
  amount: z.number(),
  leverage: z.number(),
  openTime: z.number().nullable(),
  closeTime: z.number().nullable(),
  margin: z.number().nullable(),
  marginMode: z.string().nullable(),
  pnl: z.number().nullable(),
  pnlRatio: z.number().nullable(),
  positionSide: z.enum(["long", "short"]),
  closeAvgPrice: z.number().nullable(),
  contractValue: z.number().nullable(),
});

const snapshotPayloadSchema = z.object({
  kind: z.literal("snapshot").optional(),
  traderId: z.string().min(1),
  positions: z.array(positionSchema),
});

const legacyPayloadSchema = z.object({
  topic: z.literal("trader").optional(),
  data: z.object({
    type: z.literal("positionChange"),
    changes: z.array(
      positionSchema.extend({
        added: z.boolean().optional(),
        removed: z.boolean().optional(),
        amountChange: z.number().optional(),
        message: z.string(),
      }),
    ),
    trader: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      nickName: z.string().optional(),
      platform: z.enum([
        "okx",
        "bitget",
        "binance",
        "bybit",
        "huobi",
        "binanceFutures",
        "traderWagon",
      ]),
      link: z.url(),
      avatar: z.url(),
      sign: z.string().optional(),
      strategyStatus: z.enum(["follow", "watch", "disabled"]).optional(),
      strategyName: z.string().optional(),
      strategyRiskRate: z.number().optional(),
      balance: z.number().optional(),
      monthlyAveragePositionValue: z.number().optional(),
      threeMonthMaxDrawdown: z.number().optional(),
      positionUpdateTime: z.number().optional(),
    }),
  }),
});

const requestSchema = z.union([snapshotPayloadSchema, legacyPayloadSchema]);

export const Route = createFileRoute("/api/trading/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = requestSchema.parse(await request.json());
        const runtime = getTradingRuntime();

        if ("traderId" in payload) {
          const trader = await runtime.ingestTraderSnapshot(payload.traderId, payload.positions);
          return Response.json({ ok: true, mode: "snapshot", trader });
        }

        const traders = await runtime.ingestLegacyPositionChange({
          trader: payload.data.trader,
          changes: payload.data.changes,
        });
        return Response.json({ ok: true, mode: "legacy", traders });
      },
    },
  },
});
