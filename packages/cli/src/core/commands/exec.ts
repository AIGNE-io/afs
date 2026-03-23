/**
 * exec Command - Core Implementation
 *
 * Executes actions on AFS paths. Accepts AFS instance directly.
 * Returns AFSExecResult directly (no custom type).
 *
 * NOTE: The yargs positional is named "executable_path" to avoid name collisions
 * with action inputSchema properties. Common schema property names like "path",
 * "action", "name" etc. won't collide with this compound internal name.
 */

import type { AFS } from "@aigne/afs";
import type { CommandModule, Options } from "yargs";
import { formatExecOutput } from "../formatters/index.js";
import {
  parseExecArgs,
  parseExecArgsWithStdin,
  parseValueBySchema,
  schemaTypeToYargs,
} from "../helpers/exec-args.js";
import { cliPathToCanonical } from "../path-utils.js";
import type { JSONSchema } from "../types.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

// Re-export helpers for backward compatibility
export { parseExecArgs, parseValueBySchema };

/**
 * Exec command base arguments (known fields)
 * Note: Dynamic options are added from inputSchema at runtime
 */
export interface ExecArgs {
  executable_path: string;
  args?: string;
  [key: string]: unknown;
}

/**
 * Fetch action metadata (description, inputSchema)
 */
async function fetchActionMeta(
  afs: AFS,
  path: string,
): Promise<{ description?: string; inputSchema?: JSONSchema }> {
  const canonicalPath = cliPathToCanonical(path);

  try {
    const readResult = await afs.read(canonicalPath);
    const meta = readResult.data?.meta ?? {};
    const content = readResult.data?.content ?? {};
    // Actions list entries may carry inputSchema in the actions array
    const firstAction = readResult.data?.actions?.[0];

    return {
      description: (meta.description ??
        content.description ??
        firstAction?.description ??
        readResult.data?.summary) as string | undefined,
      inputSchema: (meta.inputSchema ?? content.inputSchema ?? firstAction?.inputSchema) as
        | JSONSchema
        | undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Create exec command factory
 *
 * This command has special handling:
 * 1. Factory function caches inputSchema
 * 2. Builder pre-parses argv to get action path
 * 3. Dynamically adds options from inputSchema
 */
export function createExecCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ExecArgs> {
  // Cache schema in closure for reuse between builder and handler
  let cachedSchema: JSONSchema | undefined;
  // Store the pre-parsed exec target path
  let resolvedExecAction: string | undefined;

  return {
    command: "exec <executable_path>",
    describe: "Execute an action",
    builder: async (yargs) => {
      // Pre-parse argv to get the action path (first positional after "exec")
      const execIndex = options.argv.indexOf("exec");
      const actionArg = execIndex >= 0 ? options.argv[execIndex + 1] : undefined;

      if (actionArg && typeof actionArg === "string" && !actionArg.startsWith("-")) {
        resolvedExecAction = actionArg;
        // Fetch action metadata
        const afs = await resolveAFS(options);
        const actionMeta = await fetchActionMeta(afs, actionArg);
        cachedSchema = actionMeta.inputSchema;

        // Set custom usage with path and description
        const description = actionMeta.description || "Execute an action";
        yargs.usage(`afs exec ${actionArg}\n\n${description}`);

        // Check if --args is provided - if so, don't require individual options
        const hasArgsOption = options.argv.includes("--args");

        if (cachedSchema?.properties) {
          // Add dynamic options from schema
          for (const [name, propSchema] of Object.entries(cachedSchema.properties)) {
            const prop = propSchema as JSONSchema;
            let description = prop.description || "";

            // For object-type properties with sub-properties, show them in the description
            if (prop.type === "object" && prop.properties) {
              const subKeys = Object.keys(prop.properties).join(", ");
              description += `${description ? " " : ""}(JSON object with: ${subKeys})`;
            }

            const optConfig: Options = {
              type: schemaTypeToYargs(prop.type),
              description: description || undefined,
              group: "Action Parameters:",
            };

            if (prop.default !== undefined) {
              optConfig.default = prop.default;
            }

            // Only require options when --args is not provided.
            // Skip demandOption for fields with sensitive/env metadata — these
            // can be resolved through credential collection (browser, env vars,
            // credential store) rather than CLI args.
            if (!hasArgsOption && cachedSchema.required?.includes(name)) {
              const hasAlternateResolution =
                (prop as Record<string, unknown>).sensitive === true ||
                Array.isArray((prop as Record<string, unknown>).env);
              if (!hasAlternateResolution) {
                optConfig.demandOption = true;
              }
            }

            yargs.option(name, optConfig);
          }
        }
      }

      return yargs
        .positional("executable_path", {
          type: "string",
          demandOption: true,
          description: "Action path to execute",
        })
        .option("args", {
          type: "string",
          description: 'JSON arguments: --args \'{"key": "value"}\'',
        })
        .strict(false);
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);
      // Use pre-parsed action path from builder
      const execPath = resolvedExecAction ?? argv.executable_path;
      // Use cached schema or fetch again
      const schema = cachedSchema ?? (await fetchActionMeta(afs, execPath)).inputSchema;

      // Strip positional "executable_path" from argv before parsing exec args
      const argvForParsing: Record<string, unknown> = { ...argv };
      delete argvForParsing.executable_path;
      // yargs also creates a camelCase alias "executablePath" — remove it too
      delete argvForParsing.executablePath;

      // Parse exec arguments with schema (supports piped stdin JSON)
      const execArgs = await parseExecArgsWithStdin(argvForParsing, schema);

      const canonicalPath = cliPathToCanonical(execPath);
      const result = await afs.exec(canonicalPath, execArgs, {});
      options.onResult({
        command: "exec",
        result,
        format: formatExecOutput,
      });
    },
  };
}
