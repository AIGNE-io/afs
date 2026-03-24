/**
 * search Command - Core Implementation
 *
 * Searches for content within an AFS path.
 * Returns AFSSearchResult directly (no custom type).
 */

import type { CommandModule } from "yargs";
import { formatSearchOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Search command arguments
 */
export interface SearchArgs {
  path: string;
  query: string;
}

/**
 * Create search command factory
 */
export function createSearchCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, SearchArgs> {
  return {
    command: ["search <path> <query>", "grep <path> <query>", "find <path> <query>"],
    describe: "Search for content within an AFS path",
    builder: {
      path: {
        type: "string",
        demandOption: true,
        description: "Path to search in",
      },
      query: {
        type: "string",
        demandOption: true,
        description: "Search query",
      },
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);
      const canonicalPath = cliPathToCanonical(argv.path);
      const result = await afs.search(canonicalPath, argv.query);
      options.onResult({
        command: "search",
        result,
        format: formatSearchOutput,
      });
    },
  };
}
