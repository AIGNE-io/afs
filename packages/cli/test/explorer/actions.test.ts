import { describe, expect, test } from "bun:test";
import type { AFS, AFSEntry } from "@aigne/afs";
import {
  createInitialState,
  createUpEntry,
  executeAction,
  filterEntries,
  isExecutable,
  loadDirectory,
  loadMetadata,
  navigation,
  toExplorerEntry,
} from "../../src/explorer/actions.js";
import type { ExplorerEntry, ExplorerState } from "../../src/explorer/types.js";

describe("Explorer Actions", () => {
  describe("toExplorerEntry", () => {
    // === Happy Path ===
    describe("Happy Path - childrenCount semantics", () => {
      test("childrenCount > 0 returns type = directory", () => {
        const afsEntry: AFSEntry = {
          id: "test-1",
          path: "/test/subdir",
          meta: { childrenCount: 5 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.name).toBe("subdir");
        expect(result.type).toBe("directory");
        expect(result.childrenCount).toBe(5);
      });

      test("childrenCount = -1 returns type = directory", () => {
        const afsEntry: AFSEntry = {
          id: "test-2",
          path: "/test/unknown-dir",
          meta: { childrenCount: -1 }, // Unknown children count
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("directory");
        expect(result.childrenCount).toBe(-1);
      });

      test("childrenCount = 0 returns type = file", () => {
        const afsEntry: AFSEntry = {
          id: "test-3",
          path: "/test/file.txt",
          meta: { size: 1024, childrenCount: 0 },
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-15"),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.name).toBe("file.txt");
        expect(result.path).toBe("/test/file.txt");
        expect(result.type).toBe("file");
        expect(result.size).toBe(1024);
      });

      test("childrenCount = undefined returns type = file", () => {
        const afsEntry: AFSEntry = {
          id: "test-4",
          path: "/test/leaf-node",
          meta: {}, // No childrenCount → leaf node → file
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("file");
      });

      test("kind = afs:executable returns type = exec", () => {
        const afsEntry: AFSEntry = {
          id: "test-5",
          path: "/test/action",
          meta: { kind: "afs:executable" },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("exec");
      });

      test("kind = afs:link returns type = link", () => {
        const afsEntry: AFSEntry = {
          id: "test-6",
          path: "/test/symlink",
          meta: { kind: "afs:link" },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("link");
      });

      test("kinds array includes afs:link returns type = link", () => {
        const afsEntry: AFSEntry = {
          id: "test-7",
          path: "/test/symlink",
          meta: { kinds: ["afs:node", "afs:link"] },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("link");
      });
    });

    // === Bad Path ===
    describe("Bad Path - invalid inputs", () => {
      test("childrenCount = NaN does not crash, returns file", () => {
        const afsEntry: AFSEntry = {
          id: "test-bad-1",
          path: "/test/weird",
          meta: { childrenCount: NaN },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("file");
      });

      test("childrenCount = -5 (negative, not -1) returns file", () => {
        const afsEntry: AFSEntry = {
          id: "test-bad-2",
          path: "/test/invalid",
          meta: { childrenCount: -5 },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("file");
      });

      test("meta = null does not crash, returns file", () => {
        const afsEntry: AFSEntry = {
          id: "test-bad-3",
          path: "/test/null-meta",
          meta: null as unknown as undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("file");
      });

      test("meta = undefined does not crash, returns file", () => {
        const afsEntry: AFSEntry = {
          id: "test-bad-4",
          path: "/test/no-meta",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("file");
        expect(result.size).toBeUndefined();
      });
    });

    // === Edge Cases ===
    describe("Edge Cases - type priority", () => {
      test("childrenCount = 0 with kind = afs:executable, exec takes priority", () => {
        const afsEntry: AFSEntry = {
          id: "test-edge-1",
          path: "/test/action",
          meta: { childrenCount: 0, kind: "afs:executable" },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("exec");
      });

      test("childrenCount = 0 with kind = afs:link, link takes priority", () => {
        const afsEntry: AFSEntry = {
          id: "test-edge-2",
          path: "/test/link",
          meta: { childrenCount: 0, kind: "afs:link" },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("link");
      });

      test("kinds array has both executable and link, executable takes priority", () => {
        const afsEntry: AFSEntry = {
          id: "test-edge-3",
          path: "/test/both",
          meta: { kinds: ["afs:link", "afs:executable"] },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        expect(result.type).toBe("exec");
      });
    });

    // === Security ===
    describe("Security - input validation", () => {
      test("childrenCount as string is validated as number", () => {
        const afsEntry: AFSEntry = {
          id: "test-sec-1",
          path: "/test/string-count",
          meta: { childrenCount: "5" as unknown as number },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = toExplorerEntry(afsEntry, "/test");

        // String "5" is not a valid number type, should be treated as file
        expect(result.type).toBe("file");
      });
    });

    // === Data Damage ===
    describe("Data Damage - immutability", () => {
      test("does not modify the passed AFSEntry object", () => {
        const originalMeta = { childrenCount: 5, size: 100 };
        const afsEntry: AFSEntry = {
          id: "test-immut-1",
          path: "/test/immutable",
          meta: originalMeta,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const entryBefore = JSON.stringify(afsEntry);
        toExplorerEntry(afsEntry, "/test");
        const entryAfter = JSON.stringify(afsEntry);

        expect(entryAfter).toBe(entryBefore);
      });
    });

    // === Optional metadata fields ===
    test("includes optional metadata fields", () => {
      const afsEntry: AFSEntry = {
        id: "test-opt-1",
        path: "/test/file.txt",
        meta: {
          hash: "sha256:abc123",
          description: "Test file",
          provider: "fs",
          childrenCount: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = toExplorerEntry(afsEntry, "/test");

      expect(result.hash).toBe("sha256:abc123");
      expect(result.description).toBe("Test file");
      expect(result.provider).toBe("fs");
    });
  });

  describe("createUpEntry", () => {
    test("creates parent directory entry", () => {
      const result = createUpEntry("/parent");

      expect(result.name).toBe("..");
      expect(result.path).toBe("/parent");
      expect(result.type).toBe("up");
    });

    test("creates root parent entry", () => {
      const result = createUpEntry("/");

      expect(result.path).toBe("/");
      expect(result.type).toBe("up");
    });
  });

  describe("loadDirectory", () => {
    test("loads directory entries", async () => {
      const mockRuntime = {
        list: async () => ({
          data: [
            {
              path: "/test/file.txt",
              meta: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              path: "/test/subdir",
              meta: { childrenCount: 3 },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as unknown as AFS;

      const result = await loadDirectory(mockRuntime, "/test");

      expect(result.error).toBeUndefined();
      expect(result.entries.length).toBe(3); // ".." + 2 entries
      expect(result.entries[0]!.type).toBe("up");
    });

    test("sorts directories before files", async () => {
      // Per Provider Protocol spec:
      // - childrenCount === 0 or undefined → file (leaf node)
      // - childrenCount > 0 or -1 → directory
      const mockRuntime = {
        list: async () => ({
          data: [
            {
              path: "/test/b.txt",
              meta: { childrenCount: 0 }, // Explicitly no children → file
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              path: "/test/a-dir",
              meta: { childrenCount: 2 }, // Has children → directory
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              path: "/test/z-dir",
              meta: { childrenCount: 5 }, // Has children → directory
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as unknown as AFS;

      const result = await loadDirectory(mockRuntime, "/test");

      expect(result.entries[0]!.type).toBe("up");
      expect(result.entries[1]!.name).toBe("a-dir"); // directory first
      expect(result.entries[2]!.name).toBe("z-dir"); // directory second
      expect(result.entries[3]!.name).toBe("b.txt"); // file last
    });

    test("does not add up entry at root", async () => {
      const mockRuntime = {
        list: async () => ({
          data: [
            {
              path: "/modules",
              meta: { childrenCount: 2 },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as unknown as AFS;

      const result = await loadDirectory(mockRuntime, "/");

      expect(result.entries[0]!.type).toBe("directory");
      expect(result.entries.find((e) => e.type === "up")).toBeUndefined();
    });

    test("returns error on failure", async () => {
      const mockRuntime = {
        list: async () => {
          throw new Error("Network error");
        },
      } as unknown as AFS;

      const result = await loadDirectory(mockRuntime, "/test");

      expect(result.error).toBe("Network error");
      expect(result.entries).toEqual([]);
    });

    test("skips current directory entry", async () => {
      const mockRuntime = {
        list: async () => ({
          data: [
            {
              path: "/test", // Current directory
              meta: { childrenCount: 1 },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              path: "/test/file.txt",
              meta: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      } as unknown as AFS;

      const result = await loadDirectory(mockRuntime, "/test");

      // Should have ".." and "file.txt", but not "/test" itself
      expect(result.entries.length).toBe(2);
      expect(result.entries.find((e) => e.path === "/test")).toBeUndefined();
    });
  });

  describe("navigation", () => {
    const createState = (overrides: Partial<ExplorerState> = {}): ExplorerState => ({
      currentPath: "/test",
      entries: [
        { name: "..", path: "/", type: "up" },
        { name: "dir1", path: "/test/dir1", type: "directory" },
        { name: "dir2", path: "/test/dir2", type: "directory" },
        { name: "file1.txt", path: "/test/file1.txt", type: "file" },
        { name: "file2.txt", path: "/test/file2.txt", type: "file" },
      ],
      selectedIndex: 2,
      scrollOffset: 0,
      loading: false,
      ...overrides,
    });

    describe("up", () => {
      test("moves selection up", () => {
        const state = createState({ selectedIndex: 2 });
        const result = navigation.up(state);
        expect(result.selectedIndex).toBe(1);
      });

      test("does not go below 0", () => {
        const state = createState({ selectedIndex: 0 });
        const result = navigation.up(state);
        expect(result.selectedIndex).toBe(0);
      });
    });

    describe("down", () => {
      test("moves selection down", () => {
        const state = createState({ selectedIndex: 2 });
        const result = navigation.down(state);
        expect(result.selectedIndex).toBe(3);
      });

      test("does not go beyond last item", () => {
        const state = createState({ selectedIndex: 4 });
        const result = navigation.down(state);
        expect(result.selectedIndex).toBe(4);
      });
    });

    describe("home", () => {
      test("goes to first item", () => {
        const state = createState({ selectedIndex: 3 });
        const result = navigation.home(state);
        expect(result.selectedIndex).toBe(0);
        expect(result.scrollOffset).toBe(0);
      });
    });

    describe("end", () => {
      test("goes to last item", () => {
        const state = createState({ selectedIndex: 1 });
        const result = navigation.end(state);
        expect(result.selectedIndex).toBe(4);
      });

      test("handles empty list", () => {
        const state = createState({ entries: [], selectedIndex: 0 });
        const result = navigation.end(state);
        expect(result.selectedIndex).toBe(0);
      });
    });

    describe("pageUp", () => {
      test("moves up by page size", () => {
        const state = createState({ selectedIndex: 4 });
        const result = navigation.pageUp(state, 3);
        expect(result.selectedIndex).toBe(1);
      });

      test("does not go below 0", () => {
        const state = createState({ selectedIndex: 1 });
        const result = navigation.pageUp(state, 5);
        expect(result.selectedIndex).toBe(0);
      });
    });

    describe("pageDown", () => {
      test("moves down by page size", () => {
        const state = createState({ selectedIndex: 0 });
        const result = navigation.pageDown(state, 3);
        expect(result.selectedIndex).toBe(3);
      });

      test("does not go beyond last item", () => {
        const state = createState({ selectedIndex: 3 });
        const result = navigation.pageDown(state, 5);
        expect(result.selectedIndex).toBe(4);
      });
    });

    describe("getSelected", () => {
      test("returns selected entry", () => {
        const state = createState({ selectedIndex: 2 });
        const result = navigation.getSelected(state);
        expect(result?.name).toBe("dir2");
      });

      test("returns undefined for invalid index", () => {
        const state = createState({ selectedIndex: 10 });
        const result = navigation.getSelected(state);
        expect(result).toBeUndefined();
      });
    });

    describe("getParentPath", () => {
      test("returns parent of nested path", () => {
        expect(navigation.getParentPath("/a/b/c")).toBe("/a/b");
      });

      test("returns root for top-level path", () => {
        expect(navigation.getParentPath("/modules")).toBe("/");
      });

      test("returns root for root", () => {
        expect(navigation.getParentPath("/")).toBe("/");
      });
    });
  });

  describe("filterEntries", () => {
    const entries: ExplorerEntry[] = [
      { name: "..", path: "/", type: "up" },
      { name: "Documents", path: "/Documents", type: "directory" },
      { name: "Downloads", path: "/Downloads", type: "directory" },
      { name: "readme.txt", path: "/readme.txt", type: "file" },
      { name: "README.md", path: "/README.md", type: "file" },
    ];

    test("returns all entries when filter is empty", () => {
      const result = filterEntries(entries, "");
      expect(result.length).toBe(5);
    });

    test("filters by name case-insensitively", () => {
      const result = filterEntries(entries, "readme");
      // Should include: ".." (always), "readme.txt", "README.md"
      expect(result.length).toBe(3);
      expect(result.map((e) => e.name)).toContain("readme.txt");
      expect(result.map((e) => e.name)).toContain("README.md");
    });

    test("always includes up entry", () => {
      const result = filterEntries(entries, "xyz");
      expect(result.length).toBe(1);
      expect(result[0]!.type).toBe("up");
    });

    test("filters partial matches", () => {
      const result = filterEntries(entries, "down");
      expect(result.map((e) => e.name)).toContain("Downloads");
    });
  });

  describe("createInitialState", () => {
    test("creates state with default path", () => {
      const state = createInitialState();
      expect(state.currentPath).toBe("/");
      expect(state.entries).toEqual([]);
      expect(state.selectedIndex).toBe(0);
      expect(state.loading).toBe(true);
    });

    test("creates state with custom path", () => {
      const state = createInitialState("/modules/src");
      expect(state.currentPath).toBe("/modules/src");
    });
  });

  // === Phase 2: isExecutable Tests ===
  describe("isExecutable", () => {
    // Happy Path
    describe("Happy Path", () => {
      test("returns true for kind = afs:executable", () => {
        expect(isExecutable({ kind: "afs:executable" })).toBe(true);
      });

      test("returns true for kinds array containing afs:executable", () => {
        expect(isExecutable({ kinds: ["afs:node", "afs:executable"] })).toBe(true);
      });

      test("returns true for kinds array with only afs:executable", () => {
        expect(isExecutable({ kinds: ["afs:executable"] })).toBe(true);
      });
    });

    // Bad Path
    describe("Bad Path", () => {
      test("returns false for null", () => {
        expect(isExecutable(null)).toBe(false);
      });

      test("returns false for undefined", () => {
        expect(isExecutable(undefined)).toBe(false);
      });

      test("returns false for empty object", () => {
        expect(isExecutable({})).toBe(false);
      });

      test("returns false for kind = afs:node", () => {
        expect(isExecutable({ kind: "afs:node" })).toBe(false);
      });

      test("returns false for kind = afs:link", () => {
        expect(isExecutable({ kind: "afs:link" })).toBe(false);
      });

      test("returns false for kinds array without afs:executable", () => {
        expect(isExecutable({ kinds: ["afs:node", "afs:readable"] })).toBe(false);
      });

      test("returns false for empty kinds array", () => {
        expect(isExecutable({ kinds: [] })).toBe(false);
      });
    });
  });

  // === Phase 2: loadMetadata Tests ===
  describe("loadMetadata", () => {
    // Happy Path
    describe("Happy Path", () => {
      test("returns actions array from stat result", async () => {
        const mockAFS = {
          stat: async () => ({
            data: {
              path: "/test",
              meta: {},
              actions: [
                { name: "download", description: "Download file" },
                { name: "preview", description: "Preview file" },
              ],
            },
          }),
        } as unknown as AFS;

        const entry: ExplorerEntry = {
          name: "test",
          path: "/test",
          type: "file",
        };

        const metadata = await loadMetadata(mockAFS, entry);

        expect(metadata?.actions).toHaveLength(2);
        expect(metadata?.actions?.[0]?.name).toBe("download");
        expect(metadata?.actions?.[1]?.description).toBe("Preview file");
      });

      test("returns undefined for up entry", async () => {
        const mockAFS = {} as AFS;
        const entry: ExplorerEntry = {
          name: "..",
          path: "/parent",
          type: "up",
        };

        const metadata = await loadMetadata(mockAFS, entry);

        expect(metadata).toBeUndefined();
      });

      test("includes inputSchema in extra for executable nodes", async () => {
        const inputSchema = {
          type: "object",
          properties: {
            query: { type: "string" },
          },
        };

        const mockAFS = {
          stat: async () => ({
            data: {
              path: "/tool",
              meta: {
                inputSchema,
              },
            },
          }),
        } as unknown as AFS;

        const entry: ExplorerEntry = {
          name: "tool",
          path: "/tool",
          type: "exec",
        };

        const metadata = await loadMetadata(mockAFS, entry);

        expect(metadata?.extra?.inputSchema).toEqual(inputSchema);
      });
    });

    // Bad Path
    describe("Bad Path", () => {
      test("returns basic metadata when stat fails", async () => {
        const mockAFS = {
          stat: async () => {
            throw new Error("Network error");
          },
        } as unknown as AFS;

        const entry: ExplorerEntry = {
          name: "test",
          path: "/test",
          type: "file",
          size: 1024,
        };

        const metadata = await loadMetadata(mockAFS, entry);

        expect(metadata?.path).toBe("/test");
        expect(metadata?.size).toBe(1024);
      });

      test("returns basic metadata when stat returns no data", async () => {
        const mockAFS = {
          stat: async () => ({
            data: null,
          }),
        } as unknown as AFS;

        const entry: ExplorerEntry = {
          name: "test",
          path: "/test",
          type: "file",
        };

        const metadata = await loadMetadata(mockAFS, entry);

        expect(metadata?.path).toBe("/test");
      });
    });

    // Edge Cases
    describe("Edge Cases", () => {
      test("handles empty actions array", async () => {
        const mockAFS = {
          stat: async () => ({
            data: {
              path: "/test",
              meta: {},
              actions: [],
            },
          }),
        } as unknown as AFS;

        const entry: ExplorerEntry = {
          name: "test",
          path: "/test",
          type: "file",
        };

        const metadata = await loadMetadata(mockAFS, entry);

        expect(metadata?.actions).toEqual([]);
      });
    });
  });

  // === Phase 2: executeAction Tests ===
  describe("executeAction", () => {
    // Happy Path
    describe("Happy Path", () => {
      test("returns success = true for successful execution", async () => {
        const mockAFS = {
          exec: async () => ({
            success: true,
            data: { result: "ok" },
          }),
        } as unknown as AFS;

        const result = await executeAction(mockAFS, "/tool", "run", { arg: "value" });

        expect(result.success).toBe(true);
        expect(result.data).toEqual({ result: "ok" });
      });

      test("passes params to exec call", async () => {
        let capturedParams: Record<string, unknown> | undefined;
        const mockAFS = {
          exec: async (_path: string, params: Record<string, unknown>) => {
            capturedParams = params;
            return { success: true };
          },
        } as unknown as AFS;

        await executeAction(mockAFS, "/tool", "run", { foo: "bar", count: 42 });

        expect(capturedParams).toEqual({ foo: "bar", count: 42 });
      });
    });

    // Bad Path
    describe("Bad Path", () => {
      test("returns success = false for non-existent path", async () => {
        const mockAFS = {
          exec: async () => ({
            success: false,
            error: { message: "Path not found" },
          }),
        } as unknown as AFS;

        const result = await executeAction(mockAFS, "/nonexistent", "run");

        expect(result.success).toBe(false);
        expect(result.message).toBe("Path not found");
      });

      test("returns error message for invalid params", async () => {
        const mockAFS = {
          exec: async () => ({
            success: false,
            error: { message: "Invalid parameter: count must be a number" },
          }),
        } as unknown as AFS;

        const result = await executeAction(mockAFS, "/tool", "run", { count: "not-a-number" });

        expect(result.success).toBe(false);
        expect(result.message).toContain("Invalid parameter");
      });

      test("handles thrown errors", async () => {
        const mockAFS = {
          exec: async () => {
            throw new Error("Connection refused");
          },
        } as unknown as AFS;

        const result = await executeAction(mockAFS, "/tool", "run");

        expect(result.success).toBe(false);
        expect(result.message).toBe("Connection refused");
      });
    });

    // Security - executeAction authorization is handled by AFS core
    describe("Security", () => {
      test("passes through authorization errors from AFS", async () => {
        const mockAFS = {
          exec: async () => ({
            success: false,
            error: { message: "Unauthorized: action not permitted" },
          }),
        } as unknown as AFS;

        const result = await executeAction(mockAFS, "/protected", "admin");

        expect(result.success).toBe(false);
        expect(result.message).toContain("Unauthorized");
      });
    });

    // Data Leak
    describe("Data Leak", () => {
      test("error message does not expose internal paths", async () => {
        const mockAFS = {
          exec: async () => {
            throw new Error("Operation failed");
          },
        } as unknown as AFS;

        const result = await executeAction(mockAFS, "/internal/secret/path", "run");

        // The error message should be the thrown error, not include stack traces
        expect(result.message).toBe("Operation failed");
        expect(result.message).not.toContain("/internal/secret/path");
      });
    });

    // Data Damage
    describe("Data Damage", () => {
      test("failed execution does not affect subsequent operations", async () => {
        let callCount = 0;
        const mockAFS = {
          exec: async () => {
            callCount++;
            if (callCount === 1) {
              throw new Error("First call fails");
            }
            return { success: true, data: "second call succeeds" };
          },
        } as unknown as AFS;

        // First call fails
        const result1 = await executeAction(mockAFS, "/tool", "run");
        expect(result1.success).toBe(false);

        // Second call should still work
        const result2 = await executeAction(mockAFS, "/tool", "run");
        expect(result2.success).toBe(true);
        expect(result2.data).toBe("second call succeeds");
      });
    });
  });
});
