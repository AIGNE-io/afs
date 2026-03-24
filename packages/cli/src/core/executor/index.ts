/**
 * AFS Command Executor
 *
 * Unified command execution interface using yargs and CommandFactory pattern.
 */

import type { AFS } from "@aigne/afs";
import yargs from "yargs";
import type { CommandFactory, CommandFactoryOptions, CommandOutput } from "../commands/types.js";
import type { ViewType } from "../types.js";

/**
 * Result from executing a command
 */
export interface ExecuteResult {
  /** Whether the command executed successfully */
  success: boolean;
  /** The command that was executed (ls, read, write, etc.) */
  command: string;
  /** The raw result data from AFS */
  result?: unknown;
  /** Formatted output string */
  formatted: string;
  /** Error info if the command failed */
  error?: {
    /** Exit code (from ExitCode enum) */
    code?: number;
    /** Error message */
    message: string;
  };
}

/**
 * Options for the executor
 */
export interface ExecutorOptions {
  /** Whether the output is for a TTY (enables colors) */
  tty?: boolean;
  /** Current working directory (for explore command) */
  cwd?: string;
  /** Version of the AFS CLI */
  version?: string;
}

/** Known command names and aliases for suggestion matching. */
const KNOWN_COMMANDS = [
  "ls",
  "list",
  "read",
  "cat",
  "write",
  "delete",
  "rm",
  "stat",
  "exec",
  "explain",
  "search",
  "grep",
  "find",
  "mount",
  "serve",
  "explore",
  "service",
  "connect",
  "vault",
];

/**
 * AFS Command Executor
 *
 * Provides a unified interface for executing AFS commands using yargs.
 *
 * @example
 * ```typescript
 * const executor = new AFSCommandExecutor(afs, { tty: false });
 * const result = await executor.execute("afs ls /path --depth=2");
 * console.log(result.formatted);
 * ```
 */
export class AFSCommandExecutor {
  private afs?: AFS;
  private options: ExecutorOptions;
  private customFactories?: CommandFactory[];

  constructor(afs?: AFS, options?: ExecutorOptions & { factories?: CommandFactory[] }) {
    this.afs = afs;
    this.options = options ?? {};
    this.customFactories = options?.factories;
  }

  /**
   * Execute an AFS command
   *
   * @param argv - Command string or array of arguments
   *   - String: "afs ls /path --depth=2" or "ls /path --depth=2"
   *   - Array: ["ls", "/path", "--depth=2"]
   * @returns Execution result with formatted output
   */
  async execute(argv: string | string[]): Promise<ExecuteResult> {
    const normalizedArgs = this.normalizeArgv(argv);

    // Capture command result
    let commandResult: CommandOutput | undefined;

    // Determine output format from args
    const outputOptions = this.extractOutputOptions(normalizedArgs);

    // Create factory options
    const factoryOptions: CommandFactoryOptions = {
      afs: this.afs,
      argv: normalizedArgs,
      cwd: this.options.cwd,
      onResult: (result) => {
        commandResult = result;
      },
    };

    // Capture fail() info so we can format errors ourselves
    let failMsg: string | undefined;
    let failErr: Error | undefined;

    // Build yargs parser with all commands
    let parser = yargs(normalizedArgs)
      .scriptName("afs")
      .usage("$0 <command> [options]")
      .option("json", {
        type: "boolean",
        description: "Output in JSON format",
        global: true,
      })
      .option("yaml", {
        type: "boolean",
        description: "Output in YAML format",
        global: true,
      })
      .option("view", {
        type: "string",
        choices: ["default", "llm", "human"],
        default: "default",
        description: "Output view format",
        global: true,
      })
      .option("interactive", {
        alias: "i",
        type: "boolean",
        description: "Start interactive REPL mode",
        global: false,
      })
      .help(true)
      .alias("h", "help")
      .version(this.options.version || "unknown")
      .alias("v", "version")
      .demandCommand()
      .strictCommands()
      .exitProcess(false)
      .fail((msg, err) => {
        // Prevent yargs from writing to stderr; we handle output ourselves.
        failErr = err || new Error(msg || "Unknown error");
        failMsg = msg;
      });

    // Register all commands from factories (custom or lazy-loaded default).
    // NOTE: The variable-based import prevents bundlers from statically resolving
    // the barrel module (which pulls in heavy Node-only commands).
    // When customFactories is provided (e.g. Workers), the fallback never executes.
    const _cmdBarrel = "../commands/index.js";
    const factories = this.customFactories ?? (await import(_cmdBarrel)).commandFactories;
    for (const factory of factories) {
      parser = parser.command(factory(factoryOptions));
    }

    // Parse and execute
    try {
      let output: string | undefined;

      await parser.parseAsync(normalizedArgs, {}, (_e, _, o) => {
        output = o;
      });

      if (failErr) {
        const formatted = await this.formatFailure(normalizedArgs, failMsg, parser);
        return {
          success: false,
          command: normalizedArgs[0] || "unknown",
          result: undefined,
          formatted,
          error: { message: failMsg || failErr.message },
        };
      }

      if (output) {
        // --help or --version produced output
        return {
          success: true,
          command: "help",
          formatted: output,
        };
      }

      if (!commandResult) {
        const formatted = await this.formatFailure(normalizedArgs, undefined, parser);
        return {
          success: false,
          command: normalizedArgs[0] || "unknown",
          result: undefined,
          formatted,
          error: { message: `Unknown command: "${normalizedArgs[0] || ""}"` },
        };
      }

      // Always use the formatter - it handles json/llm/human views
      // Explicit format flags (--json, --yaml, --view) take precedence over command viewOverride (e.g. -l)
      const view: ViewType = outputOptions.json
        ? "json"
        : outputOptions.yaml
          ? "yaml"
          : (commandResult.viewOverride ?? outputOptions.view);
      const formatted = commandResult.format(commandResult.result, view, {
        path: this.extractPath(normalizedArgs),
      });

      // Check if command indicated failure
      if (commandResult.error) {
        return {
          success: false,
          command: commandResult.command,
          result: commandResult.result,
          formatted,
          error: commandResult.error,
        };
      }

      return {
        success: true,
        command: commandResult.command,
        result: commandResult.result,
        formatted,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        command: normalizedArgs[0] || "unknown",
        result: undefined,
        formatted: `ERROR: ${errorMessage}`,
        error: { message: errorMessage },
      };
    }
  }

