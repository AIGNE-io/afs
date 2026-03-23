/**
 * In-memory adapter conformance test.
 *
 * Proves the PlatformAdapter interface works without any node: imports.
 * Uses the shared MemoryAdapter from packages/core/src/platform/memory.ts.
 */
import { afterAll, beforeAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryAdapter } from "../../src/platform/memory.js";
import { runAdapterTests } from "./adapter-conformance.test.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "afs-memory-adapter-"));
});

afterAll(async () => {
  try {
    await rm(tempDir, { recursive: true });
  } catch {
    // cleanup is best-effort
  }
});

runAdapterTests({
  name: "Memory (Workers/QuickJS shim)",
  createAdapter: () => createMemoryAdapter(),
  // Use in-memory path — MemoryFS doesn't care about real filesystem paths
  get tempDir() {
    return `/tmp/afs-test-${Date.now()}`;
  },
});
