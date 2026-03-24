/**
 * Well-known Kind definitions for @aigne/afs core package.
 *
 * These are common types that all providers can use or extend.
 *
 * Naming convention:
 * - Well-known: "afs:*" (defined here)
 * - Provider-specific: "{provider}:{kind}" (e.g., "chamber:project")
 */

import type { JSONSchema7, KindSchema } from "./type.js";

// =============================================================================
// Common JSON Schema definitions (reusable across kinds)
// =============================================================================

/**
 * Common meta properties that can apply to any node.
 * Providers can extend their kinds with these properties.
 */
export const commonMetaSchema: JSONSchema7 = {
  type: "object",
  properties: {
    /** Display icon (path, URL, or icon identifier like "folder", "file-text") */
    icon: {
      type: "string",
      description: "Display icon for this node",
    },
    /** Display label (alternative to file/directory name) */
    label: {
      type: "string",
      description: "Human-readable display name",
    },
    /** Color for UI display (hex, rgb, or named color) */
    color: {
      type: "string",
      description: "Display color for this node",
    },
    /** Tags for categorization */
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Tags for categorization and filtering",
    },
    /** Human-readable description */
    description: {
      type: "string",
      description: "Description of this node",
    },
  },
};

// =============================================================================
// Well-known Kind Schemas
// =============================================================================

/**
 * Base node kind - the root of all kinds.
 * All AFS nodes are just "nodes" - there's no file/directory distinction at the kind level.
 * Whether a node has children is determined by childrenCount at runtime.
 */
export const afsNode: KindSchema = {
  name: "afs:node",
  description: "Base kind for all AFS nodes",
  meta: {
    type: "object",
    properties: {
      ...commonMetaSchema.properties,
      /**
       * Number of children this node has.
       * - undefined: unknown (not yet loaded)
       * - 0: no children currently (but may have children in the future)
       * - >0: has children
       *
       * Note: This is a runtime value. There is no file/directory distinction -
       * all nodes can potentially have children.
       */
      childrenCount: {
        type: "integer",
        minimum: 0,
        description: "Number of children (undefined=unknown, 0=none currently, >0=has children)",
      },
      /** MIME type (for content nodes) */
      mimeType: {
        type: "string",
        description: "MIME type (e.g., text/plain, application/json)",
      },
      /** Whether this node should be shown expanded by default in UI */
      expanded: {
        type: "boolean",
        description: "Whether to show expanded by default in UI",
      },
      /** Sort order for children */
      sortOrder: {
        type: "string",
        enum: ["name", "date", "size", "type", "custom"],
        description: "How to sort children in listings",
      },
    },
  },
};

/**
 * Document kind (text, markdown, etc.).
 */
export const afsDocument: KindSchema = {
  name: "afs:document",
  extends: "afs:node",
  description: "Document (text, markdown, rich text)",
  meta: {
    type: "object",
    properties: {
      /** Document title */
      title: {
        type: "string",
        description: "Document title",
      },
      /** Author name */
      author: {
        type: "string",
        description: "Author of the document",
      },
      /** Document format */
      format: {
        type: "string",
        enum: ["text", "markdown", "html", "rst", "asciidoc"],
        description: "Document format",
      },
    },
  },
};

/**
 * Image kind.
 */
export const afsImage: KindSchema = {
  name: "afs:image",
  extends: "afs:node",
  description: "Image (png, jpg, gif, etc.)",
  meta: {
    type: "object",
    properties: {
      /** Image width in pixels */
      width: {
        type: "integer",
        minimum: 0,
        description: "Image width in pixels",
      },
      /** Image height in pixels */
      height: {
        type: "integer",
        minimum: 0,
        description: "Image height in pixels",
      },
      /** Image format */
      format: {
        type: "string",
        enum: ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"],
        description: "Image format",
      },
      /** Alternative text for accessibility */
      alt: {
        type: "string",
        description: "Alternative text for accessibility",
      },
    },
  },
};

/**
 * Executable or script kind.
 */
export const afsExecutable: KindSchema = {
  name: "afs:executable",
  extends: "afs:node",
  description: "Executable or script",
  meta: {
    type: "object",
    properties: {
      /** Runtime environment */
      runtime: {
        type: "string",
        description: "Runtime environment (e.g., node, python, bash)",
      },
      /** Entry command or script */
      command: {
        type: "string",
        description: "Command to execute",
      },
      /** Input schema (JSON Schema format) */
      inputSchema: {
        type: "object",
        description: "JSON Schema describing expected input parameters",
      },
      /** Output schema (JSON Schema format) */
      outputSchema: {
        type: "object",
        description: "JSON Schema describing expected output format",
      },
    },
  },
};

/**
 * Program/Blocklet kind — a directory containing blocklet.yaml (or program.yaml) manifest.
 * Represents a packaged AFS application with entrypoint, dependency declarations, and projection mounts.
 */
export const afsProgram: KindSchema = {
  name: "afs:program",
  extends: "afs:executable",
  description: "Blocklet directory with blocklet.yaml manifest",
  meta: {
    type: "object",
    properties: {
      /** Entrypoint script path relative to program root */
      entrypoint: {
        type: "string",
        description: "Entrypoint script path relative to program root",
      },
    },
    required: ["entrypoint"],
  },
};

/**
 * Link/symlink kind.
 */
export const afsLink: KindSchema = {
  name: "afs:link",
  extends: "afs:node",
  description: "Symbolic link or reference to another node",
  meta: {
    type: "object",
    properties: {
      /** Target path */
      target: {
        type: "string",
        description: "Path to the target node",
      },
    },
  },
};

// =============================================================================
// Registry
// =============================================================================

/**
 * All well-known kinds as an array.
 * Note: No separate file/directory kinds - all are nodes.
 * Whether a node has children is determined by childrenCount at runtime.
 */
export const WELL_KNOWN_KINDS: KindSchema[] = [
  afsNode,
  afsDocument,
  afsImage,
  afsExecutable,
  afsProgram,
  afsLink,
];

/**
 * Well-known kinds as a map for quick lookup.
 */
export const WELL_KNOWN_KINDS_MAP: Map<string, KindSchema> = new Map(
  WELL_KNOWN_KINDS.map((k) => [k.name, k]),
);

/**
 * Get a well-known kind by name.
 */
export function getWellKnownKind(name: string): KindSchema | undefined {
  return WELL_KNOWN_KINDS_MAP.get(name);
}

/**
 * Check if a kind name is a well-known kind.
 */
export function isWellKnownKind(name: string): boolean {
  return WELL_KNOWN_KINDS_MAP.has(name);
}
