import { ApiError } from "@/lib/api";

export interface RetryInfo {
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  /** Total attempts (including the first). */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Called before each backoff wait — handy for surfacing "reintentando…". */
  onRetry?: (info: RetryInfo) => void;
  /** Decide whether an error is worth retrying. Defaults to network + 5xx. */
  shouldRetry?: (error: unknown) => boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient failures (network / 5xx) with exponential backoff + jitter. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { attempts = 4, baseDelayMs = 600, maxDelayMs = 8000, onRetry, shouldRetry } = opts;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retriable = shouldRetry ? shouldRetry(error) : isTransient(error);
      if (attempt >= attempts || !retriable) break;

      let delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      // Honor a server-provided Retry-After if it asks for longer.
      const retryAfter = error instanceof ApiError ? error.retryAfter : undefined;
      if (typeof retryAfter === "number" && retryAfter > 0) {
        delay = Math.max(delay, retryAfter * 1000);
      }
      delay += Math.random() * 200; // jitter to avoid thundering herd
      onRetry?.({ attempt, delayMs: delay, error });
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Network errors and 5xx are transient; 4xx (incl. 429 cooldown) are not. */
export function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500;
  return true; // unknown / thrown network error
}
