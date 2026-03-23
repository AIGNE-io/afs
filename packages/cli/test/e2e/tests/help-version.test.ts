/**
 * E2E tests for help and version commands
 *
 * Ensures consistent help output format across all commands.
 * Uses snapshots to detect unintended changes.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";

describe("Help and Version Commands", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  // ============================================================
  // Global options
  // ============================================================
  describe("global options", () => {
    test("afs --help shows main help", async () => {
      const result = await cli.run("--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("main-help");
    });

    test("afs -h shows main help", async () => {
      const result = await cli.run("-h");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("main-help-short");
    });

    test("afs --version shows version", async () => {
      const result = await cli.run("--version");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("afs -v shows version", async () => {
      const result = await cli.run("-v");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
    });

    test("afs without args shows help with error", async () => {
      const result = await cli.run();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatchSnapshot("no-args-help");
    });
  });

  // ============================================================
  // Command help
  // ============================================================
  describe("command help", () => {
    test("afs ls --help", async () => {
      const result = await cli.run("ls", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("ls-help");
    });

    test("afs read --help", async () => {
      const result = await cli.run("read", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("read-help");
    });

    test("afs write --help", async () => {
      const result = await cli.run("write", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("write-help");
    });

    test("afs delete --help", async () => {
      const result = await cli.run("delete", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("delete-help");
    });

    test("afs stat --help", async () => {
      const result = await cli.run("stat", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("stat-help");
    });

    test("afs exec --help", async () => {
      const result = await cli.run("exec", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("exec-help");
    });

    test("afs explain --help", async () => {
      const result = await cli.run("explain", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("explain-help");
    });

    test("afs serve --help", async () => {
      const result = await cli.run("serve", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("serve-help");
    });

    test("afs explore --help", async () => {
      const result = await cli.run("explore", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("explore-help");
    });
  });

  // ============================================================
  // Mount subcommand help
  // ============================================================
  describe("mount subcommand help", () => {
    test("afs mount --help", async () => {
      const result = await cli.run("mount", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("mount-help");
    });

    test("afs mount list --help", async () => {
      const result = await cli.run("mount", "list", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("mount-list-help");
    });

    test("afs mount add --help", async () => {
      const result = await cli.run("mount", "add", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("mount-add-help");
    });

    test("afs mount remove --help", async () => {
      const result = await cli.run("mount", "remove", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("mount-remove-help");
    });

    test("afs mount validate --help", async () => {
      const result = await cli.run("mount", "validate", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("mount-validate-help");
    });
  });

  // ============================================================
  // Alias command help
  // ============================================================
  describe("alias command help", () => {
    test("afs list --help (ls alias)", async () => {
      const result = await cli.run("list", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("list-alias-help");
    });

    test("afs rm --help (delete alias)", async () => {
      const result = await cli.run("rm", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("rm-alias-help");
    });
  });

  // ============================================================
  // exec with path (dynamic help)
  // ============================================================
  describe("exec with path help", () => {
    test("afs exec /mcp/tools/echo --help shows tool description", async () => {
      const result = await cli.run("exec", "/mcp/tools/echo", "--help");
      expect(result.exitCode).toBe(0);
      // Should show the specific tool path and description
      expect(result.stdout).toContain("/mcp/tools/echo");
      expect(result.stdout).toMatchSnapshot("exec-mcp-tool-help");
    });

    test("afs exec /sqlite/users/.actions/count --help shows action description", async () => {
      const result = await cli.run("exec", "/sqlite/users/.actions/count", "--help");
      expect(result.exitCode).toBe(0);
      // Should show the specific action path
      expect(result.stdout).toContain("/sqlite/users/.actions/count");
      expect(result.stdout).toMatchSnapshot("exec-sqlite-action-help");
    });
  });
});
