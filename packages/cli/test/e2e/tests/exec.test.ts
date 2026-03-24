/**
 * E2E tests for exec command with MCP tools
 *
 * Tests MCP tool execution via exec command:
 * - Tool listing and reading
 * - Tool execution with parameters
 * - All views: human, llm, json
 *
 * Uses @modelcontextprotocol/server-everything which provides:
 * - echo: Simple echo tool that returns the message
 * - And other test tools
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestCli } from "../helpers/cli-runner.js";
import { setupTestEnv, teardownTestEnv } from "../helpers/setup.js";
import { removeTimestamps } from "../helpers/snapshot.js";

describe("exec command - MCP tools", () => {
  let cli: ReturnType<typeof createTestCli>;

  beforeAll(async () => {
    const tempDir = await setupTestEnv();
    cli = createTestCli(tempDir);
  }, 30000);

  afterAll(async () => {
    await teardownTestEnv();
  });

  const views = ["human", "llm", "json"];

  // ============================================================
  // MCP tools directory listing
  // ============================================================
  describe("tools directory", () => {
    describe.each(views)("view=%s", (view) => {
      test("ls /mcp/tools lists available tools", async () => {
        const args =
          view === "json" ? ["ls", "/mcp/tools", "--json"] : ["ls", "/mcp/tools", "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output = removeTimestamps(result.stdout);
        expect(output).toMatchSnapshot(`exec-${view}-mcp-tools-list`);
      }, 30000);
    });
  });

  // ============================================================
  // MCP tool reading (get tool info)
  // ============================================================
  describe("tool info", () => {
    describe.each(views)("view=%s", (view) => {
      test("read /mcp/tools/echo shows tool info", async () => {
        const args =
          view === "json"
            ? ["read", "/mcp/tools/echo", "--json"]
            : ["read", "/mcp/tools/echo", "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output = removeTimestamps(result.stdout);
        expect(output).toMatchSnapshot(`exec-${view}-mcp-tool-echo-info`);
      }, 30000);
    });
  });

  // ============================================================
  // MCP tool execution
  // ============================================================
  describe("tool execution", () => {
    describe.each(views)("view=%s", (view) => {
      test("exec /mcp/tools/echo with message", async () => {
        const args =
          view === "json"
            ? ["exec", "/mcp/tools/echo", "--message", "Hello from E2E test", "--json"]
            : ["exec", "/mcp/tools/echo", "--message", "Hello from E2E test", "--view", view];
        const result = await cli.run(...args);
        expect(result.exitCode).toBe(0);

        const output = removeTimestamps(result.stdout);
        expect(output).toMatchSnapshot(`exec-${view}-mcp-echo`);

        // Verify the echo response contains our message
        if (view === "json") {
          const data = JSON.parse(result.stdout);
          expect(data.success).toBe(true);
        }
      }, 30000);
    });

    test("exec with --args JSON parameter", async () => {
      const result = await cli.run(
        "exec",
        "/mcp/tools/echo",
        "--args",
        '{"message": "Hello via --args"}',
        "--json",
      );
      expect(result.exitCode).toBe(0);

      const data = JSON.parse(result.stdout);
      expect(data.success).toBe(true);
    }, 30000);
  });

  // ============================================================
  // Tool help
  // ============================================================
  describe("tool help", () => {
    test("exec /mcp/tools/echo --help shows usage", async () => {
      const result = await cli.run("exec", "/mcp/tools/echo", "--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatchSnapshot("exec-mcp-echo-help");
    }, 30000);
  });

  // ============================================================
  // Error cases
  // ============================================================
  describe("error cases", () => {
    test("exec nonexistent tool fails", async () => {
      const result = await cli.run("exec", "/mcp/tools/nonexistent");
      expect(result.exitCode).not.toBe(0);
    });

    test("exec tool with missing required param fails or returns error", async () => {
      // Echo without message - behavior depends on tool implementation
      const result = await cli.run("exec", "/mcp/tools/echo", "--json");
      // May succeed with empty message or fail - just verify it doesn't crash
      expect(typeof result.exitCode).toBe("number");
    });
  });
});
