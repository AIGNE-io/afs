/**
 * AFS CLI Core Module
 *
 * Core command implementations and formatters for use by external projects.
 * This module does not include terminal output controls (colors, spinners).
 *
 * Uses AFS native types (AFSListResult, AFSReadResult, etc.) directly.
 *
 * @packageDocumentation
 * @module @aigne/afs-cli/core
 */

export type {
  CommandFactory,
  CommandFactoryOptions,
  CommandOutput,
  // Args types
  DeleteArgs,
  ExecArgs,
  ExplainArgs,
  FormatFunction,
  LsArgs,
  MountAddArgs,
  MountListArgs,
  MountRemoveArgs,
  ReadArgs,
  StatArgs,
  WriteArgs,
} from "./commands/index.js";
// Commands
export {
  // Command factories
  commandFactories,
  createDeleteCommand,
  createExecCommand,
  createExplainCommand,
  createLsCommand,
  createMountCommand,
  createReadCommand,
  createSearchCommand,
  createStatCommand,
  createWriteCommand,
} from "./commands/index.js";
export type { ExecuteResult, ExecutorOptions } from "./executor/index.js";
// Executor (primary API)
export { AFSCommandExecutor } from "./executor/index.js";
// Formatters
export {
  formatDeleteOutput,
  formatExecOutput,
  formatExplainOutput,
  formatLsOutput,
  formatMountListOutput,
  formatReadOutput,
  formatStatOutput,
  formatWriteOutput,
} from "./formatters/index.js";
export type { FormatLsOptions } from "./formatters/ls.js";
// Helpers
export {
  parseExecArgs,
  parseExecArgsWithStdin,
  parseValueBySchema,
  RESERVED_OPTIONS,
  readStdin,
  schemaTypeToYargs,
} from "./helpers/index.js";
export type { ParsedCliPath } from "./path-utils.js";
// Path utilities
export { cliPathToCanonical, parseCliPath } from "./path-utils.js";

// Types (CLI-specific only)
export type { JSONSchema, ViewType } from "./types.js";
