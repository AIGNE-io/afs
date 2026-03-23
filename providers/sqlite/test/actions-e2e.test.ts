import { beforeAll, describe, expect, test } from "bun:test";
import { SQLiteAFS } from "../src/sqlite-afs.js";

/**
 * End-to-end tests for AFS Action System with SQLite Provider
 *
 * This test suite validates the complete Action System workflow:
 * 1. Create tables via actions
 * 2. Insert rows via actions
 * 3. Update/delete rows via existing CRUD
 * 4. List and discover actions at all levels
 * 5. Verify action metadata and kinds
 */
describe("Action System E2E Tests", () => {
  let afs: SQLiteAFS;

  beforeAll(async () => {
    afs = new SQLiteAFS({ url: ":memory:" });
    await afs.ensureInitialized();
  });

  describe("Complete CRUD Workflow via Actions", () => {
    test("Step 1: Create a new table via /.actions/create_table", async () => {
      const result = await afs.exec(
        "/.actions/create_table",
        {
          name: "tasks",
          columns: [
            { name: "id", type: "INTEGER", primaryKey: true },
            { name: "title", type: "TEXT", nullable: false },
            { name: "description", type: "TEXT" },
            { name: "priority", type: "INTEGER" },
            { name: "completed", type: "INTEGER" },
            { name: "created_at", type: "DATETIME" },
          ],
        },
        {},
      );

      expect(result.success).toBe(true);
      expect(result.data?.tableName).toBe("tasks");
      expect(result.data?.columnCount).toBe(6);

      // Verify table appears in schema (getSchemas is now async)
      const schemas = await afs.getSchemas();
      expect(schemas.has("tasks")).toBe(true);
    });

    test("Step 2: Insert rows via /tasks/.actions/insert", async () => {
      // Insert first task
      const result1 = await afs.exec(
        "/tasks/.actions/insert",
        {
          data: {
            title: "Implement Action System",
            description: "Add create_table and insert actions",
            priority: 1,
            completed: 0,
          },
        },
        {},
      );

      expect(result1.success).toBe(true);
      expect(result1.data?.id).toBeDefined();

      // Insert second task
      const result2 = await afs.exec(
        "/tasks/.actions/insert",
        {
          data: {
            title: "Write E2E Tests",
            description: "Verify the complete workflow",
            priority: 2,
            completed: 0,
          },
        },
        {},
      );

      expect(result2.success).toBe(true);
      expect(result2.data?.id).toBeDefined();

      // Insert third task
      const result3 = await afs.exec(
        "/tasks/.actions/insert",
        {
          data: {
            title: "Documentation",
            priority: 3,
            completed: 1,
          },
        },
        {},
      );

      expect(result3.success).toBe(true);
    });

    test("Step 3: List rows to verify inserts", async () => {
      const listResult = await afs.list("/tasks");

      // Should have 3 rows (plus potentially the table entry itself)
      const rows = listResult.data.filter((e) => e.content !== undefined);
      expect(rows.length).toBe(3);

      // Verify first task
      const task1 = rows.find((r) => (r.content as any).title === "Implement Action System");
      expect(task1).toBeDefined();
      expect((task1?.content as any).priority).toBe(1);
    });

    test("Step 4: Read individual row", async () => {
      const readResult = await afs.read("/tasks/1");

      expect(readResult.data).toBeDefined();
      expect(readResult.data?.content).toHaveProperty("title", "Implement Action System");
      expect(readResult.data?.content).toHaveProperty("completed", 0);
    });

    test("Step 5: Update row via existing CRUD (write)", async () => {
      // Mark task as completed
      const updateResult = await afs.write("/tasks/1", {
        content: { completed: 1 },
      });

      expect(updateResult.data).toBeDefined();
      expect(updateResult.data.content).toHaveProperty("completed", 1);

      // Verify update persisted
      const readResult = await afs.read("/tasks/1");
      expect(readResult.data?.content).toHaveProperty("completed", 1);
    });

    test("Step 6: Delete row via existing CRUD", async () => {
      // First add a task to delete
      await afs.exec(
        "/tasks/.actions/insert",
        {
          data: { title: "Task to Delete", priority: 99 },
        },
        {},
      );

      // Find the new task
      const listBefore = await afs.list("/tasks");
      const taskToDelete = listBefore.data.find(
        (e) => e.content && (e.content as any).title === "Task to Delete",
      );
      expect(taskToDelete).toBeDefined();

      const taskId = (taskToDelete?.content as any).id;

      // Delete it
      const deleteResult = await afs.delete(`/tasks/${taskId}`);
      expect(deleteResult.message).toContain("Deleted");

      // Verify deletion
      const listAfter = await afs.list("/tasks");
      const deletedTask = listAfter.data.find(
        (e) => e.content && (e.content as any).title === "Task to Delete",
      );
      expect(deletedTask).toBeUndefined();
    });

    test("Step 7: Get row count via action", async () => {
      const countResult = await afs.exec("/tasks/.actions/count", {}, {});

      expect(countResult.success).toBe(true);
      expect(countResult.data?.count).toBe(3); // 3 tasks remain
    });
  });

  describe("Action Discovery at All Levels", () => {
    test("Root-level actions at /.actions", async () => {
      const result = await afs.list("/.actions");

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      const actionNames = result.data.map((e) => e.summary ?? e.id);
      expect(actionNames).toContain("create_table");
    });

    test("Table-level actions at /:table/.actions", async () => {
      const result = await afs.list("/tasks/.actions");

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      const actionNames = result.data.map((e) => e.summary ?? e.id);
      // Note: refresh action was removed - schema service queries on-demand
      expect(actionNames).toContain("export");
      expect(actionNames).toContain("count");
      expect(actionNames).toContain("insert");

      // Row-level-only actions should NOT appear
      expect(actionNames).not.toContain("validate");
      expect(actionNames).not.toContain("duplicate");
    });

    test("Row-level actions at /:table/:pk/.actions", async () => {
      const result = await afs.list("/tasks/1/.actions");

      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      const actionNames = result.data.map((e) => e.summary ?? e.id);
      expect(actionNames).toContain("validate");
      expect(actionNames).toContain("duplicate");

      // Table-level-only actions should NOT appear
      expect(actionNames).not.toContain("insert");
    });
  });

  describe("Action Entry Metadata", () => {
    test("Action entries have afs:executable kind", async () => {
      // Check root-level
      const rootActions = await afs.list("/.actions");
      for (const entry of rootActions.data) {
        expect(entry.meta?.kind).toBe("afs:executable");
        expect(entry.meta?.kinds).toContain("afs:executable");
      }

      // Check table-level
      const tableActions = await afs.list("/tasks/.actions");
      for (const entry of tableActions.data) {
        expect(entry.meta?.kind).toBe("afs:executable");
        expect(entry.meta?.kinds).toContain("afs:executable");
      }

      // Check row-level
      const rowActions = await afs.list("/tasks/1/.actions");
      for (const entry of rowActions.data) {
        expect(entry.meta?.kind).toBe("afs:executable");
      }
    });

    test("Action entries have correct path format", async () => {
      const rootActions = await afs.list("/.actions");
      for (const entry of rootActions.data) {
        expect(entry.path).toMatch(/^\/.actions\/[\w-]+$/);
      }

      const tableActions = await afs.list("/tasks/.actions");
      for (const entry of tableActions.data) {
        expect(entry.path).toMatch(/^\/tasks\/.actions\/[\w-]+$/);
      }

      const rowActions = await afs.list("/tasks/1/.actions");
      for (const entry of rowActions.data) {
        expect(entry.path).toMatch(/^\/tasks\/1\/.actions\/[\w-]+$/);
      }
    });

    test("create_table action has inputSchema in metadata", async () => {
      const rootActions = await afs.list("/.actions");
      const createTableAction = rootActions.data.find(
        (e) => e.summary === "create_table" || e.id.includes("create_table"),
      );

      expect(createTableAction).toBeDefined();
      expect(createTableAction?.meta?.inputSchema).toBeDefined();
      expect(createTableAction?.meta?.inputSchema?.properties).toHaveProperty("name");
      expect(createTableAction?.meta?.inputSchema?.properties).toHaveProperty("columns");
    });

    test("insert action has inputSchema in metadata", async () => {
      const tableActions = await afs.list("/tasks/.actions");
      const insertAction = tableActions.data.find(
        (e) => e.summary === "insert" || e.id.includes("insert"),
      );

      expect(insertAction).toBeDefined();
      expect(insertAction?.meta?.inputSchema).toBeDefined();
      expect(insertAction?.meta?.inputSchema?.properties).toHaveProperty("data");
    });
  });

  describe("Action Execution via Write", () => {
    test("Execute insert action via write method", async () => {
      const result = await afs.write("/tasks/.actions/insert", {
        content: {
          data: {
            title: "Task via Write",
            priority: 5,
          },
        },
      });

      expect(result.data).toBeDefined();
      expect((result.data.content as Record<string, unknown>).success).toBe(true);
      expect((result.data.content as Record<string, unknown>).data).toHaveProperty("id");
    });

    test("Execute table action (export) via exec", async () => {
      const result = await afs.exec("/tasks/.actions/export", { format: "json" }, {});

      expect(result.success).toBe(true);
      // Export action returns data wrapped in data property
      expect(Array.isArray(result.data?.data)).toBe(true);
    });

    test("Execute row action (validate) via write", async () => {
      const result = await afs.write("/tasks/1/.actions/validate", {
        content: {},
      });

      expect(result.data).toBeDefined();
      expect((result.data.content as Record<string, unknown>).success).toBe(true);
      expect((result.data.content as Record<string, unknown>).data).toHaveProperty("valid", true);
    });

    test("Execute row action (duplicate) via write", async () => {
      const result = await afs.write("/tasks/1/.actions/duplicate", {
        content: {},
      });

      expect(result.data).toBeDefined();
      expect((result.data.content as Record<string, unknown>).success).toBe(true);
      expect((result.data.content as Record<string, unknown>).data).toHaveProperty("newId");

      // Verify duplicate was created
      const newId = (
        (result.data.content as Record<string, unknown>).data as Record<string, unknown>
      ).newId;
      const readResult = await afs.read(`/tasks/${newId}`);
      expect(readResult.data?.content).toHaveProperty("title", "Implement Action System");
    });
  });

  describe("Read Individual Action Definition", () => {
    test("should read root-level action definition via read()", async () => {
      const result = await afs.read("/.actions/create_table");

      expect(result.data).toBeDefined();
      expect(result.data?.summary).toBe("create_table");
      expect(result.data?.meta?.kind).toBe("afs:executable");
      expect(result.data?.meta?.inputSchema).toBeDefined();
    });

    test("should read table-level action definition via read()", async () => {
      const result = await afs.read("/tasks/.actions/insert");

      expect(result.data).toBeDefined();
      expect(result.data?.summary).toBe("insert");
      expect(result.data?.meta?.kind).toBe("afs:executable");
      expect(result.data?.meta?.inputSchema).toBeDefined();
    });

    test("should read row-level action definition via read()", async () => {
      const result = await afs.read("/tasks/1/.actions/validate");

      expect(result.data).toBeDefined();
      expect(result.data?.summary).toBe("validate");
      expect(result.data?.meta?.kind).toBe("afs:executable");
    });

    test("should include action metadata in read result", async () => {
      const result = await afs.read("/.actions/create_table");

      expect(result.data?.meta?.name).toBe("create_table");
      expect(result.data?.meta?.description).toBeDefined();
    });
  });

  describe("Dynamic Input Schema Generation", () => {
    test("insert action should have dynamic schema with column definitions", async () => {
      const result = await afs.list("/tasks/.actions");
      const insertAction = result.data.find((e) => e.summary === "insert");

      expect(insertAction).toBeDefined();
      expect(insertAction?.meta?.inputSchema).toBeDefined();

      const schema = insertAction?.meta?.inputSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();

      // Check that the data property has column definitions
      const dataSchema = (schema.properties as Record<string, unknown>).data as Record<
        string,
        unknown
      >;
      expect(dataSchema.type).toBe("object");
      expect(dataSchema.properties).toBeDefined();

      // Should include task columns (title, description, priority, completed, created_at)
      const colProps = dataSchema.properties as Record<string, unknown>;
      expect(colProps.title).toBeDefined();
      expect(colProps.description).toBeDefined();
      expect(colProps.priority).toBeDefined();

      // title should be required (NOT NULL)
      expect((dataSchema.required as string[]).includes("title")).toBe(true);
    });

    test("insert action schema should have correct types for columns", async () => {
      const result = await afs.list("/tasks/.actions");
      const insertAction = result.data.find((e) => e.summary === "insert");

      const schema = insertAction?.meta?.inputSchema as Record<string, unknown>;
      const dataSchema = (schema.properties as Record<string, unknown>).data as Record<
        string,
        unknown
      >;
      const colProps = dataSchema.properties as Record<string, Record<string, unknown>>;

      // INTEGER columns should have type "integer"
      expect(colProps.priority?.type).toBe("integer");
      expect(colProps.completed?.type).toBe("integer");

      // TEXT columns should have type "string"
      expect(colProps.title?.type).toBe("string");

      // DATETIME columns should have type "string" with format "date-time"
      expect(colProps.created_at?.type).toBe("string");
      expect(colProps.created_at?.format).toBe("date-time");
    });

    test("validate action should have dynamic schema with table info", async () => {
      const result = await afs.list("/tasks/1/.actions");
      const validateAction = result.data.find((e) => e.summary === "validate");

      expect(validateAction).toBeDefined();
      expect(validateAction?.meta?.inputSchema).toBeDefined();

      const schema = validateAction?.meta?.inputSchema as Record<string, unknown>;
      // Should include table schema info in x-table-schema
      expect(schema["x-table-schema"]).toBeDefined();
    });

    test("duplicate action should have dynamic schema with copied columns info", async () => {
      const result = await afs.list("/tasks/1/.actions");
      const duplicateAction = result.data.find((e) => e.summary === "duplicate");

      expect(duplicateAction).toBeDefined();
      expect(duplicateAction?.meta?.inputSchema).toBeDefined();

      const schema = duplicateAction?.meta?.inputSchema as Record<string, unknown>;
      // Should include list of columns that will be copied
      expect(schema["x-copied-columns"]).toBeDefined();
      expect(Array.isArray(schema["x-copied-columns"])).toBe(true);
      // Should not include 'id' in copied columns (it's the PK)
      expect((schema["x-copied-columns"] as string[]).includes("id")).toBe(false);
    });

    test("create_table action should have static schema (not dynamic)", async () => {
      const result = await afs.list("/.actions");
      const createTableAction = result.data.find((e) => e.summary === "create_table");

      expect(createTableAction).toBeDefined();
      expect(createTableAction?.meta?.inputSchema).toBeDefined();

      const schema = createTableAction?.meta?.inputSchema as Record<string, unknown>;
      // Should have name and columns properties
      expect((schema.properties as Record<string, unknown>).name).toBeDefined();
      expect((schema.properties as Record<string, unknown>).columns).toBeDefined();
      // Should require name and columns
      expect((schema.required as string[]).includes("name")).toBe(true);
      expect((schema.required as string[]).includes("columns")).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("Creating duplicate table throws error", async () => {
      await expect(
        afs.exec(
          "/.actions/create_table",
          {
            name: "tasks", // Already exists
            columns: [{ name: "id", type: "INTEGER", primaryKey: true }],
          },
          {},
        ),
      ).rejects.toThrow(/already exists/i);
    });

    test("Inserting into non-existent table throws error", async () => {
      await expect(
        afs.exec(
          "/nonexistent/.actions/insert",
          {
            data: { field: "value" },
          },
          {},
        ),
      ).rejects.toThrow(/not found/i);
    });

    test("Creating table with invalid column type throws error", async () => {
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
  });
});
