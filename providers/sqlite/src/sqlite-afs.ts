import type { AFSExplainOptions, AFSExplainResult, AFSStatResult } from "@aigne/afs";
import {
  type ActionCatalog,
  type ActionDefinition,
  type AFSAccessMode,
  type AFSDeleteResult,
  type AFSEntry,
  type AFSListResult,
  type AFSModuleClass,
  type AFSModuleLoadParams,
  AFSNotFoundError,
  type AFSSearchOptions,
  type AFSWriteEntryPayload,
  type CapabilitiesManifest,
  type ProviderManifest,
  type ProviderTreeSchema,
} from "@aigne/afs";
import {
  Actions,
  AFSBaseProvider,
  Delete,
  Explain,
  List,
  Meta,
  Read,
  type RouteContext,
  Search,
  Stat,
  Write,
} from "@aigne/afs/provider";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { registerBuiltInActions } from "./actions/built-in.js";
import { ActionsRegistry } from "./actions/registry.js";
import type { ActionContext } from "./actions/types.js";
import { type SQLiteAFSOptions, sqliteAFSConfigSchema } from "./config.js";
import type { SqliteDatabase } from "./database/init.js";
import { initDatabase } from "./database/init.js";
import {
  buildActionsListEntry,
  buildRootActionsListEntry,
  buildRootEntry,
  buildTableActionsListEntry,
  buildTableEntry,
} from "./node/builder.js";
import { CRUDOperations } from "./operations/crud.js";
import { createFTSConfig, type FTSConfig, FTSSearch } from "./operations/search.js";
import { SchemaService } from "./schema/service.js";
import type { TableSchema } from "./schema/types.js";

/**
 * SQLite AFS Module
 *
 * Exposes SQLite databases as AFS nodes with full CRUD support,
 * schema introspection, FTS5 search, and virtual paths (.meta, .actions).
 */
export class SQLiteAFS extends AFSBaseProvider {
  override readonly name: string;
  override readonly description?: string;
  override readonly accessMode: AFSAccessMode;

  private db!: Awaited<ReturnType<typeof initDatabase>>;
  private schemaService!: SchemaService;
  private crud!: CRUDOperations;
  private ftsSearch!: FTSSearch;
  private actions: ActionsRegistry;
  private ftsConfig: FTSConfig;
  private initialized = false;

  constructor(private options: SQLiteAFSOptions & { localPath?: string; uri?: string }) {
    super();

    // Normalize registry-passed template vars: localPath → url
    if ((options as any).localPath && !options.url) {
      options.url = `file:${(options as any).localPath}`;
    }

    this.name = options.name ?? "sqlite-afs";
    this.description = options.description ?? `SQLite database: ${options.url}`;
    this.accessMode = options.accessMode ?? "readwrite";
    this.ftsConfig = createFTSConfig(options.fts);
    this.actions = new ActionsRegistry();
    registerBuiltInActions(this.actions);
  }

