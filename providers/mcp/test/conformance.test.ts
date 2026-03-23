/**
 * AFSMCP Provider Conformance Tests
 *
 * This file uses the unified provider testing framework to verify
 * that AFSMCP conforms to the AFS provider interface contract.
 *
 * Note: MCP provider has dynamic structure based on connected server.
 * We use mcp-server-everything for testing.
 */
import { describe } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFSMCP } from "@aigne/afs-mcp";
import { runProviderTests } from "@aigne/afs-testing";
import { setupPlayground } from "./playground.js";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("AFSMCP Conformance", () => {
  let mcpInstance: AFSMCP;

  runProviderTests({
    name: "AFSMCP",
    providerClass: AFSMCP,
    playground: setupPlayground,

    async beforeAll() {
      // Pre-create and connect the MCP instance to discover capabilities
      mcpInstance = new AFSMCP({
        name: "everything",
        description: "Everything MCP server for conformance testing",
        transport: "stdio",
        command: serverBinPath,
        args: [],
      });
      await mcpInstance.connect();
    },

    async afterAll() {
      await mcpInstance?.disconnect();
    },

    createProvider() {
      // Return the pre-connected instance
      return mcpInstance;
    },

    // MCP provider structure based on mcp-server-everything (tree format)
    // Note: Tool/prompt names from mcp-server-everything v1.x
    structure: {
      root: {
        name: "", // Root node (empty string resolves to "/")
        meta: {
          kind: "mcp:module",
          description: "Everything MCP server for conformance testing",
        },
        children: [
          // WORLD.md - generated documentation
          {
            name: "WORLD.md",
            content: "# everything", // Content contains this header
          },
          // /tools directory with tools from mcp-server-everything
          {
            name: "tools",
            meta: { kind: "afs:node" },
            children: [
              { name: "echo", meta: { kind: "mcp:tool" } },
              { name: "get-annotated-message", meta: { kind: "mcp:tool" } },
              { name: "get-env", meta: { kind: "mcp:tool" } },
              { name: "get-resource-links", meta: { kind: "mcp:tool" } },
              { name: "get-resource-reference", meta: { kind: "mcp:tool" } },
              { name: "get-structured-content", meta: { kind: "mcp:tool" } },
              { name: "get-sum", meta: { kind: "mcp:tool" } },
              { name: "get-tiny-image", meta: { kind: "mcp:tool" } },
              { name: "gzip-file-as-resource", meta: { kind: "mcp:tool" } },
              { name: "toggle-simulated-logging", meta: { kind: "mcp:tool" } },
              { name: "toggle-subscriber-updates", meta: { kind: "mcp:tool" } },
              { name: "simulate-research-query", meta: { kind: "mcp:tool" } },
              { name: "trigger-long-running-operation", meta: { kind: "mcp:tool" } },
            ],
          },
          // /prompts directory with prompts from mcp-server-everything
          {
            name: "prompts",
            meta: { kind: "afs:node" },
            children: [
              {
                name: "simple-prompt",
                content: "simple prompt without arguments",
                meta: { kind: "mcp:prompt" },
              },
              { name: "args-prompt", content: "", meta: { kind: "mcp:prompt" } },
              { name: "completable-prompt", content: "", meta: { kind: "mcp:prompt" } },
              { name: "resource-prompt", content: "", meta: { kind: "mcp:prompt" } },
            ],
          },
          // /resources directory - tree structure from mcp-server-everything
          {
            name: "resources",
            children: [
              {
                name: "resource",
                children: [
                  {
                    name: "dynamic",
                    meta: { kind: "afs:node" },
                    children: [
                      { name: "blob", meta: { kind: "mcp:resource-template" } },
                      { name: "text", meta: { kind: "mcp:resource-template" } },
                    ],
                  },
                  {
                    name: "static",
                    meta: { kind: "afs:node" },
                    children: [
                      {
                        name: "document",
                        children: [
                          {
                            name: "architecture.md",
                            content: "",
                            meta: { kind: "mcp:resource" },
                          },
                          { name: "extension.md", content: "", meta: { kind: "mcp:resource" } },
                          { name: "features.md", content: "", meta: { kind: "mcp:resource" } },
                          {
                            name: "how-it-works.md",
                            content: "",
                            meta: { kind: "mcp:resource" },
                          },
                          {
                            name: "instructions.md",
                            content: "",
                            meta: { kind: "mcp:resource" },
                          },
                          { name: "startup.md", content: "", meta: { kind: "mcp:resource" } },
                          { name: "structure.md", content: "", meta: { kind: "mcp:resource" } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },

    // Execute test cases for tools
    executeCases: [
      {
        name: "echo tool should return message",
        path: "/tools/echo",
        args: { message: "hello from conformance test" },
        expected: (output, expect) => {
          // Echo tool returns "Echo: {message}"
          const content = output.content as Array<{ type: string; text: string }>;
          expect(content).toBeDefined();
          expect(content[0]?.text).toContain("hello from conformance test");
        },
      },
      {
        name: "get-sum tool should calculate sum",
        path: "/tools/get-sum",
        args: { a: 5, b: 3 },
        expected: (output, expect) => {
          // Get-sum returns "The sum of {a} and {b} is {result}."
          const content = output.content as Array<{ type: string; text: string }>;
          expect(content).toBeDefined();
          expect(content[0]?.text).toContain("8");
        },
      },
      {
        name: "echo tool with empty message",
        path: "/tools/echo",
        args: { message: "" },
        expected: (output, expect) => {
          // Should have content array
          expect(Array.isArray(output.content)).toBe(true);
        },
      },
    ],

    config: {
      // MCP can be slow due to server startup
      timeout: 30000,
    },
  });
});
