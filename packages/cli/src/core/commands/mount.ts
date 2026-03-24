/**
 * mount Command - Core Implementation
 *
 * Mount management commands for config file operations.
 * Changes are persisted to .afs-config/config.toml.
 */

import type { Argv, CommandModule } from "yargs";
import {
  configMountListCommand,
  type MountValidateResult,
  mountRemoveCommand,
  mountValidateCommand,
  persistMount,
  resolveUriPath,
} from "../../config/mount-commands.js";
import { MountSchema } from "../../config/schema.js";
import { formatMountListOutput } from "../formatters/index.js";
import type { ViewType } from "../types.js";
import type { CommandFactoryOptions } from "./types.js";

/**
 * Mount list subcommand arguments
 */
export interface MountListArgs {
  namespace?: string;
}

/**
 * Mount add subcommand arguments
 */
export interface MountAddArgs {
  path: string;
  uri: string;
  namespace?: string;
  description?: string;
  "sensitive-args"?: string[];
  force?: boolean;
  [key: string]: unknown;
}

/**
 * Mount remove subcommand arguments
 */
export interface MountRemoveArgs {
  path: string;
  namespace?: string;
}

/**
 * Create mount command factory (with subcommands)
 */
export function createMountCommand(options: CommandFactoryOptions): CommandModule {
  return {
    command: "mount",
    describe: "Mount management",
    builder: (yargs: Argv) =>
      yargs
        .command(createMountListSubcommand(options))
        .command(createMountAddSubcommand(options))
        .command(createMountRemoveSubcommand(options))
        .command(createMountValidateSubcommand(options))
        .demandCommand(1, "Please specify a subcommand")
        .alias("help", "h"),
    handler: () => {},
  };
}

/**
 * Create mount list subcommand
 */
function createMountListSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, MountListArgs> {
  return {
    command: ["list", "ls"],
    describe: "List all mounts",
    builder: {
      namespace: {
        type: "string",
        description: "Filter by namespace",
      },
    },
    handler: async () => {
      const cwd = options.cwd ?? process.cwd();
      const result = await configMountListCommand(cwd);
      options.onResult({
        command: "mount list",
        result: result.mounts,
        format: formatMountListOutput,
      });
    },
  };
}

/**
 * Create mount add subcommand
 */
/** Known argv keys that are NOT provider options */
const KNOWN_MOUNT_KEYS = new Set([
  "path",
  "uri",
  "namespace",
  "description",
  "sensitive-args",
  "sensitiveArgs",
  "set",
  "terminal",
  "force",
  "f",
  "_",
  "$0",
  "help",
  "h",
  "version",
  "v",
  // Global options from executor
  "json",
  "yaml",
  "view",
  "interactive",
]);

function createMountAddSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, MountAddArgs> {
  return {
    command: "add <path> <uri>",
    describe: "Add a mount",
    builder: (yargs) =>
      yargs
        .strict(false)
        .positional("path", {
          type: "string",
          demandOption: true,
          description: "Mount path (e.g., /src)",
        })
        .positional("uri", {
          type: "string",
          demandOption: true,
          description: "Provider URI (e.g., fs://./src)",
        })
        .option("namespace", {
          type: "string",
          description: "Mount namespace",
        })
        .option("description", {
          type: "string",
          description: "Mount description",
        })
        .option("sensitive-args", {
          type: "string",
          array: true,
          description: "Field names to treat as sensitive credentials",
        })
        .option("set", {
          type: "string",
          array: true,
          alias: "s",
          description: "Set credential key=value directly (repeatable, bypasses interactive)",
        })
        .option("terminal", {
          type: "boolean",
          description: "Use terminal readline for credential input (instead of browser)",
        })
        .option("force", {
          type: "boolean",
          alias: "f",
          description: "Force re-collect credentials (ignore cached values)",
        }) as Argv<MountAddArgs>,
    handler: async (argv) => {
      const cwd = options.cwd ?? process.cwd();

      // Step 1: Validate and resolve URI
      if (!argv.uri || argv.uri.trim() === "") {
        throw new Error("URI is required");
      }
      const resolvedUri = resolveUriPath(argv.uri, cwd);

      const validation = MountSchema.safeParse({
        path: argv.path,
        uri: resolvedUri,
        description: argv.description,
      });
      if (!validation.success) {
        const errors = validation.error.issues.map((e) => e.message).join("; ");
        throw new Error(errors);
      }

      // Collect extra options (any unknown --key value pairs)
      const extraOptions: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(argv)) {
        if (!KNOWN_MOUNT_KEYS.has(key) && !key.startsWith("-")) {
          extraOptions[key] = value;
        }
      }
      const sensitiveArgs = argv["sensitive-args"] ?? [];

      // Step 2: Resolve credentials FIRST (opens browser/terminal if needed)
      // This must happen before persisting mount config, so that if the user
      // cancels, no incomplete mount is left in config.toml.
      const { resolveCredentialsForMount } = await import("../../config/afs-loader.js");
      const { selectAuthContext, parseSetParams } = await import(
        "../../credential/terminal-auth-context.js"
      );
      const { createCredentialStore } = await import("../../credential/store.js");

      // --set mode: merge key=value pairs into extraOptions, skip interactive
      const setParams = parseSetParams(argv.set as string[] | undefined);
      if (setParams) {
        for (const [key, value] of Object.entries(setParams)) {
          extraOptions[key] = value;
        }
      }

      const authContext = setParams ? undefined : selectAuthContext(argv.terminal as boolean);
      const credentialStore = createCredentialStore();
      const credResolveOptions = {
        cwd,
        uri: resolvedUri,
        mountPath: validation.data.path,
        authContext,
        credentialStore,
        extraOptions: Object.keys(extraOptions).length > 0 ? extraOptions : undefined,
        sensitiveArgs,
        forceCollect: argv.force || undefined,
      };

      let credResult = await resolveCredentialsForMount(credResolveOptions);

      // Step 3: Verify mount works before persisting
      // Use resolved URI (template rebuilt with collected values) for verification
      const { verifyMount } = await import("../../config/afs-loader.js");
      let verifyUri = credResult?.resolvedUri ?? resolvedUri;
      let verifyOptions = { ...extraOptions, ...(credResult?.allValues ?? {}) };

      try {
        await verifyMount(
          verifyUri,
          validation.data.path,
          Object.keys(verifyOptions).length > 0 ? verifyOptions : undefined,
        );
      } catch (verifyError) {
        // Health check failed with silently resolved credentials →
        // retry once with forced interactive collection so user can fix values
        if (credResult && !credResult.collected) {
          credResult = await resolveCredentialsForMount({
            ...credResolveOptions,
            forceCollect: true,
          });
          verifyUri = credResult?.resolvedUri ?? resolvedUri;
          verifyOptions = { ...extraOptions, ...(credResult?.allValues ?? {}) };
          await verifyMount(
            verifyUri,
            validation.data.path,
            Object.keys(verifyOptions).length > 0 ? verifyOptions : undefined,
          );
        } else {
          throw verifyError;
        }
      }

      // Step 4: Persist credentials (only after health check succeeds) and mount config
      if (credResult) {
        await credResult.persistCredentials();
      }

      const nonSensitiveFromCreds = credResult?.nonSensitive ?? {};
      const mountOptions = { ...extraOptions, ...nonSensitiveFromCreds };
      // Strip sensitive fields — they go to credentials.toml, not config.toml
      if (credResult?.sensitiveFields) {
        for (const field of credResult.sensitiveFields) {
          delete mountOptions[field];
        }
      }
      // Strip URI template variables — already encoded in the URI itself
      {
        const { ProviderRegistry } = await import("@aigne/afs");
        const infoRegistry = new ProviderRegistry();
        const pInfo = await infoRegistry.getProviderInfo(resolvedUri);
        if (pInfo?.manifest?.uriTemplate) {
          const { getTemplateVariableNames } = await import("@aigne/afs/utils/uri-template");
          for (const v of getTemplateVariableNames(pInfo.manifest.uriTemplate)) {
            delete mountOptions[v];
          }
        }
      }
      const finalMountOptions = Object.keys(mountOptions).length > 0 ? mountOptions : undefined;

      // Use canonical URI for config.toml: prefer resolvedUri (template-rebuilt with defaults),
      // then configUri (env params stripped for MCP), then original URI.
      const persistUri = credResult?.resolvedUri ?? credResult?.configUri ?? validation.data.uri;

      const result = await persistMount(cwd, {
        path: validation.data.path,
        uri: persistUri,
        description: argv.description,
        options: finalMountOptions,
      });
      if (!result.success) {
        throw new Error(result.message ?? "Failed to add mount");
      }

      options.onResult({
        command: "mount add",
        result: { success: true, path: argv.path, uri: resolvedUri },
        format: (res: { path: string; uri: string }) => `Mounted ${res.uri} at ${res.path}`,
      });
    },
  };
}

/**
 * Create mount remove subcommand
 */
function createMountRemoveSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, MountRemoveArgs> {
  return {
    command: ["remove <path>", "rm <path>"],
    describe: "Unmount a path",
    builder: {
      path: {
        type: "string",
        demandOption: true,
        description: "Mount path to remove",
      },
      namespace: {
        type: "string",
        description: "Namespace of the mount",
      },
    },
    handler: async (argv) => {
      const cwd = options.cwd ?? process.cwd();
      const result = await mountRemoveCommand(cwd, argv.path);
      if (!result.success) {
        throw new Error(result.message ?? "Failed to remove mount");
      }
      options.onResult({
        command: "mount remove",
        result: { success: true, path: argv.path },
        format: (res: { success: boolean; path: string }) =>
          res.success ? `Unmounted ${res.path}` : `Failed to unmount ${res.path}`,
      });
    },
  };
}

/**
 * Format mount validate output
 */
function formatMountValidateOutput(result: MountValidateResult, view?: ViewType): string {
  if (view === "json") {
    return JSON.stringify(result, null, 2);
  }

  if (result.valid) {
    return "Configuration is valid";
  }

  const lines = ["Configuration validation failed:", ...result.errors.map((e) => `  - ${e}`)];
  return lines.join("\n");
}

/**
 * Create mount validate subcommand
 */
function createMountValidateSubcommand(options: CommandFactoryOptions): CommandModule {
  return {
    command: "validate",
    describe: "Validate mount configuration",
    handler: async () => {
      const cwd = options.cwd ?? process.cwd();
      const result = await mountValidateCommand(cwd);

      options.onResult({
        command: "mount validate",
        result,
        format: formatMountValidateOutput,
        error: result.valid ? undefined : { message: result.errors.join("; ") },
      });
    },
  };
}
