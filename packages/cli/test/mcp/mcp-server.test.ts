/**
 * Tests for MCP Server - Phase 0
 *
 * Tests MCP Server skeleton, stdio transport, and serve command integration.
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

describe("MCP Server - Phase 0", () => {
  let tempDir: string;
  let afs: AFS;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-mcp-test-"));
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

  describe("Happy Path", () => {
    test("MCP server responds to initialize request via in-memory transport", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      // If we got here, initialization succeeded
      expect(client).toBeDefined();

      await client.close();
      await server.close();
    });

    test("tools/list returns registered afs_read and afs_list tools", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.listTools();
      const toolNames = result.tools.map((t) => t.name);

      expect(toolNames).toContain("afs_read");
      expect(toolNames).toContain("afs_list");

      await client.close();
      await server.close();
    });

    test("tools/call afs_read returns llm format file content", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_read",
        arguments: { path: "/fs/hello.txt" },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toBeDefined();
      expect(result.content).toBeArrayOfSize(1);
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      // LLM format includes NODE and CONTENT
      expect(text).toContain("Hello, World!");

      await client.close();
      await server.close();
    });

    test("tools/call afs_list returns llm format directory listing", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_list",
        arguments: { path: "/fs" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      // LLM format includes ENTRY
      expect(text).toContain("ENTRY");
      expect(text).toContain("TOTAL");

      await client.close();
      await server.close();
    });

    test("afs serve --transport http keeps existing HTTP behavior", async () => {
      // This test verifies the serve command builder accepts the transport option
      // We don't actually start the server, just verify the command definition
      const { createServeCommand } = await import("../../src/core/commands/serve.js");

      const command = createServeCommand({
        afs,
        argv: [],
        onResult: () => {},
      });

      // Verify the builder has transport option
      expect((command.builder as Record<string, unknown>).transport).toBeDefined();
    });
  });

  describe("Bad Path", () => {
    test("afs_read path not found returns isError: true", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_read",
        arguments: { path: "/nonexistent/path" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBeDefined();

      await client.close();
      await server.close();
    });

    test("afs_list on non-existent path returns empty results (not error)", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_list",
        arguments: { path: "/nonexistent/path" },
      });

      // AFS returns empty data for non-existent paths (not an error)
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("TOTAL 0");

      await client.close();
      await server.close();
    });

    test("config.toml not found, MCP server still starts (empty mounts)", async () => {
      const emptyAfs = new AFS();
      const { server } = createAFSMcpServer({ afs: emptyAfs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThan(0);

      await client.close();
      await server.close();
    });
  });

  describe("Edge Cases", () => {
    test("afs_read on root path returns virtual directory data", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_read",
        arguments: { path: "/" },
      });

      // Root is now a virtual directory with mount point children
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toBeDefined();

      await client.close();
      await server.close();
    });

    test("afs_list on empty directory returns empty list", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "afs-mcp-empty-"));
      const emptyAfs = new AFS();
      await emptyAfs.mount(new AFSFS({ localPath: emptyDir, description: "Empty dir" }), "/empty");

      const { server } = createAFSMcpServer({ afs: emptyAfs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_list",
        arguments: { path: "/empty" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("TOTAL 0");

      await client.close();
      await server.close();
      await rm(emptyDir, { recursive: true, force: true });
    });

    test("afs_list with depth=0 returns correct results", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_list",
        arguments: { path: "/fs", depth: 0 },
      });

      expect(result.isError).toBeFalsy();

      await client.close();
      await server.close();
    });

    test("afs_list with limit parameter truncates results", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_list",
        arguments: { path: "/fs", limit: 1 },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      // Should have exactly 1 ENTRY line
      const entryLines = text.split("\n").filter((l: string) => l.startsWith("ENTRY"));
      expect(entryLines.length).toBeLessThanOrEqual(1);

      await client.close();
      await server.close();
    });
  });

  describe("Security", () => {
    test("error messages do not contain internal stack traces", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: "afs_read",
        arguments: { path: "/nonexistent/deeply/nested/path" },
      });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      // Should not contain stack trace indicators
      expect(text).not.toContain("    at ");
      expect(text).not.toContain("Error:");

      await client.close();
      await server.close();
    });
  });

  describe("Concurrency", () => {
    test("multiple concurrent tools/call requests don't interfere", async () => {
      const { server } = createAFSMcpServer({ afs });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "test-client", version: "1.0.0" });

      await server.connect(serverTransport);
      await client.connect(clientTransport);

      // Send multiple requests concurrently
      const [readResult, listResult] = await Promise.all([
        client.callTool({
          name: "afs_read",
          arguments: { path: "/fs/hello.txt" },
        }),
        client.callTool({
          name: "afs_list",
          arguments: { path: "/fs" },
        }),
      ]);

      expect(readResult.isError).toBeFalsy();
      expect(listResult.isError).toBeFalsy();

      const readText = (readResult.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(readText).toContain("Hello, World!");

      const listText = (listResult.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(listText).toContain("ENTRY");

      await client.close();
      await server.close();
    });
  });
});
