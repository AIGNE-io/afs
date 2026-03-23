/**
 * SQLITE_BUSY retry wrapper using Proxy pattern.
 * Inlined from @aigne/sqlite to remove external dependency.
 */

function isDBLockedError(error: unknown): boolean {
  let err = error;
  while (err) {
    if (!(err instanceof Error)) return false;
    if (typeof err.message !== "string") return false;
    if (err.message.includes("SQLITE_BUSY")) return true;
    err = (err as Error).cause;
  }
  return false;
}

interface WithRetryOptions {
  max?: number;
  backoffBase?: number;
  backoffExponent?: number;
  backoffJitter?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export function withRetry<T extends object>(
  db: T,
  methods: (keyof T)[],
  {
    max = 30,
    backoffBase = 300,
    backoffExponent = 1.2,
    backoffJitter = 300,
    shouldRetry = isDBLockedError,
  }: WithRetryOptions = {},
): T {
  return new Proxy(db, {
    get(target, prop) {
      const val = (target as Record<string | symbol, unknown>)?.[prop];
      if (methods.includes(prop as keyof T) && typeof val === "function") {
        return async (...args: unknown[]) => {
          let attempt = 1;
          while (true) {
            try {
              return await (val as (...a: unknown[]) => unknown).apply(target, args);
            } catch (err) {
              if (!shouldRetry(err) || ++attempt > max) throw err;
              const expDelay = backoffBase * backoffExponent ** (attempt - 1);
              const jitter = Math.random() * backoffJitter;
              const waitTime = Math.floor(expDelay + jitter);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
          }
        };
      }
      return val;
    },
  });
}
