/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Delay multiplier for exponential backoff (default: 2) */
  multiplier?: number;
  /** Function to determine if an error is retryable */
  isRetryable?: (error: Error, response?: Response) => boolean;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "isRetryable">> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
};

/**
 * Calculate delay for a given retry attempt using exponential backoff
 * @param attempt - The retry attempt number (0-indexed)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
export function calculateDelay(
  attempt: number,
  options: Pick<RetryOptions, "initialDelay" | "maxDelay" | "multiplier"> = {},
): number {
  const initialDelay = options.initialDelay ?? DEFAULT_RETRY_OPTIONS.initialDelay;
  const maxDelay = options.maxDelay ?? DEFAULT_RETRY_OPTIONS.maxDelay;
  const multiplier = options.multiplier ?? DEFAULT_RETRY_OPTIONS.multiplier;

  const delay = initialDelay * multiplier ** attempt;
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Default function to check if a fetch error is retryable
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors that are typically transient
  const retryablePatterns = [
    "econnreset",
    "etimedout",
    "enotfound",
    "econnrefused",
    "epipe",
    "network",
    "fetch failed",
    "socket hang up",
    "connection reset",
    "timeout",
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

/**
 * Check if an HTTP response status is retryable
 */
export function isRetryableStatus(status: number): boolean {
  // 5xx server errors are retryable
  if (status >= 500 && status < 600) {
    return true;
  }
  // 429 Too Many Requests is retryable
  if (status === 429) {
    return true;
  }
  return false;
}

/**
 * Execute a function with retry logic
 * @param fn - The async function to execute
 * @param options - Retry options
 * @returns The result of the function
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries;
  const isRetryable = options.isRetryable ?? ((error: Error) => isRetryableError(error));

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const shouldRetry = attempt < maxRetries && isRetryable(lastError);

      if (!shouldRetry) {
        throw lastError;
      }

      // Calculate and wait for the delay
      const delay = calculateDelay(attempt, options);
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error("Retry failed");
}

/**
 * Execute a fetch request with retry logic
 * @param url - The URL to fetch
 * @param init - Fetch init options
 * @param retryOptions - Retry options
 * @returns The fetch response
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOptions: RetryOptions = {},
): Promise<Response> {
  const maxRetries = retryOptions.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries;

  let lastError: Error | undefined;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);
      lastResponse = response;

      // Check if the response status is retryable
      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        const delay = calculateDelay(attempt, retryOptions);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const isRetryable = retryOptions.isRetryable ?? isRetryableError;
      const shouldRetry = attempt < maxRetries && isRetryable(lastError);

      if (!shouldRetry) {
        throw lastError;
      }

      // Calculate and wait for the delay
      const delay = calculateDelay(attempt, retryOptions);
      await sleep(delay);
    }
  }

  // If we have a response (from retryable status), return it
  if (lastResponse) {
    return lastResponse;
  }

  // Otherwise throw the last error
  throw lastError ?? new Error("Fetch failed after retries");
}
