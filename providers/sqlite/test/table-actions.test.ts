import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { SqliteDatabase } from "../src/database/init.js";
import { SQLiteAFS } from "../src/sqlite-afs.js";

describe("Table-level Action Discovery", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();

    db = await afs.getDatabase();
    await db.run(
      sql.raw(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL
      )
    `),
    );
    await db.run(sql.raw(`INSERT INTO products (name, price) VALUES ('Widget', 9.99)`));
    // No need for refreshSchema - schema service queries on-demand
  });

  describe("List table-level actions", () => {
    test("should list available table-level actions at /:table/.actions", async () => {
      const result = await afs.list("/products/.actions");

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      // Check that table-level actions are included
      const actionNames = result.data.map((e) => e.summary ?? e.id);
      expect(actionNames).toContain("export");
      expect(actionNames).toContain("count");
      expect(actionNames).toContain("insert");
    });

    test("should NOT include row-level-only actions in table-level list", async () => {
      const result = await afs.list("/products/.actions");

      const actionNames = result.data.map((e) => e.summary ?? e.id);
      // validate and duplicate are row-level only
      expect(actionNames).not.toContain("validate");
      expect(actionNames).not.toContain("duplicate");
    });

    test("action entries should have afs:executable kind", async () => {
      const result = await afs.list("/products/.actions");

      for (const entry of result.data) {
        expect(entry.meta?.kind).toBe("afs:executable");
        expect(entry.meta?.kinds).toContain("afs:executable");
      }
    });

    test("action entries should have path in correct format", async () => {
      const result = await afs.list("/products/.actions");

      for (const entry of result.data) {
        expect(entry.path).toMatch(/^\/products\/.actions\/\w+$/);
      }
    });
  });

  describe("Row-level actions remain working", () => {
    test("should still list row-level actions at /:table/:pk/.actions", async () => {
      const result = await afs.list("/products/1/.actions");

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      const actionNames = result.data.map((e) => e.summary ?? e.id);
      expect(actionNames).toContain("validate");
      expect(actionNames).toContain("duplicate");
    });
  });
});

describe("Root-level Action Discovery", () => {
  let afs: SQLiteAFS;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
  });

  test("should list available root-level actions at /.actions", async () => {
    const result = await afs.list("/.actions");

    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);

    const actionNames = result.data.map((e) => e.summary ?? e.id);
    expect(actionNames).toContain("create_table");
  });

  test("create_table action entry should have inputSchema in metadata", async () => {
    const result = await afs.list("/.actions");

    const createTableAction = result.data.find(
      (e) => e.summary === "create_table" || e.id.includes("create_table"),
    );
    expect(createTableAction).toBeDefined();
    expect(createTableAction?.meta?.inputSchema).toBeDefined();
  });
});

describe("Create Table Action", () => {
  let afs: SQLiteAFS;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
  });

  test("should create a new table via action", async () => {
    const result = await afs.exec(
      "/.actions/create_table",
      {
        name: "customers",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "name", type: "TEXT", nullable: false },
          { name: "email", type: "TEXT" },
          { name: "created_at", type: "DATETIME" },
        ],
      },
      {},
    );

    expect(result.data).toBeDefined();
    expect(result.success).toBe(true);

    // Verify table was created (getSchemas is now async)
    const schemas = await afs.getSchemas();
    expect(schemas.has("customers")).toBe(true);
  });

  test("should fail gracefully when table already exists", async () => {
    // Try to create the same table again
    await expect(
      afs.exec(
        "/.actions/create_table",
        {
          name: "customers",
          columns: [{ name: "id", type: "INTEGER", primaryKey: true }],
        },
        {},
      ),
    ).rejects.toThrow(/already exists/i);
  });

  test("should fail with invalid column type", async () => {
    await expect(
      afs.exec(
        "/.actions/create_table",
        {
          name: "invalid_table",
          columns: [{ name: "id", type: "INVALID_TYPE" }],
        },
        {},
      ),
    ).rejects.toThrow(/invalid.*type/i);
  });

  test("should fail without table name", async () => {
    await expect(
      afs.exec(
        "/.actions/create_table",
        {
          columns: [{ name: "id", type: "INTEGER" }],
        },
        {},
      ),
    ).rejects.toThrow(/name.*required/i);
  });

  test("should fail without columns", async () => {
    await expect(
      afs.exec(
        "/.actions/create_table",
        {
          name: "empty_table",
          columns: [],
        },
        {},
      ),
    ).rejects.toThrow(/column.*required|at least one column/i);
  });

  test("should fail with invalid table name", async () => {
    await expect(
      afs.exec(
        "/.actions/create_table",
        {
          name: "123invalid",
          columns: [{ name: "id", type: "INTEGER" }],
        },
        {},
      ),
    ).rejects.toThrow(/must start with a letter/i);
  });

  test("should fail with invalid column name", async () => {
    await expect(
      afs.exec(
        "/.actions/create_table",
        {
          name: "test_table",
          columns: [{ name: "123col", type: "INTEGER" }],
        },
        {},
      ),
    ).rejects.toThrow(/invalid column name/i);
  });

  test("should create table with unique constraint", async () => {
    const result = await afs.exec(
      "/.actions/create_table",
      {
        name: "users_unique",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "email", type: "TEXT", unique: true, nullable: false },
        ],
      },
      {},
    );

    expect(result.success).toBe(true);

    // Verify by checking schema (getSchemas is now async)
    const schemas = await afs.getSchemas();
    expect(schemas.has("users_unique")).toBe(true);
  });

  test("should create table with foreign key", async () => {
    // First create the referenced table
    await afs.exec(
      "/.actions/create_table",
      {
        name: "categories",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "name", type: "TEXT", nullable: false },
        ],
      },
      {},
    );

    // Then create table with foreign key
    const result = await afs.exec(
      "/.actions/create_table",
      {
        name: "products_with_fk",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "name", type: "TEXT", nullable: false },
          {
            name: "category_id",
            type: "INTEGER",
            references: {
              table: "categories",
              column: "id",
              onDelete: "CASCADE",
            },
          },
        ],
      },
      {},
    );

    expect(result.success).toBe(true);

    // Verify foreign key was created (getSchemas is now async)
    const schemas = await afs.getSchemas();
    const schema = schemas.get("products_with_fk");
    expect(schema?.foreignKeys.length).toBe(1);
    expect(schema?.foreignKeys[0]?.from).toBe("category_id");
    expect(schema?.foreignKeys[0]?.table).toBe("categories");
  });

  test("should create table with ifNotExists", async () => {
    // Create table first
    await afs.exec(
      "/.actions/create_table",
      {
        name: "existing_table",
        columns: [{ name: "id", type: "INTEGER", primaryKey: true }],
      },
      {},
    );

    // Try to create again with ifNotExists - should not throw
    const result = await afs.exec(
      "/.actions/create_table",
      {
        name: "existing_table",
        columns: [{ name: "id", type: "INTEGER", primaryKey: true }],
        ifNotExists: true,
      },
      {},
    );

    expect(result.success).toBe(true);
  });

  test("should support various SQL types", async () => {
    const result = await afs.exec(
      "/.actions/create_table",
      {
        name: "various_types",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "small_num", type: "SMALLINT" },
          { name: "big_num", type: "BIGINT" },
          { name: "price", type: "DECIMAL" },
          { name: "rate", type: "FLOAT" },
          { name: "name", type: "VARCHAR" },
          { name: "is_active", type: "BOOLEAN" },
          { name: "created", type: "TIMESTAMP" },
        ],
      },
      {},
    );

    expect(result.success).toBe(true);
    expect(result.data?.columnCount).toBe(8);
  });

  test("should return generated SQL in response", async () => {
    const result = await afs.exec(
      "/.actions/create_table",
      {
        name: "sql_test",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "name", type: "TEXT", nullable: false },
        ],
      },
      {},
    );

    expect(result.data?.sql).toBeDefined();
    expect(result.data?.sql).toContain("CREATE TABLE");
    expect(result.data?.sql).toContain("sql_test");
  });
});

describe("Insert Action", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();

    db = await afs.getDatabase();
    await db.run(
      sql.raw(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer TEXT NOT NULL,
        total REAL,
        status TEXT DEFAULT 'pending'
      )
    `),
    );
    // No need for refreshSchema - schema service queries on-demand
  });

  test("should insert a new row via action", async () => {
    const result = await afs.exec(
      "/orders/.actions/insert",
      {
        data: {
          customer: "Alice",
          total: 99.99,
          status: "confirmed",
        },
      },
      {},
    );

    expect(result.data).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data?.id).toBeDefined();

    // Verify row was inserted
    const listResult = await afs.list("/orders");
    const insertedRow = listResult.data.find(
      (e) => e.content && (e.content as any).customer === "Alice",
    );
    expect(insertedRow).toBeDefined();
  });

  test("should insert row with only required fields", async () => {
    const result = await afs.exec(
      "/orders/.actions/insert",
      {
        data: {
          customer: "Bob",
        },
      },
      {},
    );

    expect(result.success).toBe(true);

    // Verify default status was applied
    const readResult = await afs.read(`/orders/${result.data?.id}`);
    expect(readResult.data?.content).toHaveProperty("status", "pending");
  });

  test("should fail when required field is missing", async () => {
    await expect(
      afs.exec(
        "/orders/.actions/insert",
        {
          data: {
            total: 50.0,
            // customer is required but missing
          },
        },
        {},
      ),
    ).rejects.toThrow(/customer|required|NOT NULL|Insert failed/i);
  });

  test("should fail for non-existent table", async () => {
    await expect(
      afs.exec(
        "/nonexistent/.actions/insert",
        {
          data: { field: "value" },
        },
        {},
      ),
    ).rejects.toThrow(/not found|nonexistent/i);
  });

  test("should handle multiple inserts", async () => {
    const customers = ["Charlie", "Diana", "Eve"];

    for (const customer of customers) {
      const result = await afs.exec(
        "/orders/.actions/insert",
        {
          data: { customer, total: Math.random() * 100 },
        },
        {},
      );
      expect(result.success).toBe(true);
    }

    // Verify all rows exist
    const listResult = await afs.list("/orders");
    const allCustomers = listResult.data
      .filter((e) => e.content)
      .map((e) => (e.content as any).customer);

    for (const customer of customers) {
      expect(allCustomers).toContain(customer);
    }
  });
});

