import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

let afs: AFS;

beforeEach(async () => {
  const moduleA = new JSONModule({
    name: "module-a",
    description: "Module A",
    accessMode: "readwrite",
    data: {
      fileA: { content: "Content A" },
      fileB: { content: "Content B" },
    },
  });

  const moduleB = new JSONModule({
    name: "module-b",
    description: "Module B",
    accessMode: "readwrite",
    data: {
      fileX: { content: "Content X" },
    },
  });

  const readonlyModule = new JSONModule({
    name: "readonly-mod",
    description: "Readonly Module",
    accessMode: "readonly",
    data: {
      fileR: { content: "Readonly Content" },
    },
  });

  afs = new AFS();
  await afs.mount(moduleA);
  await afs.mount(moduleB);
  await afs.mount(readonlyModule);
});

describe("batchWrite", () => {
  test("should write multiple entries successfully", async () => {
    const result = await afs.batchWrite([
      { path: "/modules/module-a/new1", content: { content: "Content 1" } },
      { path: "/modules/module-a/new2", content: { content: "Content 2" } },
      { path: "/modules/module-a/new3", content: { content: "Content 3" } },
    ]);

    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(3);

    for (const entry of result.results) {
      expect(entry.success).toBe(true);
      expect(entry.data).toBeDefined();
    }

    // Verify files were written
    const read1 = await afs.read("/modules/module-a/new1");
    expect(read1.data?.content).toBe("Content 1");
    const read3 = await afs.read("/modules/module-a/new3");
    expect(read3.data?.content).toBe("Content 3");
  });

  test("should handle partial failure — invalid path fails, others succeed", async () => {
    const result = await afs.batchWrite([
      { path: "/modules/module-a/ok1", content: { content: "OK 1" } },
      { path: "/modules/nonexistent/bad", content: { content: "Bad" } },
      { path: "/modules/module-a/ok2", content: { content: "OK 2" } },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(3);

    expect(result.results[0]!.success).toBe(true);
    expect(result.results[0]!.path).toBe("/modules/module-a/ok1");

    expect(result.results[1]!.success).toBe(false);
    expect(result.results[1]!.path).toBe("/modules/nonexistent/bad");
    expect(result.results[1]!.error).toBeDefined();

    expect(result.results[2]!.success).toBe(true);
    expect(result.results[2]!.path).toBe("/modules/module-a/ok2");
  });

  test("should handle readonly module — entry fails with error", async () => {
    const result = await afs.batchWrite([
      { path: "/modules/module-a/ok", content: { content: "OK" } },
      {
        path: "/modules/readonly-mod/fileR/content",
        content: { content: "Should Fail" },
      },
    ]);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);

    expect(result.results[0]!.success).toBe(true);
    expect(result.results[1]!.success).toBe(false);
    expect(result.results[1]!.error).toContain("readonly");
  });

  test("should handle empty entries array", async () => {
    const result = await afs.batchWrite([]);

    expect(result.results).toHaveLength(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test("should work across providers — entries in different mounts", async () => {
    const result = await afs.batchWrite([
      { path: "/modules/module-a/crossA", content: { content: "In A" } },
      { path: "/modules/module-b/crossB", content: { content: "In B" } },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);

    const readA = await afs.read("/modules/module-a/crossA");
    expect(readA.data?.content).toBe("In A");

    const readB = await afs.read("/modules/module-b/crossB");
    expect(readB.data?.content).toBe("In B");
  });

  test("should preserve entry order in results", async () => {
    const result = await afs.batchWrite([
      { path: "/modules/module-a/first", content: { content: "1" } },
      { path: "/modules/module-a/second", content: { content: "2" } },
      { path: "/modules/module-a/third", content: { content: "3" } },
    ]);

    expect(result.results[0]!.path).toBe("/modules/module-a/first");
    expect(result.results[1]!.path).toBe("/modules/module-a/second");
    expect(result.results[2]!.path).toBe("/modules/module-a/third");
  });

  test("should support write mode per entry", async () => {
    // Write initial content
    await afs.write("/modules/module-a/appendTarget/content", {
      content: "Hello",
    });

    const result = await afs.batchWrite([
      {
        path: "/modules/module-a/createNew",
        content: { content: "Brand New" },
        mode: "create",
      },
      { path: "/modules/module-a/replaceMe", content: { content: "Replaced" } },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });
});

describe("batchDelete", () => {
  test("should delete multiple entries successfully", async () => {
    const result = await afs.batchDelete([
      { path: "/modules/module-a/fileA/content" },
      { path: "/modules/module-a/fileB/content" },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(2);

    for (const entry of result.results) {
      expect(entry.success).toBe(true);
    }
  });

  test("should handle partial failure — non-existent path fails, others succeed", async () => {
    const result = await afs.batchDelete([
      { path: "/modules/module-a/fileA/content" },
      { path: "/modules/module-a/nonexistent" },
      { path: "/modules/module-b/fileX/content" },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);

    expect(result.results[0]!.success).toBe(true);
    expect(result.results[1]!.success).toBe(false);
    expect(result.results[1]!.error).toBeDefined();
    expect(result.results[2]!.success).toBe(true);
  });

  test("should handle readonly module — entry fails with error", async () => {
    const result = await afs.batchDelete([
      { path: "/modules/module-a/fileA/content" },
      { path: "/modules/readonly-mod/fileR/content" },
    ]);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);

    expect(result.results[0]!.success).toBe(true);
    expect(result.results[1]!.success).toBe(false);
    expect(result.results[1]!.error).toContain("readonly");
  });

  test("should handle empty entries array", async () => {
    const result = await afs.batchDelete([]);

    expect(result.results).toHaveLength(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  test("should work across providers", async () => {
    const result = await afs.batchDelete([
      { path: "/modules/module-a/fileA/content" },
      { path: "/modules/module-b/fileX/content" },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });

  test("should support recursive per entry", async () => {
    // module-a has a directory-like structure, fileA is an object with content key
    const result = await afs.batchDelete([
      { path: "/modules/module-a/fileA", recursive: true },
      { path: "/modules/module-a/fileB", recursive: true },
    ]);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
  });
});
