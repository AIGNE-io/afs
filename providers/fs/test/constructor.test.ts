import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "../src/index.js";

describe("AFSFS constructor side effects", () => {
  test("constructor with non-existent path does NOT mkdir", () => {
    const dir = join(tmpdir(), `afs-fs-no-create-${Date.now()}`);
    const _fs = new AFSFS({ localPath: dir });
    expect(existsSync(dir)).toBe(false);
  });

  test("after ready() the directory exists", async () => {
    const dir = join(tmpdir(), `afs-fs-ready-${Date.now()}`);
    try {
      const fs = new AFSFS({ localPath: dir });
      expect(existsSync(dir)).toBe(false);
      await fs.ready();
      expect(existsSync(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ready() is idempotent", async () => {
    const dir = join(tmpdir(), `afs-fs-idempotent-${Date.now()}`);
    try {
      const fs = new AFSFS({ localPath: dir });
      await fs.ready();
      await fs.ready();
      expect(existsSync(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
