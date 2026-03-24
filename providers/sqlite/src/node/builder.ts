import type { AFSEntry } from "@aigne/afs";
import type { TableSchema } from "../schema/types.js";

/**
 * Options for building an AFSEntry
 */
export interface BuildEntryOptions {
  /** Base path prefix (e.g., empty string or module mount path) */
  basePath?: string;
}

/**
 * Builds an AFSEntry from a database row
 */
export function buildRowEntry(
  table: string,
  schema: TableSchema,
  row: Record<string, unknown>,
  options?: BuildEntryOptions,
): AFSEntry {
  const pkColumn = schema.primaryKey[0] ?? "rowid";
  const pk = String(row[pkColumn] ?? row.rowid);
  const basePath = options?.basePath ?? "";

  return {
    id: `${table}:${pk}`,
    path: `${basePath}/${table}/${pk}`,
    content: row,
    meta: {
      kind: "sqlite:row",
      table,
      primaryKey: pkColumn,
      primaryKeyValue: pk,
    },
    createdAt: parseDate(row.created_at ?? row.createdAt),
    updatedAt: parseDate(row.updated_at ?? row.updatedAt),
  };
}

/**
 * Builds an AFSEntry for a table listing
 */
export function buildTableEntry(
  table: string,
  schema: TableSchema,
  options?: BuildEntryOptions & { rowCount?: number },
): AFSEntry {
  const basePath = options?.basePath ?? "";

  return {
    id: table,
    path: `${basePath}/${table}`,
    meta: {
      kind: "sqlite:table",
      description: `Table: ${table} (${schema.columns.length} columns)`,
      table,
      columnCount: schema.columns.length,
      primaryKey: schema.primaryKey,
      childrenCount: options?.rowCount || -1,
    },
  };
}

/**
 * Builds an AFSEntry for row metadata (using @meta suffix)
 */
export function buildMetaEntry(
  table: string,
  schema: TableSchema,
  pk: string,
  row: Record<string, unknown>,
  options?: BuildEntryOptions,
): AFSEntry {
  const basePath = options?.basePath ?? "";

  return {
    id: `${table}:${pk}:@meta`,
    path: `${basePath}/${table}/${pk}/@meta`,
    content: {
      table,
      primaryKey: schema.primaryKey[0] ?? "rowid",
      primaryKeyValue: pk,
      schema: {
        columns: schema.columns.map((c) => c.name),
        types: Object.fromEntries(schema.columns.map((c) => [c.name, c.type])),
      },
      foreignKeys: schema.foreignKeys.filter((fk) => Object.keys(row).includes(fk.from)),
      rowid: row.rowid,
    },
    meta: {
      table,
      type: "meta",
    },
  };
}

/**
 * Builds an AFSEntry for row metadata (using .meta suffix - conformance standard)
 */
export function buildRowDotMetaEntry(
  table: string,
  schema: TableSchema,
  pk: string,
  _row: Record<string, unknown>,
  options?: BuildEntryOptions,
): AFSEntry {
  const basePath = options?.basePath ?? "";

  return {
    id: `${table}:${pk}:.meta`,
    path: `${basePath}/${table}/${pk}/.meta`,
    meta: {
      table,
      primaryKey: schema.primaryKey[0] ?? "rowid",
      primaryKeyValue: pk,
      columnCount: schema.columns.length,
      columns: schema.columns.map((c) => c.name),
    },
  };
}

/**
 * Action definition with optional schema
 */
export interface ActionDefinitionInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Builds AFSEntry for row-level actions list
 */
export function buildActionsListEntry(
  table: string,
  pk: string,
  actions: ActionDefinitionInfo[],
  options?: BuildEntryOptions,
): AFSEntry[] {
  const basePath = options?.basePath ?? "";

  return actions.map((action) => ({
    id: `${table}:${pk}:.actions:${action.name}`,
    path: `${basePath}/${table}/${pk}/.actions/${action.name}`,
    summary: action.name,
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
      name: action.name,
      description: action.description ?? `Execute ${action.name} action on ${table}:${pk}`,
      inputSchema: action.inputSchema,
    },
  }));
}

/**
 * Builds AFSEntry for table-level actions list
 */
export function buildTableActionsListEntry(
  table: string,
  actions: ActionDefinitionInfo[],
  options?: BuildEntryOptions,
): AFSEntry[] {
  const basePath = options?.basePath ?? "";

  return actions.map((action) => ({
    id: `${table}:.actions:${action.name}`,
    path: `${basePath}/${table}/.actions/${action.name}`,
    summary: action.name,
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
      name: action.name,
      description: action.description ?? `Execute ${action.name} action on table ${table}`,
      inputSchema: action.inputSchema,
    },
  }));
}

/**
 * Builds AFSEntry for root-level actions list
 */
export function buildRootActionsListEntry(
  actions: ActionDefinitionInfo[],
  options?: BuildEntryOptions,
): AFSEntry[] {
  const basePath = options?.basePath ?? "";

  return actions.map((action) => ({
    id: `:actions:${action.name}`,
    path: `${basePath}/.actions/${action.name}`,
    summary: action.name,
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
      name: action.name,
      description: action.description ?? `Execute ${action.name} action`,
      inputSchema: action.inputSchema,
    },
  }));
}

/**
 * Builds a search result entry with highlights
 */
export function buildSearchEntry(
  table: string,
  schema: TableSchema,
  row: Record<string, unknown>,
  snippet?: string,
  options?: BuildEntryOptions,
): AFSEntry {
  const entry = buildRowEntry(table, schema, row, options);

  if (snippet) {
    entry.summary = snippet;
  }

  return entry;
}

/**
 * Builds an AFSEntry for the root (database)
 */
export function buildRootEntry(
  schemas: Map<string, TableSchema>,
  options?: BuildEntryOptions,
): AFSEntry {
  const basePath = options?.basePath ?? "";

  return {
    id: "root",
    path: basePath === "" ? "/" : basePath,
    meta: {
      kind: "sqlite:database",
      description: "SQLite database root",
      childrenCount: schemas.size,
      tableCount: schemas.size,
    },
  };
}

/**
 * Builds an AFSEntry for root metadata
 */
export function buildRootMetaEntry(
  schemas: Map<string, TableSchema>,
  options?: BuildEntryOptions,
): AFSEntry {
  const basePath = options?.basePath ?? "";

  return {
    id: "root:meta",
    path: `${basePath}/.meta`,
    meta: {
      description: "SQLite database metadata",
      tableCount: schemas.size,
      tables: Array.from(schemas.keys()),
    },
  };
}

/**
 * Builds an AFSEntry for table metadata (directory-level, not row-level)
 */
export function buildTableMetaEntry(
  table: string,
  schema: TableSchema,
  options?: BuildEntryOptions & { rowCount?: number },
): AFSEntry {
  const basePath = options?.basePath ?? "";

  return {
    id: `${table}:meta`,
    path: `${basePath}/${table}/.meta`,
    meta: {
      description: `Table metadata for: ${table}`,
      table,
      columnCount: schema.columns.length,
      primaryKey: schema.primaryKey,
      columns: schema.columns.map((c) => c.name),
      rowCount: options?.rowCount,
    },
  };
}

/**
 * Parses a date from various formats
 */
function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (typeof value === "number") return new Date(value);
  return undefined;
}
