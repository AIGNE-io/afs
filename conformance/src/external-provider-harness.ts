/**
 * External Provider Test Harness
 *
 * Manages external provider process lifecycle for conformance testing.
 * Spawns provider as a child process, waits for it to attach to a core,
 * and provides cleanup on test completion.
 */

import { type ChildProcess, spawn } from "node:child_process";

export interface ProviderHandle {
  /** The spawned child process */
  process: ChildProcess;
  /** Stop the provider process */
  stop(): Promise<void>;
  /** Whether the process is still running */
  readonly running: boolean;
}

export interface SpawnProviderOptions {
  /** URL of the AFS core to connect to */
  coreUrl: string;
  /** Timeout for provider to attach (ms, default: 10000) */
  attachTimeout?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Working directory for the provider process */
  cwd?: string;
}

/**
 * Spawn an external provider process and wait for it to be ready.
 *
 * The script should use `createSessionEntry` to connect and attach to the core.
 * This function waits for the process to start (via stdout "attached" signal or timeout).
 *
 * @param scriptPath - Path to the provider's session entry script
 * @param options - Spawn options including core URL
 * @returns Handle to manage the provider process
 */
export async function spawnProvider(
  scriptPath: string,
  options: SpawnProviderOptions,
): Promise<ProviderHandle> {
  const timeout = options.attachTimeout ?? 10_000;

  const child = spawn("bun", ["run", scriptPath], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
      AFS_CORE_URL: options.coreUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let running = true;

  child.on("exit", () => {
    running = false;
  });

  // Wait for process to start (either "attached" on stdout or a brief delay)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        if (running) {
          // Process started but no explicit signal — assume it's ready
          resolve();
        } else {
          reject(new Error(`Provider process exited before attach (timeout: ${timeout}ms)`));
        }
      },
      Math.min(timeout, 2000),
    ); // Wait at most 2s for startup

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.includes("attached") || text.includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      // Log stderr for debugging
      process.stderr.write(`[provider] ${data}`);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn provider: ${err.message}`));
    });

    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        reject(new Error(`Provider exited with code ${code}`));
      }
    });
  });

  return {
    process: child,
    get running() {
      return running;
    },
    async stop() {
      if (!running) return;
      child.kill("SIGTERM");
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 5000);
        child.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      running = false;
    },
  };
}
