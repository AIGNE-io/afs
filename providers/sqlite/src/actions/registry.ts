import type {
  ActionContext,
  ActionDefinition,
  ActionHandler,
  ActionResult,
  SchemaGeneratorContext,
} from "./types.js";

/**
 * Registry for managing action handlers
 */
export class ActionsRegistry {
  private handlers = new Map<string, ActionDefinition>();

  /**
   * Registers an action handler
   */
  register(definition: ActionDefinition): void {
    this.handlers.set(definition.name, definition);
  }

  /**
   * Registers a simple action with just name and handler
   */
  registerSimple(
    name: string,
    handler: ActionHandler,
    options?: {
      description?: string;
      tableLevel?: boolean;
      rowLevel?: boolean;
    },
  ): void {
    this.register({
      name,
      handler,
      description: options?.description,
      tableLevel: options?.tableLevel ?? false,
      rowLevel: options?.rowLevel ?? true,
    });
  }

  /**
   * Unregisters an action
   */
  unregister(name: string): boolean {
    return this.handlers.delete(name);
  }

  /**
   * Checks if an action is registered
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Gets an action definition
   */
  get(name: string): ActionDefinition | undefined {
    return this.handlers.get(name);
  }

  /**
   * Lists all registered actions
   */
  list(options?: {
    rootLevel?: boolean;
    tableLevel?: boolean;
    rowLevel?: boolean;
  }): ActionDefinition[] {
    const actions = Array.from(this.handlers.values());

    if (
      options?.rootLevel !== undefined ||
      options?.tableLevel !== undefined ||
      options?.rowLevel !== undefined
    ) {
      return actions.filter((a) => {
        if (options.rootLevel && !a.rootLevel) return false;
        if (options.tableLevel && !a.tableLevel) return false;
        if (options.rowLevel && !a.rowLevel) return false;
        return true;
      });
    }

    return actions;
  }

  /**
   * Lists action names
   */
  listNames(options?: { rootLevel?: boolean; tableLevel?: boolean; rowLevel?: boolean }): string[] {
    return this.list(options).map((a) => a.name);
  }

  /**
   * Lists actions with their metadata (name, description, inputSchema)
   * If schemaContext is provided, dynamic schemas will be generated
   */
  listWithInfo(
    options?: {
      rootLevel?: boolean;
      tableLevel?: boolean;
      rowLevel?: boolean;
    },
    schemaContext?: SchemaGeneratorContext,
  ): Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> {
    return this.list(options).map((a) => {
      // Use dynamic schema generator if available, otherwise use static schema
      let inputSchema = a.inputSchema;
      if (a.inputSchemaGenerator && schemaContext) {
        inputSchema = a.inputSchemaGenerator(schemaContext);
      }

      return {
        name: a.name,
        description: a.description,
        inputSchema,
      };
    });
  }

  /**
   * Gets an action's input schema, optionally with dynamic generation
   */
  getInputSchema(
    name: string,
    schemaContext?: SchemaGeneratorContext,
  ): Record<string, unknown> | undefined {
    const definition = this.handlers.get(name);
    if (!definition) return undefined;

    if (definition.inputSchemaGenerator && schemaContext) {
      return definition.inputSchemaGenerator(schemaContext);
    }
    return definition.inputSchema;
  }

  /**
   * Executes an action
   */
  async execute(
    name: string,
    ctx: ActionContext,
    params: Record<string, unknown> = {},
  ): Promise<ActionResult> {
    const definition = this.handlers.get(name);

    if (!definition) {
      return {
        success: false,
        message: `Unknown action: ${name}`,
      };
    }

    // Determine the level of this execution
    const isRootLevel = !ctx.table;
    const isTableLevel = ctx.table && !ctx.pk;
    const isRowLevel = ctx.table && ctx.pk;

    // Validate action level
    if (isRootLevel && !definition.rootLevel) {
      return {
        success: false,
        message: `Action '${name}' is not available at root level`,
      };
    }

    if (isRowLevel && !definition.rowLevel) {
      return {
        success: false,
        message: `Action '${name}' is not available at row level`,
      };
    }

    if (isTableLevel && !definition.tableLevel) {
      return {
        success: false,
        message: `Action '${name}' is not available at table level`,
      };
    }

    try {
      return await definition.handler(ctx, params);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
