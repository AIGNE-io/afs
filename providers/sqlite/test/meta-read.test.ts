/**
 * SQLite Meta Read Tests
 *
 * Tests that Meta paths can be read via provider.read() and return
 * schema introspection data (not user-defined metadata).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { SQLiteAFS } from "../src/sqlite-afs.js";

describe("SQLite Meta Read", () => {
  let afs: SQLiteAFS;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:", accessMode: "readwrite" });
    await afs.ensureInitialized();

    const db = await afs.getDatabase();

    // Create users table
    await db.run(
      sql.raw(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `),
    );

    // Create posts table with foreign key
    await db.run(
      sql.raw(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `),
    );

    // Create index
    await db.run(sql.raw(`CREATE INDEX idx_posts_user_id ON posts(user_id)`));

    // Insert test data
    await db.run(sql.raw(`INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')`));
    await db.run(sql.raw(`INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')`));
    await db.run(
      sql.raw(
        `INSERT INTO posts (user_id, title, content) VALUES (1, 'First Post', 'Hello World')`,
      ),
    );

    // Schema service queries on-demand, no refresh needed
  });

  describe("Root Meta (/.meta)", () => {
    test("should return database schema information", async () => {
      const result = await afs.read("/.meta");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/.meta");
      expect(result.data?.content).toBeDefined();

      const content = result.data?.content as {
        type: string;
        url: string;
        tableCount: number;
        tables: Array<{ name: string; columnCount: number; primaryKey: string[] }>;
      };

      expect(content.type).toBe("sqlite");
      expect(content.tableCount).toBe(2);
      expect(content.tables).toBeArray();
      expect(content.tables.length).toBe(2);

      // Verify table summaries
      const usersTable = content.tables.find((t) => t.name === "users");
      expect(usersTable).toBeDefined();
      expect(usersTable?.columnCount).toBe(4);
      expect(usersTable?.primaryKey).toContain("id");

      const postsTable = content.tables.find((t) => t.name === "posts");
      expect(postsTable).toBeDefined();
      expect(postsTable?.columnCount).toBe(4);
    });
  });

  describe("Table Meta (/:table/.meta)", () => {
    test("should return table schema with columns", async () => {
      const result = await afs.read("/users/.meta");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/users/.meta");
      expect(result.data?.content).toBeDefined();

      const content = result.data?.content as {
        table: string;
        columns: Array<{
          name: string;
          type: string;
          nullable: boolean;
          primaryKey: boolean;
          defaultValue: unknown;
        }>;
        primaryKey: string[];
        foreignKeys: unknown[];
        indexes: unknown[];
        rowCount: number;
      };

      expect(content.table).toBe("users");
      expect(content.columns).toBeArray();
      expect(content.columns.length).toBe(4);
      expect(content.rowCount).toBe(2);

      // Verify column details
      const idColumn = content.columns.find((c) => c.name === "id");
      expect(idColumn).toBeDefined();
      expect(idColumn?.type).toBe("INTEGER");
      expect(idColumn?.primaryKey).toBe(true);

      const nameColumn = content.columns.find((c) => c.name === "name");
      expect(nameColumn).toBeDefined();
      expect(nameColumn?.type).toBe("TEXT");
      expect(nameColumn?.nullable).toBe(false);

      const emailColumn = content.columns.find((c) => c.name === "email");
      expect(emailColumn).toBeDefined();
      expect(emailColumn?.type).toBe("TEXT");
    });

    test("should return foreign keys for posts table", async () => {
      const result = await afs.read("/posts/.meta");

      expect(result.data).toBeDefined();
      const content = result.data?.content as {
        table: string;
        foreignKeys: Array<{
          column: string;
          referencesTable: string;
          referencesColumn: string;
        }>;
        indexes: Array<{
          name: string;
          unique: boolean;
        }>;
      };

      expect(content.table).toBe("posts");

      // Verify foreign key
      expect(content.foreignKeys).toBeArray();
      expect(content.foreignKeys.length).toBeGreaterThan(0);
      const fk = content.foreignKeys.find((f) => f.column === "user_id");
      expect(fk).toBeDefined();
      expect(fk?.referencesTable).toBe("users");
      expect(fk?.referencesColumn).toBe("id");

      // Verify index
      expect(content.indexes).toBeArray();
      const idx = content.indexes.find((i) => i.name === "idx_posts_user_id");
      expect(idx).toBeDefined();
    });
  });

  describe("Row Meta (/:table/:pk/.meta)", () => {
    test("should return row-level schema information", async () => {
      const result = await afs.read("/users/1/.meta");

      expect(result.data).toBeDefined();
      expect(result.data?.path).toBe("/users/1/.meta");
      expect(result.data?.content).toBeDefined();

      const content = result.data?.content as {
        table: string;
        primaryKey: string;
        primaryKeyValue: string;
        columns: Array<{
          name: string;
          type: string;
          nullable: boolean;
          primaryKey: boolean;
        }>;
        foreignKeys: unknown[];
      };

      expect(content.table).toBe("users");
      expect(content.primaryKey).toBe("id");
      expect(content.primaryKeyValue).toBe("1");
      expect(content.columns).toBeArray();
      expect(content.columns.length).toBe(4);

      // Verify column schema is included
      const idColumn = content.columns.find((c) => c.name === "id");
      expect(idColumn).toBeDefined();
      expect(idColumn?.primaryKey).toBe(true);
    });

    test("should throw AFSNotFoundError for non-existent row", async () => {
      await expect(afs.read("/users/999/.meta")).rejects.toThrow();
    });
  });

  describe("Meta is Read-Only", () => {
    test("should not have write handler for /.meta", async () => {
      await expect(afs.write("/.meta", { meta: { test: true } })).rejects.toThrow(
        /No write handler/,
      );
    });

    test("should not allow writing metadata to table meta path", async () => {
      // Writing to /:table/.meta either throws "No write handler" or falls through
      // to row update which fails with "No valid columns" - either way, it should fail
      await expect(afs.write("/users/.meta", { meta: { test: true } })).rejects.toThrow();
    });

    test("should not allow writing metadata to row meta path", async () => {
      // Writing to /:table/:pk/.meta should fail
      await expect(afs.write("/users/1/.meta", { meta: { test: true } })).rejects.toThrow();
    });
  });
});
