/**
 * CLI Runner - Execute AFS CLI commands in-process via AFSCommandExecutor
 *
 * Uses the shared executor from setup.ts for fast execution without spawning subprocesses.
 */

import { AFS, ProviderRegistry } from "@aigne/afs";
import { ConfigLoader } from "../../../src/config/loader.js";
import { AFSCommandExecutor } from "../../../src/core/executor/index.js";
import { VERSION } from "../../../src/version.js";
import { getExecutor, getTempDir } from "./setup.js";

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command using an AFSCommandExecutor and return CLI-style result
 */
async function executeCommand(
  executor: AFSCommandExecutor,
  args: string[],
  configDir?: string,
): Promise<CLIResult> {
  // Ensure AFS_USER_CONFIG_DIR points to the right dir
  // (the global test preload may override it in beforeEach)
  const savedConfigDir = process.env.AFS_USER_CONFIG_DIR;
  if (configDir) {
    process.env.AFS_USER_CONFIG_DIR = configDir;
  }

  try {
    const result = await executor.execute(args);

    if (result.success) {
      return {
        stdout: result.formatted?.trim() ?? "",
        stderr: "",
        exitCode: 0,
      };
    }

    // For errors, yargs outputs help + error to stderr in subprocess mode
    return {
      stdout: "",
      stderr: result.formatted?.trim() ?? result.error?.message ?? "",
      exitCode: result.error?.code ?? 5,
    };
  } finally {
    if (savedConfigDir === undefined) {
      delete process.env.AFS_USER_CONFIG_DIR;
    } else {
      process.env.AFS_USER_CONFIG_DIR = savedConfigDir;
    }
  }
}

/**
 * Run an AFS CLI command in-process using the shared executor from setupTestEnv
 *
 * @param args - Command line arguments
 * @returns CLI execution result
 */
export async function runCLI(args: string[]): Promise<CLIResult> {
  const executor = getExecutor();
  const tempDir = getTempDir();
  return executeCommand(executor, args, tempDir ?? undefined);
}

/**
 * Convenience wrapper for runCLI
 *
 * @example
 * const result = await afs("ls", "/", "--json");
 */
export async function afs(...args: string[]): Promise<CLIResult> {
  return runCLI(args);
}

/**
 * Create a test CLI runner bound to the shared executor
 */
export function createTestCli(_tempDir: string) {
  return {
    run: (...args: string[]) => runCLI(args),
  };
}

/**
 * Create a CLI runner from a config directory.
 * Loads config.toml, creates providers, and returns an executor-backed runner.
 *
 * Used by namespace tests where each test has its own mount configuration.
 *
 * @param cwd - Working directory containing .afs-config/config.toml
 * @returns CLI runner function
 */
export async function createConfigRunner(
  cwd: string,
): Promise<(args: string) => Promise<CLIResult>> {
  // Set env var BEFORE constructing ConfigLoader so it captures our config dir
  const savedConfigDir = process.env.AFS_USER_CONFIG_DIR;
  process.env.AFS_USER_CONFIG_DIR = cwd;

  const loader = new ConfigLoader();

  try {
    const config = await loader.load(cwd);
    const afsInstance = new AFS();
    const registry = new ProviderRegistry();

    for (const mount of config.mounts) {
      const provider = await registry.createProvider(mount);
      await afsInstance.mount(provider, mount.path, {
        namespace: mount.namespace ?? null,
      });
    }

    const executor = new AFSCommandExecutor(afsInstance, {
      cwd,
      tty: false,
      version: VERSION,
    });

    return async (args: string) => {
      // Pass string directly to executor — it has proper tokenization for quoted strings
      const savedDir = process.env.AFS_USER_CONFIG_DIR;
      if (cwd) {
        process.env.AFS_USER_CONFIG_DIR = cwd;
      }
      try {
        const result = await executor.execute(args);
        if (result.success) {
          return {
            stdout: result.formatted?.trim() ?? "",
            stderr: "",
            exitCode: 0,
          } as CLIResult;
        }
        return {
          stdout: "",
          stderr: result.formatted?.trim() ?? result.error?.message ?? "",
          exitCode: result.error?.code ?? 5,
        } as CLIResult;
      } finally {
        if (savedDir === undefined) {
          delete process.env.AFS_USER_CONFIG_DIR;
        } else {
          process.env.AFS_USER_CONFIG_DIR = savedDir;
        }
      }
    };
  } finally {
    if (savedConfigDir === undefined) {
      delete process.env.AFS_USER_CONFIG_DIR;
    } else {
      process.env.AFS_USER_CONFIG_DIR = savedConfigDir;
    }
  }
}
