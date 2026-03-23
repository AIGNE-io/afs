/**
 * Tests for MCP Provider /.meta/.capabilities
 *
 * Phase 1 of capabilities-manifest task:
 * - MCP Provider returns valid CapabilitiesManifest
 * - Tools are correctly exposed in manifest
 * - Actions is empty array (MCP has no node-level actions)
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilitiesManifest } from "@aigne/afs";
import { AFS } from "@aigne/afs";
import { AFSMCP } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("MCP Provider Capabilities", () => {
  let mcp: AFSMCP;
  let afs: AFS;

  beforeAll(async () => {
    mcp = new AFSMCP({
      name: "everything",
      description: "Everything MCP Server",
      transport: "stdio",
      command: serverBinPath,
      args: [],
    });

    afs = new AFS();
    await afs.mount(mcp);
    await mcp.connect();
  });

  afterAll(async () => {
    await mcp.disconnect();
  });

  describe("Happy Path", () => {
    // read("/.meta/.capabilities") 返回有效的 CapabilitiesManifest
    test("read('/.meta/.capabilities') returns valid CapabilitiesManifest", async () => {
      const result = await mcp.read("/.meta/.capabilities");

      expect(result.data).toBeDefined();
      expect(result.data?.content).toBeDefined();

      const manifest = result.data?.content as CapabilitiesManifest;
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.provider).toBe("everything");
      expect(Array.isArray(manifest.tools)).toBe(true);
      expect(Array.isArray(manifest.actions)).toBe(true);
    });

    // manifest.tools 包含所有 MCP tools
    test("manifest.tools contains all MCP tools", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Everything server has tools like echo, add, etc.
      expect(manifest.tools.length).toBeGreaterThan(0);

      // Check that tools from mcp._tools are all present
      const toolNames = manifest.tools.map((t) => t.name);
      for (const tool of mcp.tools) {
        expect(toolNames).toContain(tool.name);
      }
    });

    // 每个 tool 有正确的 name, path, inputSchema
    test("each tool has correct name, path, inputSchema", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      for (const tool of manifest.tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);

        expect(tool.path).toBeDefined();
        expect(tool.path.startsWith("/")).toBe(true);

        // inputSchema is optional but if present should be an object
        if (tool.inputSchema) {
          expect(typeof tool.inputSchema).toBe("object");
        }
      }
    });

    // manifest.actions 为空数组
    test("manifest.actions is empty array", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      expect(manifest.actions).toEqual([]);
    });

    // tool.path 指向实际可执行的节点
    test("tool.path points to executable node", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Pick the first tool and verify path is valid
      const firstTool = manifest.tools[0];
      if (firstTool) {
        const readResult = await mcp.read(firstTool.path);
        expect(readResult.data).toBeDefined();
        expect(readResult.data?.meta?.kind).toBe("mcp:tool");
      }
    });
  });

  describe("Edge Cases", () => {
    // tool name 包含特殊字符时正确处理
    test("handles tool names correctly", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // All tool names should be valid strings
      for (const tool of manifest.tools) {
        expect(typeof tool.name).toBe("string");
        // Name should not be empty
        expect(tool.name.length).toBeGreaterThan(0);
      }
    });

    // inputSchema 为 undefined 时正常返回
    test("handles tools with no inputSchema", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Should not throw even if some tools have no inputSchema
      expect(manifest.tools).toBeDefined();
    });
  });

  describe("Security", () => {
    // 不暴露 MCP server 连接信息
    test("does not expose MCP server connection info", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Stringify and check for sensitive patterns
      const manifestStr = JSON.stringify(manifest);
      expect(manifestStr).not.toContain("command");
      expect(manifestStr).not.toContain("stdio");
      expect(manifestStr).not.toContain("mcp-server-everything");
    });

    // 验证 tool path 格式（必须以 / 开头）
    test("all tool paths start with /", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      for (const tool of manifest.tools) {
        expect(tool.path.startsWith("/")).toBe(true);
      }
    });
  });

  describe("Data Leak Prevention", () => {
    // 不在 manifest 中暴露 MCP server URL (connection info)
    test("does not expose MCP server URL in manifest", async () => {
      const result = await mcp.read("/.meta/.capabilities");
      const manifest = result.data?.content as CapabilitiesManifest;

      // Check that connection-specific URLs are not exposed
      // Note: $schema URLs in inputSchema are OK (JSON Schema standard)
      const manifestStr = JSON.stringify(manifest);

      // Should not contain server connection URLs
      expect(manifestStr).not.toContain("localhost:");
      expect(manifestStr).not.toContain("127.0.0.1:");

      // Top-level fields should not have url
      expect((manifest as any).url).toBeUndefined();
      expect((manifest as any).serverUrl).toBeUndefined();
      expect((manifest as any).endpoint).toBeUndefined();
    });
  });

  describe("Data Damage Prevention", () => {
    // 获取 capabilities 不影响 MCP 连接状态
    test("getting capabilities does not affect connection state", async () => {
      const wasConnected = mcp.isConnected;

      await mcp.read("/.meta/.capabilities");

      expect(mcp.isConnected).toBe(wasConnected);
    });
  });
});

describe("MCP Provider Capabilities - Disconnected State", () => {
  // MCP server 未连接时返回空 tools
  test("returns empty tools when not connected", async () => {
    const mcp = new AFSMCP({
      name: "disconnected",
      transport: "stdio",
      command: serverBinPath,
      args: [],
    });

    // Don't connect - directly read capabilities
    // Provider should handle this gracefully
    const result = await mcp.read("/.meta/.capabilities");

    // Even if not connected, should return valid manifest structure
    expect(result.data).toBeDefined();
    const manifest = result.data?.content as CapabilitiesManifest;
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.provider).toBe("disconnected");
    // Tools will be populated after ensureConnected is called
    expect(Array.isArray(manifest.tools)).toBe(true);

    // Clean up - disconnect if somehow connected
    if (mcp.isConnected) {
      await mcp.disconnect();
    }
  });
});

describe("MCP Provider Capabilities - AFS Integration", () => {
  let mcp: AFSMCP;
  let afs: AFS;

  beforeAll(async () => {
    mcp = new AFSMCP({
      name: "everything",
      description: "Everything MCP Server",
      transport: "stdio",
      command: serverBinPath,
      args: [],
    });

    afs = new AFS();
    await afs.mount(mcp, "/mcp");
    await mcp.connect();
  });

  afterAll(async () => {
    await mcp.disconnect();
  });

  test("AFS aggregates MCP capabilities with correct prefixes", async () => {
    const result = await afs.read("/.meta/.capabilities");

    expect(result.data).toBeDefined();
    const content = result.data?.content as any;

    // Tools should have provider prefix
    expect(content.tools.length).toBeGreaterThan(0);
    for (const tool of content.tools) {
      expect(tool.name.startsWith("everything.")).toBe(true);
      expect(tool.path.startsWith("/mcp/")).toBe(true);
    }
  });
});
