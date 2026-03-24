// Main module export

export type { SQL } from "drizzle-orm";
// Re-export drizzle-orm sql utilities for consumers
export { sql } from "drizzle-orm";
export { registerBuiltInActions } from "./actions/built-in.js";
// Actions
export { ActionsRegistry } from "./actions/registry.js";
export type {
  ActionContext,
  ActionDefinition,
  ActionHandler,
  ActionResult,
  SchemaGeneratorContext,
} from "./actions/types.js";
// Configuration
export {
  type SQLiteAFSConfig,
  type SQLiteAFSOptions,
  sqliteAFSConfigSchema,
} from "./config.js";
// Database initialization
export {
  type Database,
  type InitDatabaseOptions,
  initDatabase,
  type SqliteDatabase,
} from "./database/init.js";
// DO SQLite adapter (bridges Cloudflare Durable Object SqlStorage to drizzle)
export { createDoSqliteDatabase, type DoSqlStorage } from "./do-adapter.js";
// Node builder
export {
  type BuildEntryOptions,
  buildActionsListEntry,
  buildMetaEntry,
  buildRowEntry,
  buildSearchEntry,
  buildTableEntry,
} from "./node/builder.js";
// Operations
export { CRUDOperations } from "./operations/crud.js";
export {
  buildDelete,
  buildGetLastRowId,
  buildInsert,
  buildSelectAll,
  buildSelectByPK,
  buildUpdate,
} from "./operations/query-builder.js";
export {
  createFTSConfig,
  type FTSConfig,
  FTSSearch,
  type FTSTableConfig,
} from "./operations/search.js";
// Router
export {
  buildPath,
  createPathRouter,
  getVirtualPathType,
  isVirtualPath,
  matchPath,
} from "./router/path-router.js";
export type {
  RouteAction,
  RouteData,
  RouteMatch,
  RouteParams,
} from "./router/types.js";
// Schema types, introspector, and service
export { SchemaIntrospector } from "./schema/introspector.js";
export { SchemaService, type SchemaServiceOptions } from "./schema/service.js";
export type {
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  PragmaForeignKeyRow,
  PragmaIndexListRow,
  PragmaTableInfoRow,
  TableSchema,
} from "./schema/types.js";
export { SQLiteAFS, SQLiteAFS as default } from "./sqlite-afs.js";
