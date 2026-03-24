import { describe, expect, mock, test } from "bun:test";
import { type AFSContext, type AFSLogger, contextLogger, defaultLogger } from "../src/index.js";

describe("contextLogger", () => {
  test("returns default logger when called with undefined", () => {
    const logger = contextLogger(undefined);
    expect(logger).toBe(defaultLogger);
  });

  test("returns default logger when called with empty object", () => {
    const logger = contextLogger({});
    expect(logger).toBe(defaultLogger);
  });

  test("returns custom logger from context", () => {
    const custom: AFSLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const logger = contextLogger({ context: { logger: custom } });
    expect(logger).toBe(custom);
  });

  test("default logger calls console.warn with structured data", () => {
    const spy = mock((..._args: unknown[]) => {});
    const original = console.warn;
    console.warn = spy as typeof console.warn;
    try {
      defaultLogger.warn({ message: "test warning", extra: 42 });
      expect(spy).toHaveBeenCalledTimes(1);
      const calls = spy.mock.calls as unknown[][];
      expect(calls[0]![0]).toBe("test warning");
      expect(calls[0]![1]).toEqual({ message: "test warning", extra: 42 });
    } finally {
      console.warn = original;
    }
  });

  test("AFSContext type accepts requestId and logger fields", () => {
    const custom: AFSLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const ctx: AFSContext = {
      requestId: "abc",
      logger: custom,
    };
    expect(ctx.requestId).toBe("abc");
    expect(ctx.logger).toBe(custom);
  });
});
