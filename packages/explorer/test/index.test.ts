import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { ExplorerWSServer, startExplorer } from "../src/index.js";

let testDir: string;
let afs: AFS;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-explorer-index-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  await writeFile(join(testDir, "test.txt"), "Hello World");

  afs = new AFS();
  await afs.mount(new AFSFS({ localPath: testDir, name: "test" }));
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

test("ExplorerWSServer can be instantiated", () => {
  const srv = new ExplorerWSServer(afs);
  expect(srv).toBeDefined();
});

test("ExplorerWSServer can start and stop", async () => {
  const srv = new ExplorerWSServer(afs);
  const info = await srv.start();
  expect(info.port).toBeGreaterThan(0);
  expect(info.url).toContain("http://");
  srv.stop();
});

test("startExplorer returns port, url, and stop function", async () => {
  const result = await startExplorer(afs);
  expect(result.port).toBeGreaterThan(0);
  expect(result.url).toContain("http://");
  expect(typeof result.stop).toBe("function");
  result.stop();
});
