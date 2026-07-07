export const HTTP_FETCH_MAX_RETRIES = 3;
export const HTTP_FETCH_RETRY_BASE_MS = 500;
export const HTTP_FETCH_RETRY_MAX_MS = 8_000;

export const HTTP_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const DISCOVER_RANK_REQUEST_DELAY_MS = 350;
export const DISCOVER_DEEP_CRAWL_CONCURRENCY = 2;
export const DISCOVER_DEEP_REQUEST_DELAY_MS = 500;
export const DISCOVER_DEEP_REFRESH_COOLDOWN_MS = 10 * 60_000;
export const DISCOVER_DEEP_CRAWL_MAX_RETRIES = 2;

export const ADAPTER_PAGINATION_DELAY_MS = 250;

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function readHttpStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("httpStatus" in error)) {
    return null;
  }

  const status = (error as { httpStatus: unknown }).httpStatus;
  return typeof status === "number" ? status : null;
}

export function isRetryableFetchError(error: unknown) {
  const httpStatus = readHttpStatus(error);
  if (httpStatus !== null) {
    return HTTP_RETRYABLE_STATUS_CODES.has(httpStatus);
  }

  return error instanceof TypeError;
}

export function computeRetryDelayMs(
  attempt: number,
  baseMs = HTTP_FETCH_RETRY_BASE_MS,
  maxMs = HTTP_FETCH_RETRY_MAX_MS,
) {
  const exponential = Math.min(baseMs * 2 ** attempt, maxMs);
  const jitter = Math.floor(Math.random() * exponential * 0.2);
  return exponential + jitter;
}

export async function retryWithBackoff<T>(
  label: string,
  worker: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? HTTP_FETCH_MAX_RETRIES;
  const shouldRetry = options?.shouldRetry ?? isRetryableFetchError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await worker();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = computeRetryDelayMs(attempt, options?.baseDelayMs, options?.maxDelayMs);
      console.warn(
        `[crawl-retry] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function paginateDelay() {
  await sleep(ADAPTER_PAGINATION_DELAY_MS);
}
