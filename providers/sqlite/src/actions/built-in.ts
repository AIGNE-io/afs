import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { SqliteDatabase } from "../database/init.js";
import type { TableSchema } from "../schema/types.js";
import { buildWhereClause, type WhereClause } from "./operators.js";
import type { ActionsRegistry } from "./registry.js";
import {
  type ActionContext,
  type ActionResult,
  errorResult,
  type SchemaGeneratorContext,
  SQLiteActionErrorCode,
} from "./types.js";

/**
 * Executes a raw SQL query and returns all rows
 */
async function execAll<T>(db: SqliteDatabase, query: string): Promise<T[]> {
  return db.all<T>(sql.raw(query)).execute();
}

/**
 * Executes a raw SQL query (for INSERT, UPDATE, DELETE)
 */
async function execRun(db: SqliteDatabase, query: string): Promise<void> {
  await db.run(sql.raw(query)).execute();
}

/**
 * Executes a parameterized SQL query and returns all rows
 */
async function execSql<T>(db: SqliteDatabase, sqlQuery: SQL): Promise<T[]> {
  return db.all<T>(sqlQuery).execute();
}

/**
 * Executes a parameterized SQL statement (for INSERT, UPDATE, DELETE)
 */
async function runSql(db: SqliteDatabase, sqlQuery: SQL): Promise<{ changes: number }> {
  const result: any = await db.run(sqlQuery).execute();
  return { changes: result.rowsAffected ?? result.meta?.changes ?? 0 };
}

/**
 * Registers built-in actions to the registry
 */
