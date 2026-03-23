/**
 * DO SQLite adapter — bridges Cloudflare Durable Object SqlStorage to drizzle SqliteDatabase.
 *
 * DO SQLite API:  ctx.storage.sql.exec(query, ...bindings) → SqlStorageCursor
 * drizzle-orm:    sqlite-proxy callback(sql, params, method) → { rows: any[] }
 *
 * Usage:
 *   const db = await createDoSqliteDatabase(ctx.storage.sql);
 *   const store = await SomeStore.create(db);
 */
import type { SqliteDatabase } from "./database/init.js";

/**
 * Minimal interface matching Cloudflare DO's ctx.storage.sql (SqlStorage).
 * Also works with bun:sqlite-based mocks for testing.
 */
export interface DoSqlStorage {
  exec<T = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): {
    toArray(): T[];
    one(): T;
    columnNames: string[];
  };
}

/**
 * Creates a drizzle SqliteDatabase from a DO SqlStorage instance.
 * Uses drizzle-orm/sqlite-proxy as the bridge.
 */
export async function createDoSqliteDatabase(sqlStorage: DoSqlStorage): Promise<SqliteDatabase> {
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");

  const callback = async (
    query: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get",
  ): Promise<{ rows: any[] }> => {
    const cursor = sqlStorage.exec(query, ...params);

    switch (method) {
      case "all":
        return { rows: cursor.toArray() };
      case "get": {
        const rows = cursor.toArray();
        return { rows: rows.length > 0 ? [rows[0]] : [] };
      }
      case "run":
        cursor.toArray(); // execute side effects
        return { rows: [] };
      case "values": {
        const rows = cursor.toArray();
        return { rows: rows.map((r: any) => Object.values(r)) };
      }
      default:
        return { rows: [] };
    }
  };

  return drizzle(callback) as unknown as SqliteDatabase;
}
