/**
 * write Command - Core Implementation
 *
 * Writes content to a file/node. Accepts AFS instance directly.
 * Returns AFSWriteResult directly (no custom type).
 */

import type { AFSWriteEntryPayload } from "@aigne/afs";
import type { CommandModule } from "yargs";
import { formatWriteOutput } from "../formatters/index.js";
import { cliPathToCanonical } from "../path-utils.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

/**
 * Write command arguments
 */
export interface WriteArgs {
  path: string;
  content?: string;
  mode: "replace" | "append" | "prepend" | "patch" | "create" | "update";
  patch?: string;
  meta?: string[];
}

/**
 * Parse --meta values into metadata object
 */
function parseMetaValues(metaValues?: string[]): Record<string, string> | undefined {
  if (!metaValues || metaValues.length === 0) return undefined;

  const meta: Record<string, string> = {};
  for (const item of metaValues) {
    const idx = item.indexOf("=");
    if (idx > 0) {
      const key = item.slice(0, idx);
      const value = item.slice(idx + 1);
      meta[key] = value;
    }
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Create write command factory
 */
export function createWriteCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, WriteArgs> {
  return {
    command: "write <path> [content]",
    describe: "Write content to file",
    builder: {
      path: {
        type: "string",
        demandOption: true,
        description: "Path to write",
      },
      content: {
        type: "string",
        description: "Content to write",
      },
      mode: {
        type: "string",
        choices: ["replace", "append", "prepend", "patch", "create", "update"] as const,
        description: "Write mode",
        default: "replace" as const,
      },
      patch: {
        type: "string",
        description: "JSON array of patch operations (for mode=patch)",
      },
      meta: {
        type: "string",
        array: true,
        description: "Set metadata field (key=value)",
      },
    },
    handler: async (argv) => {
      const metadata = parseMetaValues(argv.meta);
      const fields = metadata ? Object.keys(metadata) : undefined;

      // Content is required unless only setting metadata or using patch mode
      if (argv.content === undefined && !metadata && argv.mode !== "patch") {
        throw new Error("write requires content (use --content or provide as second argument)");
      }

      const afs = await resolveAFS(options);
      const canonicalPath = cliPathToCanonical(argv.path);
      const writeData: AFSWriteEntryPayload = {};

      if (argv.content !== undefined) {
        writeData.content = argv.content;
      }
      if (metadata) {
        writeData.meta = metadata;
      }
      if (argv.patch) {
        writeData.patches = JSON.parse(argv.patch);
      }

      const result = await afs.write(canonicalPath, writeData, { mode: argv.mode });
      options.onResult({
        command: "write",
        result,
        format: (res, view) => formatWriteOutput(res, view, { fields }),
      });
    },
  };
}
