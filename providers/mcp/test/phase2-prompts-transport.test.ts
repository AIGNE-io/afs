/**
 * Phase 2 Tests: Prompts + HTTP/SSE Transport
 *
 * 测试目标：
 * 1. 能列出 prompts
 * 2. 能读取 prompt 内容
 * 3. HTTP transport 能正常工作
 * 4. SSE transport 能正常工作
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFS } from "@aigne/afs";
import { AFSMCP, type AFSMCPOptions } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("Phase 2: Prompts + Transport", () => {
  describe("Prompts", () => {
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
      await mcp.connect();
    });

    afterAll(async () => {
      await mcp.disconnect();
    });

    test("list('/prompts') should return available prompts", async () => {
      const result = await afs.list("/modules/everything/prompts");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);

      // everything server 应该有 prompts
      const promptEntries = result.data.filter(
        (e: any) => e.path !== "/modules/everything/prompts",
      );

      // 每个 prompt entry 应该有基本信息
      for (const entry of promptEntries) {
        expect(entry.id).toBeDefined();
        expect(entry.path).toBeDefined();
      }
    });

    test("read('/prompts/<name>') should return prompt with arguments", async () => {
      // 先获取 prompt 列表
      const listResult = await afs.list("/modules/everything/prompts");
      const promptEntries = listResult.data.filter(
        (e: any) => e.path !== "/modules/everything/prompts",
      );

      if (promptEntries.length === 0) {
        console.log("No prompts available, skipping test");
        return;
      }

      const firstPrompt = promptEntries[0]!;
      const readResult = await afs.read(firstPrompt.path);

      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta?.mcp).toBeDefined();

      // simple-prompt has no required args, so content should be auto-fetched
      const simplePromptResult = await afs.read("/modules/everything/prompts/simple-prompt");
      expect(simplePromptResult.data).toBeDefined();
      expect(simplePromptResult.data?.content).toBeDefined();
      expect(typeof simplePromptResult.data?.content).toBe("string");
      expect(simplePromptResult.data?.content).toContain("simple prompt without arguments");
    });

    test("read('/prompts/<name>') with arguments should return prompt content", async () => {
      // 先获取 prompt 列表
      const listResult = await afs.list("/modules/everything/prompts");
      const promptEntries = listResult.data.filter(
        (e: any) => e.path !== "/modules/everything/prompts",
      );

      if (promptEntries.length === 0) {
        console.log("No prompts available, skipping test");
        return;
      }

      // 获取第一个 prompt 的名称
      const firstPromptPath = promptEntries[0]!.path;
      const promptName = firstPromptPath.split("/").pop();

      // 使用 readPrompt 获取 prompt 内容
      const readResult = await mcp.readPrompt(`/prompts/${promptName}`, {});

      expect(readResult.data).toBeDefined();
      // prompt 应该有 messages 内容
      if (readResult.data?.content) {
        expect(readResult.data.content).toBeDefined();
      }
    });

    test("list('/prompts/<name>/.actions') should return actions for prompts with arguments", async () => {
      // args-prompt has required arguments, so it should expose a "get" action
      const result = await afs.list("/modules/everything/prompts/args-prompt/.actions");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);

      const getAction = result.data.find((e: any) => e.id === "get" || e.meta?.name === "get");
      expect(getAction).toBeDefined();
      expect(getAction?.meta?.inputSchema).toBeDefined();
      expect(getAction?.meta?.inputSchema?.properties?.city).toBeDefined();
    });

    test("exec('/prompts/<name>/.actions/get') should return prompt content with arguments", async () => {
      // args-prompt requires 'city' (required) and 'state' (optional)
      const result = await afs.exec(
        "/modules/everything/prompts/args-prompt/.actions/get",
        { city: "Beijing", state: "Haidian" },
        {},
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.content).toBeDefined();
      expect(typeof result.data?.content).toBe("string");
      expect(result.data?.content).toContain("Beijing");
    });

    test("read('/prompts/<name>') without query params returns metadata-only for required-arg prompts", async () => {
      // args-prompt has required args, should not auto-fetch content without query params
      const result = await afs.read("/modules/everything/prompts/args-prompt");

      expect(result.data).toBeDefined();
      expect(result.data?.meta?.mcp).toBeDefined();
      // Content should be undefined since required args are missing
      expect(result.data?.content).toBeUndefined();
    });

    test("list('/prompts/<name>/.actions') returns empty for prompts without arguments", async () => {
      // simple-prompt has no arguments, so it should not expose actions
      const result = await afs.list("/modules/everything/prompts/simple-prompt/.actions");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(0);
    });

    test("list('/prompts/nonexistent/.actions') throws AFSNotFoundError", async () => {
      await expect(afs.list("/modules/everything/prompts/nonexistent/.actions")).rejects.toThrow();
    });

    test("exec('/prompts/nonexistent/.actions/get') returns error", async () => {
      const result = await afs.exec(
        "/modules/everything/prompts/nonexistent/.actions/get",
        { city: "Beijing" },
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("stat on prompt with args auto-enriches actions", async () => {
      // AFS Core should auto-enrich actions via list(/.actions)
      const result = await afs.stat("/modules/everything/prompts/args-prompt");

      expect(result.data).toBeDefined();
      expect(result.data?.meta?.kind).toBe("mcp:prompt");
      // Actions should be auto-enriched by AFS Core
      expect(result.data?.actions).toBeDefined();
      expect(Array.isArray(result.data?.actions)).toBe(true);
      if (result.data?.actions && result.data.actions.length > 0) {
        const getAction = result.data.actions.find((a: any) => a.name === "get");
        expect(getAction).toBeDefined();
      }
    });
  });

  describe("HTTP Transport", () => {
    test("should throw on missing url for http transport", () => {
      const options = {
        name: "test-http",
        transport: "http",
        // missing url
      } as AFSMCPOptions;

      expect(() => new AFSMCP(options)).toThrow();
    });

    test("should create AFSMCP with valid http config", () => {
      const options: AFSMCPOptions = {
        name: "test-http",
        transport: "http",
        url: "http://localhost:3000/mcp",
      };

      const mcp = new AFSMCP(options);
      expect(mcp).toBeInstanceOf(AFSMCP);
      expect(mcp.name).toBe("test-http");
    });

    // Note: HTTP integration tests would require a running HTTP MCP server
    // which is beyond the scope of unit tests
  });

  describe("SSE Transport", () => {
    test("should throw on missing url for sse transport", () => {
      const options = {
        name: "test-sse",
        transport: "sse",
        // missing url
      } as AFSMCPOptions;

      expect(() => new AFSMCP(options)).toThrow();
    });

    test("should create AFSMCP with valid sse config", () => {
      const options: AFSMCPOptions = {
        name: "test-sse",
        transport: "sse",
        url: "http://localhost:3000/sse",
      };

      const mcp = new AFSMCP(options);
      expect(mcp).toBeInstanceOf(AFSMCP);
      expect(mcp.name).toBe("test-sse");
    });

    // Note: SSE integration tests would require a running SSE MCP server
    // which is beyond the scope of unit tests
  });

  describe("Schema and Load", () => {
    test("schema should validate all transport types", () => {
      const schema = AFSMCP.schema();

      // stdio transport
      expect(
        schema.safeParse({
          name: "test",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@some/server"],
        }).success,
      ).toBe(true);

      // http transport
      expect(
        schema.safeParse({
          name: "test",
          transport: "http",
          url: "http://localhost:3000/mcp",
          headers: { Authorization: "Bearer token" },
        }).success,
      ).toBe(true);

      // sse transport
      expect(
        schema.safeParse({
          name: "test",
          transport: "sse",
          url: "http://localhost:3000/sse",
        }).success,
      ).toBe(true);
    });

    test("schema should reject invalid configs", () => {
      const schema = AFSMCP.schema();

      // stdio without command
      expect(
        schema.safeParse({
          name: "test",
          transport: "stdio",
        }).success,
      ).toBe(false);

      // http without url
      expect(
        schema.safeParse({
          name: "test",
          transport: "http",
        }).success,
      ).toBe(false);

      // invalid transport
      expect(
        schema.safeParse({
          name: "test",
          transport: "invalid",
        }).success,
      ).toBe(false);
    });
  });
});
