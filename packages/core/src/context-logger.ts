/**
 * Minimal structured logger interface.
 * Providers call contextLogger(ctx) to get one — falls back to console.
 */
export interface AFSLogger {
  debug(data: Record<string, unknown> & { message: string }): void;
  info(data: Record<string, unknown> & { message: string }): void;
  warn(data: Record<string, unknown> & { message: string }): void;
  error(data: Record<string, unknown> & { message: string }): void;
}

/** Default logger — 直接转发到 console，零行为变更 */
export const defaultLogger: AFSLogger = {
  debug: (d) => console.debug(d.message, d),
  info: (d) => console.info(d.message, d),
  warn: (d) => console.warn(d.message, d),
  error: (d) => console.error(d.message, d),
};

/**
 * Extract logger from RouteContext options.
 * Falls back to console-based default — zero behavior change for existing code.
 */
export function contextLogger(options?: { context?: { logger?: AFSLogger } }): AFSLogger {
  return options?.context?.logger ?? defaultLogger;
}
