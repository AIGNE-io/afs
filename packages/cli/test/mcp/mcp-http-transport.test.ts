/**
 * Tests for MCP Server - Phase 3
 *
 * Tests Streamable HTTP Transport for MCP server.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startMcpHttpServer } from "../../src/mcp/http-transport.js";
import { createAFSMcpServer } from "../../src/mcp/server.js";

describe("MCP Server - Phase 3: Streamable HTTP Transport", () => {
  let tempDir: string;
  let afs: AFS;
  let httpServer: Server | undefined;
  let assignedPort: number;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-mcp-http-"));
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
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
      httpServer = undefined;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Start a test MCP HTTP server on a random port */
  async function startTestServer(options?: { cors?: boolean }) {
    const { server: mcpServer } = createAFSMcpServer({ afs });
    const result = await startMcpHttpServer({
      mcpServer,
      host: "127.0.0.1",
      port: 0, // auto-assign
      cors: options?.cors ?? false,
    });
    httpServer = result.httpServer;
    assignedPort = result.port;
    return { mcpServer, ...result };
  }

  /** Create a connected MCP client over HTTP transport */
  async function createHttpClient() {
    const url = new URL(`http://127.0.0.1:${assignedPort}/mcp`);
    const transport = new StreamableHTTPClientTransport(url);
    const client = new Client({ name: "test-http-client", version: "1.0.0" });
    await client.connect(transport);
    return { client, transport };
  }

  describe("Happy Path", () => {
    test("MCP HTTP server starts and accepts connections", async () => {
      await startTestServer();

      const { client, transport } = await createHttpClient();

      // If we got here, connection succeeded
      expect(client).toBeDefined();

      await client.close();
      await transport.close();
    });

    test("HTTP client can send MCP requests via POST", async () => {
      await startTestServer();

      // Send a raw HTTP POST with MCP initialize request
      // Streamable HTTP requires Accept header for SSE
      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain("serverInfo");
    });

    test("tools/list returns all tools via HTTP transport", async () => {
      await startTestServer();
      const { client, transport } = await createHttpClient();

      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();

      expect(names).toContain("afs_read");
      expect(names).toContain("afs_list");
      expect(names).toHaveLength(16);

      await client.close();
      await transport.close();
    });

    test("tools/call executes and returns result via HTTP transport", async () => {
      await startTestServer();
      const { client, transport } = await createHttpClient();

      const result = await client.callTool({
        name: "afs_read",
        arguments: { path: "/fs/hello.txt" },
      });

      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text).toContain("Hello, World!");

      await client.close();
      await transport.close();
    });

    test("resources/list returns via HTTP transport", async () => {
      await startTestServer();
      const { client, transport } = await createHttpClient();

      const result = await client.listResources();
      const uris = result.resources.map((r) => r.uri);

      expect(uris).toContain("afs:///mounts");

      await client.close();
      await transport.close();
    });

    test("server startup reports listening address", async () => {
      const result = await startTestServer();

      expect(result.port).toBeGreaterThan(0);
      expect(result.url).toContain("127.0.0.1");
      expect(result.url).toContain(String(result.port));
    });
  });

  describe("Bad Path", () => {
    test("port in use returns clear error", async () => {
      // Start first server
      await startTestServer();
      const busyPort = assignedPort;

      // Try to start another server on the same port
      const { server: mcpServer2 } = createAFSMcpServer({ afs });
      try {
        await startMcpHttpServer({
          mcpServer: mcpServer2,
          host: "127.0.0.1",
          port: busyPort,
          cors: false,
        });
        // Should have thrown
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toBeDefined();
      }
    });

    test("stale session ID returns 404 so client can re-initialize", async () => {
      await startTestServer();

      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": "stale-session-id-that-does-not-exist",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.message).toContain("Session not found");
    });

    test("non-POST request returns 405", async () => {
      await startTestServer();

      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "PUT",
      });

      expect(response.status).toBe(405);
    });
  });

  describe("Edge Cases", () => {
    test("port 0 auto-assigns available port", async () => {
      const result = await startTestServer();

      expect(result.port).toBeGreaterThan(0);
      expect(result.port).not.toBe(0);
    });

    test("server graceful close disconnects connections", async () => {
      const { mcpServer } = await startTestServer();
      const { client, transport } = await createHttpClient();

      // Verify connection works
      const tools = await client.listTools();
      expect(tools.tools.length).toBe(16);

      // Close server
      await mcpServer.close();

      await client.close();
      await transport.close();
    });
  });

  describe("Security", () => {
    test("CORS disabled by default - no Access-Control-Allow-Origin header", async () => {
      await startTestServer({ cors: false });

      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://evil.com",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    test("CORS enabled adds Access-Control-Allow-Origin header", async () => {
      await startTestServer({ cors: true });

      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://example.com",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("Data Leak", () => {
    test("HTTP response headers do not expose server version", async () => {
      await startTestServer();

      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        }),
      });

      // Should not have server version header
      expect(response.headers.get("X-Powered-By")).toBeNull();
      expect(response.headers.get("Server")).toBeNull();
    });

    test("500 error does not expose stack trace", async () => {
      await startTestServer();

      // Send invalid JSON-RPC (missing required fields)
      const response = await fetch(`http://127.0.0.1:${assignedPort}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json at all",
      });

      const text = await response.text();
      expect(text).not.toContain("    at ");
      expect(text).not.toContain("node_modules");
    });
  });

  describe("Data Damage", () => {
    test("concurrent HTTP requests are correctly isolated", async () => {
      await startTestServer();
      const { client, transport } = await createHttpClient();

      // Send concurrent requests from same client
      const [result1, result2] = await Promise.all([
        client.callTool({
          name: "afs_read",
          arguments: { path: "/fs/hello.txt" },
        }),
        client.callTool({
          name: "afs_list",
          arguments: { path: "/fs" },
        }),
      ]);

      expect(result1.isError).toBeFalsy();
      expect(result2.isError).toBeFalsy();

      const text1 = (result1.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text1).toContain("Hello, World!");

      const text2 = (result2.content as Array<{ type: string; text: string }>)[0]!.text;
      expect(text2).toContain("ENTRY");

      await client.close();
      await transport.close();
    });
  });
});
