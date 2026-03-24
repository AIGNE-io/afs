/**
 * CLI Core Commands
 *
 * Re-exports all command implementations and factories.
 */

export { type ConnectArgs, createConnectCommand } from "./connect.js";
export { createServiceCommand, type ServiceArgs } from "./daemon.js";
// Command factories and types
export { createDeleteCommand, type DeleteArgs } from "./delete.js";
export { createDIDCommand } from "./did.js";
export { createExecCommand, type ExecArgs, parseExecArgs, parseValueBySchema } from "./exec.js";
export { createExplainCommand, type ExplainArgs } from "./explain.js";
export { createExploreCommand, type ExploreArgs } from "./explore.js";
export { createGenAgentMdCommand, type GenAgentMdArgs, generateAgentMd } from "./gen-agent-md.js";
export { createLsCommand, type LsArgs } from "./ls.js";
export { createMcpBridgeCommand, type McpBridgeArgs } from "./mcp-bridge.js";
export {
  createMountCommand,
  type MountAddArgs,
  type MountListArgs,
  type MountRemoveArgs,
} from "./mount.js";
export { createReadCommand, type ReadArgs } from "./read.js";
export { createSearchCommand, type SearchArgs } from "./search.js";
export { createServeCommand, type ServeArgs, type ServeResult } from "./serve.js";
export { createStatCommand, type StatArgs } from "./stat.js";
// Types and helpers
export type {
  CommandFactory,
  CommandFactoryOptions,
  CommandOutput,
  FormatFunction,
} from "./types.js";
export { resolveAFS } from "./types.js";
export { createVaultCommand } from "./vault.js";
export { createWriteCommand, type WriteArgs } from "./write.js";

// Import factories for array export
import { createConnectCommand } from "./connect.js";
import { createServiceCommand } from "./daemon.js";
import { createDeleteCommand } from "./delete.js";
import { createDIDCommand } from "./did.js";
import { createExecCommand } from "./exec.js";
import { createExplainCommand } from "./explain.js";
import { createExploreCommand } from "./explore.js";
import { createGenAgentMdCommand } from "./gen-agent-md.js";
import { createLsCommand } from "./ls.js";
import { createMcpBridgeCommand } from "./mcp-bridge.js";
import { createMountCommand } from "./mount.js";
import { createReadCommand } from "./read.js";
import { createSearchCommand } from "./search.js";
import { createServeCommand } from "./serve.js";
import { createStatCommand } from "./stat.js";
import type { CommandFactory } from "./types.js";
import { createVaultCommand } from "./vault.js";
import { createWriteCommand } from "./write.js";

/**
 * Array of all command factories
 *
 * Used by AFSCommandExecutor to register all commands.
 */
export const commandFactories: CommandFactory[] = [
  createLsCommand,
  createReadCommand,
  createWriteCommand,
  createDeleteCommand,
  createStatCommand,
  createExecCommand,
  createExplainCommand,
  createSearchCommand,
  createMountCommand,
  createServeCommand,
  createExploreCommand,
  createDIDCommand,
  createVaultCommand,
  createServiceCommand,
  createConnectCommand,
  createMcpBridgeCommand,
  createGenAgentMdCommand,
];
