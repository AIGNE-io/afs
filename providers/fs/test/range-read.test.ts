import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

let testDir: string;
let afs: AFS;

const MULTILINE = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10";

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-range-read-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  await writeFile(join(testDir, "multiline.txt"), MULTILINE);
  await writeFile(join(testDir, "single.txt"), "one line only");

  const fs = new AFSFS({ localPath: testDir, name: "test-fs" });
  afs = new AFS();
  await afs.mount(fs);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ─── startLine + endLine ────────────────────────────────────────────────────

describe("range read: startLine + endLine", () => {
  test("returns exact range of lines", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 3,
      endLine: 5,
    });
    expect(result.data?.content).toBe("line3\nline4\nline5");
    expect(result.data?.meta?.lineRange).toEqual({
      startLine: 3,
      endLine: 5,
      totalLines: 10,
    });
  });

  test("returns first N lines with startLine=1", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 1,
      endLine: 3,
    });
    expect(result.data?.content).toBe("line1\nline2\nline3");
  });

  test("returns last lines", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 8,
      endLine: 10,
    });
    expect(result.data?.content).toBe("line8\nline9\nline10");
  });
});

// ─── startLine only ─────────────────────────────────────────────────────────

describe("range read: startLine only", () => {
  test("returns from startLine to end of file", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 8,
    });
    expect(result.data?.content).toBe("line8\nline9\nline10");
    expect(result.data?.meta?.lineRange).toEqual({
      startLine: 8,
      endLine: 10,
      totalLines: 10,
    });
  });
});

// ─── endLine only ───────────────────────────────────────────────────────────

describe("range read: endLine only", () => {
  test("returns from beginning to endLine", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      endLine: 3,
    });
    expect(result.data?.content).toBe("line1\nline2\nline3");
    expect(result.data?.meta?.lineRange).toEqual({
      startLine: 1,
      endLine: 3,
      totalLines: 10,
    });
  });
});

// ─── endLine: -1 ────────────────────────────────────────────────────────────

describe("range read: endLine=-1", () => {
  test("endLine=-1 means end of file", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 9,
      endLine: -1,
    });
    expect(result.data?.content).toBe("line9\nline10");
    expect(result.data?.meta?.lineRange).toEqual({
      startLine: 9,
      endLine: 10,
      totalLines: 10,
    });
  });
});

// ─── out of range ───────────────────────────────────────────────────────────

describe("range read: out of range", () => {
  test("startLine > totalLines returns empty content", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 999,
    });
    expect(result.data?.content).toBe("");
    expect(result.data?.meta?.lineRange?.totalLines).toBe(10);
  });

  test("endLine > totalLines clamps to totalLines", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt", {
      startLine: 8,
      endLine: 100,
    });
    expect(result.data?.content).toBe("line8\nline9\nline10");
    expect(result.data?.meta?.lineRange?.endLine).toBe(10);
  });
});

// ─── invalid range ──────────────────────────────────────────────────────────

describe("range read: invalid range", () => {
  test("startLine > endLine throws error", async () => {
    await expect(
      afs.read("/modules/test-fs/multiline.txt", { startLine: 10, endLine: 5 }),
    ).rejects.toThrow("Invalid range");
  });
});

// ─── no range (backward compat) ─────────────────────────────────────────────

describe("range read: no range", () => {
  test("no startLine/endLine returns full content without lineRange meta", async () => {
    const result = await afs.read("/modules/test-fs/multiline.txt");
    expect(result.data?.content).toBe(MULTILINE);
    expect(result.data?.meta?.lineRange).toBeUndefined();
  });
});

// ─── non-string content ─────────────────────────────────────────────────────

describe("range read: non-string content", () => {
  test("non-string content is passed through unchanged", async () => {
    // Read a directory (which has no string content)
    const result = await afs.read("/modules/test-fs", { startLine: 1, endLine: 5 });
    // Should not crash — just returns as-is without lineRange
    expect(result.data?.meta?.lineRange).toBeUndefined();
  });
});

// ─── single line file ───────────────────────────────────────────────────────

describe("range read: single line file", () => {
  test("single line file with full range", async () => {
    const result = await afs.read("/modules/test-fs/single.txt", {
      startLine: 1,
      endLine: 1,
    });
    expect(result.data?.content).toBe("one line only");
    expect(result.data?.meta?.lineRange?.totalLines).toBe(1);
  });
});
