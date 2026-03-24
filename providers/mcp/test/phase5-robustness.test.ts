/**
 * Phase 5 Tests: 健壮性 + 边界情况
 *
 * 测试目标：
 * 1. 错误处理
 * 2. 边界情况
 * 3. 生命周期方法
 */

import { describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFSMCP } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("Phase 5: Robustness + Edge Cases", () => {
  describe("Error Handling", () => {
    test("should handle invalid tool execution gracefully", async () => {
      const mcp = new AFSMCP({
        name: "error-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();

      try {
        // Try to execute non-existent tool
        await mcp.exec("/tools/nonexistent_tool_xyz", {}, {});
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.message).toContain("not found");
      } finally {
        await mcp.disconnect();
      }
    });

    test("should handle read on non-existent path", async () => {
      const mcp = new AFSMCP({
        name: "error-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();

      // Non-existent paths should throw AFSNotFoundError
      await expect(mcp.read("/nonexistent/path/xyz")).rejects.toThrow("Path not found");

      await mcp.disconnect();
    });

    test("should throw when exec called on non-tool path", async () => {
      const mcp = new AFSMCP({
        name: "error-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();

      try {
        await mcp.exec("/prompts/some_prompt", {}, {});
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        // No exec handler for paths outside /tools/*
        expect(error.message).toContain("No exec handler for path");
      } finally {
        await mcp.disconnect();
      }
    });

    test("should auto-connect when exec called without explicit connection", async () => {
      const mcp = new AFSMCP({
        name: "error-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      // Don't explicitly connect - ensureConnected should auto-connect

      // With lazy connection, exec should auto-connect and succeed
      const result = await mcp.exec("/tools/echo", { message: "test" }, {});
      expect(result.data).toBeDefined();
      expect(mcp.isConnected).toBe(true);

      await mcp.disconnect();
    });
  });

  describe("Connection State", () => {
    test("should not reconnect if already connected", async () => {
      const mcp = new AFSMCP({
        name: "state-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();
      expect(mcp.isConnected).toBe(true);

      // Second connect should be a no-op
      await mcp.connect();
      expect(mcp.isConnected).toBe(true);

      await mcp.disconnect();
      expect(mcp.isConnected).toBe(false);
    });

    test("should not disconnect if not connected", async () => {
      const mcp = new AFSMCP({
        name: "state-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      // Should not throw
      await mcp.disconnect();
      expect(mcp.isConnected).toBe(false);
    });

    test("should clear caches on disconnect", async () => {
      const mcp = new AFSMCP({
        name: "state-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();
      expect(mcp.tools.length).toBeGreaterThan(0);

      await mcp.disconnect();
      expect(mcp.tools.length).toBe(0);
      expect(mcp.prompts.length).toBe(0);
      expect(mcp.resources.length).toBe(0);
    });
  });

  describe("Lifecycle Methods", () => {
    test("connect should establish connection", async () => {
      const mcp = new AFSMCP({
        name: "lifecycle-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      expect(mcp.isConnected).toBe(false);

      await mcp.connect();
      expect(mcp.isConnected).toBe(true);
      expect(mcp.tools.length).toBeGreaterThan(0);

      await mcp.disconnect();
    });

    test("disconnect should close connection gracefully", async () => {
      const mcp = new AFSMCP({
        name: "lifecycle-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();
      expect(mcp.isConnected).toBe(true);

      await mcp.disconnect();
      expect(mcp.isConnected).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty path normalization", async () => {
      const mcp = new AFSMCP({
        name: "edge-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();

      // Empty string should work like root
      const result1 = await mcp.list("");
      expect(result1.data.length).toBeGreaterThan(0);

      // Path without leading slash should be normalized
      const result2 = await mcp.list("tools");
      expect(result2.data.length).toBeGreaterThan(0);

      await mcp.disconnect();
    });

    test("should handle special characters in paths", async () => {
      const mcp = new AFSMCP({
        name: "edge-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      await mcp.connect();

      // Non-existent paths should throw AFSNotFoundError
      await expect(mcp.read("/tools/with spaces and-special_chars")).rejects.toThrow(
        "Path not found",
      );

      await mcp.disconnect();
    });

    test("parseResourceUri should handle various URI formats", () => {
      // Standard format
      let parsed = AFSMCP.parseResourceUri("sqlite://database/table");
      expect(parsed.scheme).toBe("sqlite");
      expect(parsed.path).toBe("/database/table");

      // With triple slash (file URIs)
      parsed = AFSMCP.parseResourceUri("file:///path/to/file.txt");
      expect(parsed.scheme).toBe("file");
      expect(parsed.path).toBe("/path/to/file.txt");

      // No path after scheme
      parsed = AFSMCP.parseResourceUri("custom://");
      expect(parsed.scheme).toBe("custom");
      expect(parsed.path).toBe("/");

      // Invalid format (fallback)
      parsed = AFSMCP.parseResourceUri("not-a-uri");
      expect(parsed.scheme).toBe("unknown");
      expect(parsed.path).toBe("not-a-uri");
    });

    test("matchPathToTemplate should return null for non-matching paths", () => {
      const result = AFSMCP.matchPathToTemplate("/different/path", "sqlite://posts/{id}");
      expect(result).toBeNull();
    });
  });

  describe("Module Properties", () => {
    test("should have correct name and description", () => {
      const mcp = new AFSMCP({
        name: "my-server",
        description: "My test server",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      expect(mcp.name).toBe("my-server");
      expect(mcp.description).toBe("My test server");
    });

    test("should use default name when not provided", () => {
      const mcp = new AFSMCP({
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      expect(mcp.name).toBe("mcp");
      expect(mcp.description).toBeUndefined();
    });
  });
});
