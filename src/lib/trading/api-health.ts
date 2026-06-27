import "@tanstack/react-start/server-only";
import "#/lib/trading/adapters/index";
import type { EndpointDefinition } from "#/lib/trading/adapters/platform-adapter";
import { getAllEndpoints, getAllTraderModels } from "#/lib/trading/adapters/registry";
import {
  getTraderModelOverallStatus,
  getTraderModelSectionStatus,
  type TraderModelStatus,
  type TraderPlatformModel,
} from "#/lib/trading/trader-data-model";
import type { TraderPlatform } from "#/lib/trading/types";

export interface ApiHealthResult {
  id: string;
  platformId: TraderPlatform;
  platform: string;
  name: string;
  method: "GET" | "POST";
  url: string;
  status: "ok" | "error" | "timeout";
  httpStatus: number | null;
  latencyMs: number | null;
  dataCount: number | null;
  responseSizeBytes: number | null;
  error: string | null;
  integrated: boolean;
  checkedAt: number;
}

export interface ApiHealthModelField {
  id: string;
  label: string;
  status: TraderModelStatus;
  source: string;
  note: string | null;
  pageHint: string | null;
}

export interface ApiHealthModelSection {
  id: string;
  label: string;
  status: TraderModelStatus;
  note: string | null;
  fields: ApiHealthModelField[];
}

export interface ApiHealthPlatformModel {
  platformId: TraderPlatform;
  platform: string;
  sampleTraderId: string;
  overallStatus: TraderModelStatus;
  readyCount: number;
  partialCount: number;
  missingCount: number;
  sections: ApiHealthModelSection[];
}

export interface ApiHealthReport {
  checkedAt: number;
  endpoints: ApiHealthResult[];
  platformModels: ApiHealthPlatformModel[];
}

const TIMEOUT_MS = 10_000;

async function probeEndpoint(
  ep: EndpointDefinition & {
    platform: TraderPlatform;
    displayName: string;
    sampleTraderId: string;
  },
): Promise<ApiHealthResult> {
  const checkedAt = Date.now();
  const params = { traderId: ep.sampleTraderId };
  const url = ep.buildUrl(params);
  const headers = { ...ep.extraHeaders };
  const body = ep.buildBody ? ep.buildBody(params) : undefined;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const startTime = performance.now();
    const response = await fetch(url, {
      method: ep.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - startTime);
    const text = await response.text();
    const responseSizeBytes = text.length;

    let dataCount: number | null = null;
    let status: "ok" | "error" = "ok";
    let error: string | null = null;

    if (!response.ok) {
      status = "error";
      error = `HTTP ${response.status}`;
    } else {
      try {
        const parsed = JSON.parse(text) as {
          code?: string;
          retCode?: number;
          msg?: string;
          retMsg?: string;
        };
        const code = parsed.code ?? parsed.retCode;
        if (
          code !== undefined &&
          code !== "0" &&
          code !== "00000" &&
          code !== 0 &&
          code !== "000000" &&
          code !== "200"
        ) {
          status = "error";
          error = `API code: ${code}${parsed.msg ? ` — ${parsed.msg}` : ""}${parsed.retMsg ? ` — ${parsed.retMsg}` : ""}`;
        } else {
          dataCount = ep.extractCount(parsed);
        }
      } catch {
        status = "error";
        error = "Invalid JSON response";
      }
    }

    return {
      id: ep.id,
      platformId: ep.platform,
      platform: ep.displayName,
      name: ep.name,
      method: ep.method,
      url,
      status,
      httpStatus: response.status,
      latencyMs,
      dataCount,
      responseSizeBytes,
      error,
      integrated: ep.integrated,
      checkedAt,
    };
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    return {
      id: ep.id,
      platformId: ep.platform,
      platform: ep.displayName,
      name: ep.name,
      method: ep.method,
      url,
      status: isTimeout ? "timeout" : "error",
      httpStatus: null,
      latencyMs: null,
      dataCount: null,
      responseSizeBytes: null,
      error: isTimeout ? `Timeout after ${TIMEOUT_MS}ms` : (err as Error).message,
      integrated: ep.integrated,
      checkedAt,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPlatformModel(model: TraderPlatformModel): ApiHealthPlatformModel {
  const sections = model.sections.map((section) => ({
    id: section.id,
    label: section.label,
    status: getTraderModelSectionStatus(section),
    note: section.note ?? null,
    fields: section.fields.map((field) => ({
      id: field.id,
      label: field.label,
      status: field.status,
      source: field.source,
      note: field.note ?? null,
      pageHint: field.pageHint ?? null,
    })),
  }));

  const fieldList = sections.flatMap((section) => section.fields);
  const readyCount = fieldList.filter((field) => field.status === "ready").length;
  const partialCount = fieldList.filter((field) => field.status === "partial").length;
  const missingCount = fieldList.filter((field) => field.status === "missing").length;

  return {
    platformId: model.platform,
    platform: model.displayName,
    sampleTraderId: model.sampleTraderId,
    overallStatus: getTraderModelOverallStatus(model),
    readyCount,
    partialCount,
    missingCount,
    sections,
  };
}

export async function probeAllApiEndpoints(): Promise<ApiHealthReport> {
  const endpoints = getAllEndpoints();
  const [endpointResults, platformModels] = await Promise.all([
    Promise.all(endpoints.map((ep) => probeEndpoint(ep))),
    Promise.resolve(getAllTraderModels().map(buildPlatformModel)),
  ]);

  return {
    checkedAt: Date.now(),
    endpoints: endpointResults,
    platformModels,
  };
}
