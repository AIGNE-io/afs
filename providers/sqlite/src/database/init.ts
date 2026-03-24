/**
 * Database initialization for SQLite.
 *
 * Supports two backends:
 * - **libsql** (default): Local files, :memory:, or Turso remote via URL string
 * - **D1**: Cloudflare Workers D1 binding (pass D1Database object)
 */

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { withRetry } from "./retry.js";

/**
 * Unified database type that works across libsql and D1 backends.
 * All internal code uses this type instead of backend-specific types.
 */
export type SqliteDatabase = BaseSQLiteDatabase<"async", any>;

export interface InitDatabaseOptions {
  url?: string;
  /** Cloudflare D1 database binding (Workers environment) */
  d1?: unknown;
  wal?: boolean;
  walAutocheckpoint?: number;
}

export type Database = SqliteDatabase & { clean?: () => Promise<void> };

export async function initDatabase(options?: InitDatabaseOptions): Promise<Database> {
  const { url = ":memory:", d1, wal = false, walAutocheckpoint = 5000 } = options ?? {};

  // D1 backend (Cloudflare Workers)
  if (d1) {
    const { drizzle } = await import("drizzle-orm/d1");
    const db = drizzle(d1 as Parameters<typeof drizzle>[0]);
    return db as unknown as Database;
  }

  // libsql backend (Node.js / Bun)
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");

  let db: SqliteDatabase;
  let client: ReturnType<typeof createClient> | undefined;

  if (/^file:.*/.test(url)) {
    await mkdir(dirname(url.replace(/^file:(\/\/)?/, "")), { recursive: true });
  }

  if (wal) {
    client = createClient({ url });
    await client.execute(`\
PRAGMA journal_mode = WAL;
PRAGMA synchronous = normal;
PRAGMA wal_autocheckpoint = ${walAutocheckpoint};
PRAGMA busy_timeout = 5000;
`);
    db = drizzle(client);
  } else {
    db = drizzle(url);
  }

  // Wrap session methods with SQLITE_BUSY retry logic
  if ("session" in db && db.session && typeof db.session === "object") {
    (db as any).session = withRetry(
      db.session as object,
      ["all", "get", "run", "values", "count"] as any,
    );
  }

  // Add clean method for WAL maintenance
  (db as Database).clean = async () => {
    if (wal && client && typeof client.execute === "function") {
      await client.execute("PRAGMA auto_vacuum = FULL;");
      await client.execute("VACUUM;");
      await client.execute("PRAGMA wal_checkpoint(TRUNCATE);");
      await client.execute("VACUUM;");
    }
  };

  return db as Database;
}
