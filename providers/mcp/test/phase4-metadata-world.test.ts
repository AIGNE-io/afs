/**
 * Phase 4 Tests: Metadata 完善 + WORLD.md 生成
 *
 * 测试目标：
 * 1. metadata.mcp 结构规范
 * 2. entry.type 正确设置
 * 3. WORLD.md 自动生成
 * 4. WORLD.md 包含完整的 server 信息
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFS } from "@aigne/afs";
import { AFSMCP } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("Phase 4: Metadata + WORLD.md", () => {
  let mcp: AFSMCP;
  let afs: AFS;

  beforeAll(async () => {
    mcp = new AFSMCP({
      name: "everything",
      description: "Everything MCP server for testing",
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

  describe("Metadata Structure", () => {
    test("tool entry should have consistent metadata structure (Meta Spec compliant)", async () => {
      const listResult = await afs.list("/modules/everything/tools");
      const toolEntries = listResult.data.filter(
        (e: any) => e.path !== "/modules/everything/tools" && e.meta?.kind === "mcp:tool",
      );

      expect(toolEntries.length).toBeGreaterThan(0);

      for (const entry of toolEntries) {
        // Should have kind for executable tools
        expect(entry.meta?.kind).toBe("mcp:tool");

        // Should have inputSchema at top level (Meta Spec)
        expect(entry.meta?.inputSchema).toBeDefined();

        // Should have mcp metadata for MCP-specific data
        expect(entry.meta?.mcp).toBeDefined();
        expect(entry.meta?.mcp?.name).toBeDefined();
      }
    });

    test("prompt entry should have consistent metadata structure (Meta Spec compliant)", async () => {
      const listResult = await afs.list("/modules/everything/prompts");
      const promptEntries = listResult.data.filter(
        (e: any) => e.path !== "/modules/everything/prompts",
      );

      for (const entry of promptEntries) {
        // Should have kind for prompts
        expect(entry.meta?.kind).toBe("mcp:prompt");

        // Should have mcp metadata
        expect(entry.meta?.mcp).toBeDefined();
        expect(entry.meta?.mcp?.name).toBeDefined();
      }
    });

    test("resource entry should have uri in mcp metadata", async () => {
      if (mcp.resources.length === 0) {
        console.log("No resources available, skipping test");
        return;
      }

      const firstResource = mcp.resources[0]!;
      const resourcePath = mcp.resourceUriToPath(firstResource.uri);
      if (!resourcePath) return;

      // Resources are accessed via /resources prefix
      const readResult = await afs.read(`/modules/everything/resources${resourcePath}`);
      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta?.mcp?.uri).toBeDefined();
    });

    test("root entry should have server info in mcp metadata", async () => {
      const readResult = await afs.read("/modules/everything");

      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta?.mcp?.server).toBeDefined();
      expect(readResult.data?.meta?.mcp?.server?.name).toBe("everything");
      expect(readResult.data?.meta?.mcp?.capabilities).toBeDefined();
    });
  });

  describe("WORLD.md Generation", () => {
    test("read('/WORLD.md') should return generated documentation", async () => {
      const readResult = await afs.read("/modules/everything/WORLD.md");

      expect(readResult.data).toBeDefined();
      expect(readResult.data?.content).toBeDefined();
      expect(typeof readResult.data?.content).toBe("string");

      const content = readResult.data?.content as string;

      // Should contain server info
      expect(content).toContain("everything");

      // Should contain tools section
      expect(content.toLowerCase()).toContain("tools");

      // Should list actual tools
      if (mcp.tools.length > 0) {
        const firstToolName = mcp.tools[0]?.name;
        if (firstToolName) {
          expect(content).toContain(firstToolName);
        }
      }
    });

    test("WORLD.md should contain prompts section if prompts exist", async () => {
      if (mcp.prompts.length === 0) {
        console.log("No prompts available, skipping test");
        return;
      }

      const readResult = await afs.read("/modules/everything/WORLD.md");
      const content = readResult.data?.content as string;

      expect(content.toLowerCase()).toContain("prompts");
      const firstPromptName = mcp.prompts[0]?.name;
      if (firstPromptName) {
        expect(content).toContain(firstPromptName);
      }
    });

    test("WORLD.md should contain resources section if resources exist", async () => {
      if (mcp.resources.length === 0) {
        console.log("No resources available, skipping test");
        return;
      }

      const readResult = await afs.read("/modules/everything/WORLD.md");
      const content = readResult.data?.content as string;

      expect(content.toLowerCase()).toContain("resources");
    });

    test("list('/') should include WORLD.md entry", async () => {
      const listResult = await afs.list("/modules/everything");

      const worldMdEntry = listResult.data.find(
        (e: any) => e.path === "/WORLD.md" || e.path.endsWith("/WORLD.md"),
      );

      expect(worldMdEntry).toBeDefined();
      expect(worldMdEntry?.meta?.mcp?.type).toBe("world");
    });

    test("generateWorldMd() should return markdown string", () => {
      const worldMd = mcp.generateWorldMd();

      expect(typeof worldMd).toBe("string");
      expect(worldMd.length).toBeGreaterThan(0);
      expect(worldMd).toContain("#"); // Should have markdown headers
    });
  });
});
