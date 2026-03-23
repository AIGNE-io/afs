/**
 * Tests for SQLite Provider /.meta/.capabilities
 *
 * Phase 2 of capabilities-manifest task:
 * - SQLite Provider returns valid CapabilitiesManifest
 * - Tools is empty array (SQLite has no global tools)
 * - Actions contain table and row level catalogs
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilitiesManifest } from "@aigne/afs";
import { AFS } from "@aigne/afs";
import { SQLiteAFS } from "@aigne/afs-sqlite";

const TEST_DB_PATH = join(import.meta.dir, "test-capabilities.db");

describe("SQLite Provider Capabilities", () => {
  let sqlite: SQLiteAFS;
  let afs: AFS;

  beforeAll(async () => {
    // Remove existing test database if present
    try {
      await unlink(TEST_DB_PATH);
    } catch {
      // Ignore if doesn't exist
    }

    sqlite = new SQLiteAFS({
      name: "test-sqlite",
      description: "Test SQLite Database",
      url: `file:${TEST_DB_PATH}`,
    });

    afs = new AFS();
    await afs.mount(sqlite);
    await sqlite.ensureInitialized();

    // Create a test table
    const db = await sqlite.getDatabase();
    const createTableSQL = `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )`;
    await db.run(createTableSQL).execute();
  });

  afterAll(async () => {
    // Clean up test database
    try {
      await unlink(TEST_DB_PATH);
      await unlink(`${TEST_DB_PATH}-shm`);
      await unlink(`${TEST_DB_PATH}-wal`);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Happy Path", () => {
    // read("/.meta/.capabilities") 返回有效的 CapabilitiesManifest
    test("read('/.meta/.capabilities') returns valid CapabilitiesManifest", async () => {
      const result = await sqlite.read("/.meta/.capabilities");

      expect(result.data).toBeDefined();
      expect(result.data?.content).toBeDefined();

      const manifest = result.data?.content as CapabilitiesManifest;
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.provider).toBe("test-sqlite");
      expect(Array.isArray(manifest.tools)).toBe(true);
      expect(Array.isArray(manifest.actions)).toBe(true);
    });

    // manifest.tools 为空数组
    test("manifest.tools is empty array", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      expect(manifest.tools).toEqual([]);
    });

    // manifest.actions 包含 table 和 row 级别的 catalog
    test("manifest.actions contains table and row level catalogs", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      expect(manifest.actions.length).toBeGreaterThan(0);

      // Check for different action levels
      const kinds = manifest.actions.map((a) => a.kind);
      expect(kinds).toContain("sqlite:root");
      expect(kinds).toContain("sqlite:table");
      expect(kinds).toContain("sqlite:row");
    });

    // 每个 ActionCatalog 有 kind, catalog, discovery
    test("each ActionCatalog has kind, catalog, discovery", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      for (const actionCatalog of manifest.actions) {
        expect(actionCatalog.kind).toBeDefined();
        expect(typeof actionCatalog.kind).toBe("string");

        expect(actionCatalog.catalog).toBeDefined();
        expect(Array.isArray(actionCatalog.catalog)).toBe(true);

        expect(actionCatalog.discovery).toBeDefined();
        expect(actionCatalog.discovery.pathTemplate).toBeDefined();
      }
    });

    // discovery.pathTemplate 格式正确（以 / 开头，使用 :param）
    test("discovery.pathTemplate format is correct (starts with /, uses :param)", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      for (const actionCatalog of manifest.actions) {
        const pathTemplate = actionCatalog.discovery.pathTemplate;
        expect(pathTemplate.startsWith("/")).toBe(true);

        // Table-level actions should have :table parameter
        if (actionCatalog.kind === "sqlite:table") {
          expect(pathTemplate).toContain(":table");
        }

        // Row-level actions should have :table and :pk parameters
        if (actionCatalog.kind === "sqlite:row") {
          expect(pathTemplate).toContain(":table");
          expect(pathTemplate).toContain(":pk");
        }
      }
    });
  });

  describe("Bad Path", () => {
    // 数据库未连接时返回空 actions (handled by ensureInitialized)
    test("returns valid manifest even before explicit initialization", async () => {
      const unconnectedSqlite = new SQLiteAFS({
        name: "unconnected",
        url: `file:${TEST_DB_PATH}`,
      });

      // Reading capabilities should auto-initialize
      const result = await unconnectedSqlite.read("/.meta/.capabilities");
      expect(result.data).toBeDefined();

      const manifest = result.data?.content as CapabilitiesManifest;
      expect(manifest.schemaVersion).toBe(1);
      expect(Array.isArray(manifest.actions)).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    // 空数据库（无表）时返回有 actions (actions still exist, just no specific table context)
    test("returns actions catalog even for empty database", async () => {
      // Remove test database to create empty one
      const emptyDbPath = join(import.meta.dir, "test-empty.db");
      try {
        await unlink(emptyDbPath);
      } catch {
        // Ignore
      }

      const emptySqlite = new SQLiteAFS({
        name: "empty-db",
        url: `file:${emptyDbPath}`,
      });

      const result = await emptySqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Actions catalog should still exist (describes possible operations)
      expect(Array.isArray(manifest.actions)).toBe(true);
      expect(manifest.actions.length).toBeGreaterThan(0);

      // Cleanup
      try {
        await unlink(emptyDbPath);
        await unlink(`${emptyDbPath}-shm`);
        await unlink(`${emptyDbPath}-wal`);
      } catch {
        // Ignore
      }
    });

    // catalog 中 action 无 inputSchema 时正常返回
    test("handles actions with no inputSchema gracefully", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Should not throw - some actions may not have inputSchema
      expect(manifest.actions).toBeDefined();
    });

    // kind 为可选，无 kind 时正常返回 (our implementation always provides kind)
    test("all actions have kind defined", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      for (const actionCatalog of manifest.actions) {
        // Our implementation always provides kind
        expect(actionCatalog.kind).toBeDefined();
      }
    });
  });

  describe("Security", () => {
    // 不暴露数据库连接字符串
    test("does not expose database connection string", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      const manifestStr = JSON.stringify(manifest);
      expect(manifestStr).not.toContain(TEST_DB_PATH);
      expect(manifestStr).not.toContain("file:");
    });

    // 不暴露表的实际数据
    test("does not expose actual table data", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      const manifestStr = JSON.stringify(manifest);
      // Should not contain any row data or specific values
      expect(manifestStr).not.toContain("@example.com");
    });
  });

  describe("Data Leak Prevention", () => {
    // capabilities 不包含表的行数或统计信息
    test("does not expose table row counts or statistics", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      const manifestStr = JSON.stringify(manifest);
      // Should not contain actual row count numbers or rowCount field
      expect(manifestStr).not.toContain("rowCount");
      // Should not contain childrenCount (which exposes row counts)
      expect(manifestStr).not.toContain("childrenCount");
      // Should not contain actual numeric statistics
      expect(manifestStr).not.toContain('"count":');
    });

    // 不暴露数据库文件路径
    test("does not expose database file path", async () => {
      const result = await sqlite.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      const manifestStr = JSON.stringify(manifest);
      expect(manifestStr).not.toContain("/test-capabilities.db");
      expect(manifestStr).not.toContain("test-capabilities");
    });
  });

  describe("Data Damage Prevention", () => {
    // 获取 capabilities 是只读操作
    test("getting capabilities is a read-only operation", async () => {
      // Get initial table count
      const db = await sqlite.getDatabase();
      const countQuery = "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'";
      const beforeResult = await db.all<{ count: number }>(countQuery).execute();
      const beforeCount = beforeResult[0]?.count ?? 0;

      // Read capabilities multiple times
      await sqlite.read("/.meta/.capabilities");
      await sqlite.read("/.meta/.capabilities");
      await sqlite.read("/.meta/.capabilities");

      // Verify table count unchanged
      const afterResult = await db.all<{ count: number }>(countQuery).execute();
      const afterCount = afterResult[0]?.count ?? 0;

      expect(afterCount).toBe(beforeCount);
    });

    // 不影响数据库连接状态
    test("does not affect database connection state", async () => {
      // Database should still be usable after reading capabilities
      await sqlite.read("/.meta/.capabilities");

      // Verify we can still query
      const result = await sqlite.read("/users");
      expect(result.data).toBeDefined();
    });
  });
});

describe("SQLite Provider Capabilities - AFS Integration", () => {
  let sqlite: SQLiteAFS;
  let afs: AFS;
  const testDbPath = join(import.meta.dir, "test-integration.db");

  beforeAll(async () => {
    try {
      await unlink(testDbPath);
    } catch {
      // Ignore
    }

    sqlite = new SQLiteAFS({
      name: "sqlite-db",
      url: `file:${testDbPath}`,
    });

    afs = new AFS();
    await afs.mount(sqlite, "/db");
    await sqlite.ensureInitialized();
  });

  afterAll(async () => {
    try {
      await unlink(testDbPath);
      await unlink(`${testDbPath}-shm`);
      await unlink(`${testDbPath}-wal`);
    } catch {
      // Ignore
    }
  });

  test("AFS aggregates SQLite capabilities with correct prefixes", async () => {
    const result = await afs.read("/.meta/.capabilities");

    expect(result.data).toBeDefined();
    const content = result.data?.content as {
      tools: Array<{ name: string; path: string }>;
      actions: Array<{ kind?: string; discovery: { pathTemplate: string } }>;
    };

    // Tools should be empty (SQLite has no tools)
    expect(content.tools).toEqual([]);

    // Actions should have mount path prefix
    for (const action of content.actions) {
      expect(action.discovery.pathTemplate.startsWith("/db")).toBe(true);
    }
  });
});
