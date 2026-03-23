/**
 * Tests for MCP-specific kind definitions
 *
 * MCP kinds:
 * - mcp:module - Root module container
 * - mcp:tool - Executable tool (extends afs:executable)
 * - mcp:prompt - Prompt template (extends afs:node)
 * - mcp:resource - Resource (extends afs:node)
 */

import { describe, expect, test } from "bun:test";
import { getInheritanceChain } from "@aigne/afs";
import {
  getKindsArray,
  getMcpKind,
  getMcpKindResolver,
  MCP_KINDS,
  MCP_KINDS_MAP,
  mcpModule,
  mcpPrompt,
  mcpResource,
  mcpTool,
} from "../src/kinds.js";

describe("MCP Kind Definitions", () => {
  describe("mcpModule kind", () => {
    test("should have correct name", () => {
      expect(mcpModule.name).toBe("mcp:module");
    });

    test("should extend afs:node", () => {
      expect(mcpModule.extends).toBe("afs:node");
    });

    test("should have description", () => {
      expect(mcpModule.description).toBeDefined();
    });
  });

  describe("mcpTool kind", () => {
    test("should have correct name", () => {
      expect(mcpTool.name).toBe("mcp:tool");
    });

    test("should extend afs:executable", () => {
      expect(mcpTool.extends).toBe("afs:executable");
    });

    test("should have description", () => {
      expect(mcpTool.description).toBeDefined();
    });

    test("should have inputSchema in meta", () => {
      expect(mcpTool.meta?.properties?.inputSchema).toBeDefined();
    });
  });

  describe("mcpPrompt kind", () => {
    test("should have correct name", () => {
      expect(mcpPrompt.name).toBe("mcp:prompt");
    });

    test("should extend afs:node", () => {
      expect(mcpPrompt.extends).toBe("afs:node");
    });

    test("should have description", () => {
      expect(mcpPrompt.description).toBeDefined();
    });
  });

  describe("mcpResource kind", () => {
    test("should have correct name", () => {
      expect(mcpResource.name).toBe("mcp:resource");
    });

    test("should extend afs:node", () => {
      expect(mcpResource.extends).toBe("afs:node");
    });

    test("should have description", () => {
      expect(mcpResource.description).toBeDefined();
    });
  });

  describe("MCP_KINDS array", () => {
    test("should contain all MCP kinds", () => {
      expect(MCP_KINDS).toHaveLength(4);
      const names = MCP_KINDS.map((k) => k.name);
      expect(names).toContain("mcp:module");
      expect(names).toContain("mcp:tool");
      expect(names).toContain("mcp:prompt");
      expect(names).toContain("mcp:resource");
    });
  });

  describe("MCP_KINDS_MAP", () => {
    test("should allow lookup by name", () => {
      expect(MCP_KINDS_MAP.get("mcp:tool")).toBe(mcpTool);
      expect(MCP_KINDS_MAP.get("mcp:prompt")).toBe(mcpPrompt);
      expect(MCP_KINDS_MAP.get("mcp:resource")).toBe(mcpResource);
      expect(MCP_KINDS_MAP.get("mcp:module")).toBe(mcpModule);
    });
  });

  describe("getMcpKind function", () => {
    test("should return kind by name", () => {
      expect(getMcpKind("mcp:tool")).toBe(mcpTool);
    });

    test("should return undefined for unknown kind", () => {
      expect(getMcpKind("unknown:kind")).toBeUndefined();
    });
  });

  describe("getMcpKindResolver", () => {
    test("should resolve MCP kinds", () => {
      const resolver = getMcpKindResolver();
      expect(resolver("mcp:tool")).toBe(mcpTool);
    });

    test("should resolve well-known kinds", () => {
      const resolver = getMcpKindResolver();
      const afsNode = resolver("afs:node");
      expect(afsNode).toBeDefined();
      expect(afsNode?.name).toBe("afs:node");
    });

    test("should return undefined for unknown kinds", () => {
      const resolver = getMcpKindResolver();
      expect(resolver("unknown:kind")).toBeUndefined();
    });
  });

  describe("Inheritance chain", () => {
    test("mcp:tool should have chain [afs:node, afs:executable, mcp:tool]", () => {
      const resolver = getMcpKindResolver();
      const chain = getInheritanceChain(mcpTool, resolver);

      const names = chain.map((k) => k.name);
      expect(names).toEqual(["afs:node", "afs:executable", "mcp:tool"]);
    });

    test("mcp:module should have chain [afs:node, mcp:module]", () => {
      const resolver = getMcpKindResolver();
      const chain = getInheritanceChain(mcpModule, resolver);

      const names = chain.map((k) => k.name);
      expect(names).toEqual(["afs:node", "mcp:module"]);
    });

    test("mcp:prompt should have chain [afs:node, mcp:prompt]", () => {
      const resolver = getMcpKindResolver();
      const chain = getInheritanceChain(mcpPrompt, resolver);

      const names = chain.map((k) => k.name);
      expect(names).toEqual(["afs:node", "mcp:prompt"]);
    });

    test("mcp:resource should have chain [afs:node, mcp:resource]", () => {
      const resolver = getMcpKindResolver();
      const chain = getInheritanceChain(mcpResource, resolver);

      const names = chain.map((k) => k.name);
      expect(names).toEqual(["afs:node", "mcp:resource"]);
    });
  });

  describe("getKindsArray helper", () => {
    test("should return kinds array for mcp:tool (most specific first)", () => {
      const kinds = getKindsArray("mcp:tool");
      expect(kinds).toEqual(["mcp:tool", "afs:executable", "afs:node"]);
    });

    test("should return kinds array for mcp:module", () => {
      const kinds = getKindsArray("mcp:module");
      expect(kinds).toEqual(["mcp:module", "afs:node"]);
    });

    test("should return kinds array for mcp:prompt", () => {
      const kinds = getKindsArray("mcp:prompt");
      expect(kinds).toEqual(["mcp:prompt", "afs:node"]);
    });

    test("should return kinds array for mcp:resource", () => {
      const kinds = getKindsArray("mcp:resource");
      expect(kinds).toEqual(["mcp:resource", "afs:node"]);
    });

    test("should return single-element array for unknown kind", () => {
      const kinds = getKindsArray("unknown:kind");
      expect(kinds).toEqual(["unknown:kind"]);
    });
  });
});
