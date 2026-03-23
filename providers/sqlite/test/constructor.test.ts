import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteAFS } from "../src/sqlite-afs.js";

describe("SQLiteAFS constructor side effects", () => {
  test("constructor with non-existent path does NOT create db file", () => {
    const dbPath = join(tmpdir(), `afs-sqlite-no-create-${Date.now()}`, "test.db");
    const _sqlite = new SQLiteAFS({ url: `file:${dbPath}` });
    expect(existsSync(dbPath)).toBe(false);
  });

  test("after ready() the db file exists", async () => {
    const dir = join(tmpdir(), `afs-sqlite-ready-${Date.now()}`);
    const dbPath = join(dir, "test.db");
    try {
      const sqlite = new SQLiteAFS({ url: `file:${dbPath}` });
      expect(existsSync(dbPath)).toBe(false);
      await sqlite.ready();
      expect(existsSync(dbPath)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ready() is idempotent", async () => {
    const dir = join(tmpdir(), `afs-sqlite-idempotent-${Date.now()}`);
    const dbPath = join(dir, "test.db");
    try {
      const sqlite = new SQLiteAFS({ url: `file:${dbPath}` });
      await sqlite.ready();
      await sqlite.ready();
      expect(existsSync(dbPath)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
