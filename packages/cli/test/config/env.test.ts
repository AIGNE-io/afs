import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveEnvVars } from "../../src/config/env.js";

describe("resolveEnvVars", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set up test environment variables
    process.env.AFS_TOKEN = "test-token-123";
    process.env.AFS_USER = "testuser";
    process.env.AFS_EMPTY = "";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("resolves single env var", () => {
    const result = resolveEnvVars("bearer:${AFS_TOKEN}");
    expect(result).toBe("bearer:test-token-123");
  });

  test("resolves multiple env vars", () => {
    const result = resolveEnvVars("${AFS_USER}:${AFS_TOKEN}");
    expect(result).toBe("testuser:test-token-123");
  });

  test("returns string unchanged if no env vars", () => {
    const result = resolveEnvVars("plain-string");
    expect(result).toBe("plain-string");
  });

  test("handles empty string", () => {
    const result = resolveEnvVars("");
    expect(result).toBe("");
  });

  test("resolves env var to empty string if set to empty", () => {
    const result = resolveEnvVars("value:${AFS_EMPTY}");
    expect(result).toBe("value:");
  });

  test("throws on undefined env var by default", () => {
    expect(() => resolveEnvVars("${UNDEFINED_VAR}")).toThrow(
      "Environment variable UNDEFINED_VAR is not defined",
    );
  });

  test("allows undefined env vars with option", () => {
    const result = resolveEnvVars("${UNDEFINED_VAR}", { allowUndefined: true });
    expect(result).toBe("");
  });

  test("handles mixed content", () => {
    const result = resolveEnvVars("prefix-${AFS_TOKEN}-suffix");
    expect(result).toBe("prefix-test-token-123-suffix");
  });

  test("handles adjacent env vars", () => {
    const result = resolveEnvVars("${AFS_USER}${AFS_TOKEN}");
    expect(result).toBe("testusertest-token-123");
  });

  test("does not resolve escaped env vars", () => {
    const result = resolveEnvVars("\\${AFS_TOKEN}");
    expect(result).toBe("${AFS_TOKEN}");
  });

  test("handles complex auth string", () => {
    process.env.API_KEY = "secret-key";
    const result = resolveEnvVars("header:X-API-Key:${API_KEY}");
    expect(result).toBe("header:X-API-Key:secret-key");
  });
});
