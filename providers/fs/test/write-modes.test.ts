import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS, AFSNotFoundError } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

let testDir: string;
let afs: AFS;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-write-modes-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  const fs = new AFSFS({ localPath: testDir, name: "test-fs" });
  afs = new AFS();
  await afs.mount(fs);
});

beforeEach(async () => {
  // Ensure existing.txt exists for each test
  await writeFile(join(testDir, "existing.txt"), "existing content");
  // Remove new-file.txt if it exists
  const newFilePath = join(testDir, "new-file.txt");
  if (existsSync(newFilePath)) {
    await rm(newFilePath);
  }
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ─── create mode ────────────────────────────────────────────────────────────

describe("write mode=create", () => {
  test("creates new file successfully", async () => {
    const result = await afs.write(
      "/modules/test-fs/new-file.txt",
      { content: "new content" },
      { mode: "create" },
    );
    expect(result.data).toBeDefined();

    const read = await afs.read("/modules/test-fs/new-file.txt");
    expect(read.data?.content).toBe("new content");
  });

  test("throws AFSAlreadyExistsError when path exists", async () => {
    await expect(
      afs.write("/modules/test-fs/existing.txt", { content: "overwrite" }, { mode: "create" }),
    ).rejects.toThrow("already exists");
  });

  test("AFSAlreadyExistsError has correct code", async () => {
    try {
      await afs.write(
        "/modules/test-fs/existing.txt",
        { content: "overwrite" },
        { mode: "create" },
      );
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("AFS_ALREADY_EXISTS");
    }
  });
});

// ─── update mode ────────────────────────────────────────────────────────────

describe("write mode=update", () => {
  test("updates existing file successfully", async () => {
    const result = await afs.write(
      "/modules/test-fs/existing.txt",
      { content: "updated content" },
      { mode: "update" },
    );
    expect(result.data).toBeDefined();

    const read = await afs.read("/modules/test-fs/existing.txt");
    expect(read.data?.content).toBe("updated content");
  });

  test("throws AFSNotFoundError when path does not exist", async () => {
    await expect(
      afs.write("/modules/test-fs/new-file.txt", { content: "content" }, { mode: "update" }),
    ).rejects.toThrow(AFSNotFoundError);
  });
});

// ─── patch mode on non-existent file ────────────────────────────────────────

describe("write mode=patch on non-existent file", () => {
  test("throws AFSNotFoundError", async () => {
    await expect(
      afs.write(
        "/modules/test-fs/new-file.txt",
        { patches: [{ op: "str_replace", target: "x", content: "y" }] },
        { mode: "patch" },
      ),
    ).rejects.toThrow(AFSNotFoundError);
  });
});

// ─── replace mode (backward compat) ─────────────────────────────────────────

describe("write mode=replace (backward compat)", () => {
  test("creates new file", async () => {
    await afs.write("/modules/test-fs/new-file.txt", { content: "created" });
    const read = await afs.read("/modules/test-fs/new-file.txt");
    expect(read.data?.content).toBe("created");
  });

  test("overwrites existing file", async () => {
    await afs.write("/modules/test-fs/existing.txt", { content: "replaced" });
    const read = await afs.read("/modules/test-fs/existing.txt");
    expect(read.data?.content).toBe("replaced");
  });

  test("explicit mode=replace works same as default", async () => {
    await afs.write(
      "/modules/test-fs/existing.txt",
      { content: "explicit replace" },
      { mode: "replace" },
    );
    const read = await afs.read("/modules/test-fs/existing.txt");
    expect(read.data?.content).toBe("explicit replace");
  });
});
