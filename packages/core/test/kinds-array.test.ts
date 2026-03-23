/**
 * Tests for `kinds` array in AFSEntryMetadata
 *
 * The `kinds` array represents the inheritance chain of a node's kind.
 * Example: An MCP tool has `kinds: ["mcp:tool", "afs:executable", "afs:node"]`
 * This allows checking capabilities via `kinds.includes("afs:executable")`
 */

import { describe, expect, test } from "bun:test";
import type { AFSEntry, AFSEntryMetadata } from "@aigne/afs";

describe("kinds array in AFSEntryMetadata", () => {
  test("kinds array should be optional", () => {
    const meta: AFSEntryMetadata = {
      kind: "afs:node",
      // kinds is optional, so this should compile and work
    };
    expect(meta.kind).toBe("afs:node");
    expect(meta.kinds).toBeUndefined();
  });

  test("kinds array should hold inheritance chain", () => {
    const meta: AFSEntryMetadata = {
      kind: "mcp:tool",
      kinds: ["mcp:tool", "afs:executable", "afs:node"],
    };
    expect(meta.kind).toBe("mcp:tool");
    expect(meta.kinds).toEqual(["mcp:tool", "afs:executable", "afs:node"]);
  });

  test("kinds array enables capability detection", () => {
    const meta: AFSEntryMetadata = {
      kind: "mcp:tool",
      kinds: ["mcp:tool", "afs:executable", "afs:node"],
    };

    // Check if node is executable
    const isExecutable = meta.kinds?.includes("afs:executable") ?? false;
    expect(isExecutable).toBe(true);

    // Check if node is an MCP tool
    const isMcpTool = meta.kinds?.includes("mcp:tool") ?? false;
    expect(isMcpTool).toBe(true);

    // Check for a non-existent kind
    const isDocument = meta.kinds?.includes("afs:document") ?? false;
    expect(isDocument).toBe(false);
  });

  test("AFSEntry can contain kinds array in meta", () => {
    const entry: AFSEntry = {
      id: "/tools/echo",
      path: "/tools/echo",
      summary: "Echo tool",
      meta: {
        kind: "mcp:tool",
        kinds: ["mcp:tool", "afs:executable", "afs:node"],
        description: "Echoes input back",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
        },
      },
    };

    expect(entry.meta?.kinds).toEqual(["mcp:tool", "afs:executable", "afs:node"]);
    expect(entry.meta?.kinds?.includes("afs:executable")).toBe(true);
  });

  test("kinds array first element should match kind field", () => {
    const meta: AFSEntryMetadata = {
      kind: "mcp:prompt",
      kinds: ["mcp:prompt", "afs:node"],
    };

    // By convention, kinds[0] should equal kind
    expect(meta.kinds?.[0]).toBe(meta.kind);
  });

  test("empty kinds array is valid", () => {
    const meta: AFSEntryMetadata = {
      kind: "afs:node",
      kinds: [],
    };
    expect(meta.kinds).toEqual([]);
    expect(meta.kinds?.includes("afs:node")).toBe(false);
  });
});
