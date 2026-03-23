/**
 * Global test setup for AFS CLI tests
 *
 * This file is loaded before all tests via bunfig.toml preload.
 * It isolates tests from the real user config directory.
 */

import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Force English locale so yargs output is deterministic across environments
process.env.LC_ALL = "C";

let testUserConfigDir: string | undefined;
let originalUserConfigDir: string | undefined;

beforeEach(() => {
  // Create a temporary directory for user config isolation
  testUserConfigDir = mkdtempSync(join(tmpdir(), "afs-test-user-config-"));
  // Save original and set isolated user config dir
  originalUserConfigDir = process.env.AFS_USER_CONFIG_DIR;
  process.env.AFS_USER_CONFIG_DIR = testUserConfigDir;
});

afterEach(() => {
  // Restore original environment
  if (originalUserConfigDir === undefined) {
    delete process.env.AFS_USER_CONFIG_DIR;
  } else {
    process.env.AFS_USER_CONFIG_DIR = originalUserConfigDir;
  }
  // Clean up temp directory
  if (testUserConfigDir) {
    try {
      rmSync(testUserConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    testUserConfigDir = undefined;
  }
});
