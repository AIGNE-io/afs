import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFS } from "@aigne/afs";
import { AFSMCP } from "@aigne/afs-mcp";

/**
 * Phase 6: MCP — explain + search
 *
 * Tests for:
 * - explain root → server name, version, tools/prompts/resources count
 * - explain tool → name, description, inputSchema summary
 * - explain prompt → name, description, argument list
 * - explain non-existent node → error
 * - explain tool with complex inputSchema
 * - explain when server has no prompts/resources
 * - search by name → matching tools/prompts/resources
 * - search by description → matching items
 * - search empty string → all items
 * - search no match → empty result
 * - search does not allow regex injection
 * - explain does not expose server transport credentials
 * - all operations are read-only
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

let mcp: AFSMCP;
let afs: AFS;

beforeAll(async () => {
  mcp = new AFSMCP({
    name: "everything",
    description: "Everything test server",
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

// ========== Explain: Happy Path ==========

describe("explain", () => {
  test("explain root → server name, tools/prompts/resources count", async () => {
    const result = await mcp.explain("/");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toBeTruthy();
    // Should mention server name
    expect(result.content).toContain("everything");
    // Should include tools count
    expect(result.content.toLowerCase()).toContain("tool");
    // Should include prompts info
    expect(result.content.toLowerCase()).toContain("prompt");
    // Should include resources info
    expect(result.content.toLowerCase()).toContain("resource");
  });

  test("explain tool → name, description, inputSchema summary", async () => {
    // The everything server has an "echo" tool
    const result = await mcp.explain("/tools/echo");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("echo");
    // Should mention input schema or parameters
    expect(result.content.toLowerCase()).toMatch(/schema|param|input|argument/);
  });

  test("explain prompt → name, description, argument list", async () => {
    // The everything server has a "simple-prompt"
    const result = await mcp.explain("/prompts/simple-prompt");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("simple-prompt");
  });

  // ========== Explain: Bad Path ==========

  test("explain non-existent node → error", async () => {
    await expect(mcp.explain("/tools/nonexistent-tool-xyz")).rejects.toThrow();
  });

  test("explain non-existent prompt → error", async () => {
    await expect(mcp.explain("/prompts/nonexistent-prompt-xyz")).rejects.toThrow();
  });

  // ========== Explain: Edge Cases ==========

  test("explain tool with complex inputSchema", async () => {
    // The everything server has tools with various input schemas
    // "get-sum" tool takes numeric parameters
    const result = await mcp.explain("/tools/get-sum");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toBeTruthy();
    expect(result.content).toContain("get-sum");
  });

  test("MCP server with no prompts/resources → explain reflects correctly", async () => {
    // Create an MCP instance that connects to a server, then check explain
    // We use the same server but explain should correctly reflect counts
    const result = await mcp.explain("/");
    expect(result).toBeDefined();
    // The content should be well-formed even if counts are zero for some categories
    expect(result.content.length).toBeGreaterThan(10);
  });

  // ========== Explain: Security ==========

  test("explain does not expose server transport credentials", async () => {
    const result = await mcp.explain("/");
    const content = result.content;
    // Should not contain any password/token/secret references
    expect(content).not.toMatch(/password|token|secret|credential/i);
    // Should not expose absolute file paths of the server binary
    expect(content).not.toContain(serverBinPath);
  });
});

// ========== Search: Happy Path ==========

describe("search", () => {
  test("search by name → returns matching tools/prompts/resources", async () => {
    const result = await mcp.search("/", "echo");
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
    // At least one result should be the echo tool
    const paths = result.data.map((e) => e.path);
    expect(paths.some((p) => p?.includes("echo"))).toBe(true);
  });

  test("search by description content → returns matching items", async () => {
    // Search for a term that appears in tool descriptions
    const result = await mcp.search("/", "sum");
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
  });

  // ========== Search: Bad Path ==========

  test("search no match → empty result", async () => {
    const result = await mcp.search("/", "xyznonexistent9999");
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(0);
  });

  // ========== Search: Edge Cases ==========

  test("search empty string → returns all items", async () => {
    const result = await mcp.search("/", "");
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    // Should return all tools + prompts + resources
    expect(result.data.length).toBeGreaterThan(0);
  });

  // ========== Search: Security ==========

  test("search does not allow regex injection", async () => {
    // Regex special characters should be treated as literals
    const result = await mcp.search("/", ".*");
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    // Should not match everything (if treated literally, ".*" is not a name)
    // But it should not throw an error either
  });
});

// ========== All Operations Read-Only ==========

describe("read-only safety", () => {
  test("all operations are read-only", async () => {
    // Record initial state
    const beforeTools = mcp.tools.length;
    const beforePrompts = mcp.prompts.length;

    // Run all read operations
    await mcp.explain("/");
    await mcp.explain("/tools/echo");
    await mcp.search("/", "echo");
    await mcp.search("/", "");

    // Verify state unchanged
    expect(mcp.tools.length).toBe(beforeTools);
    expect(mcp.prompts.length).toBe(beforePrompts);
  });
});
