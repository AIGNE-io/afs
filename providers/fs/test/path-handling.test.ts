import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "../src/index.js";

describe("AFS path handling", () => {
  test('list("/") returns entries with forward-slash AFS paths', async () => {
    const localPath = join(tmpdir(), `afs-path-test-${Date.now()}`);
    mkdirSync(join(localPath, "subdir"), { recursive: true });
    writeFileSync(join(localPath, "file.txt"), "hello");
    writeFileSync(join(localPath, "subdir", "nested.txt"), "world");

    try {
      const fs = new AFSFS({ localPath });
      const result = await fs.list!("/", {});
      for (const entry of result.data) {
        expect(entry.path).toStartWith("/");
        expect(entry.path).not.toContain("\\");
      }
    } finally {
      await rm(localPath, { recursive: true });
    }
  });

  test("all entry paths start with /", async () => {
    const localPath = join(tmpdir(), `afs-path-test2-${Date.now()}`);
    mkdirSync(join(localPath, "a", "b"), { recursive: true });
    writeFileSync(join(localPath, "a", "b", "c.txt"), "content");

    try {
      const fs = new AFSFS({ localPath });
      const result = await fs.list!("/a", {});
      for (const entry of result.data) {
        expect(entry.path).toStartWith("/");
      }
    } finally {
      await rm(localPath, { recursive: true });
    }
  });

  test("search returns entries with forward-slash paths", async () => {
    const localPath = join(tmpdir(), `afs-search-path-${Date.now()}`);
    mkdirSync(localPath, { recursive: true });
    writeFileSync(join(localPath, "hello.txt"), "world");

    try {
      const fs = new AFSFS({ localPath });
      const result = await fs.search!("/", "world", {});
      for (const entry of result.data) {
        expect(entry.path).toStartWith("/");
        expect(entry.path).not.toContain("\\");
      }
    } finally {
      await rm(localPath, { recursive: true });
    }
  });
});
