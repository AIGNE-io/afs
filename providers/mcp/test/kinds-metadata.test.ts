/**
 * Tests for MCP provider using proper kind and kinds array in metadata
 *
 * This tests that the MCP provider correctly:
 * 1. Uses mcp:tool, mcp:module, etc. as the kind field
 * 2. Returns kinds array with full inheritance chain
 * 3. Includes inputSchema at metadata level for tools
 * 4. Includes childrenCount for container nodes
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFS } from "@aigne/afs";
import { AFSMCP } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("MCP Provider Kinds Metadata", () => {
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

  describe("Tool metadata", () => {
    test("tool entry should have kind=mcp:tool", async () => {
      const listResult = await afs.list("/modules/everything/tools");
      const toolEntries = listResult.data.filter(
        (e: any) => e.path !== "/tools" && e.meta?.kind === "mcp:tool",
      );

      expect(toolEntries.length).toBeGreaterThan(0);

      for (const entry of toolEntries) {
        expect(entry.meta?.kind).toBe("mcp:tool");
      }
    });

    test("tool entry should have kinds array with inheritance chain", async () => {
      const listResult = await afs.list("/modules/everything/tools");
      const toolEntries = listResult.data.filter(
        (e: any) => e.path !== "/tools" && e.meta?.kind === "mcp:tool",
      );

      expect(toolEntries.length).toBeGreaterThan(0);

      for (const entry of toolEntries) {
        expect(entry.meta?.kinds).toBeDefined();
        expect(Array.isArray(entry.meta?.kinds)).toBe(true);
        // Should have: mcp:tool, afs:executable, afs:node
        expect(entry.meta?.kinds).toEqual(["mcp:tool", "afs:executable", "afs:node"]);
      }
    });

    test("tool entry should allow checking if executable via kinds", async () => {
      const listResult = await afs.list("/modules/everything/tools");
      const toolEntries = listResult.data.filter(
        (e: any) => e.path !== "/tools" && e.meta?.kind === "mcp:tool",
      );

      expect(toolEntries.length).toBeGreaterThan(0);

      for (const entry of toolEntries) {
        const isExecutable = entry.meta?.kinds?.includes("afs:executable") ?? false;
        expect(isExecutable).toBe(true);
      }
    });

    test("tool entry should have inputSchema in metadata", async () => {
      const listResult = await afs.list("/modules/everything/tools");
      const toolEntries = listResult.data.filter(
        (e: any) => e.path !== "/tools" && e.meta?.kind === "mcp:tool",
      );

      expect(toolEntries.length).toBeGreaterThan(0);

      for (const entry of toolEntries) {
        expect(entry.meta?.inputSchema).toBeDefined();
        expect(typeof entry.meta?.inputSchema).toBe("object");
      }
    });
  });

  describe("Prompt metadata", () => {
    test("prompt entry should have kind=mcp:prompt", async () => {
      const listResult = await afs.list("/modules/everything/prompts");
      const promptEntries = listResult.data.filter(
        (e: any) => e.path !== "/prompts" && e.meta?.kind === "mcp:prompt",
      );

      // mcp-server-everything should have prompts
      for (const entry of promptEntries) {
        expect(entry.meta?.kind).toBe("mcp:prompt");
      }
    });

    test("prompt entry should have kinds array", async () => {
      const listResult = await afs.list("/modules/everything/prompts");
      const promptEntries = listResult.data.filter(
        (e: any) => e.path !== "/prompts" && e.meta?.kind === "mcp:prompt",
      );

      for (const entry of promptEntries) {
        expect(entry.meta?.kinds).toEqual(["mcp:prompt", "afs:node"]);
      }
    });
  });

  describe("Container metadata", () => {
    test("/tools directory should have childrenCount", async () => {
      const listResult = await afs.list("/modules/everything");
      // The path could be "/tools" or include the module path prefix
      const toolsDir = listResult.data.find(
        (e: any) => e.path === "/tools" || e.path.endsWith("/tools"),
      );

      expect(toolsDir).toBeDefined();
      expect(toolsDir?.meta?.childrenCount).toBeDefined();
      expect(typeof toolsDir?.meta?.childrenCount).toBe("number");
      expect(toolsDir?.meta?.childrenCount).toBeGreaterThan(0);
    });

    test("/prompts directory should have childrenCount", async () => {
      const listResult = await afs.list("/modules/everything");
      const promptsDir = listResult.data.find(
        (e: any) => e.path === "/prompts" || e.path.endsWith("/prompts"),
      );

      // Only test if prompts exist
      if (promptsDir) {
        expect(promptsDir?.meta?.childrenCount).toBeDefined();
        expect(typeof promptsDir?.meta?.childrenCount).toBe("number");
      }
    });

    test("root entry should have kind=mcp:module", async () => {
      const readResult = await afs.read("/modules/everything");

      expect(readResult.data).toBeDefined();
      expect(readResult.data?.meta?.kind).toBe("mcp:module");
    });

    test("root entry should have kinds array", async () => {
      const readResult = await afs.read("/modules/everything");

      expect(readResult.data?.meta?.kinds).toEqual(["mcp:module", "afs:node"]);
    });
  });
});
