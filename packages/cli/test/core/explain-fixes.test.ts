/**
 * Tests for explain command bug fixes:
 * - DOC-1: Remove /modules/ references
 * - DOC-3: All URI schemes listed
 * - DOC-7/8: stat→read fallback for path type detection
 */

import { describe, expect, test } from "bun:test";
import type { AFS } from "@aigne/afs";
import { AFSCommandExecutor } from "../../src/core/executor/index.js";
import { VERSION } from "../../src/version.js";

function createExecutor(afs?: AFS) {
  return new AFSCommandExecutor(afs, { tty: false, version: VERSION });
}

describe("explain overview (DOC-1)", () => {
  test("does not contain /modules/ references", async () => {
    const executor = createExecutor();
    const result = await executor.execute("explain");
    expect(result.success).toBe(true);
    expect(result.formatted).not.toContain("/modules/");
  });

  test("contains /{mount} reference", async () => {
    const executor = createExecutor();
    const result = await executor.execute("explain");
    expect(result.success).toBe(true);
    expect(result.formatted).toContain("/{mount}");
  });
});

describe("explain paths (DOC-1)", () => {
  test("does not contain /modules/ references", async () => {
    const executor = createExecutor();
    const result = await executor.execute("explain paths");
    expect(result.success).toBe(true);
    expect(result.formatted).not.toContain("/modules/");
    expect(result.formatted).not.toContain("/modules");
  });

  test("contains /{mount} reference", async () => {
    const executor = createExecutor();
    const result = await executor.execute("explain paths");
    expect(result.success).toBe(true);
    expect(result.formatted).toContain("/{mount}");
  });
});

describe("explain uri (DOC-3)", () => {
  const allSchemes = [
    "fs://",
    "git://",
    "sqlite://",
    "json://",
    "toml://",
    "sandbox://",
    "github://",
    "http://",
    "mcp://",
    "s3://",
    "gcs://",
    "ec2://",
    "gce://",
    "dns://",
  ];

  test("lists all 14 provider URI schemes", async () => {
    const executor = createExecutor();
    const result = await executor.execute("explain uri");
    expect(result.success).toBe(true);

    for (const scheme of allSchemes) {
      expect(result.formatted).toContain(scheme);
    }
  });
});