  /**
   * Format a friendly error message for unknown/invalid commands.
   */
  private async formatFailure(
    args: string[],
    failMsg: string | undefined,
    parser: ReturnType<typeof yargs>,
  ): Promise<string> {
    const cmd = args[0] || "";
    const lines: string[] = [];

    // Show what went wrong
    if (cmd && failMsg?.includes("Unknown command")) {
      lines.push(`Unknown command: "${cmd}"`);
      const suggestions = suggestCommands(cmd);
      if (suggestions.length > 0) {
        lines.push("");
        lines.push(`Did you mean?`);
        for (const s of suggestions) {
          lines.push(`  afs ${s}`);
        }
      }
    } else if (failMsg) {
      lines.push(failMsg);
    } else {
      lines.push(`Unknown command: "${cmd}"`);
    }

    // Append help text
    lines.push("");
    try {
      const helpText = await parser.getHelp();
      lines.push(helpText);
    } catch {
      lines.push('Run "afs --help" to see available commands.');
    }

    return lines.join("\n");
  }

  /**
   * Normalize argv to an array of strings
   */
  private normalizeArgv(argv: string | string[]): string[] {
    if (typeof argv === "string") {
      // Parse quoted strings properly
      return this.tokenize(argv);
    }

    // Filter array input
    const filtered: string[] = [];
    let foundCommand = false;

    for (const arg of argv) {
      // Skip node and script paths (for process.argv format)
      if (
        !foundCommand &&
        (arg.includes("node") || arg.includes("bun") || arg.endsWith(".js") || arg.endsWith(".ts"))
      ) {
        continue;
      }

      // Skip "afs" prefix
      if (!foundCommand && arg === "afs") {
        continue;
      }

      filtered.push(arg);
      if (!arg.startsWith("-")) {
        foundCommand = true;
      }
    }

    return filtered;
  }

  /**
   * Tokenize a command string, respecting quotes
   */
  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inQuote = false;
    let quoteChar = "";

    for (let i = 0; i < input.length; i++) {
      const char = input[i]!;

      if (inQuote) {
        if (char === quoteChar) {
          inQuote = false;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuote = true;
        quoteChar = char;
      } else if (char === " " || char === "\t") {
        if (current) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    // Filter out "afs" prefix if present
    if (tokens[0] === "afs") {
      tokens.shift();
    }

    return tokens;
  }

  /**
   * Extract output options from args
   */
  private extractOutputOptions(args: string[]): {
    json: boolean;
    yaml: boolean;
    view: ViewType;
  } {
    let json = false;
    let yaml = false;
    let view: ViewType | undefined;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--json") json = true;
      if (arg === "--yaml") yaml = true;
      if (arg.startsWith("--view=")) {
        view = arg.slice(7) as ViewType;
      } else if (arg === "--view" && args[i + 1] && !args[i + 1]!.startsWith("-")) {
        view = args[i + 1] as ViewType;
      }
    }

    // Default to human view in TTY, default otherwise
    if (!view) {
      view = this.options.tty ? "human" : "default";
    }

    return { json, yaml, view };
  }

  /**
   * Extract path from args (first non-option argument after command)
   */
  private extractPath(args: string[]): string | undefined {
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]!;
      if (!arg.startsWith("-")) {
        return arg;
      }
    }
    return undefined;
  }
}

/** Levenshtein distance between two strings. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

/** Suggest known commands similar to the given input. */
function suggestCommands(input: string): string[] {
  const lower = input.toLowerCase();
  const scored = KNOWN_COMMANDS.map((cmd) => ({
    cmd,
    dist: levenshtein(lower, cmd),
    maxLen: Math.max(lower.length, cmd.length),
  }))
    // Only suggest when edit distance < 50% of the longer string
    .filter((x) => x.dist > 0 && x.dist < x.maxLen * 0.5)
    .sort((a, b) => a.dist - b.dist);
  return scored.map((x) => x.cmd).slice(0, 3);
}
