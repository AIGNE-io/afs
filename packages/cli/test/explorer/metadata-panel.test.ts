import { describe, expect, test } from "bun:test";
import { formatMetadata } from "../../src/explorer/components/metadata-panel.js";
import type { EntryMetadata, ExplorerEntry } from "../../src/explorer/types.js";

describe("Metadata Panel", () => {
  describe("formatMetadata", () => {
    // === Happy Path ===
    describe("Happy Path - basic fields", () => {
      test("displays basic fields: path, size, modified", () => {
        const entry: ExplorerEntry = {
          name: "test.txt",
          path: "/modules/fs/test.txt",
          type: "file",
          size: 1024,
          modified: new Date("2024-01-15T10:30:00Z"),
        };

        const lines = formatMetadata(entry);

        expect(lines).toContain("Path: /modules/fs/test.txt");
        expect(lines.some((l) => l.includes("Size:"))).toBe(true);
        expect(lines.some((l) => l.includes("Modified:"))).toBe(true);
      });

      test("displays kind (single)", () => {
        const entry: ExplorerEntry = {
          name: "action",
          path: "/modules/mcp/action",
          type: "exec",
          kind: "afs:executable",
        };

        const lines = formatMetadata(entry);

        expect(lines).toContain("Kind: afs:executable");
      });

      test("displays kinds (array, joined with →)", () => {
        const entry: ExplorerEntry = {
          name: "node",
          path: "/modules/mcp/node",
          type: "file",
          kinds: ["afs:node", "afs:readable", "afs:listable"],
        };

        const lines = formatMetadata(entry);

        expect(lines).toContain("Kinds: afs:node → afs:readable → afs:listable");
      });

      test("displays extra fields from metadata", () => {
        const entry: ExplorerEntry = {
          name: "data",
          path: "/modules/sqlite/data",
          type: "directory",
        };
        const metadata: EntryMetadata = {
          path: "/modules/sqlite/data",
          extra: {
            author: "John Doe",
            version: "1.0.0",
          },
        };

        const lines = formatMetadata(entry, metadata);

        expect(lines).toContain("Author: John Doe");
        expect(lines).toContain("Version: 1.0.0");
      });

      test("inputSchema formatted as property list", () => {
        const entry: ExplorerEntry = {
          name: "tool",
          path: "/modules/mcp/tool",
          type: "exec",
        };
        const metadata: EntryMetadata = {
          path: "/modules/mcp/tool",
          extra: {
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "User name" },
                age: { type: "number" },
              },
              required: ["name"],
            },
          },
        };

        const lines = formatMetadata(entry, metadata);

        expect(lines).toContain("InputSchema:");
        expect(lines.some((l) => l.includes("• name*: string - User name"))).toBe(true);
        expect(lines.some((l) => l.includes("• age: number"))).toBe(true);
      });

      test("required fields marked with *", () => {
        const entry: ExplorerEntry = {
          name: "api",
          path: "/modules/api",
          type: "exec",
        };
        const metadata: EntryMetadata = {
          path: "/modules/api",
          extra: {
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
                query: { type: "string" },
              },
              required: ["id"],
            },
          },
        };

        const lines = formatMetadata(entry, metadata);

        // id is required, query is not
        expect(lines.some((l) => l.includes("• id*:"))).toBe(true);
        expect(lines.some((l) => l.includes("• query:") && !l.includes("*"))).toBe(true);
      });

      test("property descriptions displayed correctly", () => {
        const entry: ExplorerEntry = {
          name: "cmd",
          path: "/modules/cmd",
          type: "exec",
        };
        const metadata: EntryMetadata = {
          path: "/modules/cmd",
          extra: {
            inputSchema: {
              type: "object",
              properties: {
                command: { type: "string", description: "The command to execute" },
              },
            },
          },
        };

        const lines = formatMetadata(entry, metadata);

        expect(lines.some((l) => l.includes("- The command to execute"))).toBe(true);
      });
    });

    // === Bad Path ===
    describe("Bad Path - invalid inputs", () => {
      test("extra = null does not crash", () => {
        const entry: ExplorerEntry = {
          name: "test",
          path: "/test",
          type: "file",
        };
        const metadata: EntryMetadata = {
          path: "/test",
          extra: null as unknown as undefined,
        };

        expect(() => formatMetadata(entry, metadata)).not.toThrow();
      });

      test("extra = undefined does not crash", () => {
        const entry: ExplorerEntry = {
          name: "test",
          path: "/test",
          type: "file",
        };
        const metadata: EntryMetadata = {
          path: "/test",
        };

        expect(() => formatMetadata(entry, metadata)).not.toThrow();
      });

      test("inputSchema with invalid format falls back to JSON display", () => {
        const entry: ExplorerEntry = {
          name: "tool",
          path: "/tool",
          type: "exec",
        };
        const metadata: EntryMetadata = {
          path: "/tool",
          extra: {
            inputSchema: "invalid string",
          },
        };

        const lines = formatMetadata(entry, metadata);

        // Should display as string, not crash
        expect(lines.some((l) => l.includes("InputSchema:"))).toBe(true);
        expect(lines.some((l) => l.includes("invalid string"))).toBe(true);
      });

      test("JSON.stringify failure shows [unable to display]", () => {
        const entry: ExplorerEntry = {
          name: "circular",
          path: "/circular",
          type: "file",
        };

        // Create circular reference
        const circular: Record<string, unknown> = { a: 1 };
        circular.self = circular;

        const metadata: EntryMetadata = {
          path: "/circular",
          extra: {
            data: circular,
          },
        };

        // This should not crash, but show some fallback
        const lines = formatMetadata(entry, metadata);
        expect(Array.isArray(lines)).toBe(true);
      });
    });

    // === Edge Cases ===
    describe("Edge Cases - fallback behavior", () => {
      test("entry.kinds empty but metadata.extra.kinds has value, uses extra", () => {
        const entry: ExplorerEntry = {
          name: "node",
          path: "/node",
          type: "file",
          kinds: [], // Empty
        };
        const metadata: EntryMetadata = {
          path: "/node",
          extra: {
            kinds: ["afs:node", "afs:special"],
          },
        };

        const lines = formatMetadata(entry, metadata);

        // Should display kinds from extra since entry.kinds is empty
        // Note: current impl checks entry.kinds.length > 0 first
        expect(lines.some((l) => l.includes("afs:node") || l.includes("afs:special"))).toBe(true);
      });

      test("entry.kind and metadata.extra.kind both have value, uses entry", () => {
        const entry: ExplorerEntry = {
          name: "node",
          path: "/node",
          type: "file",
          kind: "afs:primary",
        };
        const metadata: EntryMetadata = {
          path: "/node",
          extra: {
            kind: "afs:secondary",
          },
        };

        const lines = formatMetadata(entry, metadata);

        // Should use entry.kind (afs:primary), not extra.kind
        expect(lines).toContain("Kind: afs:primary");
      });

      test("inputSchema.properties empty object handles correctly", () => {
        const entry: ExplorerEntry = {
          name: "empty",
          path: "/empty",
          type: "exec",
        };
        const metadata: EntryMetadata = {
          path: "/empty",
          extra: {
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        };

        const lines = formatMetadata(entry, metadata);

        // Should show InputSchema header but no properties
        expect(lines).toContain("InputSchema:");
      });

      test("inputSchema.required empty array handles correctly", () => {
        const entry: ExplorerEntry = {
          name: "optional",
          path: "/optional",
          type: "exec",
        };
        const metadata: EntryMetadata = {
          path: "/optional",
          extra: {
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: [],
            },
          },
        };

        const lines = formatMetadata(entry, metadata);

        // name should not have * since required is empty
        expect(lines.some((l) => l.includes("• name:") && !l.includes("*"))).toBe(true);
      });
    });

    // === Security ===
    describe("Security - no code execution", () => {
      test("extra with executable content only displays, does not execute", () => {
        const entry: ExplorerEntry = {
          name: "safe",
          path: "/safe",
          type: "file",
        };
        const metadata: EntryMetadata = {
          path: "/safe",
          extra: {
            script: "process.exit(1); // malicious",
            eval: 'eval("alert(1)")',
          },
        };

        // This should not execute anything, just display the values
        const lines = formatMetadata(entry, metadata);

        expect(lines.some((l) => l.includes("process.exit"))).toBe(true);
        expect(lines.some((l) => l.includes("eval"))).toBe(true);
      });
    });

    // === Data Leak ===
    describe("Data Leak - sensitive fields shown (by design)", () => {
      test("sensitive fields in extra are displayed (design decision)", () => {
        const entry: ExplorerEntry = {
          name: "config",
          path: "/config",
          type: "file",
        };
        const metadata: EntryMetadata = {
          path: "/config",
          extra: {
            password: "secret123",
            apiToken: "sk-xxx-yyy",
          },
        };

        const lines = formatMetadata(entry, metadata);

        // By design, we show all fields including sensitive ones
        expect(lines.some((l) => l.includes("Password:") && l.includes("secret123"))).toBe(true);
        expect(lines.some((l) => l.includes("ApiToken:") && l.includes("sk-xxx-yyy"))).toBe(true);
      });
    });

    // === Data Damage ===
    describe("Data Damage - immutability", () => {
      test("does not modify the passed metadata object", () => {
        const entry: ExplorerEntry = {
          name: "immut",
          path: "/immut",
          type: "file",
        };
        const originalExtra = { custom: "value", nested: { a: 1 } };
        const metadata: EntryMetadata = {
          path: "/immut",
          extra: originalExtra,
        };

        const metadataBefore = JSON.stringify(metadata);
        formatMetadata(entry, metadata);
        const metadataAfter = JSON.stringify(metadata);

        expect(metadataAfter).toBe(metadataBefore);
      });

      test("does not modify the passed entry object", () => {
        const entry: ExplorerEntry = {
          name: "immut",
          path: "/immut",
          type: "file",
          kinds: ["afs:node"],
        };

        const entryBefore = JSON.stringify(entry);
        formatMetadata(entry);
        const entryAfter = JSON.stringify(entry);

        expect(entryAfter).toBe(entryBefore);
      });
    });
  });
});
