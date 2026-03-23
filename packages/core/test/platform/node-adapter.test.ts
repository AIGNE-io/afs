import { afterAll, beforeAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeAdapter } from "../../src/platform/node.js";
import { runAdapterTests } from "./adapter-conformance.test.js";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "afs-node-adapter-"));
});

afterAll(async () => {
  try {
    await rm(tempDir, { recursive: true });
  } catch {
    // cleanup is best-effort
  }
});

runAdapterTests({
  name: "Node",
  createAdapter: () => createNodeAdapter(),
  get tempDir() {
    return tempDir;
  },
});