describe("Insert Action via Write", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();

    db = await afs.getDatabase();
    await db.run(
      sql.raw(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        quantity INTEGER DEFAULT 0
      )
    `),
    );
    // No need for refreshSchema - schema service queries on-demand
  });

  test("should insert via write to /:table/.actions/insert", async () => {
    const result = await afs.write("/items/.actions/insert", {
      content: {
        data: {
          name: "Test Item",
          quantity: 10,
        },
      },
    });

    expect(result.data).toBeDefined();
    expect(result.data.content).toHaveProperty("success", true);
  });
});

describe("Action System Integration", () => {
  let afs: SQLiteAFS;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
  });

  test("complete workflow: create table, insert rows, verify data", async () => {
    // Step 1: Create a new table
    await afs.exec(
      "/.actions/create_table",
      {
        name: "workflow_test",
        columns: [
          { name: "id", type: "INTEGER", primaryKey: true },
          { name: "title", type: "TEXT", nullable: false },
          { name: "completed", type: "INTEGER" },
        ],
      },
      {},
    );

    // Step 2: Insert rows
    await afs.exec(
      "/workflow_test/.actions/insert",
      {
        data: { title: "Task 1", completed: 0 },
      },
      {},
    );

    await afs.exec(
      "/workflow_test/.actions/insert",
      {
        data: { title: "Task 2", completed: 1 },
      },
      {},
    );

    // Step 3: Verify data
    const listResult = await afs.list("/workflow_test");
    // First entry is the table itself, rest are rows
    const rows = listResult.data.filter((e) => e.content !== undefined);
    expect(rows.length).toBe(2);

    // Step 4: Get count via action
    const countResult = await afs.exec("/workflow_test/.actions/count", {}, {});
    expect(countResult.data?.count).toBe(2);

    // Step 5: Verify we can read individual rows
    const row1 = await afs.read("/workflow_test/1");
    expect(row1.data?.content).toHaveProperty("title", "Task 1");
  });
});
