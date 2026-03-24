/**
 * read Command - Core Implementation
 *
 * Reads file/node content. Accepts AFS instance directly.
 * Returns AFSReadResult directly (no custom type).
 */

import type { CommandModule } from "yargs";
import { formatReadOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Read command arguments
 */
export interface ReadArgs {
  path: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Create read command factory
 */
export function createReadCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ReadArgs> {
  return {
    command: ["read <path>", "cat <path>"],
    describe: "Read file content",
    builder: {
      path: {
        type: "string",
        demandOption: true,
        description: "Path to read",
      },
      "start-line": {
        type: "number",
        description: "Start line (1-indexed, inclusive)",
      },
      "end-line": {
        type: "number",
        description: "End line (1-indexed, inclusive). -1 for end of file",
      },
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);
      const canonicalPath = cliPathToCanonical(argv.path);
      const result = await afs.read(canonicalPath, {
        startLine: argv.startLine,
        endLine: argv.endLine,
      });

      // Use the original CLI path for display (UX-friendly, e.g. /fs instead of $afs/fs)
      if (result.data) {
        result.data.path = argv.path;

        // Fetch metadata and actions from stat for non-virtual paths
        const isMeta = argv.path.endsWith("/.meta") || argv.path.includes("/.meta/");
        const isAction = argv.path.includes("/.actions");

        if (!isMeta && !isAction) {
          try {
            const statResult = await afs.stat(canonicalPath);
            if (statResult.data) {
              result.data.meta = { ...result.data.meta, ...statResult.data.meta };
              result.data.actions = statResult.data.actions;
            }
          } catch {
            // stat not supported
          }
        }
      }

      options.onResult({
        command: "read",
        result,
        format: formatReadOutput,
      });
    },
  };
}
