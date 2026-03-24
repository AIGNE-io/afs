/**
 * MCP-specific Kind definitions for @aigne/afs-mcp provider.
 *
 * These kinds extend the well-known AFS kinds to provide MCP-specific
 * types for tools, prompts, and resources.
 *
 * Naming convention:
 * - MCP kinds: "mcp:*"
 * - Example: "mcp:tool", "mcp:prompt", "mcp:resource"
 */

import {
  createKindResolver,
  getInheritanceChain,
  type KindResolver,
  type KindSchema,
} from "@aigne/afs";

// =============================================================================
// MCP Kind Schemas
// =============================================================================

/**
 * MCP Module kind - Root container for an MCP server
 */
export const mcpModule: KindSchema = {
  name: "mcp:module",
  extends: "afs:node",
  description: "MCP server module container",
  meta: {
    type: "object",
    properties: {
      /** Server name */
      serverName: {
        type: "string",
        description: "Name of the MCP server",
      },
      /** Transport type used to connect */
      transport: {
        type: "string",
        enum: ["stdio", "http", "sse"],
        description: "Transport type (stdio, http, sse)",
      },
      /** Server capabilities */
      capabilities: {
        type: "object",
        properties: {
          tools: { type: "boolean" },
          prompts: { type: "boolean" },
          resources: { type: "boolean" },
        },
        description: "Server capabilities",
      },
    },
  },
};

/**
 * MCP Tool kind - Executable tool exposed by MCP server
 * Extends afs:executable since tools can be executed
 */
export const mcpTool: KindSchema = {
  name: "mcp:tool",
  extends: "afs:executable",
  description: "MCP tool that can be executed with arguments",
  meta: {
    type: "object",
    properties: {
      /** Tool input schema (JSON Schema) */
      inputSchema: {
        type: "object",
        description: "JSON Schema describing expected input parameters",
      },
      /** MCP-specific tool metadata */
      mcp: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Original tool name in MCP server",
          },
        },
      },
    },
  },
};

/**
 * MCP Prompt kind - Prompt template exposed by MCP server
 */
export const mcpPrompt: KindSchema = {
  name: "mcp:prompt",
  extends: "afs:node",
  description: "MCP prompt template",
  meta: {
    type: "object",
    properties: {
      /** Prompt arguments schema */
      arguments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            required: { type: "boolean" },
          },
        },
        description: "Arguments that can be passed to the prompt",
      },
      /** MCP-specific prompt metadata */
      mcp: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Original prompt name in MCP server",
          },
        },
      },
    },
  },
};

/**
 * MCP Resource kind - Resource exposed by MCP server
 */
export const mcpResource: KindSchema = {
  name: "mcp:resource",
  extends: "afs:node",
  description: "MCP resource that can be read",
  meta: {
    type: "object",
    properties: {
      /** Resource MIME type */
      mimeType: {
        type: "string",
        description: "MIME type of the resource content",
      },
      /** MCP-specific resource metadata */
      mcp: {
        type: "object",
        properties: {
          uri: {
            type: "string",
            description: "Original resource URI in MCP server",
          },
          name: {
            type: "string",
            description: "Resource name",
          },
        },
      },
    },
  },
};

// =============================================================================
// Registry
// =============================================================================

/**
 * All MCP kinds as an array.
 */
export const MCP_KINDS: KindSchema[] = [mcpModule, mcpTool, mcpPrompt, mcpResource];

/**
 * MCP kinds as a map for quick lookup.
 */
export const MCP_KINDS_MAP: Map<string, KindSchema> = new Map(MCP_KINDS.map((k) => [k.name, k]));

/**
 * Get an MCP kind by name.
 */
export function getMcpKind(name: string): KindSchema | undefined {
  return MCP_KINDS_MAP.get(name);
}

/**
 * Check if a kind name is an MCP kind.
 */
export function isMcpKind(name: string): boolean {
  return MCP_KINDS_MAP.has(name);
}

// =============================================================================
// Kind Resolver
// =============================================================================

/**
 * Get a kind resolver that includes MCP kinds and well-known kinds.
 *
 * @returns A resolver function that can resolve MCP kinds and well-known kinds
 */
export function getMcpKindResolver(): KindResolver {
  return createKindResolver(MCP_KINDS);
}

/**
 * Get the inheritance chain for an MCP kind as an array of kind names.
 * The array is ordered from most specific (index 0) to most general.
 *
 * @param kindName - The kind name (e.g., "mcp:tool")
 * @returns Array of kind names from most specific to most general
 *
 * @example
 * ```typescript
 * getKindsArray("mcp:tool") // ["mcp:tool", "afs:executable", "afs:node"]
 * ```
 */
export function getKindsArray(kindName: string): string[] {
  const resolver = getMcpKindResolver();
  const kind = resolver(kindName);
  if (!kind) {
    return [kindName];
  }

  try {
    const chain = getInheritanceChain(kind, resolver);
    // Reverse so most specific is first (matches the kind field)
    return chain.map((k) => k.name).reverse();
  } catch {
    // If inheritance chain fails, just return the kind itself
    return [kindName];
  }
}
