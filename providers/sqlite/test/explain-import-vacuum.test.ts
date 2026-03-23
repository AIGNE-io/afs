import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { SqliteDatabase } from "../src/database/init.js";
import { SQLiteAFS } from "../src/sqlite-afs.js";

let testDir: string;
let dbPath: string;
let module: SQLiteAFS;
let db: SqliteDatabase;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-sqlite-explain-test-${Date.now()}`);
  dbPath = join(testDir, "test.db");

  // Ensure directory exists
  const { mkdir } = await import("node:fs/promises");
  await mkdir(testDir, { recursive: true });

  module = new SQLiteAFS({
    url: `file:${dbPath}`,
    name: "test-sqlite",
    description: "Test SQLite database",
    accessMode: "readwrite",
  });

  await module.ensureInitialized();
  db = await module.getDatabase();

  // Create test tables
  await db.run(sql`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    age INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    published INTEGER DEFAULT 0
  )`);

  await db.run(sql`CREATE TABLE IF NOT EXISTS tags (
    name TEXT PRIMARY KEY,
    color TEXT
  )`);

  // Create indexes
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published)`);

  // Create an empty table for edge cases
  await db.run(sql`CREATE TABLE IF NOT EXISTS empty_table (
    id INTEGER PRIMARY KEY,
    value TEXT
  )`);

  // Create table with composite primary key
  await db.run(sql`CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_name TEXT NOT NULL,
    granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_name)
  )`);

  // Insert some test data
  await db.run(sql`INSERT INTO users (name, email, age) VALUES ('Alice', 'alice@example.com', 30)`);
  await db.run(sql`INSERT INTO users (name, email, age) VALUES ('Bob', 'bob@example.com', 25)`);
  await db.run(
    sql`INSERT INTO users (name, email, age) VALUES ('Charlie', 'charlie@example.com', 35)`,
  );

  await db.run(
    sql`INSERT INTO posts (title, body, user_id, published) VALUES ('First Post', 'Hello world', 1, 1)`,
  );
  await db.run(
    sql`INSERT INTO posts (title, body, user_id, published) VALUES ('Draft', 'Work in progress', 1, 0)`,
  );

  await db.run(sql`INSERT INTO tags (name, color) VALUES ('tech', 'blue')`);
  await db.run(sql`INSERT INTO tags (name, color) VALUES ('news', 'red')`);
});

afterAll(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(testDir, { recursive: true, force: true });
});

// ===== EXPLAIN =====

describe("explain", () => {
  describe("Happy Path", () => {
    test("explain root should show database info, table count", async () => {
      const result = await module.explain("/");

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.format).toBe("markdown");

      // Should mention tables
      expect(result.content).toContain("users");
      expect(result.content).toContain("posts");
      expect(result.content).toContain("tags");
    });

    test("explain table should show column definitions, primary key, indexes, row count", async () => {
      const result = await module.explain("/users");

      expect(result.content).toBeDefined();
      expect(result.format).toBe("markdown");

      // Should contain column info
      expect(result.content).toContain("id");
      expect(result.content).toContain("name");
      expect(result.content).toContain("email");
      expect(result.content).toContain("age");

      // Should mention primary key
      expect(result.content).toMatch(/primary.*key|PRIMARY/i);

      // Should show row count
      expect(result.content).toContain("3");
    });

    test("explain table with indexes should show index info", async () => {
      const result = await module.explain("/posts");

      expect(result.content).toBeDefined();
      // Should mention indexes
      expect(result.content).toMatch(/index|idx_posts/i);
    });

    test("explain table with foreign keys should show relationships", async () => {
      const result = await module.explain("/posts");

      expect(result.content).toBeDefined();
      // Should mention foreign key to users
      expect(result.content).toMatch(/foreign.*key|users|references/i);
    });

    test("explain row should show primary key value and column values", async () => {
      const result = await module.explain("/users/1");

      expect(result.content).toBeDefined();
      expect(result.format).toBe("markdown");

      // Should contain row data summary
      expect(result.content).toContain("Alice");
      expect(result.content).toContain("alice@example.com");
    });
  });

  describe("Edge Cases", () => {
    test("explain empty table (0 rows)", async () => {
      const result = await module.explain("/empty_table");

      expect(result.content).toBeDefined();
      expect(result.content).toContain("0");
    });

    test("explain table with no indexes", async () => {
      const result = await module.explain("/tags");

      expect(result.content).toBeDefined();
      // tags table only has PK index, no additional indexes
      expect(result.content).toContain("tags");
    });

    test("explain table with composite primary key", async () => {
      const result = await module.explain("/user_roles");

      expect(result.content).toBeDefined();
      expect(result.content).toContain("user_id");
      expect(result.content).toContain("role_name");
    });

    test("explain non-existent path should throw", async () => {
      await expect(module.explain("/nonexistent")).rejects.toThrow();
    });

    test("explain non-existent row should throw", async () => {
      await expect(module.explain("/users/999")).rejects.toThrow();
    });
  });

  describe("Security", () => {
    test("explain should not leak other table data", async () => {
      const result = await module.explain("/users");

      // Should not contain posts data
      expect(result.content).not.toContain("First Post");
      expect(result.content).not.toContain("Work in progress");
    });
  });
});