export function registerBuiltInActions(registry: ActionsRegistry): void {
  // Export table action (table level)
  registry.register({
    name: "export",
    description: "Export table data in specified format (json, csv)",
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "csv"],
          default: "json",
        },
      },
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const format = (params.format as string) ?? "json";
      const data = await ctx.module.exportTable(ctx.table, format);
      return {
        success: true,
        data,
      };
    },
  });

  // Count rows action (table level)
  registry.register({
    name: "count",
    description: "Get the total row count for this table",
    tableLevel: true,
    rowLevel: false,
    handler: async (ctx: ActionContext): Promise<ActionResult> => {
      const result = await execAll<{ count: number }>(
        ctx.db,
        `SELECT COUNT(*) as count FROM "${ctx.table}"`,
      );
      return {
        success: true,
        data: { count: result[0]?.count ?? 0 },
      };
    },
  });

  // Duplicate row action (row level)
  registry.register({
    name: "duplicate",
    description: "Create a copy of this row",
    tableLevel: false,
    rowLevel: true,
    inputSchemaGenerator: (schemaCtx: SchemaGeneratorContext) => {
      if (!schemaCtx.tableSchema) {
        return { type: "object", properties: {}, additionalProperties: false };
      }
      return generateDuplicateSchema(schemaCtx.tableSchema);
    },
    handler: async (ctx: ActionContext): Promise<ActionResult> => {
      if (!ctx.row) {
        return { success: false, message: "Row data not available" };
      }

      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return { success: false, message: `Table '${ctx.table}' not found` };
      }

      // Create a copy without the primary key
      const pkColumn = schema.primaryKey[0] ?? "rowid";
      const rowCopy = { ...ctx.row };
      delete rowCopy[pkColumn];
      delete rowCopy.rowid;

      // Build insert query
      const columns = Object.keys(rowCopy);
      const values = columns.map((col) => formatValueForSQL(rowCopy[col]));

      await execRun(
        ctx.db,
        `INSERT INTO "${ctx.table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`,
      );

      // Get the new row's ID
      const lastIdResult = await execAll<{ id: number }>(
        ctx.db,
        "SELECT last_insert_rowid() as id",
      );

      return {
        success: true,
        data: { newId: lastIdResult[0]?.id },
        message: "Row duplicated successfully",
      };
    },
  });

  // Validate row action (row level)
  registry.register({
    name: "validate",
    description: "Validate row data against schema constraints",
    tableLevel: false,
    rowLevel: true,
    inputSchemaGenerator: (schemaCtx: SchemaGeneratorContext) => {
      if (!schemaCtx.tableSchema) {
        return { type: "object", properties: {}, additionalProperties: false };
      }
      return generateValidateSchema(schemaCtx.tableSchema);
    },
    handler: async (ctx: ActionContext): Promise<ActionResult> => {
      if (!ctx.row) {
        return { success: false, message: "Row data not available" };
      }

      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return { success: false, message: `Table '${ctx.table}' not found` };
      }

      const errors: string[] = [];

      // Check NOT NULL constraints
      for (const col of schema.columns) {
        if (col.notnull && (ctx.row[col.name] === null || ctx.row[col.name] === undefined)) {
          errors.push(`Column '${col.name}' cannot be null`);
        }
      }

      // Check foreign key references
      for (const fk of schema.foreignKeys) {
        const value = ctx.row[fk.from];
        if (value !== null && value !== undefined) {
          const refResult = await execAll<{ count: number }>(
            ctx.db,
            `SELECT COUNT(*) as count FROM "${fk.table}" WHERE "${fk.to}" = '${String(value).replace(/'/g, "''")}'`,
          );
          if (refResult[0]?.count === 0) {
            errors.push(
              `Foreign key violation: ${fk.from} references non-existent ${fk.table}.${fk.to}`,
            );
          }
        }
      }

      return {
        success: errors.length === 0,
        data: { errors, valid: errors.length === 0 },
        message: errors.length > 0 ? `Validation failed: ${errors.join("; ")}` : "Row is valid",
      };
    },
  });

  // Insert action (table level)
  registry.register({
    name: "insert",
    description: "Insert a new row into the table",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    // Dynamic schema generator - generates schema based on table columns
    inputSchemaGenerator: (schemaCtx: SchemaGeneratorContext) => {
      if (!schemaCtx.tableSchema) {
        // Fallback to generic schema if no table schema available
        return {
          type: "object",
          properties: {
            data: {
              type: "object",
              description: "Row data to insert (column names as keys)",
              additionalProperties: true,
            },
          },
          required: ["data"],
        };
      }
      return generateInsertSchema(schemaCtx.tableSchema);
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const data = params.data as Record<string, unknown>;

      if (!data || Object.keys(data).length === 0) {
        throw new Error("Insert data is required");
      }

      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        throw new Error(`Table '${ctx.table}' not found`);
      }

      // Build insert query
      const columns = Object.keys(data);
      const values = columns.map((col) => formatValueForSQL(data[col]));

      const insertSQL = `INSERT INTO "${ctx.table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`;

      try {
        await execRun(ctx.db, insertSQL);
      } catch (error) {
        // Re-throw with more context
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Insert failed: ${message}`);
      }

      // Get the new row's ID
      const lastIdResult = await execAll<{ id: number }>(
        ctx.db,
        "SELECT last_insert_rowid() as id",
      );
      const newId = lastIdResult[0]?.id;

      return {
        success: true,
        data: { id: newId, ...data },
        message: `Row inserted successfully with id ${newId}`,
      };
    },
  });

  // create_table - Root level action to create a new table
  registry.register({
    name: "create_table",
    description: "Create a new table in the database",
    rootLevel: true,
    tableLevel: false,
    rowLevel: false,
    inputSchema: {
      type: "object",
      description: "Create a new SQLite table with specified columns",
      properties: {
        name: {
          type: "string",
          description: "Table name (alphanumeric and underscores, must start with letter)",
          pattern: "^[a-zA-Z][a-zA-Z0-9_]*$",
          minLength: 1,
          maxLength: 128,
        },
        columns: {
          type: "array",
          description: "Column definitions (at least one required)",
          minItems: 1,
          items: {
            type: "object",
            description: "Column definition",
            properties: {
              name: {
                type: "string",
                description: "Column name (alphanumeric and underscores)",
                pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
                minLength: 1,
                maxLength: 128,
              },
              type: {
                type: "string",
                description: "SQLite column type",
                enum: [
                  // SQLite native types
                  "INTEGER",
                  "TEXT",
                  "REAL",
                  "BLOB",
                  "NUMERIC",
                  // Common SQL types (mapped to SQLite affinities)
                  "INT",
                  "TINYINT",
                  "SMALLINT",
                  "MEDIUMINT",
                  "BIGINT",
                  "UNSIGNED BIG INT",
                  "INT2",
                  "INT8",
                  "CHARACTER",
                  "VARCHAR",
                  "VARYING CHARACTER",
                  "NCHAR",
                  "NATIVE CHARACTER",
                  "NVARCHAR",
                  "CLOB",
                  "DOUBLE",
                  "DOUBLE PRECISION",
                  "FLOAT",
                  "DECIMAL",
                  "BOOLEAN",
                  "DATE",
                  "DATETIME",
                  "TIMESTAMP",
                ],
                "x-affinity-mapping": {
                  INTEGER: [
                    "INTEGER",
                    "INT",
                    "TINYINT",
                    "SMALLINT",
                    "MEDIUMINT",
                    "BIGINT",
                    "UNSIGNED BIG INT",
                    "INT2",
                    "INT8",
                  ],
                  TEXT: [
                    "TEXT",
                    "CHARACTER",
                    "VARCHAR",
                    "VARYING CHARACTER",
                    "NCHAR",
                    "NATIVE CHARACTER",
                    "NVARCHAR",
                    "CLOB",
                  ],
                  REAL: ["REAL", "DOUBLE", "DOUBLE PRECISION", "FLOAT"],
                  NUMERIC: ["NUMERIC", "DECIMAL", "BOOLEAN", "DATE", "DATETIME", "TIMESTAMP"],
                  BLOB: ["BLOB"],
                },
              },
              nullable: {
                type: "boolean",
                description: "Whether the column allows NULL values (default: true)",
                default: true,
              },
              primaryKey: {
                type: "boolean",
                description:
                  "Whether this column is the primary key (default: false). INTEGER PRIMARY KEY will auto-increment.",
                default: false,
              },
              unique: {
                type: "boolean",
                description: "Whether this column must have unique values (default: false)",
                default: false,
              },
              defaultValue: {
                oneOf: [
                  { type: "string" },
                  { type: "number" },
                  { type: "boolean" },
                  { type: "null" },
                ],
                description:
                  "Default value for the column. Use string 'CURRENT_TIMESTAMP' for auto timestamp.",
              },
              references: {
                type: "object",
                description: "Foreign key reference",
                properties: {
                  table: {
                    type: "string",
                    description: "Referenced table name",
                  },
                  column: {
                    type: "string",
                    description: "Referenced column name",
                  },
                  onDelete: {
                    type: "string",
                    enum: ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"],
                    description: "Action on delete (default: NO ACTION)",
                  },
                  onUpdate: {
                    type: "string",
                    enum: ["CASCADE", "SET NULL", "SET DEFAULT", "RESTRICT", "NO ACTION"],
                    description: "Action on update (default: NO ACTION)",
                  },
                },
                required: ["table", "column"],
              },
            },
            required: ["name", "type"],
            additionalProperties: false,
          },
        },
        ifNotExists: {
          type: "boolean",
          description: "If true, do not throw error if table already exists (default: false)",
          default: false,
        },
      },
      required: ["name", "columns"],
      additionalProperties: false,
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const tableName = params.name as string;
      const columns = params.columns as Array<{
        name: string;
        type: string;
        nullable?: boolean;
        primaryKey?: boolean;
        unique?: boolean;
        defaultValue?: string | number | boolean | null;
        references?: {
          table: string;
          column: string;
          onDelete?: string;
          onUpdate?: string;
        };
      }>;
      const ifNotExists = params.ifNotExists as boolean | undefined;

      // Validate required params
      if (!tableName) {
        throw new Error("Table name is required");
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tableName)) {
        throw new Error(
          "Table name must start with a letter and contain only alphanumeric characters and underscores",
        );
      }
      if (!columns || columns.length === 0) {
        throw new Error("At least one column is required");
      }

      // Validate column names
      for (const col of columns) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col.name)) {
          throw new Error(
            `Invalid column name: ${col.name}. Must start with a letter or underscore and contain only alphanumeric characters and underscores`,
          );
        }
      }

      // Validate column types
      const validTypes = [
        "INTEGER",
        "TEXT",
        "REAL",
        "BLOB",
        "NUMERIC",
        "INT",
        "TINYINT",
        "SMALLINT",
        "MEDIUMINT",
        "BIGINT",
        "UNSIGNED BIG INT",
        "INT2",
        "INT8",
        "CHARACTER",
        "VARCHAR",
        "VARYING CHARACTER",
        "NCHAR",
        "NATIVE CHARACTER",
        "NVARCHAR",
        "CLOB",
        "DOUBLE",
        "DOUBLE PRECISION",
        "FLOAT",
        "DECIMAL",
        "BOOLEAN",
        "DATE",
        "DATETIME",
        "TIMESTAMP",
      ];
      for (const col of columns) {
        const upperType = col.type.toUpperCase();
        if (!validTypes.includes(upperType)) {
          throw new Error(
            `Invalid column type: ${col.type}. Valid types are: ${validTypes.join(", ")}`,
          );
        }
      }

      // Check if table already exists (unless ifNotExists is true)
      if (!ifNotExists) {
        const exists = await ctx.schemaService.hasTable(tableName);
        if (exists) {
          throw new Error(`Table '${tableName}' already exists`);
        }
      }

      // Build CREATE TABLE SQL
      const columnDefs: string[] = [];
      const foreignKeys: string[] = [];

      for (const col of columns) {
        const parts = [`"${col.name}"`, col.type.toUpperCase()];

        if (col.primaryKey) {
          parts.push("PRIMARY KEY");
          // Only auto-increment for INTEGER primary keys
          if (col.type.toUpperCase() === "INTEGER" || col.type.toUpperCase() === "INT") {
            parts.push("AUTOINCREMENT");
          }
        }

        if (col.nullable === false && !col.primaryKey) {
          parts.push("NOT NULL");
        }

        if (col.unique && !col.primaryKey) {
          parts.push("UNIQUE");
        }

        if (col.defaultValue !== undefined) {
          // Handle special default values
          if (
            col.defaultValue === "CURRENT_TIMESTAMP" ||
            col.defaultValue === "CURRENT_DATE" ||
            col.defaultValue === "CURRENT_TIME"
          ) {
            parts.push(`DEFAULT ${col.defaultValue}`);
          } else {
            parts.push(`DEFAULT ${formatValueForSQL(col.defaultValue)}`);
          }
        }

        columnDefs.push(parts.join(" "));

        // Handle foreign key references
        if (col.references) {
          let fkDef = `FOREIGN KEY ("${col.name}") REFERENCES "${col.references.table}"("${col.references.column}")`;
          if (col.references.onDelete) {
            fkDef += ` ON DELETE ${col.references.onDelete}`;
          }
          if (col.references.onUpdate) {
            fkDef += ` ON UPDATE ${col.references.onUpdate}`;
          }
          foreignKeys.push(fkDef);
        }
      }

      // Combine column definitions and foreign keys
      const allDefs = [...columnDefs, ...foreignKeys];
      const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";
      const createSQL = `CREATE TABLE ${ifNotExistsClause}"${tableName}" (${allDefs.join(", ")})`;

      await execRun(ctx.db, createSQL);

      return {
        success: true,
        data: {
          tableName,
          columnCount: columns.length,
          sql: createSQL,
        },
        message: `Table '${tableName}' created successfully`,
      };
    },
  });

  // drop_table - Root level action to drop a table
  registry.register({
    name: "drop_table",
    description: "Drop a table from the database",
    rootLevel: true,
    tableLevel: false,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Table name to drop" },
        ifExists: {
          type: "boolean",
          default: false,
          description: "Don't error if table doesn't exist",
        },
      },
      required: ["name"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const tableName = params.name as string;
      const ifExists = params.ifExists as boolean | undefined;

      if (!tableName) {
        return errorResult(SQLiteActionErrorCode.INVALID_INPUT, "Table name is required");
      }

      // Check if table exists
      const exists = await ctx.schemaService.hasTable(tableName);
      if (!exists && !ifExists) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table '${tableName}' does not exist`);
      }

      if (exists) {
        const ifExistsClause = ifExists ? "IF EXISTS " : "";
        await execRun(ctx.db, `DROP TABLE ${ifExistsClause}"${tableName}"`);
      }

      return {
        success: true,
        data: { tableName },
        message: `Table '${tableName}' dropped successfully`,
      };
    },
  });

  // rename_table - Root level action to rename a table
  registry.register({
    name: "rename_table",
    description: "Rename a table in the database",
    rootLevel: true,
    tableLevel: false,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        oldName: { type: "string", description: "Current table name" },
        newName: { type: "string", description: "New table name" },
      },
      required: ["oldName", "newName"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const oldName = params.oldName as string;
      const newName = params.newName as string;

      if (!oldName || !newName) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Both oldName and newName are required",
        );
      }

      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(newName)) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "New table name must start with a letter and contain only alphanumeric characters and underscores",
        );
      }

      // Check if source table exists
      const exists = await ctx.schemaService.hasTable(oldName);
      if (!exists) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table '${oldName}' does not exist`);
      }

      // Check if target name already exists
      const targetExists = await ctx.schemaService.hasTable(newName);
      if (targetExists) {
        return errorResult(
          SQLiteActionErrorCode.CONSTRAINT_VIOLATION,
          `Table '${newName}' already exists`,
        );
      }

      await execRun(ctx.db, `ALTER TABLE "${oldName}" RENAME TO "${newName}"`);

      return {
        success: true,
        data: { oldName, newName },
        message: `Table renamed from '${oldName}' to '${newName}'`,
      };
    },
  });

  // add_column - Table level action to add a column
  registry.register({
    name: "add_column",
    description: "Add a new column to the table",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Column name" },
        type: {
          type: "string",
          enum: ["INTEGER", "TEXT", "REAL", "BLOB", "NUMERIC"],
          description: "Column type",
        },
        nullable: {
          type: "boolean",
          default: true,
          description: "Whether the column allows NULL values",
        },
        defaultValue: {
          oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
          description: "Default value for the column",
        },
      },
      required: ["name", "type"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const colName = params.name as string;
      const colType = params.type as string;
      const nullable = params.nullable !== false;
      const defaultValue = params.defaultValue;

      if (!colName || !colType) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Column name and type are required",
        );
      }

      // Build ALTER TABLE statement
      let columnDef = `"${colName}" ${colType.toUpperCase()}`;
      if (!nullable) {
        columnDef += " NOT NULL";
      }
      if (defaultValue !== undefined) {
        columnDef += ` DEFAULT ${formatValueForSQL(defaultValue)}`;
      }

      try {
        await execRun(ctx.db, `ALTER TABLE "${ctx.table}" ADD COLUMN ${columnDef}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("duplicate column name")) {
          return errorResult(
            SQLiteActionErrorCode.CONSTRAINT_VIOLATION,
            `Column '${colName}' already exists`,
          );
        }
        throw error;
      }

      return {
        success: true,
        data: { table: ctx.table, column: colName, type: colType },
        message: `Column '${colName}' added to table '${ctx.table}'`,
      };
    },
  });

  // rename_column - Table level action to rename a column
  registry.register({
    name: "rename_column",
    description: "Rename a column in the table",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        oldName: { type: "string", description: "Current column name" },
        newName: { type: "string", description: "New column name" },
      },
      required: ["oldName", "newName"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const oldName = params.oldName as string;
      const newName = params.newName as string;

      if (!oldName || !newName) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Both oldName and newName are required",
        );
      }

      // Verify column exists
      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table '${ctx.table}' not found`);
      }

      const columnExists = schema.columns.some((c) => c.name === oldName);
      if (!columnExists) {
        return errorResult(
          SQLiteActionErrorCode.NOT_FOUND,
          `Column '${oldName}' not found in table '${ctx.table}'`,
        );
      }

      await execRun(
        ctx.db,
        `ALTER TABLE "${ctx.table}" RENAME COLUMN "${oldName}" TO "${newName}"`,
      );

      return {
        success: true,
        data: { table: ctx.table, oldName, newName },
        message: `Column renamed from '${oldName}' to '${newName}'`,
      };
    },
  });

  // drop_column - Table level action to drop a column
  registry.register({
    name: "drop_column",
    description: "Drop a column from the table",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Column name to drop" },
      },
      required: ["name"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const colName = params.name as string;

      if (!colName) {
        return errorResult(SQLiteActionErrorCode.INVALID_INPUT, "Column name is required");
      }

      // Verify column exists
      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table '${ctx.table}' not found`);
      }

      const columnExists = schema.columns.some((c) => c.name === colName);
      if (!columnExists) {
        return errorResult(
          SQLiteActionErrorCode.NOT_FOUND,
          `Column '${colName}' not found in table '${ctx.table}'`,
        );
      }

      await execRun(ctx.db, `ALTER TABLE "${ctx.table}" DROP COLUMN "${colName}"`);

      return {
        success: true,
        data: { table: ctx.table, column: colName },
        message: `Column '${colName}' dropped from table '${ctx.table}'`,
      };
    },
  });

  // create_index - Table level action to create an index
  registry.register({
    name: "create_index",
    description: "Create an index on the table",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Index name" },
        columns: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Columns to index (supports compound indexes)",
        },
        unique: { type: "boolean", default: false, description: "Whether the index is unique" },
        ifNotExists: {
          type: "boolean",
          default: false,
          description: "Don't error if index already exists",
        },
      },
      required: ["name", "columns"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const indexName = params.name as string;
      const columns = params.columns as string[];
      const unique = params.unique as boolean | undefined;
      const ifNotExists = params.ifNotExists as boolean | undefined;

      if (!indexName || !columns || columns.length === 0) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Index name and columns are required",
        );
      }

      const uniqueClause = unique ? "UNIQUE " : "";
      const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";
      const columnsClause = columns.map((c) => `"${c}"`).join(", ");

      await execRun(
        ctx.db,
        `CREATE ${uniqueClause}INDEX ${ifNotExistsClause}"${indexName}" ON "${ctx.table}" (${columnsClause})`,
      );

      return {
        success: true,
        data: { indexName, table: ctx.table, columns, unique: !!unique },
        message: `Index '${indexName}' created on table '${ctx.table}'`,
      };
    },
  });

  // drop_index - Table level action to drop an index
  registry.register({
    name: "drop_index",
    description: "Drop an index from the table",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Index name to drop" },
        ifExists: {
          type: "boolean",
          default: false,
          description: "Don't error if index doesn't exist",
        },
      },
      required: ["name"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const indexName = params.name as string;
      const ifExists = params.ifExists as boolean | undefined;

      if (!indexName) {
        return errorResult(SQLiteActionErrorCode.INVALID_INPUT, "Index name is required");
      }

      const ifExistsClause = ifExists ? "IF EXISTS " : "";
      await execRun(ctx.db, `DROP INDEX ${ifExistsClause}"${indexName}"`);

      return {
        success: true,
        data: { indexName },
        message: `Index '${indexName}' dropped`,
      };
    },
  });

  // update - Row level action to update a single row by PK
  registry.register({
    name: "update",
    description: "Update this row",
    rootLevel: false,
    tableLevel: false,
    rowLevel: true,
    inputSchemaGenerator: (schemaCtx: SchemaGeneratorContext) => {
      if (!schemaCtx.tableSchema) {
        return {
          type: "object",
          properties: {
            data: { type: "object", description: "Fields to update", additionalProperties: true },
          },
          required: ["data"],
        };
      }
      return generateUpdateSchema(schemaCtx.tableSchema);
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const data = params.data as Record<string, unknown>;

      if (!data || Object.keys(data).length === 0) {
        return errorResult(SQLiteActionErrorCode.INVALID_INPUT, "Update data is required");
      }

      if (!ctx.pk) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Primary key is required for row-level update",
        );
      }

      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table '${ctx.table}' not found`);
      }

      const pkColumn = schema.primaryKey[0] ?? "rowid";

      // Build SET clause
      const setClauses = Object.entries(data)
        .map(([col, val]) => `"${col}" = ${formatValueForSQL(val)}`)
        .join(", ");

      const updateSQL = `UPDATE "${ctx.table}" SET ${setClauses} WHERE "${pkColumn}" = ${formatValueForSQL(ctx.pk)}`;

      try {
        await execRun(ctx.db, updateSQL);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("UNIQUE constraint failed")) {
          return errorResult(
            SQLiteActionErrorCode.CONSTRAINT_VIOLATION,
            `Unique constraint violation: ${message}`,
          );
        }
        throw error;
      }

      // Return updated row
      const rows = await execAll<Record<string, unknown>>(
        ctx.db,
        `SELECT * FROM "${ctx.table}" WHERE "${pkColumn}" = ${formatValueForSQL(ctx.pk)}`,
      );

      return {
        success: true,
        data: rows[0],
        message: "Row updated successfully",
      };
    },
  });

  // delete - Row level action to delete a single row by PK
  registry.register({
    name: "delete",
    description: "Delete this row",
    rootLevel: false,
    tableLevel: false,
    rowLevel: true,
    inputSchema: {
      type: "object",
      properties: {},
      description: "Delete the current row",
    },
    handler: async (ctx: ActionContext): Promise<ActionResult> => {
      if (!ctx.pk) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Primary key is required for row-level delete",
        );
      }

      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table '${ctx.table}' not found`);
      }

      const pkColumn = schema.primaryKey[0] ?? "rowid";

      await execRun(
        ctx.db,
        `DELETE FROM "${ctx.table}" WHERE "${pkColumn}" = ${formatValueForSQL(ctx.pk)}`,
      );

      return {
        success: true,
        data: { pk: ctx.pk },
        message: "Row deleted successfully",
      };
    },
  });

  // query - Table level action to query rows with conditions
  registry.register({
    name: "query",
    description: "Query rows with conditions, ordering, and pagination",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        where: { type: "object", description: "Query conditions (MongoDB-style operators)" },
        orderBy: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"], default: "asc" },
            },
            required: ["column"],
          },
          description: "Sort order",
        },
        limit: { type: "integer", minimum: 1, description: "Maximum rows to return" },
        offset: { type: "integer", minimum: 0, description: "Number of rows to skip" },
      },
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const where = params.where as WhereClause | undefined;
      const orderBy = params.orderBy as Array<{ column: string; direction?: string }> | undefined;
      const limit = params.limit as number | undefined;
      const offset = params.offset as number | undefined;

      // Build query
      let querySQL = sql`SELECT * FROM ${sql.identifier(ctx.table)}`;
      querySQL = sql`${querySQL}${buildWhereClause(where)}`;

      // Add ORDER BY
      if (orderBy && orderBy.length > 0) {
        const orderClauses = orderBy.map((o) => {
          const dir = o.direction?.toUpperCase() === "DESC" ? sql` DESC` : sql` ASC`;
          return sql`${sql.identifier(o.column)}${dir}`;
        });
        querySQL = sql`${querySQL} ORDER BY ${sql.join(orderClauses, sql`, `)}`;
      }

      // Add LIMIT/OFFSET
      if (limit !== undefined) {
        querySQL = sql`${querySQL} LIMIT ${limit}`;
      }
      if (offset !== undefined) {
        querySQL = sql`${querySQL} OFFSET ${offset}`;
      }

      const rows = await execSql<Record<string, unknown>>(ctx.db, querySQL);

      return {
        success: true,
        data: { rows, count: rows.length },
      };
    },
  });

  // update_where - Table level action to update multiple rows
  registry.register({
    name: "update_where",
    description: "Update rows matching conditions",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        where: { type: "object", description: "Update conditions (MongoDB-style operators)" },
        data: { type: "object", description: "Fields to update" },
      },
      required: ["where", "data"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const where = params.where as WhereClause;
      const data = params.data as Record<string, unknown>;

      if (!where || Object.keys(where).length === 0) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Where clause is required for update_where",
        );
      }

      if (!data || Object.keys(data).length === 0) {
        return errorResult(SQLiteActionErrorCode.INVALID_INPUT, "Update data is required");
      }

      // Build SET clause with parameterized values
      const setEntries = Object.entries(data);
      const setClauses = setEntries.map(([col, val]) => sql`${sql.identifier(col)} = ${val}`);

      const updateSQL = sql`UPDATE ${sql.identifier(ctx.table)} SET ${sql.join(setClauses, sql`, `)}${buildWhereClause(where)}`;

      const result = await runSql(ctx.db, updateSQL);

      return {
        success: true,
        data: { affectedRows: result.changes },
        message: `${result.changes} row(s) updated`,
      };
    },
  });

  // delete_where - Table level action to delete multiple rows
  registry.register({
    name: "delete_where",
    description: "Delete rows matching conditions",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        where: { type: "object", description: "Delete conditions (MongoDB-style operators)" },
      },
      required: ["where"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const where = params.where as WhereClause;

      if (!where || Object.keys(where).length === 0) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          "Where clause is required for delete_where",
        );
      }

      const deleteSQL = sql`DELETE FROM ${sql.identifier(ctx.table)}${buildWhereClause(where)}`;

      const result = await runSql(ctx.db, deleteSQL);

      return {
        success: true,
        data: { affectedRows: result.changes },
        message: `${result.changes} row(s) deleted`,
      };
    },
  });

  // bulk_insert - Table level action to insert multiple rows
  registry.register({
    name: "bulk_insert",
    description: "Insert multiple rows at once",
    rootLevel: false,
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: { type: "object" },
          minItems: 1,
          description: "Array of row data to insert",
        },
      },
      required: ["rows"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const rows = params.rows as Array<Record<string, unknown>>;

      if (!rows || rows.length === 0) {
        return errorResult(SQLiteActionErrorCode.INVALID_INPUT, "At least one row is required");
      }

      // Get columns from first row
      const columns = Object.keys(rows[0]!);
      const columnsList = columns.map((c) => `"${c}"`).join(", ");

      // Build values for each row
      const insertedIds: number[] = [];

      for (const row of rows) {
        const values = columns.map((col) => formatValueForSQL(row[col]));
        const insertSQL = `INSERT INTO "${ctx.table}" (${columnsList}) VALUES (${values.join(", ")})`;

        try {
          await execRun(ctx.db, insertSQL);
          const lastIdResult = await execAll<{ id: number }>(
            ctx.db,
            "SELECT last_insert_rowid() as id",
          );
          insertedIds.push(lastIdResult[0]?.id ?? 0);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return errorResult(
            SQLiteActionErrorCode.CONSTRAINT_VIOLATION,
            `Insert failed at row ${insertedIds.length}: ${message}`,
            { insertedCount: insertedIds.length, insertedIds },
          );
        }
      }

      return {
        success: true,
        data: { insertedCount: rows.length, insertedIds },
        message: `${rows.length} row(s) inserted`,
      };
    },
  });

  // pragma - Root level action to execute PRAGMA commands
  registry.register({
    name: "pragma",
    description: "Execute a PRAGMA command (whitelist-restricted)",
    rootLevel: true,
    tableLevel: false,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: [
            "table_info",
            "table_list",
            "index_list",
            "index_info",
            "foreign_key_list",
            "database_list",
            "collation_list",
            "journal_mode",
            "synchronous",
            "cache_size",
            "page_size",
            "encoding",
            "auto_vacuum",
            "integrity_check",
            "quick_check",
          ],
          description: "PRAGMA command to execute",
        },
        argument: { type: "string", description: "Argument for the command (e.g., table name)" },
        value: {
          oneOf: [{ type: "string" }, { type: "number" }],
          description: "Value for writable PRAGMAs",
        },
      },
      required: ["command"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const command = params.command as string;
      const argument = params.argument as string | undefined;
      const value = params.value as string | number | undefined;

      const allowedCommands = [
        "table_info",
        "table_list",
        "index_list",
        "index_info",
        "foreign_key_list",
        "database_list",
        "collation_list",
        "journal_mode",
        "synchronous",
        "cache_size",
        "page_size",
        "encoding",
        "auto_vacuum",
        "integrity_check",
        "quick_check",
      ];

      if (!allowedCommands.includes(command)) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          `PRAGMA command '${command}' is not allowed. Allowed: ${allowedCommands.join(", ")}`,
        );
      }

      // Build PRAGMA query
      let pragmaSQL = `PRAGMA ${command}`;
      if (argument) {
        pragmaSQL += `("${argument}")`;
      }
      if (value !== undefined) {
        pragmaSQL += ` = ${typeof value === "string" ? `'${value}'` : value}`;
      }

      const result = await execAll<Record<string, unknown>>(ctx.db, pragmaSQL);

      return {
        success: true,
        data:
          result.length === 1 && Object.keys(result[0]!).length === 1
            ? Object.values(result[0]!)[0]
            : result,
      };
    },
  });

  // Import data action (table level)
  registry.register({
    name: "import",
    description: "Import data into table from JSON or CSV format",
    tableLevel: true,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["json", "csv"],
          description: "Data format (json or csv)",
        },
        data: {
          type: "string",
          description: "The data to import (JSON array string or CSV string)",
        },
        onConflict: {
          type: "string",
          enum: ["abort", "ignore", "replace"],
          default: "abort",
          description: "Conflict resolution strategy",
        },
        delimiter: {
          type: "string",
          default: ",",
          description: "CSV delimiter character",
        },
        header: {
          type: "boolean",
          default: true,
          description: "Whether CSV has a header row",
        },
      },
      required: ["format", "data"],
    },
    handler: async (ctx: ActionContext, params): Promise<ActionResult> => {
      const format = params.format as string;
      const data = params.data as string;
      const onConflict = (params.onConflict as string) ?? "abort";
      const delimiter = (params.delimiter as string) ?? ",";
      const hasHeader = params.header !== false;

      if (!["json", "csv"].includes(format)) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          `Unsupported import format: ${format}. Supported: json, csv`,
        );
      }

      // Verify table exists
      const schema = await ctx.schemaService.getSchema(ctx.table);
      if (!schema) {
        return errorResult(SQLiteActionErrorCode.NOT_FOUND, `Table not found: ${ctx.table}`);
      }

      // Parse data
      let rows: Record<string, unknown>[];
      try {
        if (format === "json") {
          const parsed = JSON.parse(data);
          if (!Array.isArray(parsed)) {
            return errorResult(
              SQLiteActionErrorCode.INVALID_INPUT,
              "JSON data must be an array of objects",
            );
          }
          rows = parsed;
        } else {
          // Parse CSV
          rows = parseCSV(data, delimiter, hasHeader, schema);
        }
      } catch (error) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          `Failed to parse ${format} data: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }

      if (rows.length === 0) {
        return { success: true, data: { imported: 0, skipped: 0 } };
      }

      // Build conflict clause
      let conflictClause = "";
      if (onConflict === "ignore") {
        conflictClause = " OR IGNORE";
      } else if (onConflict === "replace") {
        conflictClause = " OR REPLACE";
      }
      // abort is the default SQLite behavior (no clause needed)

      // Get column names from schema
      const columnNames = schema.columns.map((c) => c.name);

      // Execute import in a transaction
      let imported = 0;
      let skipped = 0;

      try {
        await execRun(ctx.db, "BEGIN TRANSACTION");

        for (const row of rows) {
          // Only use columns that exist in the schema
          const usedColumns: string[] = [];
          const values: string[] = [];

          for (const colName of columnNames) {
            if (colName in row) {
              usedColumns.push(colName);
              values.push(formatValueForSQL(row[colName]));
            }
          }

          if (usedColumns.length === 0) continue;

          const insertSQL = `INSERT${conflictClause} INTO "${ctx.table}" (${usedColumns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`;

          try {
            await execAll<Record<string, unknown>>(ctx.db, insertSQL);
            // For IGNORE, check if the row was actually inserted
            const changesResult = await execAll<{ changes: number }>(
              ctx.db,
              "SELECT changes() as changes",
            );
            const changes = changesResult[0]?.changes ?? 0;
            if (changes > 0) {
              imported++;
            } else {
              skipped++;
            }
          } catch (error) {
            if (onConflict === "abort") {
              // Rollback and re-throw
              await execRun(ctx.db, "ROLLBACK");
              return errorResult(
                SQLiteActionErrorCode.CONSTRAINT_VIOLATION,
                `Import aborted: ${error instanceof Error ? error.message : "constraint violation"}`,
              );
            }
            skipped++;
          }
        }

        await execRun(ctx.db, "COMMIT");

        return { success: true, data: { imported, skipped } };
      } catch (error) {
        try {
          await execRun(ctx.db, "ROLLBACK");
        } catch {
          // Ignore rollback errors
        }
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          `Import failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    },
  });

  // Vacuum action (root level)
  registry.register({
    name: "vacuum",
    description: "Compact the database file and reclaim unused space",
    rootLevel: true,
    tableLevel: false,
    rowLevel: false,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (ctx: ActionContext): Promise<ActionResult> => {
      // Get size before vacuum
      const pageCountBefore = await execAll<{ page_count: number }>(ctx.db, "PRAGMA page_count");
      const pageSizeResult = await execAll<{ page_size: number }>(ctx.db, "PRAGMA page_size");
      const pageSize = pageSizeResult[0]?.page_size ?? 4096;
      const sizeBefore = (pageCountBefore[0]?.page_count ?? 0) * pageSize;

      try {
        await execRun(ctx.db, "VACUUM");
      } catch (error) {
        return errorResult(
          SQLiteActionErrorCode.INVALID_INPUT,
          `Vacuum failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }

      // Get size after vacuum
      const pageCountAfter = await execAll<{ page_count: number }>(ctx.db, "PRAGMA page_count");
      const sizeAfter = (pageCountAfter[0]?.page_count ?? 0) * pageSize;

      return {
        success: true,
        data: { sizeBefore, sizeAfter, freedBytes: sizeBefore - sizeAfter },
      };
    },
  });
}

/**
 * Formats a value for SQL insertion
 */
function formatValueForSQL(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Parse a CSV string into an array of row objects.
 */
function parseCSV(
  data: string,
  delimiter: string,
  hasHeader: boolean,
  schema: TableSchema,
): Record<string, unknown>[] {
  const lines = data.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  let headers: string[];
  let startIndex: number;

  if (hasHeader) {
    if (lines.length < 1) return [];
    headers = parseCsvLine(lines[0]!, delimiter);
    startIndex = 1;
  } else {
    // Use column names from schema
    headers = schema.columns.map((c) => c.name);
    startIndex = 0;
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = startIndex; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!, delimiter);
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length && j < values.length; j++) {
      row[headers[j]!] = values[j];
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (line.substring(i, i + delimiter.length) === delimiter) {
        fields.push(current);
        current = "";
        i += delimiter.length;
      } else {
        current += char;
        i++;
      }
    }
  }

  fields.push(current);
  return fields;
}

/**
 * Maps SQLite column type to JSON Schema type
 */
function sqliteTypeToJsonSchema(sqliteType: string): {
  type: string;
  format?: string;
  description?: string;
} {
  const upperType = sqliteType.toUpperCase();

  if (upperType.includes("INT")) {
    return { type: "integer" };
  }
  if (upperType.includes("REAL") || upperType.includes("FLOAT") || upperType.includes("DOUBLE")) {
    return { type: "number" };
  }
  if (upperType.includes("BOOL")) {
    return { type: "boolean", description: "Stored as INTEGER (0/1)" };
  }
  if (upperType.includes("DATE") || upperType.includes("TIME")) {
    return { type: "string", format: "date-time" };
  }
  if (upperType.includes("BLOB")) {
    return { type: "string", format: "binary", description: "Base64 encoded binary data" };
  }
  // TEXT and everything else
  return { type: "string" };
}

/**
 * Generates JSON Schema for insert action based on table schema
 */
function generateInsertSchema(tableSchema: TableSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const col of tableSchema.columns) {
    // Skip auto-increment primary keys (they're auto-generated)
    const isPrimaryKeyAutoIncrement = col.pk > 0 && col.type.toUpperCase().includes("INTEGER");
    if (isPrimaryKeyAutoIncrement) {
      continue;
    }

    const typeInfo = sqliteTypeToJsonSchema(col.type);
    const propSchema: Record<string, unknown> = {
      ...typeInfo,
    };

    // Add default value info if present
    if (col.dfltValue !== null) {
      propSchema.default = col.dfltValue;
      propSchema.description =
        `${propSchema.description ?? ""}${propSchema.description ? ". " : ""}Default: ${col.dfltValue}`.trim();
    }

    // Track required fields (NOT NULL without default)
    if (col.notnull && col.dfltValue === null && col.pk === 0) {
      required.push(col.name);
    }

    properties[col.name] = propSchema;
  }

  return {
    type: "object",
    description: `Insert a new row into "${tableSchema.name}" table`,
    properties: {
      data: {
        type: "object",
        description: "Row data to insert",
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false,
      },
    },
    required: ["data"],
  };
}

/**
 * Generates JSON Schema for validate action based on table schema
 */
function generateValidateSchema(tableSchema: TableSchema): Record<string, unknown> {
  const columnInfo = tableSchema.columns.map((col) => ({
    name: col.name,
    type: col.type,
    nullable: !col.notnull,
    primaryKey: col.pk > 0,
  }));

  const foreignKeyInfo = tableSchema.foreignKeys.map((fk) => ({
    column: fk.from,
    references: `${fk.table}.${fk.to}`,
  }));

  return {
    type: "object",
    description: `Validate row data against "${tableSchema.name}" table constraints`,
    properties: {},
    additionalProperties: false,
    // Include schema info in metadata for documentation
    "x-table-schema": {
      columns: columnInfo,
      foreignKeys: foreignKeyInfo,
    },
  };
}

/**
 * Generates JSON Schema for duplicate action based on table schema
 */
function generateDuplicateSchema(tableSchema: TableSchema): Record<string, unknown> {
  const pkColumn = tableSchema.primaryKey[0] ?? "rowid";
  const copiedColumns = tableSchema.columns
    .filter((col) => col.name !== pkColumn)
    .map((col) => col.name);

  return {
    type: "object",
    description: `Create a copy of the row (excluding primary key "${pkColumn}")`,
    properties: {},
    additionalProperties: false,
    "x-copied-columns": copiedColumns,
  };
}

/**
 * Generates JSON Schema for update action based on table schema
 */
function generateUpdateSchema(tableSchema: TableSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const pkColumn = tableSchema.primaryKey[0] ?? "rowid";

  for (const col of tableSchema.columns) {
    // Skip primary key (can't update)
    if (col.name === pkColumn) {
      continue;
    }

    const typeInfo = sqliteTypeToJsonSchema(col.type);
    properties[col.name] = typeInfo;
  }

  return {
    type: "object",
    description: `Update fields in "${tableSchema.name}" table`,
    properties: {
      data: {
        type: "object",
        description: "Fields to update",
        properties,
        additionalProperties: false,
      },
    },
    required: ["data"],
  };
}
