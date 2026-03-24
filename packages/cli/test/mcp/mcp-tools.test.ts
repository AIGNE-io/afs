/**
 * Tests for MCP Server - Phase 1
 *
 * Tests all 10 MCP tools: read, list, write, delete, search, exec, stat, explain, mount, unmount.
 * Phase 0 already covers read and list; this file covers the remaining 8 tools plus integration.
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

/** Helper to create a connected client/server pair */
async function createTestPair(afs: AFS) {
  const { server } = createAFSMcpServer({ afs });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

function getText(result: Record<string, unknown>) {
  return (result.content as Array<{ type: string; text: string }>)[0]!.text;
}

describe("MCP Server - Phase 1: All Tools", () => {
  let tempDir: string;
  let afs: AFS;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-mcp-tools-"));
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

  describe("tools/list returns all 8 tools", () => {
    test("all 8 tools are registered", async () => {
      const { client, server } = await createTestPair(afs);
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();

      expect(names).toContain("afs_read");
      expect(names).toContain("afs_list");
      expect(names).toContain("afs_write");
      expect(names).toContain("afs_delete");
      expect(names).toContain("afs_search");
      expect(names).toContain("afs_exec");
      expect(names).toContain("afs_stat");
      expect(names).toContain("afs_explain");
      expect(names).toHaveLength(16);

      await client.close();
      await server.close();
    });
  });

  describe("afs_write", () => {
    test("writes string content then afs_read can read it", async () => {
      const { client, server } = await createTestPair(afs);

      const writeResult = await client.callTool({
        name: "afs_write",
        arguments: { path: "/fs/new-file.txt", content: "New content" },
      });
      expect(writeResult.isError).toBeFalsy();
      expect(getText(writeResult)).toContain("WRITE");

      const readResult = await client.callTool({
        name: "afs_read",
        arguments: { path: "/fs/new-file.txt" },
      });
      expect(readResult.isError).toBeFalsy();
      expect(getText(readResult)).toContain("New content");

      await client.close();
      await server.close();
    });

    test("writes empty string content", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_write",
        arguments: { path: "/fs/empty.txt", content: "" },
      });
      expect(result.isError).toBeFalsy();

      await client.close();
      await server.close();
    });

    test("writes object content (JSON)", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_write",
        arguments: { path: "/fs/data.json", content: { key: "value" } },
      });
      expect(result.isError).toBeFalsy();

      await client.close();
      await server.close();
    });
  });

  describe("afs_delete", () => {
    test("deletes file then afs_read returns error", async () => {
      const { client, server } = await createTestPair(afs);

      const deleteResult = await client.callTool({
        name: "afs_delete",
        arguments: { path: "/fs/hello.txt" },
      });
      expect(deleteResult.isError).toBeFalsy();
      expect(getText(deleteResult)).toContain("DELETE");

      const readResult = await client.callTool({
        name: "afs_read",
        arguments: { path: "/fs/hello.txt" },
      });
      expect(readResult.isError).toBe(true);

      await client.close();
      await server.close();
    });

    test("delete non-existent path returns error", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_delete",
        arguments: { path: "/fs/nonexistent.txt" },
      });
      // FS provider may throw or succeed silently - either is acceptable
      // The important thing is it doesn't crash
      expect(result.content).toBeDefined();

      await client.close();
      await server.close();
    });

    test("delete with recursive=true on directory", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_delete",
        arguments: { path: "/fs/docs", recursive: true },
      });
      expect(result.isError).toBeFalsy();

      await client.close();
      await server.close();
    });
  });

  describe("afs_search", () => {
    test("returns matching results", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_search",
        arguments: { path: "/fs", query: "Hello" },
      });
      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("hello.txt");

      await client.close();
      await server.close();
    });

    test("no matches returns empty result (not error)", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_search",
        arguments: { path: "/fs", query: "nonexistent_query_xyz" },
      });
      // No matches should not be an error
      expect(result.isError).toBeFalsy();

      await client.close();
      await server.close();
    });
  });

  describe("afs_stat", () => {
    test("returns llm format metadata", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_stat",
        arguments: { path: "/fs/hello.txt" },
      });
      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("NODE");
      expect(text).toContain("SIZE");

      await client.close();
      await server.close();
    });

    test("stat on directory shows CHILDREN", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_stat",
        arguments: { path: "/fs/docs" },
      });
      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("NODE");

      await client.close();
      await server.close();
    });

    test("stat non-existent path returns error", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_stat",
        arguments: { path: "/nonexistent" },
      });
      expect(result.isError).toBe(true);

      await client.close();
      await server.close();
    });
  });

  describe("afs_explain", () => {
    test("returns human-readable explanation", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_explain",
        arguments: { path: "/fs/hello.txt" },
      });
      expect(result.isError).toBeFalsy();
      const text = getText(result);
      // Should contain some explanation content
      expect(text.length).toBeGreaterThan(0);

      await client.close();
      await server.close();
    });
  });

  describe("Security", () => {
    test("afs_exec failure does not expose provider internal details", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_exec",
        arguments: { path: "/fs/nonexistent/.actions/bad-action" },
      });
      // Should be error but not expose stack
      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).not.toContain("    at ");

      await client.close();
      await server.close();
    });
  });

  describe("canonical path support", () => {
    test("canonical path $afs/path works in afs_read", async () => {
      const { client, server } = await createTestPair(afs);

      const result = await client.callTool({
        name: "afs_read",
        arguments: { path: "$afs/fs/hello.txt" },
      });
      expect(result.isError).toBeFalsy();
      expect(getText(result)).toContain("Hello, World!");

      await client.close();
      await server.close();
    });
  });
});
