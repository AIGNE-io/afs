import { type AFSAccessMode, accessModeSchema } from "@aigne/afs";
import { z } from "zod";

/**
 * FTS (Full-Text Search) configuration schema
 */
export const ftsConfigSchema = z
  .object({
    enabled: z.boolean().default(true).describe("Whether FTS is enabled"),
    tables: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .describe("Map of table name to columns to index for FTS"),
  })
  .optional();

/**
 * SQLite AFS module configuration schema
 */
export const sqliteAFSConfigSchema = z.object({
  url: z.string().optional().describe("SQLite database URL (file:./path or :memory:)"),
  d1: z.unknown().optional().describe("Cloudflare D1 database binding (Workers environment)"),
  name: z.string().optional().describe("Module name, defaults to 'sqlite-afs'"),
  description: z.string().optional().describe("Description of this module"),
  accessMode: accessModeSchema,
  tables: z
    .array(z.string())
    .optional()
    .describe("Whitelist of tables to expose (if not specified, all tables are exposed)"),
  excludeTables: z.array(z.string()).optional().describe("Tables to exclude from exposure"),
  fts: ftsConfigSchema,
  wal: z.boolean().optional().default(true).describe("Enable WAL mode for better concurrency"),
});

/**
 * SQLite AFS module configuration type
 */
export type SQLiteAFSConfig = z.infer<typeof sqliteAFSConfigSchema>;

/**
 * SQLite AFS module options (after parsing)
 */
export interface SQLiteAFSOptions {
  /** SQLite database URL (required unless d1 or db is provided) */
  url?: string;
  /** Cloudflare D1 database binding (Workers environment) */
  d1?: unknown;
  /** Pre-created drizzle SqliteDatabase (e.g. from createDoSqliteDatabase) */
  db?: import("./database/init.js").SqliteDatabase;
  /** Module name */
  name?: string;
  /** Module description */
  description?: string;
  /** Access mode */
  accessMode?: AFSAccessMode;
  /** Tables to expose */
  tables?: string[];
  /** Tables to exclude */
  excludeTables?: string[];
  /** FTS configuration */
  fts?: {
    enabled?: boolean;
    tables?: Record<string, string[]>;
  };
  /** Enable WAL mode */
  wal?: boolean;
}
