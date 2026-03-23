/**
 * SQLiteAFS Provider Conformance Tests
 *
 * This file uses the unified provider testing framework to verify
 * that SQLiteAFS conforms to the AFS provider interface contract.
 *
 * SQLiteAFS exposes SQLite databases as virtual filesystems:
 * - `/` - root (lists tables)
 * - `/:table` - table directory (lists rows)
 * - `/:table/:pk` - row file (content is row data)
 * - `/:table/:pk/.meta` - row metadata
 * - `/:table/:pk/.actions` - available actions
 * - `/:table/new` - create new row (write-only)
 */
import { describe } from "bun:test";
import { runProviderTests } from "@aigne/afs-testing";
import { sql } from "drizzle-orm";
import type { SqliteDatabase } from "../src/database/init.js";
import { SQLiteAFS } from "../src/sqlite-afs.js";
import { setupPlayground } from "./playground.js";

describe("SQLiteAFS Conformance", () => {
  let afs: SQLiteAFS;
  let db: SqliteDatabase;

  runProviderTests({
    name: "SQLiteAFS",
    providerClass: SQLiteAFS,
    playground: setupPlayground,

    async beforeAll() {
      // Create SQLiteAFS with in-memory database
      afs = new SQLiteAFS({ url: ":memory:", accessMode: "readwrite" });
      await afs.ensureInitialized();

      db = await afs.getDatabase();

      // Create test tables matching our declared structure
      await db.run(
        sql.raw(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `),
      );

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

      await db.run(
        sql.raw(`
        CREATE TABLE scratch (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value TEXT
        )
      `),
      );

      // Insert test data
      await db.run(sql.raw(`INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')`));
      await db.run(sql.raw(`INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')`));
      await db.run(
        sql.raw(
          `INSERT INTO posts (user_id, title, content) VALUES (1, 'First Post', 'Hello World')`,
        ),
      );
      await db.run(
        sql.raw(
          `INSERT INTO posts (user_id, title, content) VALUES (1, 'Second Post', 'More content')`,
        ),
      );
      await db.run(
        sql.raw(`INSERT INTO scratch (name, value) VALUES ('existing', 'existing content')`),
      );
      await db.run(sql.raw(`INSERT INTO scratch (name, value) VALUES ('toDelete', 'delete me')`));

      // Refresh schema to pick up new tables
      // Schema service queries on-demand, no refresh needed
    },

    createProvider() {
      return afs;
    },

    // Tree-based structure declaration
    // SQLite structure: tables as directories, rows as files
    // metadata declarations are verified by reading /.meta paths
    // SQLite Meta returns schema introspection data
    // actions declarations are verified by listing /.actions paths
    structure: {
      root: {
        name: "",
        // Root meta: list of tables (sorted alphabetically)
        meta: {
          childrenCount: 3,
          tables: ["posts", "scratch", "users"],
        },
        // Root-level actions (database-level)
        actions: [
          { name: "create_table" },
          { name: "drop_table" },
          { name: "rename_table" },
          { name: "pragma" },
        ],
        children: [
          {
            name: "users",
            // Table meta: table info with columns
            meta: {
              table: "users",
              description: 'Table "users" with 3 columns',
              childrenCount: 2,
              columnCount: 3,
              columns: ["id", "name", "email"],
              primaryKey: ["id"],
            },
            // Table-level actions (all snake_case)
            actions: [
              { name: "export" },
              { name: "count" },
              { name: "insert" },
              { name: "query" },
              { name: "update_where" },
              { name: "delete_where" },
              { name: "bulk_insert" },
              { name: "add_column" },
              { name: "rename_column" },
              { name: "drop_column" },
              { name: "create_index" },
              { name: "drop_index" },
            ],
            children: [
              {
                name: "1",
                // Row meta: table, pk, and columns
                meta: {
                  table: "users",
                  primaryKeyValue: "1",
                  columns: ["id", "name", "email"],
                },
                // Row-level actions
                actions: [
                  { name: "update" },
                  { name: "delete" },
                  { name: "duplicate" },
                  { name: "validate" },
                ],
              },
              {
                name: "2",
                meta: {
                  table: "users",
                  primaryKeyValue: "2",
                  columns: ["id", "name", "email"],
                },
                // Row-level actions
                actions: [
                  { name: "update" },
                  { name: "delete" },
                  { name: "duplicate" },
                  { name: "validate" },
                ],
              },
            ],
          },
          {
            name: "posts",
            meta: {
              table: "posts",
              description: 'Table "posts" with 4 columns',
              childrenCount: 2,
              columnCount: 4,
              columns: ["id", "user_id", "title", "content"],
              primaryKey: ["id"],
            },
            // Table-level actions
            actions: [
              { name: "export" },
              { name: "count" },
              { name: "insert" },
              { name: "query" },
              { name: "update_where" },
              { name: "delete_where" },
              { name: "bulk_insert" },
              { name: "add_column" },
              { name: "rename_column" },
              { name: "drop_column" },
              { name: "create_index" },
              { name: "drop_index" },
            ],
            children: [
              {
                name: "1",
                meta: {
                  table: "posts",
                  primaryKeyValue: "1",
                  columns: ["id", "user_id", "title", "content"],
                },
                actions: [
                  { name: "update" },
                  { name: "delete" },
                  { name: "duplicate" },
                  { name: "validate" },
                ],
              },
              {
                name: "2",
                meta: {
                  table: "posts",
                  primaryKeyValue: "2",
                  columns: ["id", "user_id", "title", "content"],
                },
                actions: [
                  { name: "update" },
                  { name: "delete" },
                  { name: "duplicate" },
                  { name: "validate" },
                ],
              },
            ],
          },
          {
            name: "scratch",
            meta: {
              table: "scratch",
              description: 'Table "scratch" with 3 columns',
              childrenCount: 2,
              columnCount: 3,
              columns: ["id", "name", "value"],
              primaryKey: ["id"],
            },
            // Table-level actions
            actions: [
              { name: "export" },
              { name: "count" },
              { name: "insert" },
              { name: "query" },
              { name: "update_where" },
              { name: "delete_where" },
              { name: "bulk_insert" },
              { name: "add_column" },
              { name: "rename_column" },
              { name: "drop_column" },
              { name: "create_index" },
              { name: "drop_index" },
            ],
            children: [
              {
                name: "1",
                meta: {
                  table: "scratch",
                  primaryKeyValue: "1",
                  columns: ["id", "name", "value"],
                },
                actions: [
                  { name: "update" },
                  { name: "delete" },
                  { name: "duplicate" },
                  { name: "validate" },
                ],
              },
              {
                name: "2",
                meta: {
                  table: "scratch",
                  primaryKeyValue: "2",
                  columns: ["id", "name", "value"],
                },
                actions: [
                  { name: "update" },
                  { name: "delete" },
                  { name: "duplicate" },
                  { name: "validate" },
                ],
              },
            ],
          },
        ],
      },
    },

    // Action test cases - test action execution
    // Note: SQLite provider spreads action result data at top level (not nested under data)
    actionCases: [
      // ===== ROOT-LEVEL ACTIONS =====

      // create_table - creates a new table
      {
        name: "should create a new table via create_table action",
        path: "/.actions/create_table",
        args: {
          name: "action_test_table",
          columns: [
            { name: "id", type: "INTEGER", primaryKey: true },
            { name: "name", type: "TEXT", nullable: false },
            { name: "value", type: "TEXT" },
          ],
        },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.tableName).toBe("action_test_table");
          expect(result.data?.columnCount).toBe(3);
        },
      },

      // pragma - executes PRAGMA commands
      {
        name: "should get table_info via pragma action",
        path: "/.actions/pragma",
        args: { command: "table_info", argument: "users" },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          // table_info returns an array of column info (wrapped in data.data)
          expect(Array.isArray(result.data?.data)).toBe(true);
        },
      },

      // ===== TABLE-LEVEL ACTIONS =====

      // insert - inserts a new row
      {
        name: "should insert a new row via insert action",
        path: "/users/.actions/insert",
        args: {
          data: { name: "Charlie", email: "charlie@test.com" },
        },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.name).toBe("Charlie");
          expect(result.data?.email).toBe("charlie@test.com");
          expect(result.data?.id).toBeDefined();
        },
      },

      // count - counts rows in a table
      {
        name: "should count rows via count action",
        path: "/users/.actions/count",
        args: {},
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          // Count should be at least 2 (Alice and Bob from setup)
          expect((result.data?.count as number) >= 2).toBe(true);
        },
      },

      // export - exports table data in specified format
      {
        name: "should export table data via export action (json)",
        path: "/posts/.actions/export",
        args: { format: "json" },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(Array.isArray(result.data?.data)).toBe(true);
        },
      },

      // query - queries rows with conditions
      {
        name: "should query rows via query action",
        path: "/users/.actions/query",
        args: { where: { name: "Alice" } },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.rows).toBeDefined();
          expect(result.data?.count).toBeGreaterThanOrEqual(1);
        },
      },

      // query with $eq operator
      {
        name: "should query with $eq operator",
        path: "/users/.actions/query",
        args: { where: { name: { $eq: "Bob" } } },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.count).toBeGreaterThanOrEqual(1);
        },
      },

      // query with orderBy and limit
      {
        name: "should query with orderBy and limit",
        path: "/users/.actions/query",
        args: { orderBy: [{ column: "id", direction: "desc" }], limit: 1 },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.count).toBe(1);
        },
      },

      // bulk_insert - inserts multiple rows
      {
        name: "should bulk insert rows via bulk_insert action",
        path: "/posts/.actions/bulk_insert",
        args: {
          rows: [
            { user_id: 1, title: "Bulk Post 1", content: "Content 1" },
            { user_id: 2, title: "Bulk Post 2", content: "Content 2" },
          ],
        },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.insertedCount).toBe(2);
          expect(result.data?.insertedIds).toHaveLength(2);
        },
      },

      // add_column - adds a new column to a table
      {
        name: "should add column via add_column action",
        path: "/users/.actions/add_column",
        args: { name: "age", type: "INTEGER", nullable: true },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.column).toBe("age");
        },
      },

      // create_index - creates an index on a table
      {
        name: "should create index via create_index action",
        path: "/users/.actions/create_index",
        args: { name: "idx_users_email", columns: ["email"], unique: true },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.indexName).toBe("idx_users_email");
        },
      },

      // update_where - updates rows matching conditions
      {
        name: "should update rows via update_where action",
        path: "/users/.actions/update_where",
        args: {
          where: { name: "Alice" },
          data: { email: "alice-updated@test.com" },
        },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.affectedRows).toBeGreaterThanOrEqual(1);
        },
      },

      // ===== ROW-LEVEL ACTIONS =====

      // duplicate - duplicates a row (creates a copy)
      {
        name: "should duplicate a row via duplicate action",
        path: "/posts/1/.actions/duplicate",
        args: {},
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.newId).toBeDefined();
        },
      },

      // validate - validates row against schema
      {
        name: "should validate row via validate action",
        path: "/users/1/.actions/validate",
        args: {},
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.valid).toBe(true);
        },
      },

      // update (row level) - updates a single row by PK
      {
        name: "should update a row via row-level update action",
        path: "/users/2/.actions/update",
        args: { data: { name: "Bob Updated" } },
        expected: (result, expect) => {
          expect(result.success).toBe(true);
          expect(result.data?.name).toBe("Bob Updated");
        },
      },

      // delete (row level) - deletes a single row by PK
      {
        name: "should delete a row via row-level delete action",
        path: "/posts/2/.actions/delete",
        args: {},
        expected: (result, expect) => {
          expect(result.success).toBe(true);
        },
      },
    ],

    // Write test cases - only update existing rows (not /new which is write-only)
    writeCases: [
      {
        name: "should update existing row",
        path: "/scratch/1",
        payload: {
          content: { name: "existing", value: "updated content" },
        },
        expected: (result, expect) => {
          expect(result.data?.content).toMatchObject({
            name: "existing",
            value: "updated content",
          });
        },
      },
    ],

    // Delete test cases
    deleteCases: [
      {
        name: "should delete a row",
        path: "/scratch/2",
        verifyDeleted: true,
      },
    ],
  });
});
