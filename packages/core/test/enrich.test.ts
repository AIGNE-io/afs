/**
 * Auto-Enrichment Tests
 *
 * Tests for automatic actions and meta enrichment in read/stat APIs.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { AFS, type AFSModule } from "../src/index.js";

describe("Auto-Enrichment", () => {
  let afs: AFS;

  describe("fetchActions", () => {
    beforeEach(() => {
      afs = new AFS();
    });

    it("should return ActionSummary[] when list(.actions) succeeds", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async (path) => {
          if (path === "/.actions") {
            return {
              data: [
                {
                  id: "export",
                  path: "/.actions/export",
                  meta: {
                    kind: "afs:executable",
                    description: "Export data",
                    inputSchema: { type: "object", properties: { format: { type: "string" } } },
                  },
                },
                {
                  id: "refresh",
                  path: "/.actions/refresh",
                  meta: {
                    kind: "afs:executable",
                    description: "Refresh cache",
                  },
                },
              ],
            };
          }
          return { data: [] };
        },
        read: async () => ({ data: { id: "test", path: "/" } }),
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      expect(result.data?.actions).toBeDefined();
      expect(result.data?.actions).toHaveLength(2);
      expect(result.data?.actions?.[0]?.name).toBe("export");
      expect(result.data?.actions?.[0]?.description).toBe("Export data");
      expect(result.data?.actions?.[0]?.inputSchema).toBeDefined();
      expect(result.data?.actions?.[1]?.name).toBe("refresh");
    });

    it("should return [] when list(.actions) fails", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async () => {
          throw new Error("Not found");
        },
        read: async () => ({ data: { id: "test", path: "/" } }),
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      expect(result.data?.actions).toEqual([]);
    });

    it("should convert entries to ActionSummary format correctly", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async (path) => {
          if (path === "/.actions") {
            return {
              data: [
                {
                  id: "custom-action",
                  path: "/.actions/custom-action",
                  meta: {
                    kind: "afs:executable",
                    description: "A custom action",
                    inputSchema: {
                      type: "object",
                      properties: {
                        param1: { type: "string" },
                        param2: { type: "number" },
                      },
                      required: ["param1"],
                    },
                  },
                },
              ],
            };
          }
          return { data: [] };
        },
        read: async () => ({ data: { id: "test", path: "/" } }),
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      const action = result.data?.actions?.[0];
      expect(action?.name).toBe("custom-action");
      expect(action?.description).toBe("A custom action");
      expect(action?.inputSchema).toEqual({
        type: "object",
        properties: {
          param1: { type: "string" },
          param2: { type: "number" },
        },
        required: ["param1"],
      });
    });

    it("should filter entries without afs:executable kind", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async (path) => {
          if (path === "/.actions") {
            return {
              data: [
                {
                  id: "valid-action",
                  path: "/.actions/valid-action",
                  meta: { kind: "afs:executable" },
                },
                {
                  id: "not-an-action",
                  path: "/.actions/not-an-action",
                  meta: { kind: "other-kind" },
                },
                {
                  id: "no-meta",
                  path: "/.actions/no-meta",
                },
              ],
            };
          }
          return { data: [] };
        },
        read: async () => ({ data: { id: "test", path: "/" } }),
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      expect(result.data?.actions).toHaveLength(1);
      expect(result.data?.actions?.[0]?.name).toBe("valid-action");
    });
  });

  describe("fetchMeta", () => {
    beforeEach(() => {
      afs = new AFS();
    });

    it("should return meta object when read(.meta) succeeds", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async () => ({ data: [] }),
        read: async (path) => {
          if (path === "/.meta") {
            return {
              data: {
                id: ".meta",
                path: "/.meta",
                content: {
                  kind: "test:node",
                  kinds: ["test:node", "afs:node"],
                  description: "A test node",
                },
              },
            };
          }
          return { data: { id: "test", path: "/" } };
        },
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      expect(result.data?.meta?.kind).toBe("test:node");
      expect(result.data?.meta?.kinds).toEqual(["test:node", "afs:node"]);
      expect(result.data?.meta?.description).toBe("A test node");
    });

    it("should return null when read(.meta) fails", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async () => ({ data: [] }),
        read: async (path) => {
          if (path === "/.meta") {
            throw new Error("Not found");
          }
          return { data: { id: "test", path: "/" } };
        },
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      // Meta should not be enriched on failure
      expect(result.data?.meta?.kind).toBeUndefined();
    });

    it("should merge fetched meta with existing entry.meta", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async () => ({ data: [] }),
        read: async (path) => {
          if (path === "/.meta") {
            return {
              data: {
                id: ".meta",
                path: "/.meta",
                content: {
                  kind: "test:node",
                  description: "From meta file",
                },
              },
            };
          }
          return {
            data: {
              id: "test",
              path: "/",
              meta: {
                size: 1024,
                childrenCount: 5,
              },
            },
          };
        },
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      // Original meta fields preserved
      expect(result.data?.meta?.size).toBe(1024);
      expect(result.data?.meta?.childrenCount).toBe(5);
      // New meta fields added
      expect(result.data?.meta?.kind).toBe("test:node");
      expect(result.data?.meta?.description).toBe("From meta file");
    });
  });

  describe("enrichEntry", () => {
    beforeEach(() => {
      afs = new AFS();
    });

    describe("actions enrichment triggering", () => {
      it("should fetch actions when entry has no actions property", async () => {
        const listCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            if (path === "/.actions") {
              return {
                data: [
                  { id: "action1", path: "/.actions/action1", meta: { kind: "afs:executable" } },
                ],
              };
            }
            return { data: [] };
          },
          read: async () => ({ data: { id: "test", path: "/" } }), // No actions property
        };
        await afs.mount(module);

        await afs.read("/modules/test/");
        expect(listCalls).toContain("/.actions");
      });

      it("should fetch actions when entry.actions is undefined", async () => {
        const listCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async () => ({
            data: { id: "test", path: "/", actions: undefined },
          }),
        };
        await afs.mount(module);

        await afs.read("/modules/test/");
        expect(listCalls).toContain("/.actions");
      });

      it("should NOT fetch actions when entry.actions is empty array", async () => {
        const listCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async () => ({
            data: { id: "test", path: "/", actions: [] },
          }),
        };
        await afs.mount(module);

        await afs.read("/modules/test/");
        expect(listCalls).not.toContain("/.actions");
      });

      it("should NOT fetch actions when entry.actions has values", async () => {
        const listCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async () => ({
            data: {
              id: "test",
              path: "/",
              actions: [{ name: "existing", description: "Already present" }],
            },
          }),
        };
        await afs.mount(module);

        const result = await afs.read("/modules/test/");
        expect(listCalls).not.toContain("/.actions");
        expect(result.data?.actions?.[0]?.name).toBe("existing");
      });
    });

    describe("meta enrichment triggering", () => {
      it("should fetch meta when entry.meta is undefined", async () => {
        const readCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async () => ({ data: [] }),
          read: async (path) => {
            readCalls.push(path);
            if (path === "/.meta") {
              return { data: { id: ".meta", path: "/.meta", content: { kind: "test:kind" } } };
            }
            return { data: { id: "test", path: "/" } }; // No meta
          },
        };
        await afs.mount(module);

        await afs.read("/modules/test/");
        expect(readCalls).toContain("/.meta");
      });

      it("should fetch meta when entry.meta.kind is undefined", async () => {
        const readCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async () => ({ data: [] }),
          read: async (path) => {
            readCalls.push(path);
            if (path === "/.meta") {
              return { data: { id: ".meta", path: "/.meta", content: { kind: "test:kind" } } };
            }
            return { data: { id: "test", path: "/", meta: { size: 100 } } }; // meta exists but no kind
          },
        };
        await afs.mount(module);

        await afs.read("/modules/test/");
        expect(readCalls).toContain("/.meta");
      });

      it("should NOT fetch meta when entry.meta.kind has value", async () => {
        const readCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async () => ({ data: [] }),
          read: async (path) => {
            readCalls.push(path);
            return {
              data: {
                id: "test",
                path: "/",
                meta: { kind: "existing:kind" },
                actions: [], // Prevent actions fetch
              },
            };
          },
        };
        await afs.mount(module);

        const result = await afs.read("/modules/test/");
        expect(readCalls).not.toContain("/.meta");
        expect(result.data?.meta?.kind).toBe("existing:kind");
      });
    });

    describe("virtual path handling", () => {
      it("should skip enrichment when path ends with /.meta", async () => {
        const listCalls: string[] = [];
        const readCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async (path) => {
            readCalls.push(path);
            return { data: { id: ".meta", path } };
          },
        };
        await afs.mount(module);

        await afs.read("/modules/test/.meta");
        // Should not try to fetch .meta/.actions or .meta/.meta
        expect(listCalls).not.toContain("/.meta/.actions");
        expect(readCalls).not.toContain("/.meta/.meta");
      });

      it("should skip enrichment when path ends with /.actions", async () => {
        const listCalls: string[] = [];
        const readCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async (path) => {
            readCalls.push(path);
            return { data: { id: ".actions", path } };
          },
        };
        await afs.mount(module);

        await afs.read("/modules/test/.actions");
        // Should not try to fetch .actions/.actions
        expect(listCalls).not.toContain("/.actions/.actions");
      });

      it("should NOT skip for /.actions/export (action node)", async () => {
        const listCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async (path) => {
            return { data: { id: "export", path } };
          },
        };
        await afs.mount(module);

        await afs.read("/modules/test/.actions/export");
        // Action nodes can have their own actions/meta
        expect(listCalls).toContain("/.actions/export/.actions");
      });

      it("should NOT skip for /.meta/kinds (meta child node)", async () => {
        const listCalls: string[] = [];
        const module: AFSModule = {
          name: "test",
          stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
          list: async (path) => {
            listCalls.push(path);
            return { data: [] };
          },
          read: async (path) => {
            return { data: { id: "kinds", path } };
          },
        };
        await afs.mount(module);

        await afs.read("/modules/test/.meta/kinds");
        expect(listCalls).toContain("/.meta/kinds/.actions");
      });
    });
  });

  describe("read with enrichment", () => {
    beforeEach(() => {
      afs = new AFS();
    });

    it("should return enriched entry from read", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async (path) => {
          if (path === "/file/.actions") {
            return {
              data: [
                {
                  id: "download",
                  path: "/file/.actions/download",
                  meta: { kind: "afs:executable" },
                },
              ],
            };
          }
          return { data: [] };
        },
        read: async (path) => {
          if (path === "/file/.meta") {
            return { data: { id: ".meta", path: "/file/.meta", content: { kind: "file:text" } } };
          }
          return { data: { id: "file", path: "/file" } };
        },
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/file");
      expect(result.data?.actions?.[0]?.name).toBe("download");
      expect(result.data?.meta?.kind).toBe("file:text");
    });

    it("should preserve provider-returned actions", async () => {
      const module: AFSModule = {
        name: "test",
        stat: async (path) => ({ data: { id: path.split("/").pop() || "/", path } }),
        list: async () => ({ data: [] }),
        read: async () => ({
          data: {
            id: "test",
            path: "/",
            actions: [{ name: "provider-action", description: "From provider" }],
          },
        }),
      };
      await afs.mount(module);

      const result = await afs.read("/modules/test/");
      expect(result.data?.actions?.[0]?.name).toBe("provider-action");
    });
  });

  describe("stat with enrichment", () => {
    beforeEach(() => {
      afs = new AFS();
    });

    it("should return enriched data from stat", async () => {
      const module: AFSModule = {
        name: "test",
        list: async (path) => {
          if (path === "/file/.actions") {
            return {
              data: [{ id: "info", path: "/file/.actions/info", meta: { kind: "afs:executable" } }],
            };
          }
          return { data: [] };
        },
        read: async (path) => {
          if (path === "/file/.meta") {
            return { data: { id: ".meta", path: "/file/.meta", content: { kind: "file:binary" } } };
          }
          return { data: undefined };
        },
        stat: async (path) => ({
          data: {
            id: path === "/" ? "/" : "file",
            path: path === "/" ? "/" : "/file",
            meta: path === "/" ? undefined : { size: 1024 },
          },
        }),
      };
      await afs.mount(module);

      const result = await afs.stat("/modules/test/file");
      expect(result.data?.actions?.[0]?.name).toBe("info");
      expect(result.data?.meta?.kind).toBe("file:binary");
      expect(result.data?.meta?.size).toBe(1024);
    });

    it("should preserve provider-returned actions in stat", async () => {
      const module: AFSModule = {
        name: "test",
        list: async () => ({ data: [] }),
        read: async () => ({ data: undefined }),
        stat: async () => ({
          data: {
            id: "/",
            path: "/",
            actions: [{ name: "stat-action", description: "From stat" }],
          },
        }),
      };
      await afs.mount(module);

      const result = await afs.stat("/modules/test/");
      expect(result.data?.actions?.[0]?.name).toBe("stat-action");
    });
  });
});
