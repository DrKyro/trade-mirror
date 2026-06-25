import "@tanstack/react-start/server-only";
import WebSocket, { WebSocketServer } from "ws";

import { upsertLegacyChainInfo, upsertLegacyMessage } from "#/lib/messages/store";
import type {
  LegacyChainInfoRecord,
  LegacyJsonObject,
  LegacyMessageRecord,
} from "#/lib/messages/types";

interface BridgeEnvelope {
  msgClass?: string;
  msgSource?: string;
  msgData?: Record<string, unknown>;
}

let bridgePromise: Promise<void> | null = null;

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeMessageData(input: Record<string, unknown>) {
  return {
    ...input,
    msgTitle: typeof input.msgTitle === "string" ? input.msgTitle : "",
    msgAvatar: typeof input.msgAvatar === "string" ? input.msgAvatar : "",
    msgReleaseTime: typeof input.msgReleaseTime === "string" ? input.msgReleaseTime : "",
    msgCollectionTime: toNumber(input.msgCollectionTime) ?? Date.now(),
    msgContent: typeof input.msgContent === "string" ? input.msgContent : "",
    msgContentTranslate:
      typeof input.msgContentTranslate === "string" ? input.msgContentTranslate : "",
    msgFiles: Array.isArray(input.msgFiles)
      ? input.msgFiles.filter((item): item is string => typeof item === "string")
      : [],
    msgUrl: typeof input.msgUrl === "string" ? input.msgUrl : "",
  };
}

function parseEnvelope(raw: string): BridgeEnvelope | null {
  try {
    return JSON.parse(raw) as BridgeEnvelope;
  } catch {
    return null;
  }
}

function normalizeLegacyMessage(envelope: BridgeEnvelope): LegacyMessageRecord | null {
  if (
    !envelope.msgData ||
    typeof envelope.msgClass !== "string" ||
    envelope.msgClass === "chain_trans_info"
  ) {
    return null;
  }

  const uniqueId =
    typeof envelope.msgData.UniqueId === "string"
      ? envelope.msgData.UniqueId
      : typeof envelope.msgData.uniqueId === "string"
        ? envelope.msgData.uniqueId
        : null;

  return {
    id: uniqueId ?? `legacy-message-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    msgClass: envelope.msgClass,
    msgSource: typeof envelope.msgSource === "string" ? envelope.msgSource : envelope.msgClass,
    uniqueId,
    messageTime:
      typeof envelope.msgData.msgCollectionTime === "number"
        ? envelope.msgData.msgCollectionTime
        : null,
    msgData: normalizeMessageData(envelope.msgData),
    createdAt: Date.now(),
  };
}

function normalizeLegacyChainInfo(envelope: BridgeEnvelope): LegacyChainInfoRecord | null {
  if (envelope.msgClass !== "chain_trans_info" || !envelope.msgData) {
    return null;
  }

  const transactionHash =
    typeof envelope.msgData["交易hash"] === "string"
      ? envelope.msgData["交易hash"]
      : typeof envelope.msgData["交易哈希"] === "string"
        ? envelope.msgData["交易哈希"]
        : typeof envelope.msgData.transactionHash === "string"
          ? envelope.msgData.transactionHash
          : null;

  return {
    id: transactionHash ?? `legacy-chain-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    transactionHash,
    data: envelope.msgData as unknown as LegacyJsonObject,
    createdAt: Date.now(),
  };
}

export interface LegacyMessageBridge {
  close: () => Promise<void>;
}

export function ensureLegacyMessageBridge(options: {
  port: number;
  onInfo?: (message: string) => Promise<void> | void;
  onWarn?: (message: string) => Promise<void> | void;
}): Promise<void> {
  if (!bridgePromise) {
    bridgePromise = (async (): Promise<void> => {
      const server = new WebSocketServer({ port: options.port });
      const clients = new Set<WebSocket>();

      server.on("connection", (socket) => {
        clients.add(socket);
        void options.onInfo?.(`legacy msg bridge client connected on :${options.port}`);

        socket.on("message", async (data) => {
          const text = typeof data === "string" ? data : data.toString();
          const envelope = parseEnvelope(text);
          if (!envelope) {
            void options.onWarn?.("legacy msg bridge received invalid JSON payload");
            return;
          }

          const message = normalizeLegacyMessage(envelope);
          if (message) {
            await upsertLegacyMessage(message);
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(text);
              }
            }
            return;
          }

          const chainInfo = normalizeLegacyChainInfo(envelope);
          if (chainInfo) {
            await upsertLegacyChainInfo(chainInfo);
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(text);
              }
            }
            return;
          }

          void options.onWarn?.("legacy msg bridge received unsupported payload");
        });

        socket.on("close", () => {
          clients.delete(socket);
        });
      });

      await new Promise<void>((resolve, reject) => {
        server.once("listening", () => resolve());
        server.once("error", reject);
      });
    })().catch(async (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      await options.onWarn?.(`legacy msg bridge failed to start on :${options.port}: ${detail}`);
      bridgePromise = null;
    });
  }

  return bridgePromise;
}
