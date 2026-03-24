/**
 * stat Command - Core Implementation
 *
 * Gets file/node statistics. Accepts AFS instance directly.
 * Returns AFSStatResult directly (no custom type).
 */

import type { AFSStatResult } from "@aigne/afs";
import type { CommandModule } from "yargs";
import { ExitCode } from "../../errors.js";
import { formatStatOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Stat command arguments
 */
export interface StatArgs {
  path: string;
}

/**
 * Create stat command factory
 */
export function createStatCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, StatArgs> {
  return {
    command: "stat <path>",
    describe: "Get file or directory info",
    builder: {
      path: {
        type: "string",
        demandOption: true,
        description: "Path to stat",
      },
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);
      const canonicalPath = cliPathToCanonical(argv.path);
      let result: AFSStatResult | undefined;
      try {
        result = await afs.stat(canonicalPath);
      } catch {
        // stat() is optional — provider may not support it; fall through to read()
      }

      if (!result) {
        // Fallback: Use read to get detailed metadata
        try {
          const entry = (await afs.read(canonicalPath)).data;
          if (entry) {
            result = { data: { ...entry, meta: entry.meta ?? {} } };
          }
        } catch {
          // read() also failed — result stays undefined, handled below
        }
      }

      // Use the original CLI path for display (UX-friendly, e.g. /fs instead of $afs/fs)
      if (result?.data) {
        result.data.path = argv.path;
      }

      const notFound = !result?.data;
      options.onResult({
        command: "stat",
        result: result ?? { data: undefined, message: `No data found for path: ${argv.path}` },
        format: formatStatOutput,
        ...(notFound && {
          error: {
            code: ExitCode.NOT_FOUND,
            message: `No data found for path: ${argv.path}`,
          },
        }),
      });
    },
  };
}
