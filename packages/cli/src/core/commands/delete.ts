/**
 * delete Command - Core Implementation
 *
 * Deletes files/directories. Accepts AFS instance directly.
 * Returns AFSDeleteResult directly (no custom type).
 */

import type { CommandModule } from "yargs";
import { formatDeleteOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Delete command arguments
 */
export interface DeleteArgs {
  path: string;
  recursive: boolean;
}

/**
 * Create delete command factory
 */
export function createDeleteCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, DeleteArgs> {
  return {
    command: ["delete <path>", "rm <path>"],
    describe: "Delete file or directory",
    builder: {
      path: {
        type: "string",
        demandOption: true,
        description: "Path to delete",
      },
      recursive: {
        alias: "r",
        type: "boolean",
        default: false,
        description: "Delete directory recursively",
      },
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);
      const canonicalPath = cliPathToCanonical(argv.path);
      const result = await afs.delete(canonicalPath, { recursive: argv.recursive });
      options.onResult({
        command: "delete",
        result,
        format: formatDeleteOutput,
      });
    },
  };
}
