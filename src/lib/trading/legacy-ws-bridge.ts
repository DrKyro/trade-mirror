import "@tanstack/react-start/server-only";
import { WebSocketServer } from "ws";

import type { PositionChange, TraderPlatform, TraderRecord } from "#/lib/trading/types";

interface LegacyTraderEnvelope {
  topic?: string;
  data?: unknown;
}

interface LegacyTraderPayload {
  type?: string;
  changes?: unknown[];
  trader?: Record<string, unknown>;
}

function parseEnvelope(raw: string): LegacyTraderEnvelope | null {
  try {
    return JSON.parse(raw) as LegacyTraderEnvelope;
  } catch {
    return null;
  }
}

function isLegacyTraderPayload(input: unknown): input is LegacyTraderPayload {
  if (!input || typeof input !== "object") {
    return false;
  }

  const candidate = input as LegacyTraderPayload;
  return (
    candidate.type === "positionChange" &&
    Array.isArray(candidate.changes) &&
    Boolean(candidate.trader?.id)
  );
}

function normalizePlatform(value: unknown): TraderPlatform | null {
  switch (String(value ?? "").toLowerCase()) {
    case "okx":
      return "okx";
    case "bitget":
      return "bitget";
    case "binance":
    case "binancefutures":
      return "binanceFutures";
    case "bybit":
      return "bybit";
    default:
      return null;
  }
}

function toNumberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toNumber(value: unknown, fallback = 0) {
  return toNumberOrNull(value) ?? fallback;
}

function toTimestampOrNull(value: unknown) {
  const numeric = toNumberOrNull(value);
  return numeric && numeric > 0 ? numeric : null;
}

function normalizePositionSide(value: unknown): "long" | "short" {
  return String(value ?? "").toLowerCase() === "short" ? "short" : "long";
}

function normalizeLegacyTrader(trader: Record<string, unknown>) {
  const platform = normalizePlatform(trader.platform);
  if (!platform) {
    return null;
  }

  return {
    id: String(trader.id),
    name: typeof trader.name === "string" ? trader.name : String(trader.id),
    platform,
    link:
      typeof trader.link === "string" && trader.link.length > 0
        ? trader.link
        : "https://example.invalid/legacy-trader",
    avatar:
      typeof trader.avatar === "string" && trader.avatar.length > 0
        ? trader.avatar
        : "https://example.invalid/legacy-avatar.png",
    nickName: typeof trader.nickName === "string" ? trader.nickName : undefined,
    sign: typeof trader.sign === "string" ? trader.sign : undefined,
    strategyStatus:
      trader.strategyStatus === "follow" ||
      trader.strategyStatus === "watch" ||
      trader.strategyStatus === "disabled"
        ? trader.strategyStatus
        : undefined,
    strategyName: typeof trader.strategyName === "string" ? trader.strategyName : undefined,
    strategyRiskRate: toNumberOrNull(trader.strategyRiskRate) ?? undefined,
    balance: toNumberOrNull(trader.balance) ?? undefined,
    monthlyAveragePositionValue: toNumberOrNull(trader.monthlyAveragePositionValue) ?? undefined,
    threeMonthMaxDrawdown: toNumberOrNull(trader.threeMonthMaxDrawdown) ?? undefined,
    positionUpdateTime: toTimestampOrNull(trader.positionUpdateTime) ?? undefined,
  } satisfies Partial<TraderRecord> &
    Pick<TraderRecord, "id" | "name" | "platform" | "link" | "avatar">;
}

function normalizeLegacyChanges(changes: unknown[]) {
  return changes
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map(
      (change) =>
        ({
          id: String(change.id),
          symbol: String(change.symbol ?? ""),
          entryPrice: toNumber(change.entryPrice),
          markPrice: toNumberOrNull(change.markPrice),
          amount: toNumber(change.amount),
          leverage: toNumber(change.leverage),
          openTime: toTimestampOrNull(change.openTime),
          closeTime: toTimestampOrNull(change.closeTime),
          margin: toNumberOrNull(change.margin),
          marginMode:
            typeof change.marginMode === "string"
              ? change.marginMode
              : typeof change.mgnMode === "string"
                ? change.mgnMode
                : null,
          pnl: toNumberOrNull(change.pnl),
          pnlRatio: toNumberOrNull(change.pnlRatio),
          positionSide: normalizePositionSide(change.positionSide),
          closeAvgPrice: toNumberOrNull(change.closeAvgPrice) ?? toNumberOrNull(change.closeAvgPx),
          contractValue: toNumberOrNull(change.contractValue) ?? toNumberOrNull(change.contractVal),
          added: change.added === true ? true : undefined,
          removed: change.removed === true ? true : undefined,
          amountChange: toNumberOrNull(change.amountChange) ?? undefined,
          message: typeof change.message === "string" ? change.message : "",
        }) satisfies PositionChange,
    )
    .filter((change) => change.symbol.length > 0);
}

export interface LegacyWsBridge {
  port: number;
  close: () => Promise<void>;
}

let bridgePromise: Promise<LegacyWsBridge | null> | null = null;

export function ensureLegacyWsBridge(options: {
  port: number;
  onLegacyPositionChange: (payload: {
    trader: Partial<TraderRecord> &
      Pick<TraderRecord, "id" | "name" | "platform" | "link" | "avatar">;
    changes: PositionChange[];
  }) => Promise<void>;
  onInfo?: (message: string) => Promise<void> | void;
  onWarn?: (message: string) => Promise<void> | void;
}) {
  if (!bridgePromise) {
    bridgePromise = (async () => {
      const server = new WebSocketServer({
        port: options.port,
      });

      server.on("connection", (socket) => {
        void options.onInfo?.(`legacy traderSpy websocket client connected on :${options.port}`);

        socket.on("message", (data) => {
          const text = typeof data === "string" ? data : data.toString();
          const envelope = parseEnvelope(text);
          if (!envelope) {
            void options.onWarn?.(
              `legacy websocket received non-JSON payload: ${text.slice(0, 120)}`,
            );
            return;
          }

          if (envelope.topic !== "trader") {
            return;
          }

          if (!isLegacyTraderPayload(envelope.data)) {
            void options.onWarn?.(
              "legacy websocket received trader envelope with unsupported payload shape",
            );
            return;
          }

          const trader = normalizeLegacyTrader(envelope.data.trader ?? {});
          const changes = normalizeLegacyChanges(envelope.data.changes ?? []);
          if (!trader || changes.length === 0) {
            void options.onWarn?.(
              "legacy websocket payload could not be normalized into trader position changes",
            );
            return;
          }

          void options
            .onLegacyPositionChange({
              trader,
              changes,
            })
            .catch((error) => {
              const detail = error instanceof Error ? error.message : String(error);
              void options.onWarn?.(`legacy websocket positionChange ingest failed: ${detail}`);
            });
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", reject);
      });

      return {
        port: options.port,
        close: async () => {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          });
        },
      } satisfies LegacyWsBridge;
    })().catch(async (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      await options.onWarn?.(
        `legacy traderSpy websocket bridge failed to start on :${options.port}: ${detail}`,
      );
      bridgePromise = null;
      return null;
    });
  }

  return bridgePromise;
}
