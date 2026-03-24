import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSPatchError } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

let testDir: string;
let fs: AFSFS;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-write-patch-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  fs = new AFSFS({ localPath: testDir });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// Helper to read raw file content
async function readRaw(filename: string): Promise<string> {
  return readFile(join(testDir, filename), "utf8");
}

// Helper to write raw file content
async function writeRaw(filename: string, content: string): Promise<void> {
  await writeFile(join(testDir, filename), content, "utf8");
}

// ─── patch mode ─────────────────────────────────────────────────────────────

describe("write mode=patch", () => {
  beforeEach(async () => {
    await writeRaw("patch-target.txt", "line1\nline2\nline3\n");
  });

  test("str_replace on a real file", async () => {
    await fs.write(
      "patch-target.txt",
      { patches: [{ op: "str_replace", target: "line2", content: "replaced" }] },
      { mode: "patch" },
    );
    expect(await readRaw("patch-target.txt")).toBe("line1\nreplaced\nline3\n");
  });

  test("insert_before on a real file", async () => {
    await fs.write(
      "patch-target.txt",
      { patches: [{ op: "insert_before", target: "line2", content: "inserted\n" }] },
      { mode: "patch" },
    );
    expect(await readRaw("patch-target.txt")).toBe("line1\ninserted\nline2\nline3\n");
  });

  test("insert_after on a real file", async () => {
    await fs.write(
      "patch-target.txt",
      { patches: [{ op: "insert_after", target: "line2", content: "\ninserted" }] },
      { mode: "patch" },
    );
    expect(await readRaw("patch-target.txt")).toBe("line1\nline2\ninserted\nline3\n");
  });

  test("delete on a real file", async () => {
    await fs.write(
      "patch-target.txt",
      { patches: [{ op: "delete", target: "\nline2" }] },
      { mode: "patch" },
    );
    expect(await readRaw("patch-target.txt")).toBe("line1\nline3\n");
  });

  test("multiple patches applied sequentially", async () => {
    await fs.write(
      "patch-target.txt",
      {
        patches: [
          { op: "str_replace", target: "line1", content: "first" },
          { op: "str_replace", target: "line3", content: "third" },
        ],
      },
      { mode: "patch" },
    );
    expect(await readRaw("patch-target.txt")).toBe("first\nline2\nthird\n");
  });

  test("patch error leaves file unchanged", async () => {
    const original = await readRaw("patch-target.txt");
    expect(() =>
      fs.write(
        "patch-target.txt",
        { patches: [{ op: "str_replace", target: "nonexistent", content: "x" }] },
        { mode: "patch" },
      ),
    ).toThrow(AFSPatchError);
    expect(await readRaw("patch-target.txt")).toBe(original);
  });

  test("empty patches array is a no-op", async () => {
    const original = await readRaw("patch-target.txt");
    await fs.write("patch-target.txt", { patches: [] }, { mode: "patch" });
    expect(await readRaw("patch-target.txt")).toBe(original);
  });
});

// ─── prepend mode ───────────────────────────────────────────────────────────

describe("write mode=prepend", () => {
  beforeEach(async () => {
    await writeRaw("prepend-target.txt", "existing content");
  });

  test("prepends content to file", async () => {
    await fs.write("prepend-target.txt", { content: "new header\n" }, { mode: "prepend" });
    expect(await readRaw("prepend-target.txt")).toBe("new header\nexisting content");
  });

  test("prepend to empty file", async () => {
    await writeRaw("prepend-empty.txt", "");
    await fs.write("prepend-empty.txt", { content: "first line" }, { mode: "prepend" });
    expect(await readRaw("prepend-empty.txt")).toBe("first line");
  });
});

// ─── append mode (backward compat with new mode param) ──────────────────────

describe("write mode=append", () => {
  beforeEach(async () => {
    await writeRaw("append-target.txt", "existing content");
  });

  test("appends content to file", async () => {
    await fs.write("append-target.txt", { content: "\nnew line" }, { mode: "append" });
    expect(await readRaw("append-target.txt")).toBe("existing content\nnew line");
  });
});

// ─── replace mode (default) ─────────────────────────────────────────────────

describe("write mode=replace (default)", () => {
  test("replaces file content entirely", async () => {
    await writeRaw("replace-target.txt", "old content");
    await fs.write("replace-target.txt", { content: "new content" });
    expect(await readRaw("replace-target.txt")).toBe("new content");
  });

  test("explicit mode=replace works same as default", async () => {
    await writeRaw("replace-target2.txt", "old");
    await fs.write("replace-target2.txt", { content: "new" }, { mode: "replace" });
    expect(await readRaw("replace-target2.txt")).toBe("new");
  });
});
