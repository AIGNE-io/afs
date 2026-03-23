/**
 * E2E Test Setup and Teardown
 *
 * Creates isolated test environment with all 5 providers mounted.
 * Uses in-process AFS + AFSCommandExecutor for fast test execution.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { AFSGit } from "@aigne/afs-git";
import { AFSJSON } from "@aigne/afs-json";
import { AFSMCP } from "@aigne/afs-mcp";
import { SQLiteAFS } from "@aigne/afs-sqlite";
import { AFSCommandExecutor } from "../../../src/core/executor/index.js";

let tempDir: string | null = null;
let executor: AFSCommandExecutor | null = null;
let afsInstance: AFS | null = null;

/**
 * Get the fixtures directory path
 */
function getFixturesDir(): string {
  return join(import.meta.dir, "../fixtures");
}

/**
 * Setup the test environment
 *
 * - Creates a temporary directory
 * - Copies fixtures
 * - Initializes Git repository
 * - Mounts all 5 providers in-process (no subprocess)
 *
 * @returns Path to the temporary directory
 */
export async function setupTestEnv(): Promise<string> {
  // Create unique temp directory
  tempDir = await mkdtemp(join(tmpdir(), "afs-e2e-"));

  const fixturesDir = getFixturesDir();

  // Copy fixtures to temp dir
  await cp(fixturesDir, tempDir, {
    recursive: true,
    filter: (src) => !src.includes(".git"),
  });

  // Create .afs-config directory and config.toml for mount configuration
  const configDir = join(tempDir, ".afs-config");
  await mkdir(configDir, { recursive: true });

  // Write config.toml so commands that read config (e.g., explain mount) can see mounts
  const configToml = `[[mounts]]
path = "/fs"
uri = "fs://${join(tempDir, "fs")}"
description = "E2E Test FS Provider"

[[mounts]]
path = "/json"
uri = "json://${join(tempDir, "json/data.json")}"
description = "E2E Test JSON Provider"

[[mounts]]
path = "/sqlite"
uri = "sqlite://${join(tempDir, "sqlite/test.db")}"
description = "E2E Test SQLite Provider"

[[mounts]]
path = "/mcp"
uri = "mcp+stdio://${join(import.meta.dir, "../../../node_modules/.bin/mcp-server-everything")}"
description = "E2E Test MCP Provider"

[[mounts]]
path = "/git"
uri = "git://${join(tempDir, "git/repo")}?branch=main"
description = "E2E Test Git Provider"
`;
  // Write to both locations: user config dir (tempDir/) and local config dir (.afs-config/)
  await writeFile(join(tempDir, "config.toml"), configToml);
  await writeFile(join(configDir, "config.toml"), configToml);

  // Initialize Git repository
  const gitRepoDir = join(tempDir, "git/repo");
  if (existsSync(gitRepoDir)) {
    try {
      execSync("git init -b main", { cwd: gitRepoDir, stdio: "pipe" });
      execSync('git config user.name "E2E Test"', {
        cwd: gitRepoDir,
        stdio: "pipe",
      });
      execSync('git config user.email "e2e@test.local"', {
        cwd: gitRepoDir,
        stdio: "pipe",
      });
      execSync("git config commit.gpgsign false", {
        cwd: gitRepoDir,
        stdio: "pipe",
      });
      execSync("git add .", { cwd: gitRepoDir, stdio: "pipe" });
      execSync('git commit -m "Initial commit"', {
        cwd: gitRepoDir,
        stdio: "pipe",
      });

      // Create dev branch
      execSync("git checkout -b dev", { cwd: gitRepoDir, stdio: "pipe" });
      execSync('git commit --allow-empty -m "Dev branch"', {
        cwd: gitRepoDir,
        stdio: "pipe",
      });
      execSync("git checkout main", { cwd: gitRepoDir, stdio: "pipe" });
    } catch (error) {
      console.warn("Git initialization failed (git may not be available):", error);
    }
  }

  // Set environment variables
  process.env.E2E_TEMP_DIR = tempDir;
  process.env.AFS_USER_CONFIG_DIR = tempDir;

  // Mount providers in-process
  afsInstance = new AFS();

  // FS Provider
  await afsInstance.mount(
    new AFSFS({
      localPath: join(tempDir, "fs"),
      description: "E2E Test FS Provider",
    }),
    "/fs",
  );

  // JSON Provider
  await afsInstance.mount(
    new AFSJSON({
      jsonPath: join(tempDir, "json/data.json"),
      description: "E2E Test JSON Provider",
    }),
    "/json",
  );

  // SQLite Provider
  await afsInstance.mount(
    new SQLiteAFS({
      url: `file:${join(tempDir, "sqlite/test.db")}`,
      description: "E2E Test SQLite Provider",
    }),
    "/sqlite",
  );

  // MCP Provider (Everything Server)
  const mcpServerPath = join(import.meta.dir, "../../../node_modules/.bin/mcp-server-everything");
  await afsInstance.mount(
    new AFSMCP({
      transport: "stdio",
      command: mcpServerPath,
      args: [],
      description: "E2E Test MCP Provider",
    }),
    "/mcp",
  );

  // Git Provider
  if (existsSync(gitRepoDir)) {
    await afsInstance.mount(
      new AFSGit({
        repoPath: gitRepoDir,
        branches: ["main"],
        description: "E2E Test Git Provider",
      }),
      "/git",
    );
  }

  // Create shared executor
  const pkgPath = join(import.meta.dir, "../../../package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  executor = new AFSCommandExecutor(afsInstance, {
    tty: false,
    cwd: tempDir,
    version: pkg.version,
  });

  return tempDir;
}

/**
 * Teardown the test environment
 *
 * Removes the temporary directory and all its contents
 */
export async function teardownTestEnv(): Promise<void> {
  executor = null;
  afsInstance = null;

  if (tempDir) {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Cleanup warning:", error);
    }
    tempDir = null;
  }

  // Clean up environment variables
  delete process.env.E2E_TEMP_DIR;
  delete process.env.AFS_USER_CONFIG_DIR;
}

/**
 * Get the current temp directory path
 */
export function getTempDir(): string | null {
  return tempDir;
}

/**
 * Get the shared executor instance
 */
export function getExecutor(): AFSCommandExecutor {
  if (!executor) {
    throw new Error("Test environment not initialized. Call setupTestEnv() first.");
  }
  return executor;
}
