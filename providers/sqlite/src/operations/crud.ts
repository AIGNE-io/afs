import {
  type AFSDeleteResult,
  type AFSEntry,
  type AFSListOptions,
  type AFSListResult,
  AFSNotFoundError,
  type AFSReadResult,
  type AFSWriteResult,
} from "@aigne/afs";
import { sql } from "drizzle-orm";
import type { SqliteDatabase } from "../database/init.js";
import {
  type BuildEntryOptions,
  buildMetaEntry,
  buildRowEntry,
  buildTableEntry,
} from "../node/builder.js";
import type { SchemaService } from "../schema/service.js";
import type { TableSchema } from "../schema/types.js";
import {
  buildDelete,
  buildGetLastRowId,
  buildInsert,
  buildSelectAll,
  buildSelectByPK,
  buildUpdate,
} from "./query-builder.js";

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
 * CRUD operations for SQLite AFS
 */
export class CRUDOperations {
  constructor(
    private db: SqliteDatabase,
    private schemaService: SchemaService,
    private basePath: string = "",
  ) {}

  /**
   * Lists all tables
   */
  async listTables(): Promise<AFSListResult> {
    const entries: AFSEntry[] = [];
    const buildOptions: BuildEntryOptions = { basePath: this.basePath };

    const schemas = await this.schemaService.getAllSchemas();
    for (const [name, schema] of schemas) {
      // Get row count for each table
      const countResult = await execAll<{ count: number }>(
        this.db,
        `SELECT COUNT(*) as count FROM "${name}"`,
      );
      const rowCount = countResult[0]?.count ?? 0;

      entries.push(buildTableEntry(name, schema, { ...buildOptions, rowCount }));
    }

    return { data: entries };
  }

  /**
   * Lists rows in a table
   */
  async listTable(table: string, options?: AFSListOptions): Promise<AFSListResult> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    const buildOptions: BuildEntryOptions = { basePath: this.basePath };

    const queryStr = buildSelectAll(table, {
      limit: options?.limit ?? 100,
      orderBy: options?.orderBy,
    });

    const rows = await execAll<Record<string, unknown>>(this.db, queryStr);

    const entries = rows.map((row) => buildRowEntry(table, schema, row, buildOptions));

    return { data: entries };
  }

  /**
   * Reads a single row by primary key
   */
  async readRow(table: string, pk: string): Promise<AFSReadResult> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    const buildOptions: BuildEntryOptions = { basePath: this.basePath };

    const rows = await execAll<Record<string, unknown>>(
      this.db,
      buildSelectByPK(table, schema, pk),
    );

    const row = rows[0];
    if (!row) {
      throw new AFSNotFoundError(`/${table}/${pk}`);
    }

    return { data: buildRowEntry(table, schema, row, buildOptions) };
  }

  /**
   * Gets row metadata
   */
  async getMeta(table: string, pk: string): Promise<AFSReadResult> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    const buildOptions: BuildEntryOptions = { basePath: this.basePath };

    const rows = await execAll<Record<string, unknown>>(
      this.db,
      buildSelectByPK(table, schema, pk),
    );

    const row = rows[0];
    if (!row) {
      throw new AFSNotFoundError(`/${table}/${pk}/@meta`);
    }

    return { data: buildMetaEntry(table, schema, pk, row, buildOptions) };
  }

  /**
   * Creates a new row in a table
   */
  async createRow(table: string, content: Record<string, unknown>): Promise<AFSWriteResult> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    const buildOptions: BuildEntryOptions = { basePath: this.basePath };

    // Insert the row
    await execRun(this.db, buildInsert(table, schema, content));

    // Get the last inserted rowid
    const lastIdResult = await execAll<{ id: number }>(this.db, buildGetLastRowId());
    const lastId = lastIdResult[0]?.id;

    if (lastId === undefined) {
      throw new Error("Failed to get last inserted row ID");
    }

    // Fetch the inserted row
    const pkColumn = schema.primaryKey[0] ?? "rowid";
    const pk = content[pkColumn] !== undefined ? String(content[pkColumn]) : String(lastId);

    const rows = await execAll<Record<string, unknown>>(
      this.db,
      buildSelectByPK(table, schema, pk),
    );

    const row = rows[0];
    if (!row) {
      throw new Error("Failed to fetch inserted row");
    }

    return { data: buildRowEntry(table, schema, row, buildOptions) };
  }

  /**
   * Updates an existing row
   */
  async updateRow(
    table: string,
    pk: string,
    content: Record<string, unknown>,
  ): Promise<AFSWriteResult> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    const buildOptions: BuildEntryOptions = { basePath: this.basePath };

    // Update the row
    await execRun(this.db, buildUpdate(table, schema, pk, content));

    // Fetch the updated row
    const rows = await execAll<Record<string, unknown>>(
      this.db,
      buildSelectByPK(table, schema, pk),
    );

    const row = rows[0];
    if (!row) {
      throw new Error(`Row with pk '${pk}' not found after update`);
    }

    return { data: buildRowEntry(table, schema, row, buildOptions) };
  }

  /**
   * Deletes a row by primary key
   */
  async deleteRow(table: string, pk: string): Promise<AFSDeleteResult> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    // Check if row exists first
    const existing = await execAll<Record<string, unknown>>(
      this.db,
      buildSelectByPK(table, schema, pk),
    );

    if (existing.length === 0) {
      throw new AFSNotFoundError(`/${table}/${pk}`);
    }

    // Delete the row
    await execRun(this.db, buildDelete(table, schema, pk));

    return { message: `Deleted row '${pk}' from table '${table}'` };
  }

  /**
   * Checks if a table exists
   */
  async hasTable(table: string): Promise<boolean> {
    return this.schemaService.hasTable(table);
  }

  /**
   * Gets the schema for a table
   */
  async getTableSchema(table: string): Promise<TableSchema | undefined> {
    return this.schemaService.getSchema(table);
  }
}