// ===== IMPORT ACTION =====

describe("import action", () => {
  describe("Happy Path", () => {
    test("import JSON to table should return imported row count", async () => {
      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify([
          { name: "imported1", color: "green" },
          { name: "imported2", color: "yellow" },
        ]),
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBe(2);

      // Cleanup
      await db.run(sql`DELETE FROM tags WHERE name IN ('imported1', 'imported2')`);
    });

    test("import CSV to table should return imported row count", async () => {
      const csvData = "name,color\nimported_csv1,purple\nimported_csv2,orange";

      const result = await module.exec("/tags/.actions/import", {
        format: "csv",
        data: csvData,
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBe(2);

      // Cleanup
      await db.run(sql`DELETE FROM tags WHERE name LIKE 'imported_csv%'`);
    });

    test("import CSV with custom delimiter", async () => {
      const tsvData = "name\tcolor\nimported_tsv1\tpink\nimported_tsv2\tteal";

      const result = await module.exec("/tags/.actions/import", {
        format: "csv",
        data: tsvData,
        delimiter: "\t",
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBe(2);

      // Cleanup
      await db.run(sql`DELETE FROM tags WHERE name LIKE 'imported_tsv%'`);
    });

    test("import with onConflict=ignore should skip conflicts", async () => {
      // Insert data that conflicts with existing "tech" tag
      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify([
          { name: "tech", color: "changed" }, // Conflicts with existing
          { name: "imported_ignore", color: "gray" },
        ]),
        onConflict: "ignore",
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBeDefined();
      expect(result.data?.skipped).toBeDefined();

      // Verify "tech" was NOT changed
      const readResult = await module.read("/tags/tech");
      expect((readResult.data?.content as Record<string, unknown>)?.color).toBe("blue");

      // Cleanup
      await db.run(sql`DELETE FROM tags WHERE name = 'imported_ignore'`);
    });

    test("import with onConflict=replace should replace conflicts", async () => {
      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify([{ name: "tech", color: "replaced_color" }]),
        onConflict: "replace",
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBeDefined();

      // Verify "tech" WAS changed
      const readResult = await module.read("/tags/tech");
      expect((readResult.data?.content as Record<string, unknown>)?.color).toBe("replaced_color");

      // Restore original
      await db.run(sql`UPDATE tags SET color = 'blue' WHERE name = 'tech'`);
    });
  });

  describe("Bad Path", () => {
    test("import with unsupported format should error", async () => {
      await expect(
        module.exec("/tags/.actions/import", {
          format: "xml",
          data: "<data></data>",
        }),
      ).rejects.toThrow();
    });

    test("import with invalid JSON should error", async () => {
      await expect(
        module.exec("/tags/.actions/import", {
          format: "json",
          data: "not valid json [[[",
        }),
      ).rejects.toThrow();
    });

    test("import to non-existent table should error", async () => {
      await expect(
        module.exec("/nonexistent_table/.actions/import", {
          format: "json",
          data: JSON.stringify([{ id: 1 }]),
        }),
      ).rejects.toThrow();
    });

    test("import with onConflict=abort on primary key conflict should error", async () => {
      await expect(
        module.exec("/tags/.actions/import", {
          format: "json",
          data: JSON.stringify([
            { name: "tech", color: "conflict" }, // Conflicts with existing
          ]),
          onConflict: "abort",
        }),
      ).rejects.toThrow();

      // Verify original data unchanged
      const readResult = await module.read("/tags/tech");
      expect((readResult.data?.content as Record<string, unknown>)?.color).toBe("blue");
    });
  });

  describe("Edge Cases", () => {
    test("import empty JSON array should return imported=0", async () => {
      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify([]),
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBe(0);
    });

    test("import empty CSV (only header) should return imported=0", async () => {
      const result = await module.exec("/tags/.actions/import", {
        format: "csv",
        data: "name,color",
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBe(0);
    });

    test("import large data (100+ rows) should use transaction", async () => {
      // Generate 100 rows
      const rows = Array.from({ length: 100 }, (_, i) => ({
        name: `bulk_${i}`,
        color: `color_${i}`,
      }));

      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify(rows),
      });

      expect(result.success).toBe(true);
      expect(result.data?.imported).toBe(100);

      // Cleanup
      await db.run(sql`DELETE FROM tags WHERE name LIKE 'bulk_%'`);
    });
  });

  describe("Security", () => {
    test("import data uses parameterized queries (no SQL injection)", async () => {
      // Try SQL injection via data value
      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify([{ name: "safe'; DROP TABLE tags; --", color: "red" }]),
      });

      expect(result.success).toBe(true);

      // Table should still exist
      const listResult = await module.list("/");
      const tableNames = listResult.data.map((e) => e.path);
      expect(tableNames).toContain("/tags");

      // Cleanup
      await db.run(sql`DELETE FROM tags WHERE name LIKE '%DROP%'`);
    });
  });

  describe("Data Damage", () => {
    test("import abort should rollback - database state unchanged", async () => {
      // Count rows before
      const countBefore = await db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM tags`);

      // Import with abort on conflict (this should fail due to conflict on "tech")
      await expect(
        module.exec("/tags/.actions/import", {
          format: "json",
          data: JSON.stringify([
            { name: "new_tag_damage_test", color: "orange" },
            { name: "tech", color: "conflict" }, // Will conflict
          ]),
          onConflict: "abort",
        }),
      ).rejects.toThrow();

      // Count rows after - should be same
      const countAfter = await db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM tags`);
      expect(countAfter[0]?.count).toBe(countBefore[0]?.count);
    });

    test("import replace should correctly replace, not duplicate", async () => {
      const countBefore = await db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM tags`);

      const result = await module.exec("/tags/.actions/import", {
        format: "json",
        data: JSON.stringify([{ name: "tech", color: "replaced_again" }]),
        onConflict: "replace",
      });

      expect(result.success).toBe(true);

      const countAfter = await db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM tags`);
      expect(countAfter[0]?.count).toBe(countBefore[0]?.count);

      // Restore
      await db.run(sql`UPDATE tags SET color = 'blue' WHERE name = 'tech'`);
    });
  });
});

