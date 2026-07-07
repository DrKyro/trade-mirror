import "@tanstack/react-start/server-only";
import {
  computeRetryDelayMs,
  HTTP_FETCH_MAX_RETRIES,
  HTTP_RETRYABLE_STATUS_CODES,
  isRetryableFetchError,
  sleep,
} from "#/lib/trading/crawl-rate-limit";

export interface FetchResult<T> {
  data: T;
  latencyMs: number;
  responseSizeBytes: number;
  httpStatus: number;
}

export class FetchError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly latencyMs: number,
    readonly responseSizeBytes: number,
    message: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  isSuccessCode: (payload: unknown) => boolean;
  retries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

async function fetchJsonOnce<T>(url: string, options: FetchJsonOptions): Promise<FetchResult<T>> {
  const start = performance.now();
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const latencyMs = Math.round(performance.now() - start);
  const text = await response.text();
  const responseSizeBytes = text.length;

  if (!response.ok) {
    throw new FetchError(response.status, latencyMs, responseSizeBytes, `HTTP ${response.status}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FetchError(response.status, latencyMs, responseSizeBytes, "Invalid JSON response");
  }

  if (!options.isSuccessCode(parsed)) {
    throw new FetchError(
      response.status,
      latencyMs,
      responseSizeBytes,
      `API code error: ${text.slice(0, 200)}`,
    );
  }

  return { data: parsed as T, latencyMs, responseSizeBytes, httpStatus: response.status };
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions,
): Promise<FetchResult<T>> {
  const maxRetries = options.retries ?? HTTP_FETCH_MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchJsonOnce<T>(url, options);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableFetchError(error)) {
        throw error;
      }

      let delayMs = computeRetryDelayMs(attempt, options.retryBaseMs, options.retryMaxMs);
      if (error instanceof FetchError && error.httpStatus === 429) {
        delayMs = Math.max(delayMs, 1_500);
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

export function extractData<T>(payload: {
  data?: T;
  code?: string;
  retCode?: number;
  success?: boolean;
}): T | undefined {
  return payload.data;
}

export { HTTP_RETRYABLE_STATUS_CODES };
