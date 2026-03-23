/**
 * TerminalSession — Shared terminal REPL logic for both Workers and Node daemon.
 *
 * Wraps AFSCommandExecutor + REPL context. Platform-independent — transport
 * layer (DO WebSocket vs ws library) is separate.
 *
 * Usage:
 *   const session = await TerminalSession.create(afs, { version: "0.1.0" });
 *   const banner = session.getBanner();
 *   const messages = await session.handleLine("ls /");
 */

import type { AFS } from "@aigne/afs";
import type { CommandFactory } from "./core/commands/types.js";
import { AFSCommandExecutor } from "./core/executor/index.js";
import {
  createReplContext,
  getBanner,
  handleBuiltinCommand,
  isBuiltinCommand,
  isExploreCommand,
  type ReplContext,
  resolveArgvPath,
} from "./repl.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface TerminalMessage {
  type: "output" | "clear";
  data?: string;
}

export interface TerminalSessionConfig {
  /** Version string shown in banner. */
  version?: string;
  /**
   * Command factories to register. When omitted, uses the default set
   * (all commands — suitable for Node). Pass a subset for constrained
   * environments (e.g. Workers where mount/service/explore are unavailable).
   */
  factories?: CommandFactory[];
}

// ─── Class ────────────────────────────────────────────────────────────────

export class TerminalSession {
  private ctx: ReplContext;

  constructor(afs: AFS, config?: TerminalSessionConfig) {
    const version = config?.version ?? "0.1.0";
    const executor = new AFSCommandExecutor(afs, {
      tty: false,
      version,
      factories: config?.factories,
    });
    this.ctx = createReplContext({ executor, afs, version });
  }

  /** Welcome banner text. */
  getBanner(): string {
    return getBanner(this.ctx);
  }

  /**
   * Process one line of user input.
   * Returns an array of messages to send to the client.
   */
  async handleLine(line: string): Promise<TerminalMessage[]> {
    const messages: TerminalMessage[] = [];

    try {
      // Explore command — not available in portal terminal
      if (isExploreCommand(line)) {
        messages.push({
          type: "output",
          data: "explore is not available in this runtime.\nUse the AFS Explorer window instead.",
        });
        return messages;
      }

      // Builtin commands (cd, pwd, help, clear, exit)
      if (isBuiltinCommand(line)) {
        const result = await handleBuiltinCommand(line, this.ctx);
        if (result) {
          if (line.trim().startsWith("clear")) {
            messages.push({ type: "clear" });
          } else if (result.output) {
            messages.push({ type: "output", data: result.output });
          }
          if (result.exit) {
            messages.push({
              type: "output",
              data: "Bye! (session stays open — reconnect to continue)",
            });
          }
          return messages;
        }
      }

      // Resolve relative paths and execute
      const resolved = resolveArgvPath(line, this.ctx);
      const result = await this.ctx.executor.execute(resolved);

      if (result.formatted) {
        messages.push({ type: "output", data: result.formatted });
      }
      if (!result.success && result.error && !result.formatted?.includes(result.error.message)) {
        messages.push({ type: "output", data: `Error: ${result.error.message}` });
      }

      this.ctx.completionCache.clear();
    } catch (err) {
      messages.push({
        type: "output",
        data: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    return messages;
  }
}
