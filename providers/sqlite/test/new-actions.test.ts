/**
 * Tests for new SQLite actions:
 * - DDL: drop_table, rename_table, add_column, rename_column, drop_column
 * - Index: create_index, drop_index
 * - CRUD: update (row), delete (row), query, update_where, delete_where
 * - Bulk: bulk_insert
 * - Utility: pragma
 * - Operators: parseWhereClause
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { parseWhereClause } from "../src/actions/operators.js";
import type { SqliteDatabase } from "../src/database/init.js";
import { SQLiteAFS } from "../src/sqlite-afs.js";

// Type helpers for exec result data
type QueryResultData = { rows: Record<string, unknown>[] };
type BulkInsertResultData = { insertedCount: number; insertedIds: number[] };

describe("Operator Parser", () => {
  test("parses simple equality", () => {
    const result = parseWhereClause({ status: "active" });
    expect(result).toBeDefined();
  });

  test("parses $eq operator", () => {
    const result = parseWhereClause({ status: { $eq: "active" } });
    expect(result).toBeDefined();
  });

  test("parses comparison operators", () => {
    const result = parseWhereClause({
      age: { $gte: 18, $lt: 65 },
    });
    expect(result).toBeDefined();
  });

  test("parses $in operator", () => {
    const result = parseWhereClause({
      role: { $in: ["admin", "moderator"] },
    });
    expect(result).toBeDefined();
  });

  test("parses $like operator", () => {
    const result = parseWhereClause({
      name: { $like: "%john%" },
    });
    expect(result).toBeDefined();
  });

  test("parses $isNull operator", () => {
    const result = parseWhereClause({
      deletedAt: { $isNull: true },
    });
    expect(result).toBeDefined();
  });

  test("parses $between operator", () => {
    const result = parseWhereClause({
      createdAt: { $between: ["2024-01-01", "2024-12-31"] },
    });
    expect(result).toBeDefined();
  });

  test("parses $and logical operator", () => {
    const result = parseWhereClause({
      $and: [{ status: "active" }, { verified: true }],
    });
    expect(result).toBeDefined();
  });

  test("parses $or logical operator", () => {
    const result = parseWhereClause({
      $or: [{ status: "active" }, { role: "admin" }],
    });
    expect(result).toBeDefined();
  });

  test("parses $not logical operator", () => {
    const result = parseWhereClause({
      $not: { status: "deleted" },
    });
    expect(result).toBeDefined();
  });

  test("parses complex nested conditions", () => {
    const result = parseWhereClause({
      $or: [{ status: "active" }, { $and: [{ role: "admin" }, { verified: true }] }],
    });
    expect(result).toBeDefined();
  });

  test("treats unknown $-prefixed keys as equality (not operator)", () => {
    // Unknown $-prefixed keys in a value object are treated as simple equality
    // (the object is not recognized as an operator object)
    const result = parseWhereClause({ status: { $invalid: "test" } as any });
    expect(result).toBeDefined();
  });

  test("throws on empty $in array", () => {
    expect(() => parseWhereClause({ role: { $in: [] } })).toThrow("$in requires a non-empty array");
  });
});

describe("DDL Actions", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeEach(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
    db = await afs.getDatabase();
  });

  describe("create_table (snake_case alias)", () => {
    test("creates a new table", async () => {
      const result = await afs.exec("/.actions/create_table", {
        name: "users",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "name", type: "TEXT", nullable: false },
          { name: "email", type: "TEXT", unique: true },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.data?.tableName).toBe("users");

      // Verify table was created
      const tables = await db
        .all<{ name: string }>(
          sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"),
        )
        .execute();
      expect(tables.length).toBe(1);
    });
  });

  describe("drop_table", () => {
    test("drops an existing table", async () => {
      // First create a table
      await db.run(sql.raw("CREATE TABLE temp_table (id INTEGER PRIMARY KEY)"));

      const result = await afs.exec("/.actions/drop_table", { name: "temp_table" });

      expect(result.success).toBe(true);

      // Verify table was dropped
      const tables = await db
        .all<{ name: string }>(
          sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='temp_table'"),
        )
        .execute();
      expect(tables.length).toBe(0);
    });

    test("throws error for non-existent table", async () => {
      // Root-level actions throw on failure rather than returning error result
      await expect(afs.exec("/.actions/drop_table", { name: "nonexistent" })).rejects.toThrow();
    });

    test("does not error with ifExists for non-existent table", async () => {
      const result = await afs.exec("/.actions/drop_table", {
        name: "nonexistent",
        ifExists: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("rename_table", () => {
    test("renames an existing table", async () => {
      await db.run(sql.raw("CREATE TABLE old_name (id INTEGER PRIMARY KEY)"));

      const result = await afs.exec("/.actions/rename_table", {
        oldName: "old_name",
        newName: "new_name",
      });

      expect(result.success).toBe(true);

      // Verify rename
      const oldTables = await db
        .all<{ name: string }>(
          sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='old_name'"),
        )
        .execute();
      const newTables = await db
        .all<{ name: string }>(
          sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='new_name'"),
        )
        .execute();
      expect(oldTables.length).toBe(0);
      expect(newTables.length).toBe(1);
    });

    test("throws error for non-existent source table", async () => {
      await expect(
        afs.exec("/.actions/rename_table", {
          oldName: "nonexistent",
          newName: "new_name",
        }),
      ).rejects.toThrow();
    });
  });

  describe("add_column", () => {
    beforeEach(async () => {
      await db.run(sql.raw("CREATE TABLE test_table (id INTEGER PRIMARY KEY)"));
    });

    test("adds a new column", async () => {
      const result = await afs.exec("/test_table/.actions/add_column", {
        name: "email",
        type: "TEXT",
        nullable: true,
      });

      expect(result.success).toBe(true);

      // Verify column was added
      const info = await db
        .all<{ name: string }>(sql.raw("PRAGMA table_info(test_table)"))
        .execute();
      const emailCol = info.find((c) => c.name === "email");
      expect(emailCol).toBeDefined();
    });

    test("adds column with default value", async () => {
      const result = await afs.exec("/test_table/.actions/add_column", {
        name: "status",
        type: "TEXT",
        defaultValue: "active",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("rename_column", () => {
    beforeEach(async () => {
      await db.run(sql.raw("CREATE TABLE test_table (id INTEGER PRIMARY KEY, old_col TEXT)"));
    });

    test("renames a column", async () => {
      const result = await afs.exec("/test_table/.actions/rename_column", {
        oldName: "old_col",
        newName: "new_col",
      });

      expect(result.success).toBe(true);

      // Verify rename
      const info = await db
        .all<{ name: string }>(sql.raw("PRAGMA table_info(test_table)"))
        .execute();
      expect(info.find((c) => c.name === "old_col")).toBeUndefined();
      expect(info.find((c) => c.name === "new_col")).toBeDefined();
    });

    test("throws error for non-existent column", async () => {
      await expect(
        afs.exec("/test_table/.actions/rename_column", {
          oldName: "nonexistent",
          newName: "new_col",
        }),
      ).rejects.toThrow();
    });
  });

  describe("drop_column", () => {
    beforeEach(async () => {
      await db.run(
        sql.raw("CREATE TABLE test_table (id INTEGER PRIMARY KEY, to_drop TEXT, keep_col TEXT)"),
      );
    });

    test("drops a column", async () => {
      const result = await afs.exec("/test_table/.actions/drop_column", {
        name: "to_drop",
      });

      expect(result.success).toBe(true);

      // Verify drop
      const info = await db
        .all<{ name: string }>(sql.raw("PRAGMA table_info(test_table)"))
        .execute();
      expect(info.find((c) => c.name === "to_drop")).toBeUndefined();
      expect(info.find((c) => c.name === "keep_col")).toBeDefined();
    });
  });
});

describe("Index Actions", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeEach(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
    db = await afs.getDatabase();
    await db.run(
      sql.raw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, age INTEGER)"),
    );
  });

  describe("create_index", () => {
    test("creates a simple index", async () => {
      const result = await afs.exec("/users/.actions/create_index", {
        name: "idx_name",
        columns: ["name"],
      });

      expect(result.success).toBe(true);

      // Verify index was created
      const indexes = await db.all<{ name: string }>(sql.raw("PRAGMA index_list(users)")).execute();
      expect(indexes.find((i) => i.name === "idx_name")).toBeDefined();
    });

    test("creates a unique index", async () => {
      const result = await afs.exec("/users/.actions/create_index", {
        name: "idx_email_unique",
        columns: ["email"],
        unique: true,
      });

      expect(result.success).toBe(true);
      expect(result.data?.unique).toBe(true);
    });

    test("creates a compound index", async () => {
      const result = await afs.exec("/users/.actions/create_index", {
        name: "idx_name_age",
        columns: ["name", "age"],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("drop_index", () => {
    beforeEach(async () => {
      await db.run(sql.raw("CREATE INDEX idx_name ON users(name)"));
    });

    test("drops an existing index", async () => {
      const result = await afs.exec("/users/.actions/drop_index", { name: "idx_name" });

      expect(result.success).toBe(true);

      // Verify index was dropped
      const indexes = await db.all<{ name: string }>(sql.raw("PRAGMA index_list(users)")).execute();
      expect(indexes.find((i) => i.name === "idx_name")).toBeUndefined();
    });

    test("does not error with ifExists for non-existent index", async () => {
      const result = await afs.exec("/users/.actions/drop_index", {
        name: "nonexistent",
        ifExists: true,
      });

      expect(result.success).toBe(true);
    });
  });
});

describe("Row-level CRUD Actions", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeEach(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
    db = await afs.getDatabase();
    await db.run(
      sql.raw("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT)"),
    );
    await db.run(sql.raw("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')"));
    await db.run(sql.raw("INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com')"));
  });

  describe("update (row level)", () => {
    test("updates a row by PK", async () => {
      const result = await afs.exec("/users/1/.actions/update", {
        data: { name: "Alice Updated" },
      });

      expect(result.success).toBe(true);

      // Verify update
      const rows = await db
        .all<{ name: string }>(sql.raw("SELECT name FROM users WHERE id = 1"))
        .execute();
      expect(rows[0]?.name).toBe("Alice Updated");
    });

    test("returns updated row data", async () => {
      const result = await afs.exec("/users/1/.actions/update", {
        data: { name: "Alice New" },
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe("Alice New");
    });
  });

  describe("delete (row level)", () => {
    test("deletes a row by PK", async () => {
      const result = await afs.exec("/users/1/.actions/delete", {});

      expect(result.success).toBe(true);

      // Verify delete
      const rows = await db
        .all<{ id: number }>(sql.raw("SELECT id FROM users WHERE id = 1"))
        .execute();
      expect(rows.length).toBe(0);
    });
  });
});

describe("Table-level Query Actions", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeEach(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
    db = await afs.getDatabase();
    await db.run(
      sql.raw(
        "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL, category TEXT)",
      ),
    );
    await db.run(
      sql.raw("INSERT INTO products (name, price, category) VALUES ('Widget', 10.00, 'A')"),
    );
    await db.run(
      sql.raw("INSERT INTO products (name, price, category) VALUES ('Gadget', 20.00, 'B')"),
    );
    await db.run(
      sql.raw("INSERT INTO products (name, price, category) VALUES ('Tool', 15.00, 'A')"),
    );
    await db.run(
      sql.raw("INSERT INTO products (name, price, category) VALUES ('Device', 25.00, 'B')"),
    );
  });

  describe("query", () => {
    test("queries all rows without conditions", async () => {
      const result = await afs.exec("/products/.actions/query", {});

      expect(result.success).toBe(true);
      expect((result.data as QueryResultData)?.rows?.length).toBe(4);
    });

    test("queries with simple where condition", async () => {
      const result = await afs.exec("/products/.actions/query", {
        where: { category: "A" },
      });

      expect(result.success).toBe(true);
      expect((result.data as QueryResultData)?.rows?.length).toBe(2);
    });

    test("queries with operator conditions", async () => {
      const result = await afs.exec("/products/.actions/query", {
        where: { price: { $gte: 15 } },
      });

      expect(result.success).toBe(true);
      expect((result.data as QueryResultData)?.rows?.length).toBe(3);
    });

    test("queries with ordering", async () => {
      const result = await afs.exec("/products/.actions/query", {
        orderBy: [{ column: "price", direction: "desc" }],
      });

      expect(result.success).toBe(true);
      expect((result.data as QueryResultData)?.rows?.[0]?.price).toBe(25.0);
    });

    test("queries with limit and offset", async () => {
      const result = await afs.exec("/products/.actions/query", {
        orderBy: [{ column: "id" }],
        limit: 2,
        offset: 1,
      });

      expect(result.success).toBe(true);
      const data = result.data as QueryResultData;
      expect(data?.rows?.length).toBe(2);
      expect(data?.rows?.[0]?.name).toBe("Gadget");
    });
  });

  describe("update_where", () => {
    test("updates matching rows", async () => {
      const result = await afs.exec("/products/.actions/update_where", {
        where: { category: "A" },
        data: { price: 12.0 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.affectedRows).toBe(2);

      // Verify updates
      const rows = await db
        .all<{ price: number }>(sql.raw("SELECT price FROM products WHERE category = 'A'"))
        .execute();
      expect(rows.every((r) => r.price === 12.0)).toBe(true);
    });

    test("returns 0 affected rows when no match", async () => {
      const result = await afs.exec("/products/.actions/update_where", {
        where: { category: "X" },
        data: { price: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.data?.affectedRows).toBe(0);
    });
  });

  describe("delete_where", () => {
    test("deletes matching rows", async () => {
      const result = await afs.exec("/products/.actions/delete_where", {
        where: { category: "B" },
      });

      expect(result.success).toBe(true);
      expect(result.data?.affectedRows).toBe(2);

      // Verify deletes
      const rows = await db
        .all<{ id: number }>(sql.raw("SELECT id FROM products WHERE category = 'B'"))
        .execute();
      expect(rows.length).toBe(0);
    });
  });
});

describe("Bulk Operations", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeEach(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
    db = await afs.getDatabase();
    await db.run(
      sql.raw(
        "CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, value INTEGER)",
      ),
    );
  });

  describe("bulk_insert", () => {
    test("inserts multiple rows", async () => {
      const result = await afs.exec("/items/.actions/bulk_insert", {
        rows: [
          { name: "Item 1", value: 10 },
          { name: "Item 2", value: 20 },
          { name: "Item 3", value: 30 },
        ],
      });

      expect(result.success).toBe(true);
      const data = result.data as BulkInsertResultData;
      expect(data?.insertedCount).toBe(3);
      expect(data?.insertedIds?.length).toBe(3);

      // Verify inserts
      const rows = await db.all<{ id: number }>(sql.raw("SELECT id FROM items")).execute();
      expect(rows.length).toBe(3);
    });

    test("throws error for empty array", async () => {
      // Actions throw on failure
      await expect(afs.exec("/items/.actions/bulk_insert", { rows: [] })).rejects.toThrow();
    });
  });
});

describe("PRAGMA Action", () => {
  let afs: SQLiteAFS;

  beforeEach(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
    const db = await afs.getDatabase();
    await db.run(sql.raw("CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)"));
    await db.run(sql.raw("CREATE INDEX idx_name ON test_table(name)"));
  });

  test("executes table_info PRAGMA", async () => {
    const result = await afs.exec("/.actions/pragma", {
      command: "table_info",
      argument: "test_table",
    });

    expect(result.success).toBe(true);
    // table_info returns array of column info, may be wrapped in data property
    expect(result.data).toBeDefined();
  });

  test("executes index_list PRAGMA", async () => {
    const result = await afs.exec("/.actions/pragma", {
      command: "index_list",
      argument: "test_table",
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("executes journal_mode PRAGMA", async () => {
    const result = await afs.exec("/.actions/pragma", {
      command: "journal_mode",
    });

    expect(result.success).toBe(true);
  });

  test("rejects non-whitelisted PRAGMA command", async () => {
    // Root-level actions throw on failure
    await expect(
      afs.exec("/.actions/pragma", {
        command: "compile_options" as any,
      }),
    ).rejects.toThrow();
  });
});