// ===== VACUUM ACTION =====

describe("vacuum action", () => {
  describe("Happy Path", () => {
    test("vacuum should return sizeBefore and sizeAfter", async () => {
      const result = await module.exec("/.actions/vacuum", {});

      expect(result.success).toBe(true);
      expect(result.data?.sizeBefore).toBeDefined();
      expect(typeof result.data?.sizeBefore).toBe("number");
      expect(result.data?.sizeAfter).toBeDefined();
      expect(typeof result.data?.sizeAfter).toBe("number");
    });

    test("vacuum on already compact database should have similar sizes", async () => {
      const result = await module.exec("/.actions/vacuum", {});

      expect(result.success).toBe(true);
      const before = result.data?.sizeBefore as number;
      const after = result.data?.sizeAfter as number;

      // After vacuum, size should be <= before (or very close)
      expect(after).toBeLessThanOrEqual(before + 4096); // Allow small overhead
    });
  });

  describe("Bad Path", () => {
    test("vacuum on readonly database should error", async () => {
      const readonlyModule = new SQLiteAFS({
        url: `file:${dbPath}`,
        name: "readonly-sqlite",
        accessMode: "readonly",
      });
      await readonlyModule.ensureInitialized();

      // exec should not be available on readonly, or should fail
      try {
        const result = await readonlyModule.exec("/.actions/vacuum", {});
        // If we get here, check that it failed
        expect(result.success).toBe(false);
      } catch (error) {
        // Expected - readonly provider should reject writes
        expect(error).toBeDefined();
      }
    });
  });

  describe("Security", () => {
    test("vacuum should not expose filesystem paths in result", async () => {
      const result = await module.exec("/.actions/vacuum", {});

      expect(result.success).toBe(true);
      const resultStr = JSON.stringify(result.data);
      expect(resultStr).not.toContain(testDir);
    });
  });

  describe("Data Damage", () => {
    test("vacuum should not corrupt database", async () => {
      // Verify data before
      const usersBefore = await db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM users`);

      await module.exec("/.actions/vacuum", {});

      // Verify data after
      const usersAfter = await db.all<{ count: number }>(sql`SELECT COUNT(*) as count FROM users`);
      expect(usersAfter[0]?.count).toBe(usersBefore[0]?.count);

      // Verify we can still read
      const result = await module.read("/users/1");
      expect(result.data).toBeDefined();
    });
  });
});

// ===== CAPABILITIES =====

describe("capabilities update", () => {
  test("capabilities should include import and vacuum actions", async () => {
    const result = await module.read("/.meta/.capabilities");
    expect(result.data).toBeDefined();

    const manifest = result.data?.content as unknown as {
      actions: Array<{
        kind: string;
        catalog: Array<{ name: string }>;
      }>;
    };

    // Collect all action names across all catalogs
    const allActionNames = manifest.actions.flatMap((a) => a.catalog.map((c) => c.name));

    expect(allActionNames).toContain("import");
    expect(allActionNames).toContain("vacuum");
  });
});
