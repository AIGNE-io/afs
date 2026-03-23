/**
 * Phase 1 Tests: 基础骨架 + Tools
 *
 * 测试目标：
 * 1. AFSMCP 类能正确创建
 * 2. 能通过 stdio transport 连接 MCP server
 * 3. 能列出 tools
 * 4. 能读取 tool schema
 * 5. 能执行 tool
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFS } from "@aigne/afs";
import { AFSMCP, type AFSMCPOptions } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("Phase 1: AFSMCP Basic + Tools", () => {
  describe("AFSMCP Construction", () => {
    test("should create AFSMCP instance with valid stdio config", () => {
      const options: AFSMCPOptions = {
        name: "test-mcp",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      };

      const mcp = new AFSMCP(options);
      expect(mcp).toBeInstanceOf(AFSMCP);
      expect(mcp.name).toBe("test-mcp");
    });

    test("should throw on missing command for stdio transport", () => {
      const options = {
        name: "test-mcp",
        transport: "stdio",
        // missing command
      } as AFSMCPOptions;

      expect(() => new AFSMCP(options)).toThrow();
    });

    test("should have correct schema validation", () => {
      const schema = AFSMCP.schema();
      expect(schema).toBeDefined();

      // Valid config should pass
      const validConfig = {
        name: "test",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@some/mcp-server"],
      };
      const result = schema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe("AFSMCP with Everything Server", () => {
    // 使用官方的 everything MCP server 进行测试
    // 这是 MCP 官方提供的测试用 server，暴露所有 MCP 功能
    let mcp: AFSMCP;
    let afs: AFS;

    beforeAll(async () => {
      mcp = new AFSMCP({
        name: "everything",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      afs = new AFS();
      await afs.mount(mcp);

      // 等待连接建立
      await mcp.connect();
    });

    afterAll(async () => {
      await mcp.disconnect();
    });

    test("list('/') should return top-level directories", async () => {
      const result = await afs.list("/modules/everything");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);

      // 应该至少有 tools 目录
      const paths = result.data.map((e: any) => e.path);
      expect(paths.some((p: string) => p.includes("/tools"))).toBe(true);
    });

    test("list('/tools') should return available tools", async () => {
      const result = await afs.list("/modules/everything/tools");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);

      // everything server 应该有多个 tools
      // 过滤掉目录本身，通过 kind: "afs:executable" 识别工具
      const toolEntries = result.data.filter(
        (e: any) => e.path !== "/modules/everything/tools" && e.meta?.kind === "mcp:tool",
      );
      expect(toolEntries.length).toBeGreaterThan(0);

      // 每个 tool entry 应该有正确的 metadata 结构（符合 Meta Spec）
      for (const entry of toolEntries) {
        expect(entry.meta?.kind).toBe("mcp:tool");
        expect(entry.meta?.mcp?.name).toBeDefined();
      }
    });

    test("read('/tools/<name>') should return tool schema", async () => {
      // 先获取 tool 列表
      const listResult = await afs.list("/modules/everything/tools");
      const toolEntries = listResult.data.filter(
        (e: any) => e.path !== "/modules/everything/tools" && e.meta?.kind === "mcp:tool",
      );

      expect(toolEntries.length).toBeGreaterThan(0);

      const firstTool = toolEntries[0]!;
      const readResult = await afs.read(firstTool.path);

      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta?.kind).toBe("mcp:tool");
      expect(readResult.data?.meta?.inputSchema).toBeDefined();
    });

    test("exec('/tools/echo', args) should call the echo tool", async () => {
      // everything server 有一个 echo tool
      const execResult = await afs.exec(
        "/modules/everything/tools/echo",
        { message: "hello from test" },
        {},
      );

      expect(execResult.data).toBeDefined();
      // echo tool 应该返回包含 message 的内容
      expect(execResult.data?.content).toBeDefined();
    });
  });

  describe("AFSMCP Lifecycle", () => {
    test("connect() and disconnect() should work", async () => {
      const mcp = new AFSMCP({
        name: "lifecycle-test",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });

      // 连接
      await mcp.connect();
      expect(mcp.isConnected).toBe(true);

      // 断开
      await mcp.disconnect();
      expect(mcp.isConnected).toBe(false);
    });
  });
});
