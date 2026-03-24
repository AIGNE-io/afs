/**
 * ls Command - Core Implementation
 *
 * Lists directory contents. Accepts AFS instance directly.
 * Returns AFSListResult directly (no custom type).
 */

import type { CommandModule } from "yargs";
import { formatLsOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Ls command arguments
 */
export interface LsArgs {
  path: string;
  depth: number;
  l: boolean;
  R: boolean;
  limit?: number;
  maxChildren?: number;
  pattern?: string;
}

/**
 * Create ls command factory
 */
export function createLsCommand(options: CommandFactoryOptions): CommandModule<unknown, LsArgs> {
  return {
    command: ["ls [path]", "list [path]"],
    describe: "List directory contents",
    builder: {
      path: {
        type: "string",
        default: "/",
        description: "Path to list",
      },
      depth: {
        type: "number",
        default: 1,
        description: "Maximum depth to list",
      },
      l: {
        type: "boolean",
        default: false,
        description: "Long listing format (detailed view)",
      },
      R: {
        type: "boolean",
        default: false,
        description: "List recursively",
      },
      limit: {
        type: "number",
        description: "Maximum number of entries to return",
      },
      "max-children": {
        type: "number",
        description: "Maximum children per directory",
      },
      pattern: {
        type: "string",
        description: "Glob pattern to filter entries",
      },
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);
      const canonicalPath = cliPathToCanonical(argv.path || "/");
      const depth = argv.R ? 10 : (argv.depth ?? 1);
      const result = await afs.list(canonicalPath, {
        maxDepth: depth,
        limit: argv.limit,
        maxChildren: argv.maxChildren,
        pattern: argv.pattern,
      });
      options.onResult({
        command: "ls",
        result,
        format: formatLsOutput,
        ...(argv.l && { viewOverride: "human" as const }),
      });
    },
  };
}
