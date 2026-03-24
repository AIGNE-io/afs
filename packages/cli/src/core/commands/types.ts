/**
 * Command Factory Types
 *
 * Defines the interface for yargs CommandModule factories.
 */

import type { AFS } from "@aigne/afs";
import type { CommandModule } from "yargs";
import type { ViewType } from "../types.js";

/**
 * Format function type for command output
 *
 * Uses `any` for result type to allow different AFS result types
 * (AFSListResult, AFSReadResult, etc.) to be passed to the formatter.
 */
export type FormatFunction = (result: any, view: ViewType, options?: { path?: string }) => string;

/**
 * Command output passed to executor via onResult callback
 */
export interface CommandOutput {
  /** The command name (ls, read, write, etc.) */
  command: string;
  /** Raw result from AFS operation */
  result: unknown;
  /** Format function to convert result to string */
  format: FormatFunction;
  /** Override the view type (e.g. -l flag forces "human" view) */
  viewOverride?: ViewType;
  /** Error info if command failed (presence indicates failure) */
  error?: {
    /** Exit code (from ExitCode enum) */
    code?: number;
    /** Error message */
    message: string;
  };
}

/**
 * Options passed to command factory functions
 */
export interface CommandFactoryOptions {
  /** AFS instance for executing operations (optional: injected in tests, lazy-loaded in production) */
  afs?: AFS;
  /** Original command line arguments (for pre-parsing in builder) */
  argv: string[];
  /** Callback to pass result back to executor */
  onResult: (output: CommandOutput) => void;
  /** Current working directory (for explore command) */
  cwd?: string;
}

/**
 * Resolve AFS instance: use injected instance or lazy-load from config.
 * Heavy deps (loadAFS, credentials) are loaded lazily so this module
 * can be imported in environments that lack Node.js builtins (e.g. Workers).
 */
export async function resolveAFS(options: CommandFactoryOptions): Promise<AFS> {
  if (options.afs) return options.afs;
  const { loadAFS } = await import("../../config/afs-loader.js");
  const { createCLIAuthContext } = await import("../../credential/cli-auth-context.js");
  const { createCredentialStore } = await import("../../credential/store.js");
  return loadAFS(options.cwd ?? process.cwd(), {
    authContext: createCLIAuthContext(),
    credentialStore: createCredentialStore(),
  }).then((result) => result.afs);
}

/**
 * Command factory function type
 *
 * Uses `any` for CommandModule generics to allow different command
 * factories (with different argument types) to be stored in a common array.
 * Each individual factory uses strict types internally.
 */
export type CommandFactory = (options: CommandFactoryOptions) => CommandModule<unknown, any>;
