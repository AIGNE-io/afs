import { describe, expect, test } from "bun:test";
import type { AFS, AFSEntry, AFSStatResult } from "@aigne/afs";
import {
  createUpEntry,
  loadDirectory,
  loadMetadata,
  toExplorerEntry,
} from "../../src/explorer/actions.js";
import { formatMetadata } from "../../src/explorer/components/metadata-panel.js";
import type { ExplorerEntry } from "../../src/explorer/types.js";

/**
 * Integration tests for Explorer - verifying childrenCount semantics
 * work correctly across navigation, display, and metadata loading.
 */
describe("Explorer Integration", () => {
  // === Happy Path ===
  describe("Happy Path - childrenCount navigation", () => {
    test("directory with childrenCount > 0 can be navigated", async () => {
      // Simulate a directory structure
      const mockAFS = {
        list: async (path: string) => {
          if (path === "/modules") {
            return {
              data: [
                {
                  id: "1",
                  path: "/modules/fs",
                  meta: { childrenCount: 10 }, // Directory
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                {
                  id: "2",
                  path: "/modules/sqlite",
                  meta: { childrenCount: 5 }, // Directory
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            };
          }
          return { data: [] };
        },
      } as unknown as AFS;

      const result = await loadDirectory(mockAFS, "/modules");

      expect(result.error).toBeUndefined();
      // Both should be directories
      const entries = result.entries.filter((e) => e.type !== "up");
      expect(entries).toHaveLength(2);
      expect(entries[0]!.type).toBe("directory");
      expect(entries[1]!.type).toBe("directory");
    });

    test("entry with childrenCount = 0 displays as file", () => {
      const entry: AFSEntry = {
        id: "leaf",
        path: "/modules/fs/config.json",
        meta: { childrenCount: 0, size: 256 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const explorerEntry = toExplorerEntry(entry, "/modules/fs");

      expect(explorerEntry.type).toBe("file");
    });

    test("entry with childrenCount = undefined displays as file (critical)", () => {
      const entry: AFSEntry = {
        id: "leaf",
        path: "/modules/json/value",
        meta: {}, // No childrenCount - leaf node per Provider Protocol
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const explorerEntry = toExplorerEntry(entry, "/modules/json");

      expect(explorerEntry.type).toBe("file");
    });

    test("metadata panel displays all fields", () => {
      const entry: ExplorerEntry = {
        name: "database.db",
        path: "/modules/sqlite/database.db",
        type: "file",
        size: 10240,
        modified: new Date("2024-01-15"),
        kind: "afs:database",
      };

      const lines = formatMetadata(entry);

      expect(lines).toContain("Path: /modules/sqlite/database.db");
      expect(lines.some((l) => l.includes("Size:"))).toBe(true);
      expect(lines.some((l) => l.includes("Modified:"))).toBe(true);
      expect(lines).toContain("Kind: afs:database");
    });

    test("inputSchema formatting displays correctly", () => {
      const entry: ExplorerEntry = {
        name: "search",
        path: "/modules/mcp/search",
        type: "exec",
      };
      const metadata = {
        path: "/modules/mcp/search",
        extra: {
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              limit: { type: "number", description: "Max results" },
            },
            required: ["query"],
          },
        },
      };

      const lines = formatMetadata(entry, metadata);

      expect(lines).toContain("InputSchema:");
      expect(lines.some((l) => l.includes("• query*: string - Search query"))).toBe(true);
      expect(lines.some((l) => l.includes("• limit: number - Max results"))).toBe(true);
    });
  });

  // === Bad Path ===
  describe("Bad Path", () => {
    test("navigation to non-existent path shows error", async () => {
      const mockAFS = {
        list: async () => {
          throw new Error("Path not found");
        },
      } as unknown as AFS;

      const result = await loadDirectory(mockAFS, "/nonexistent");

      expect(result.error).toBe("Path not found");
      expect(result.entries).toEqual([]);
    });
  });

  // === Edge Cases ===
  describe("Edge Cases", () => {
    test("root directory does not have .. entry", async () => {
      const mockAFS = {
        list: async () => ({
          data: [
            {
              id: "1",
              path: "/modules",
              meta: { childrenCount: 3 },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as unknown as AFS;

      const result = await loadDirectory(mockAFS, "/");

      const upEntry = result.entries.find((e) => e.type === "up");
      expect(upEntry).toBeUndefined();
    });

    test("nested path navigates correctly", async () => {
      const mockAFS = {
        list: async (path: string) => {
          if (path === "/modules/fs/src/utils") {
            return {
              data: [
                {
                  id: "1",
                  path: "/modules/fs/src/utils/helper.ts",
                  meta: { childrenCount: 0 },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            };
          }
          return { data: [] };
        },
      } as unknown as AFS;

      const result = await loadDirectory(mockAFS, "/modules/fs/src/utils");

      expect(result.error).toBeUndefined();
      expect(result.entries).toHaveLength(2); // ".." + 1 file
      expect(result.entries[0]!.type).toBe("up");
      expect(result.entries[0]!.path).toBe("/modules/fs/src");
      expect(result.entries[1]!.name).toBe("helper.ts");
      expect(result.entries[1]!.type).toBe("file");
    });

    test("createUpEntry creates correct parent path", () => {
      const upEntry = createUpEntry("/modules/fs/src");

      expect(upEntry.name).toBe("..");
      expect(upEntry.path).toBe("/modules/fs/src");
      expect(upEntry.type).toBe("up");
    });

    test("mixed childrenCount values sort correctly", async () => {
      const mockAFS = {
        list: async () => ({
          data: [
            {
              id: "1",
              path: "/test/alpha.txt",
              meta: { childrenCount: 0 }, // file
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "2",
              path: "/test/beta",
              meta: { childrenCount: 5 }, // directory
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "3",
              path: "/test/gamma",
              meta: {}, // file (undefined = leaf)
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              id: "4",
              path: "/test/delta",
              meta: { childrenCount: -1 }, // directory (unknown count)
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as unknown as AFS;

      const result = await loadDirectory(mockAFS, "/test");

      // Should be: .., directories (beta, delta), files (alpha.txt, gamma)
      expect(result.entries[0]!.type).toBe("up");
      expect(result.entries[1]!.type).toBe("directory"); // beta
      expect(result.entries[2]!.type).toBe("directory"); // delta
      expect(result.entries[3]!.type).toBe("file"); // alpha.txt
      expect(result.entries[4]!.type).toBe("file"); // gamma
    });
  });

  // === loadMetadata Integration ===
  describe("loadMetadata integration", () => {
    test("loads complete metadata with actions", async () => {
      const mockAFS = {
        stat: async (): Promise<AFSStatResult> => ({
          data: {
            id: "users",
            path: "/modules/sqlite/users",
            meta: {
              childrenCount: 100,
              description: "Users table",
              provider: "sqlite",
            },
            actions: [
              { name: "query", description: "Run SQL query" },
              { name: "export", description: "Export data" },
            ],
          },
        }),
      } as unknown as AFS;

      const entry: ExplorerEntry = {
        name: "users",
        path: "/modules/sqlite/users",
        type: "directory",
      };

      const metadata = await loadMetadata(mockAFS, entry);

      expect(metadata?.description).toBe("Users table");
      expect(metadata?.provider).toBe("sqlite");
      expect(metadata?.actions).toHaveLength(2);
      expect(metadata?.actions?.[0]?.name).toBe("query");
    });
  });
});
