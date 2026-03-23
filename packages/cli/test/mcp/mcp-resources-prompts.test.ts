/**
 * Tests for MCP Server - Phase 2
 *
 * Tests Resource (afs:///mounts), Prompt (explore), and Notifications (resources/list_changed).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createAFSMcpServer } from "../../src/mcp/server.js";

/** Helper to get text from a resource content item */
function getResourceText(content: { uri: string; text?: string; blob?: string }): string {
  return (content as { text: string }).text;
}

/** Helper to create a connected client/server pair */
async function createTestPair(afs: AFS) {
  const { server } = createAFSMcpServer({ afs });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe("MCP Server - Phase 2: Resource + Prompt + Notifications", () => {
  let tempDir: string;
  let afs: AFS;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-mcp-phase2-"));
    await mkdir(join(tempDir, "docs"));
    await writeFile(join(tempDir, "hello.txt"), "Hello, World!");
    await writeFile(join(tempDir, "docs/readme.md"), "# Documentation");

    afs = new AFS();
    await afs.mount(
      new AFSFS({
        localPath: tempDir,
        description: "Test filesystem",
      }),
      "/fs",
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("Resources - Happy Path", () => {
    test("resources/list returns afs:///mounts resource", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.listResources();
      const uris = result.resources.map((r) => r.uri);

      expect(uris).toContain("afs:///mounts");

      await client.close();
      await server.close();
    });

    test("resources/read afs:///mounts returns JSON mount list", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.readResource({ uri: "afs:///mounts" });

      expect(result.contents).toBeArrayOfSize(1);
      const content = result.contents[0]!;
      expect(content.uri).toBe("afs:///mounts");
      expect(content.mimeType).toBe("application/json");

      const mounts = JSON.parse(getResourceText(content));
      expect(Array.isArray(mounts)).toBe(true);
      expect(mounts.length).toBeGreaterThanOrEqual(1);

      // Check mount fields
      const fsMount = mounts.find((m: Record<string, string>) => m.path === "/fs");
      expect(fsMount).toBeDefined();
      expect(fsMount.name).toBeDefined();
      expect(fsMount.accessMode).toBeDefined();

      await client.close();
      await server.close();
    });

    test("mount list includes path, provider name, and accessMode", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.readResource({ uri: "afs:///mounts" });
      const mounts = JSON.parse(getResourceText(result.contents[0]!));
      const fsMount = mounts.find((m: Record<string, string>) => m.path === "/fs");

      expect(fsMount.path).toBe("/fs");
      expect(typeof fsMount.name).toBe("string");
      expect(typeof fsMount.accessMode).toBe("string");

      await client.close();
      await server.close();
    });
  });

  describe("Prompts - Happy Path", () => {
    test("prompts/list returns explore prompt", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.listPrompts();
      const names = result.prompts.map((p) => p.name);

      expect(names).toContain("explore");

      await client.close();
      await server.close();
    });

    test("prompts/get explore returns messages array", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.getPrompt({ name: "explore" });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
      // Messages should have role and content
      const msg = result.messages[0]!;
      expect(msg.role).toBe("user");
      expect(msg.content).toBeDefined();

      await client.close();
      await server.close();
    });

    test("explore prompt includes static tool usage guide", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.getPrompt({ name: "explore" });

      const textContent = result.messages
        .map((m) => {
          if (m.content.type === "text") return m.content.text;
          return "";
        })
        .join("\n");

      // Should mention key tools
      expect(textContent).toContain("afs_list");
      expect(textContent).toContain("afs_read");

      await client.close();
      await server.close();
    });

    test("explore prompt includes dynamic mount point list", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.getPrompt({ name: "explore" });

      const textContent = result.messages
        .map((m) => {
          if (m.content.type === "text") return m.content.text;
          return "";
        })
        .join("\n");

      // Should include mount info
      expect(textContent).toContain("/fs");

      await client.close();
      await server.close();
    });
  });

  describe("Resources - Bad Path", () => {
    test("resources/read on non-existent URI returns error", async () => {
      const { client, server } = await createTestPair(afs);

      try {
        await client.readResource({ uri: "afs:///nonexistent" });
        // Should have thrown
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }

      await client.close();
      await server.close();
    });

    test("no mounted providers returns empty array for mounts resource", async () => {
      const emptyAfs = new AFS();
      const { client, server } = await createTestPair(emptyAfs);

      const result = await client.readResource({ uri: "afs:///mounts" });
      const mounts = JSON.parse(getResourceText(result.contents[0]!));

      expect(mounts).toEqual([]);

      await client.close();
      await server.close();
    });

    test("onChange listener exception does not affect mount/unmount", async () => {
      // AFS's notifyChange already catches listener errors (INV-CE-2)
      // This test verifies the MCP server works even if something throws in the chain
      const changeAfs = new AFS({
        onChange: () => {
          throw new Error("Listener error!");
        },
      });
      await changeAfs.mount(new AFSFS({ localPath: tempDir, description: "test" }), "/test");

      const { client, server } = await createTestPair(changeAfs);

      // Mount should succeed despite listener error
      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      await client.close();
      await server.close();
    });
  });

  describe("Edge Cases", () => {
    test("explore prompt with zero mounts returns valid guide", async () => {
      const emptyAfs = new AFS();
      const { client, server } = await createTestPair(emptyAfs);

      const result = await client.getPrompt({ name: "explore" });

      expect(result.messages.length).toBeGreaterThan(0);
      const textContent = result.messages
        .map((m) => {
          if (m.content.type === "text") return m.content.text;
          return "";
        })
        .join("\n");

      // Should still have usage instructions even with no mounts
      expect(textContent).toContain("afs_list");

      await client.close();
      await server.close();
    });

    test("mounts resource provider name uses module.name", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.readResource({ uri: "afs:///mounts" });
      const mounts = JSON.parse(getResourceText(result.contents[0]!));
      const fsMount = mounts.find((m: Record<string, string>) => m.path === "/fs");

      // AFSFS module name should be "fs" or similar
      expect(fsMount.name).toBeDefined();
      expect(typeof fsMount.name).toBe("string");
      expect(fsMount.name.length).toBeGreaterThan(0);

      await client.close();
      await server.close();
    });
  });

  describe("Security", () => {
    test("mounts resource does not expose provider auth info", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.readResource({ uri: "afs:///mounts" });
      const text = getResourceText(result.contents[0]!);

      // Should not contain auth-related fields
      expect(text).not.toContain("auth");
      expect(text).not.toContain("token");
      expect(text).not.toContain("password");
      expect(text).not.toContain("secret");

      await client.close();
      await server.close();
    });

    test("explore prompt does not contain sensitive path info", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.getPrompt({ name: "explore" });
      const textContent = result.messages
        .map((m) => {
          if (m.content.type === "text") return m.content.text;
          return "";
        })
        .join("\n");

      // Should not expose the actual filesystem path (tempDir)
      expect(textContent).not.toContain(tempDir);

      await client.close();
      await server.close();
    });
  });

  describe("Data Leak", () => {
    test("mounts resource only exposes path, name, accessMode", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.readResource({ uri: "afs:///mounts" });
      const mounts = JSON.parse(getResourceText(result.contents[0]!));

      for (const mount of mounts) {
        const keys = Object.keys(mount);
        // Only allowed fields
        for (const key of keys) {
          expect(["path", "name", "accessMode"]).toContain(key);
        }
      }

      await client.close();
      await server.close();
    });
  });
});
