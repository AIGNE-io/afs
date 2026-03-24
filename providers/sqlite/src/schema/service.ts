import { sql } from "drizzle-orm";
import type { SqliteDatabase } from "../database/init.js";
import { SchemaIntrospector } from "./introspector.js";
import { SYSTEM_TABLES, type TableSchema } from "./types.js";

/**
 * Executes a raw SQL query and returns all rows
 */
async function execAll<T>(db: SqliteDatabase, query: string): Promise<T[]> {
  return db.all<T>(sql.raw(query)).execute();
}

/**
 * Options for schema service
 */
export interface SchemaServiceOptions {
  /** Whitelist of tables to include */
  tables?: string[];
  /** Tables to exclude */
  excludeTables?: string[];
}

/**
 * Schema service that queries schema on-demand (no caching)
 *
 * SQLite PRAGMA queries are extremely fast, so real-time queries
 * are preferred over caching to avoid staleness issues.
 */
export class SchemaService {
  private introspector = new SchemaIntrospector();

  constructor(
    private db: SqliteDatabase,
    private options?: SchemaServiceOptions,
  ) {}

  /**
   * Gets schema for a specific table (real-time query)
   */
  async getSchema(tableName: string): Promise<TableSchema | undefined> {
    // Guard against undefined/null
    if (!tableName) {
      return undefined;
    }

    // Skip system tables
    if (SYSTEM_TABLES.includes(tableName as (typeof SYSTEM_TABLES)[number])) {
      return undefined;
    }

    // Apply whitelist filter
    if (this.options?.tables && !this.options.tables.includes(tableName)) {
      return undefined;
    }

    // Apply exclude filter
    if (this.options?.excludeTables?.includes(tableName)) {
      return undefined;
    }

    // Check if table exists
    const exists = await this.hasTable(tableName);
    if (!exists) {
      return undefined;
    }

    return this.introspector.introspectTable(this.db, tableName);
  }

  /**
   * Checks if a table exists (real-time query)
   */
  async hasTable(tableName: string): Promise<boolean> {
    // Guard against undefined/null
    if (!tableName) {
      return false;
    }

    // Skip system tables
    if (SYSTEM_TABLES.includes(tableName as (typeof SYSTEM_TABLES)[number])) {
      return false;
    }

    // Apply whitelist filter
    if (this.options?.tables && !this.options.tables.includes(tableName)) {
      return false;
    }

    // Apply exclude filter
    if (this.options?.excludeTables?.includes(tableName)) {
      return false;
    }

    const result = await execAll<{ count: number }>(
      this.db,
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = '${tableName.replace(/'/g, "''")}'`,
    );
    return (result[0]?.count ?? 0) > 0;
  }

  /**
   * Gets all table schemas (real-time query)
   */
  async getAllSchemas(): Promise<Map<string, TableSchema>> {
    return this.introspector.introspect(this.db, {
      tables: this.options?.tables,
      excludeTables: this.options?.excludeTables,
    });
  }

  /**
   * Lists all table names (real-time query)
   */
  async listTableNames(): Promise<string[]> {
    const result = await execAll<{ name: string }>(
      this.db,
      `
      SELECT name FROM sqlite_master
      WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '%_fts%'
      ORDER BY name
    `,
    );

    return result
      .map((r) => r.name)
      .filter((name) => {
        // Skip system tables
        if (SYSTEM_TABLES.includes(name as (typeof SYSTEM_TABLES)[number])) {
          return false;
        }
        // Apply whitelist filter
        if (this.options?.tables && !this.options.tables.includes(name)) {
          return false;
        }
        // Apply exclude filter
        if (this.options?.excludeTables?.includes(name)) {
          return false;
        }
        return true;
      });
  }

  /**
   * Gets the count of tables
   */
  async getTableCount(): Promise<number> {
    const names = await this.listTableNames();
    return names.length;
  }

  /**
   * Gets the primary key column name for a table
   */
  getPrimaryKeyColumn(schema: TableSchema): string {
    return this.introspector.getPrimaryKeyColumn(schema);
  }
}