  /**
   * Auto-create the database file if it doesn't exist (deferred from constructor).
   */
  async ready(): Promise<void> {
    const url = this.options.url;
    if (url?.startsWith("file:")) {
      const { existsSync, mkdirSync, writeFileSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      const dbPath = url.slice(5); // strip "file:"
      if (!existsSync(dbPath)) {
        mkdirSync(dirname(dbPath), { recursive: true });
        writeFileSync(dbPath, "");
      }
    }
  }

  /**
   * Returns the Zod schema for configuration validation
   */
  static schema() {
    return sqliteAFSConfigSchema;
  }

  static manifest(): ProviderManifest {
    return {
      name: "sqlite",
      description:
        "SQLite database — tables as directories, rows as nodes.\n- Browse tables and rows, full-text search (FTS5), schema introspection\n- Exec actions: `insert`, `update`, `delete` at table/row level, custom SQL\n- Path structure: `/{table}/{primary-key}`",
      uriTemplate: "sqlite://{localPath+}",
      category: "database",
      schema: z.object({ localPath: z.string() }),
      tags: ["sqlite", "database"],
      capabilityTags: [
        "read-write",
        "crud",
        "search",
        "query",
        "sql",
        "destructive",
        "auth:none",
        "local",
      ],
      security: {
        riskLevel: "local",
        resourceAccess: ["local-filesystem"],
        requires: ["sqlite"],
      },
      capabilities: {
        filesystem: { read: true, write: true },
      },
    };
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "delete", "search", "exec", "stat", "explain"],
      tree: {
        "/": {
          kind: "database:root",
          actions: ["create_table", "drop_table", "rename_table", "pragma"],
          destructive: ["drop_table"],
        },
        "/{table}": {
          kind: "database:table",
          actions: [
            "insert",
            "query",
            "export",
            "count",
            "update_where",
            "delete_where",
            "bulk_insert",
            "add_column",
            "rename_column",
            "drop_column",
            "create_index",
            "drop_index",
          ],
          destructive: ["delete_where"],
        },
        "/{table}/{pk}": {
          kind: "database:row",
          actions: ["update", "delete", "duplicate", "validate"],
          destructive: ["delete"],
        },
      },
      auth: { type: "none" },
      bestFor: ["structured data", "SQL queries", "local databases"],
      notFor: ["large-scale data", "concurrent writes"],
    };
  }

  /**
   * Loads a module instance from configuration
   */
  static async load({ config }: AFSModuleLoadParams = {}): Promise<SQLiteAFS> {
    const validated = sqliteAFSConfigSchema.parse(config);
    return new SQLiteAFS(validated);
  }

  /**
   * Initializes the database connection and schema service
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize database connection — use injected db if provided
    if (this.options.db) {
      this.db = this.options.db;
    } else {
      this.db = await initDatabase({
        url: this.options.url ?? ":memory:",
        d1: this.options.d1,
        wal: this.options.d1 ? false : (this.options.wal ?? true),
      });
    }

    const db = this.db;

    // Initialize schema service (queries on-demand, no caching)
    this.schemaService = new SchemaService(db, {
      tables: this.options.tables,
      excludeTables: this.options.excludeTables,
    });

    // Initialize components
    this.crud = new CRUDOperations(db, this.schemaService, "");
    this.ftsSearch = new FTSSearch(db, this.schemaService, this.ftsConfig, "");

    this.initialized = true;
  }

  /**
   * Ensures the module is initialized.
   * This is called automatically by handlers, but can also be called
   * manually to trigger initialization (e.g., in tests).
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ========== List Handlers ==========

  /**
   * List all tables
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/")
  async listTablesHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureInitialized();
    const result = await this.crud.listTables();
    return { data: result.data };
  }

  /**
   * List rows in a table
   * Note: list() returns only children (rows), never the table itself (per new semantics)
   */
  @List("/:table")
  async listTableHandler(ctx: RouteContext<{ table: string }>): Promise<AFSListResult> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    const result = await this.crud.listTable(ctx.params.table, ctx.options);
    return { data: result.data };
  }

  /**
   * List a row - rows are leaf nodes with no children
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/:table/:pk")
  async listRowHandler(ctx: RouteContext<{ table: string; pk: string }>): Promise<AFSListResult> {
    await this.ensureInitialized();
    // Verify the row exists
    const result = await this.crud.readRow(ctx.params.table, ctx.params.pk);
    if (!result.data) {
      throw new AFSNotFoundError(`/${ctx.params.table}/${ctx.params.pk}`);
    }
    // Rows are leaf nodes - they have no children
    return { data: [] };
  }

  /**
   * List actions for a row
   */
  @Actions("/:table/:pk")
  async listActionsHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<AFSListResult> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Pass schema context for dynamic input schema generation
    const actions = this.actions.listWithInfo(
      { rowLevel: true },
      {
        tableSchema: schema,
        tableName: ctx.params.table,
        schemaService: this.schemaService,
      },
    );
    return {
      data: buildActionsListEntry(ctx.params.table, ctx.params.pk, actions, { basePath: "" }),
    };
  }

  /**
   * List actions for a table (table-level actions)
   */
  @Actions("/:table")
  async listTableActionsHandler(ctx: RouteContext<{ table: string }>): Promise<AFSListResult> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Pass schema context for dynamic input schema generation
    const actions = this.actions.listWithInfo(
      { tableLevel: true },
      {
        tableSchema: schema,
        tableName: ctx.params.table,
        schemaService: this.schemaService,
      },
    );
    return {
      data: buildTableActionsListEntry(ctx.params.table, actions, { basePath: "" }),
    };
  }

  /**
   * List actions at root level (database-level actions)
   */
  @Actions("/")
  async listRootActionsHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureInitialized();
    // Get root-level actions (those that operate on the database itself)
    // Pass schema context for any actions that might need it
    const actions = this.actions.listWithInfo(
      { rootLevel: true },
      {
        schemaService: this.schemaService,
      },
    );
    return {
      data: buildRootActionsListEntry(actions, { basePath: "" }),
    };
  }

  // ========== Read Handlers ==========

  /**
   * Read root (database) entry
   */
  @Read("/")
  async readRootHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();
    const schemas = await this.schemaService.getAllSchemas();
    return buildRootEntry(schemas, { basePath: "" });
  }

  /**
   * Read root metadata (database-level schema information)
   */
  @Meta("/")
  async readRootMetaHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();

    const schemas = await this.schemaService.getAllSchemas();

    // Build comprehensive database metadata (sorted by name for deterministic order)
    const tables = Array.from(schemas.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, schema]) => ({
        name,
        description: `Table with ${schema.columns.length} columns`,
        columnCount: schema.columns.length,
        primaryKey: schema.primaryKey,
      }));

    return {
      id: "root:.meta",
      path: "/.meta",
      content: {
        type: "sqlite",
        tableCount: schemas.size,
        tables,
      },
      meta: {
        childrenCount: tables.length,
        tables: tables.map((t) => t.name),
      },
    };
  }

  /**
   * Read capabilities manifest
   * Returns information about available actions at different levels
   */
  @Read("/.meta/.capabilities")
  async readCapabilitiesHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();

    // Build action catalogs for each level
    const actionCatalogs: ActionCatalog[] = [];

    // Root-level actions (database operations)
    const rootActions = this.actions.listWithInfo(
      { rootLevel: true },
      { schemaService: this.schemaService },
    );
    if (rootActions.length > 0) {
      actionCatalogs.push({
        kind: "sqlite:root",
        description: "Database-level operations",
        catalog: rootActions.map(
          (a): ActionDefinition => ({
            name: a.name,
            description: a.description,
            inputSchema: a.inputSchema,
          }),
        ),
        discovery: {
          pathTemplate: "/.actions",
          note: "Available at database root",
        },
      });
    }

    // Table-level actions
    const tableActions = this.actions.listWithInfo(
      { tableLevel: true },
      { schemaService: this.schemaService },
    );
    if (tableActions.length > 0) {
      actionCatalogs.push({
        kind: "sqlite:table",
        description: "Table-level operations",
        catalog: tableActions.map(
          (a): ActionDefinition => ({
            name: a.name,
            description: a.description,
            inputSchema: a.inputSchema,
          }),
        ),
        discovery: {
          pathTemplate: "/:table/.actions",
          note: "Replace :table with actual table name",
        },
      });
    }

    // Row-level actions
    const rowActions = this.actions.listWithInfo(
      { rowLevel: true },
      { schemaService: this.schemaService },
    );
    if (rowActions.length > 0) {
      actionCatalogs.push({
        kind: "sqlite:row",
        description: "Row-level operations",
        catalog: rowActions.map(
          (a): ActionDefinition => ({
            name: a.name,
            description: a.description,
            inputSchema: a.inputSchema,
          }),
        ),
        discovery: {
          pathTemplate: "/:table/:pk/.actions",
          note: "Replace :table with table name, :pk with primary key value",
        },
      });
    }

    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: this.name,
      version: "1.0.0",
      description: this.description,
      tools: [], // SQLite has no global tools, only node-level actions
      actions: actionCatalogs,
      operations: this.getOperationsDeclaration(),
    };

    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: manifest,
      meta: { kind: "afs:capabilities" },
    };
  }

  /**
   * Read table (directory) entry
   */
  @Read("/:table")
  async readTableHandler(ctx: RouteContext<{ table: string }>): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Get row count
    const countResult = await this.db.all<{ count: number }>(
      sql.raw(`SELECT COUNT(*) as count FROM "${ctx.params.table}"`),
    );
    const rowCount = countResult[0]?.count ?? 0;

    return buildTableEntry(ctx.params.table, schema, { basePath: "", rowCount });
  }

  /**
   * Read table metadata (table-level schema information)
   */
  @Meta("/:table")
  async readTableMetaHandler(ctx: RouteContext<{ table: string }>): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Get row count
    const countResult = await this.db.all<{ count: number }>(
      sql.raw(`SELECT COUNT(*) as count FROM "${ctx.params.table}"`),
    );
    const rowCount = countResult[0]?.count ?? 0;

    // Build column metadata
    const columns = schema.columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: !col.notnull,
      primaryKey: col.pk > 0,
      defaultValue: col.dfltValue,
    }));

    // Build comprehensive table schema metadata
    return {
      id: `${ctx.params.table}:.meta`,
      path: `/${ctx.params.table}/.meta`,
      content: {
        table: ctx.params.table,
        columns,
        primaryKey: schema.primaryKey,
        foreignKeys: schema.foreignKeys.map((fk) => ({
          column: fk.from,
          referencesTable: fk.table,
          referencesColumn: fk.to,
          onUpdate: fk.onUpdate,
          onDelete: fk.onDelete,
        })),
        indexes: schema.indexes.map((idx) => ({
          name: idx.name,
          unique: idx.unique,
          origin: idx.origin,
        })),
        rowCount,
      },
      meta: {
        table: ctx.params.table,
        description: `Table "${ctx.params.table}" with ${columns.length} columns`,
        childrenCount: rowCount,
        columnCount: columns.length,
        columns: columns.map((c) => c.name),
        primaryKey: schema.primaryKey,
      },
    };
  }

  /**
   * Read a row
   */
  @Read("/:table/:pk")
  async readRowHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();
    const result = await this.crud.readRow(ctx.params.table, ctx.params.pk);
    return result.data;
  }

  /**
   * Get row metadata (@meta suffix - SQLite-specific)
   */
  @Read("/:table/:pk/@meta")
  async getMetaHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();
    const result = await this.crud.getMeta(ctx.params.table, ctx.params.pk);
    return result.data;
  }

  /**
   * Get row metadata (.meta suffix - row-level schema information)
   */
  @Meta("/:table/:pk")
  async getRowDotMetaHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    const result = await this.crud.readRow(ctx.params.table, ctx.params.pk);
    if (!result.data) {
      throw new AFSNotFoundError(`/${ctx.params.table}/${ctx.params.pk}`);
    }

    const pkColumn = schema.primaryKey[0] ?? "rowid";

    // Build row-level schema metadata
    return {
      id: `${ctx.params.table}:${ctx.params.pk}:.meta`,
      path: `/${ctx.params.table}/${ctx.params.pk}/.meta`,
      content: {
        table: ctx.params.table,
        primaryKey: pkColumn,
        primaryKeyValue: ctx.params.pk,
        columns: schema.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: !col.notnull,
          primaryKey: col.pk > 0,
        })),
        foreignKeys: schema.foreignKeys.map((fk) => ({
          column: fk.from,
          referencesTable: fk.table,
          referencesColumn: fk.to,
        })),
      },
      meta: {
        table: ctx.params.table,
        primaryKeyValue: ctx.params.pk,
        columns: schema.columns.map((col) => col.name),
      },
    };
  }

  // ========== Write Handlers ==========

  /**
   * Create a new row
   */
  @Write("/:table/new")
  async createRowHandler(
    ctx: RouteContext<{ table: string }>,
    content: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ensureInitialized();
    return this.crud.createRow(ctx.params.table, content.content ?? content);
  }

  /**
   * Update an existing row
   */
  @Write("/:table/:pk")
  async updateRowHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
    content: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ensureInitialized();
    return this.crud.updateRow(ctx.params.table, ctx.params.pk, content.content ?? content);
  }

  /**
   * Execute action via write (for triggering row-level actions)
   */
  @Write("/:table/:pk/.actions/:action")
  async executeActionWriteHandler(
    ctx: RouteContext<{ table: string; pk: string; action: string }>,
    content: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ensureInitialized();
    return this.executeAction(
      ctx.params.table,
      ctx.params.pk,
      ctx.params.action,
      (content.content ?? content) as Record<string, unknown>,
    );
  }

  /**
   * Execute action via write (for triggering table-level actions)
   */
  @Write("/:table/.actions/:action")
  async executeTableActionWriteHandler(
    ctx: RouteContext<{ table: string; action: string }>,
    content: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ensureInitialized();
    return this.executeAction(
      ctx.params.table,
      undefined, // No pk for table-level action
      ctx.params.action,
      (content.content ?? content) as Record<string, unknown>,
    );
  }

  /**
   * Execute action via write (for triggering root-level actions)
   */
  @Write("/.actions/:action")
  async executeRootActionWriteHandler(
    ctx: RouteContext<{ action: string }>,
    content: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ensureInitialized();
    return this.executeRootAction(
      ctx.params.action,
      (content.content ?? content) as Record<string, unknown>,
    );
  }

  // ========== Delete Handlers ==========

  /**
   * Delete a table entry (not supported - always throws)
   */
  @Delete("/:table")
  async deleteTableHandler(ctx: RouteContext<{ table: string }>): Promise<AFSDeleteResult> {
    await this.ensureInitialized();
    // Check if table exists, then throw appropriate error
    const exists = await this.schemaService.hasTable(ctx.params.table);
    if (!exists) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }
    // Tables can't be deleted through AFS - throw error
    throw new Error(`Cannot delete table '${ctx.params.table}'. Use SQL directly to drop tables.`);
  }

  /**
   * Delete a row
   */
  @Delete("/:table/:pk")
  async deleteRowHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<AFSDeleteResult> {
    await this.ensureInitialized();
    return this.crud.deleteRow(ctx.params.table, ctx.params.pk);
  }

  // ========== Search Handlers ==========

  /**
   * Search all tables
   */
  @Search("/")
  async searchAllHandler(
    _ctx: RouteContext,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    await this.ensureInitialized();
    return this.ftsSearch.search(query, options);
  }

  /**
   * Search a specific table
   */
  @Search("/:table")
  async searchTableHandler(
    ctx: RouteContext<{ table: string }>,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    await this.ensureInitialized();
    return this.ftsSearch.searchTable(ctx.params.table, query, options);
  }

  // ========== Stat Handlers ==========

  /**
   * Get stat for root (database level)
   */
  @Stat("/")
  async statRootHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    await this.ensureInitialized();
    const schemas = await this.schemaService.getAllSchemas();
    const actions = this.actions.listWithInfo(
      { rootLevel: true },
      { schemaService: this.schemaService },
    );

    return {
      data: {
        id: "/",
        path: "/",
        meta: {
          kind: "sqlite:database",
          kinds: ["sqlite:database", "afs:node"],
          tableCount: schemas.size,
          childrenCount: schemas.size,
        },
        actions:
          actions.length > 0
            ? actions.map((a) => ({ name: a.name, description: a.description }))
            : undefined,
      },
    };
  }

  /**
   * Get stat for a table
   */
  @Stat("/:table")
  async statTableHandler(ctx: RouteContext<{ table: string }>): Promise<AFSStatResult> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Get row count
    const countResult = await this.db.all<{ count: number }>(
      sql.raw(`SELECT COUNT(*) as count FROM "${ctx.params.table}"`),
    );
    const rowCount = countResult[0]?.count ?? 0;

    // Get table-level actions
    const actions = this.actions.listWithInfo(
      { tableLevel: true },
      {
        tableSchema: schema,
        tableName: ctx.params.table,
        schemaService: this.schemaService,
      },
    );

    // Build detailed columns array for metadata display
    const columns = schema.columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: !col.notnull,
      primaryKey: col.pk > 0,
    }));

    return {
      data: {
        id: ctx.params.table,
        path: `/${ctx.params.table}`,
        meta: {
          kind: "sqlite:table",
          kinds: ["sqlite:table", "afs:node"],
          table: ctx.params.table,
          columnCount: schema.columns.length,
          columns,
          primaryKey: schema.primaryKey[0],
          childrenCount: rowCount,
        },
        actions:
          actions.length > 0
            ? actions.map((a) => ({ name: a.name, description: a.description }))
            : undefined,
      },
    };
  }

  /**
   * Get stat for a row
   */
  @Stat("/:table/:pk")
  async statRowHandler(ctx: RouteContext<{ table: string; pk: string }>): Promise<AFSStatResult> {
    await this.ensureInitialized();
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Verify row exists
    const result = await this.crud.readRow(ctx.params.table, ctx.params.pk);
    if (!result.data) {
      throw new AFSNotFoundError(`/${ctx.params.table}/${ctx.params.pk}`);
    }

    // Get row-level actions
    const actions = this.actions.listWithInfo(
      { rowLevel: true },
      {
        tableSchema: schema,
        tableName: ctx.params.table,
        schemaService: this.schemaService,
      },
    );

    // Build detailed columns array for metadata display
    const columns = schema.columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: !col.notnull,
      primaryKey: col.pk > 0,
    }));

    return {
      data: {
        id: ctx.params.pk,
        path: `/${ctx.params.table}/${ctx.params.pk}`,
        meta: {
          kind: "sqlite:row",
          kinds: ["sqlite:row", "afs:node"],
          table: ctx.params.table,
          primaryKey: ctx.params.pk,
          columnCount: schema.columns.length,
          columns,
          childrenCount: 0,
        },
        actions:
          actions.length > 0
            ? actions.map((a) => ({ name: a.name, description: a.description }))
            : undefined,
      },
    };
  }

  // ========== Explain Handlers ==========

  /**
   * Explain root (database level)
   */
  @Explain("/")
  async explainRootHandler(ctx: RouteContext): Promise<AFSExplainResult> {
    await this.ensureInitialized();
    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";
    const schemas = await this.schemaService.getAllSchemas();
    const tables = Array.from(schemas.values());

    const lines: string[] = [];

    if (format === "markdown") {
      lines.push(`# ${this.name}`);
      lines.push("");
      lines.push(`**Type:** SQLite Database`);
      lines.push(`**Tables:** ${tables.length}`);
      lines.push("");

      if (tables.length > 0) {
        lines.push("## Tables");
        lines.push("");
        lines.push("| Table | Columns | Primary Key |");
        lines.push("|-------|---------|-------------|");
        for (const table of tables) {
          const pk = table.primaryKey.join(", ") || "rowid";
          lines.push(`| ${table.name} | ${table.columns.length} | ${pk} |`);
        }
      }
    } else {
      lines.push(`${this.name} (SQLite Database)`);
      lines.push(`Tables: ${tables.length}`);
      for (const table of tables) {
        lines.push(`  - ${table.name} (${table.columns.length} columns)`);
      }
    }

    return { content: lines.join("\n"), format };
  }

  /**
   * Explain a table
   */
  @Explain("/:table")
  async explainTableHandler(ctx: RouteContext<{ table: string }>): Promise<AFSExplainResult> {
    await this.ensureInitialized();
    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Get row count
    const countResult = await this.db.all<{ count: number }>(
      sql.raw(`SELECT COUNT(*) as count FROM "${ctx.params.table}"`),
    );
    const rowCount = countResult[0]?.count ?? 0;

    const lines: string[] = [];

    if (format === "markdown") {
      lines.push(`# ${ctx.params.table}`);
      lines.push("");
      lines.push(`**Type:** SQLite Table`);
      lines.push(`**Rows:** ${rowCount}`);
      lines.push(`**Primary Key:** ${schema.primaryKey.join(", ") || "rowid"}`);
      lines.push("");

      // Column table
      lines.push("## Columns");
      lines.push("");
      lines.push("| Column | Type | Nullable | Primary Key | Default |");
      lines.push("|--------|------|----------|-------------|---------|");
      for (const col of schema.columns) {
        const nullable = col.notnull ? "NO" : "YES";
        const pk = col.pk > 0 ? "YES" : "";
        const dflt =
          col.dfltValue !== null && col.dfltValue !== undefined ? String(col.dfltValue) : "";
        lines.push(`| ${col.name} | ${col.type} | ${nullable} | ${pk} | ${dflt} |`);
      }

      // Indexes
      if (schema.indexes.length > 0) {
        lines.push("");
        lines.push("## Indexes");
        lines.push("");
        for (const idx of schema.indexes) {
          const uniqueStr = idx.unique ? " (UNIQUE)" : "";
          lines.push(`- **${idx.name}**${uniqueStr}`);
        }
      }

      // Foreign keys
      if (schema.foreignKeys.length > 0) {
        lines.push("");
        lines.push("## Foreign Keys");
        lines.push("");
        for (const fk of schema.foreignKeys) {
          lines.push(`- \`${fk.from}\` → \`${fk.table}\`(\`${fk.to}\`) ON DELETE ${fk.onDelete}`);
        }
      }
    } else {
      lines.push(`${ctx.params.table} (SQLite Table)`);
      lines.push(`Rows: ${rowCount}`);
      lines.push(`Primary Key: ${schema.primaryKey.join(", ") || "rowid"}`);
      lines.push(`Columns: ${schema.columns.map((c) => `${c.name} (${c.type})`).join(", ")}`);
      if (schema.indexes.length > 0) {
        lines.push(`Indexes: ${schema.indexes.map((i) => i.name).join(", ")}`);
      }
      if (schema.foreignKeys.length > 0) {
        lines.push(
          `Foreign Keys: ${schema.foreignKeys.map((fk) => `${fk.from} → ${fk.table}(${fk.to})`).join(", ")}`,
        );
      }
    }

    return { content: lines.join("\n"), format };
  }

  /**
   * Explain a row
   */
  @Explain("/:table/:pk")
  async explainRowHandler(
    ctx: RouteContext<{ table: string; pk: string }>,
  ): Promise<AFSExplainResult> {
    await this.ensureInitialized();
    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";
    const schema = await this.schemaService.getSchema(ctx.params.table);
    if (!schema) {
      throw new AFSNotFoundError(`/${ctx.params.table}`);
    }

    // Read the row
    const result = await this.crud.readRow(ctx.params.table, ctx.params.pk);
    if (!result.data) {
      throw new AFSNotFoundError(`/${ctx.params.table}/${ctx.params.pk}`);
    }

    const rowContent = result.data.content as Record<string, unknown> | undefined;
    const pkColumn = schema.primaryKey[0] ?? "rowid";

    const lines: string[] = [];

    if (format === "markdown") {
      lines.push(`# ${ctx.params.table}/${ctx.params.pk}`);
      lines.push("");
      lines.push(`**Table:** ${ctx.params.table}`);
      lines.push(`**Primary Key:** ${pkColumn} = ${ctx.params.pk}`);
      lines.push("");

      if (rowContent) {
        lines.push("## Values");
        lines.push("");
        lines.push("| Column | Value |");
        lines.push("|--------|-------|");
        for (const col of schema.columns) {
          const val = rowContent[col.name];
          const displayVal =
            val === null || val === undefined ? "*null*" : truncateValue(String(val), 100);
          lines.push(`| ${col.name} | ${displayVal} |`);
        }
      }
    } else {
      lines.push(`${ctx.params.table}/${ctx.params.pk} (SQLite Row)`);
      lines.push(`Table: ${ctx.params.table}, ${pkColumn} = ${ctx.params.pk}`);
      if (rowContent) {
        for (const col of schema.columns) {
          const val = rowContent[col.name];
          lines.push(
            `  ${col.name}: ${val === null || val === undefined ? "null" : truncateValue(String(val), 100)}`,
          );
        }
      }
    }

    return { content: lines.join("\n"), format };
  }

  // ========== Exec Handlers ==========

  /**
   * Execute action via exec (row-level)
   */
  @Actions.Exec("/:table/:pk")
  async handleRowActionExec(
    ctx: RouteContext<{ table: string; pk: string; action: string }>,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    await this.ensureInitialized();
    return this.executeActionRaw(ctx.params.table, ctx.params.pk, ctx.params.action, args);
  }

  /**
   * Execute action via exec (table-level)
   */
  @Actions.Exec("/:table")
  async handleTableActionExec(
    ctx: RouteContext<{ table: string; action: string }>,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    await this.ensureInitialized();
    return this.executeActionRaw(
      ctx.params.table,
      undefined, // No pk for table-level action
      ctx.params.action,
      args,
    );
  }

  /**
   * Execute action via exec (root-level)
   */
  @Actions.Exec("/")
  async handleRootActionExec(
    ctx: RouteContext<{ action: string }>,
    args: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    await this.ensureInitialized();
    return this.executeRootActionRaw(ctx.params.action, args);
  }

  // ========== Helper Methods ==========

  /**
   * Executes an action and returns raw result (for exec handlers)
   * Returns AFSExecResult structure: { success: boolean, data?: Record<string, unknown> }
   */
  private async executeActionRaw(
    table: string,
    pk: string | undefined,
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    const schema = await this.schemaService.getSchema(table);
    if (!schema) {
      throw new AFSNotFoundError(`/${table}`);
    }

    // Get row data if pk is provided
    let row: Record<string, unknown> | undefined;
    if (pk) {
      const readResult = await this.crud.readRow(table, pk);
      row = readResult.data?.content as Record<string, unknown> | undefined;
    }

    const ctx: ActionContext = {
      db: this.db,
      schemaService: this.schemaService,
      table,
      pk,
      row,
      module: {
        exportTable: (t, f) => this.exportTable(t, f),
      },
    };

    const result = await this.actions.execute(actionName, ctx, params);

    if (!result.success) {
      throw new Error(result.message ?? "Action failed");
    }

    // Return AFSExecResult structure
    // Handle arrays specially - wrap in data property
    if (Array.isArray(result.data)) {
      return {
        success: true,
        data: { data: result.data },
      };
    }

    return {
      success: true,
      data: result.data as Record<string, unknown>,
    };
  }

  /**
   * Executes a root-level action and returns raw result (for exec handlers)
   * Returns AFSExecResult structure: { success: boolean, data?: Record<string, unknown> }
   */
  private async executeRootActionRaw(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ success: boolean; data?: Record<string, unknown> }> {
    const ctx: ActionContext = {
      db: this.db,
      schemaService: this.schemaService,
      table: "", // No specific table for root-level actions
      module: {
        exportTable: (t, f) => this.exportTable(t, f),
      },
    };

    const result = await this.actions.execute(actionName, ctx, params);

    if (!result.success) {
      throw new Error(result.message ?? "Action failed");
    }

    // Return AFSExecResult structure
    // Handle arrays specially - wrap in data property
    if (Array.isArray(result.data)) {
      return {
        success: true,
        data: { data: result.data },
      };
    }

    return {
      success: true,
      data: result.data as Record<string, unknown>,
    };
  }

  /**
   * Executes an action (for write handlers - wraps in AFSEntry)
   */
  private async executeAction(
    table: string,
    pk: string | undefined,
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ data: AFSEntry }> {
    const result = await this.executeActionRaw(table, pk, actionName, params);

    return {
      data: {
        id: `${table}:${pk ?? ""}:.actions:${actionName}`,
        path: pk ? `/${table}/${pk}/.actions/${actionName}` : `/${table}/.actions/${actionName}`,
        content: result,
      },
    };
  }

  /**
   * Executes a root-level action (for write handlers - wraps in AFSEntry)
   */
  private async executeRootAction(
    actionName: string,
    params: Record<string, unknown>,
  ): Promise<{ data: AFSEntry }> {
    const result = await this.executeRootActionRaw(actionName, params);

    return {
      data: {
        id: `:.actions:${actionName}`,
        path: `/.actions/${actionName}`,
        content: result,
      },
    };
  }

  /**
   * Exports table data in specified format
   */
  async exportTable(table: string, format: string): Promise<unknown> {
    const listResult = await this.crud.listTable(table, { limit: 10000 });

    if (format === "csv") {
      const schema = await this.schemaService.getSchema(table);
      if (!schema) throw new AFSNotFoundError(`/${table}`);

      const headers = schema.columns.map((c) => c.name).join(",");
      const rows = listResult.data.map((entry) => {
        const content = entry.content as Record<string, unknown>;
        return schema.columns
          .map((c) => {
            const val = content[c.name];
            if (val === null || val === undefined) return "";
            if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return String(val);
          })
          .join(",");
      });

      return `${headers}\n${rows.join("\n")}`;
    }

    // Default: JSON
    return listResult.data.map((entry) => entry.content);
  }

  /**
   * Registers a custom action
   */
  registerAction(
    name: string,
    handler: (ctx: ActionContext, params: Record<string, unknown>) => Promise<unknown>,
    options?: {
      description?: string;
      tableLevel?: boolean;
      rowLevel?: boolean;
    },
  ): void {
    this.actions.registerSimple(
      name,
      async (ctx, params) => ({
        success: true,
        data: await handler(ctx, params),
      }),
      options,
    );
  }

  /**
   * Gets table schemas (for external access)
   * Note: This queries the database on-demand
   */
  async getSchemas(): Promise<Map<string, TableSchema>> {
    await this.ensureInitialized();
    return this.schemaService.getAllSchemas();
  }

  /**
   * Gets the database instance (for advanced operations).
   * Ensures the database is initialized before returning.
   */
  async getDatabase(): Promise<SqliteDatabase> {
    await this.ensureInitialized();
    return this.db;
  }
}

/**
 * Truncate a string value for display purposes.
 */
function truncateValue(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

// Type check to ensure SQLiteAFS implements AFSModuleClass
const _typeCheck: AFSModuleClass<SQLiteAFS, SQLiteAFSOptions> = SQLiteAFS;
