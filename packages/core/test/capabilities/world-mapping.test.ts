import { describe, expect, it } from "bun:test";
import {
  type AFSWorldMappingCapable,
  type ExternalRef,
  isWorldMappingCapable,
  type MappingStatus,
  type MutateAction,
  type MutateResult,
  type ProjectionContext,
} from "../../src/capabilities/world-mapping.js";
import type { AFSEntry, AFSModule } from "../../src/type.js";

describe("isWorldMappingCapable", () => {
  // Mock base module without World Mapping capability
  const baseModule: AFSModule = {
    name: "test-module",
    description: "A test module",
  };

  // Mock module with World Mapping capability
  const worldMappingModule: AFSModule & AFSWorldMappingCapable = {
    name: "world-mapping-module",
    description: "A module with world mapping capability",

    async loadMapping(_mappingPath: string): Promise<void> {
      // no-op for test
    },

    async reloadMapping(): Promise<void> {
      // no-op for test
    },

    getMappingStatus(): MappingStatus {
      return {
        loaded: true,
        compiled: true,
        loadedAt: new Date(),
        mappingPath: "/test/mapping",
        stats: { routes: 5, operations: 10 },
      };
    },

    resolve(_path: string): ExternalRef | null {
      return {
        type: "http",
        target: "https://api.example.com/test",
        method: "GET",
        params: {},
      };
    },

    project(_data: unknown, _ctx: ProjectionContext): AFSEntry[] {
      return [];
    },

    async mutate(_path: string, _action: MutateAction, _payload: unknown): Promise<MutateResult> {
      return { success: true };
    },
  };

  // Module with partial implementation (missing methods)
  const partialModule: AFSModule & Partial<AFSWorldMappingCapable> = {
    name: "partial-module",
    description: "A module with partial world mapping",

    async loadMapping(_mappingPath: string): Promise<void> {
      // no-op
    },

    getMappingStatus(): MappingStatus {
      return { loaded: false, compiled: false };
    },
    // Missing: reloadMapping, resolve, project, mutate
  };

  it("returns true for module with all required methods", () => {
    expect(isWorldMappingCapable(worldMappingModule)).toBe(true);
  });

  it("returns false for base module without capability", () => {
    expect(isWorldMappingCapable(baseModule)).toBe(false);
  });

  it("returns false for module with partial implementation", () => {
    expect(isWorldMappingCapable(partialModule as AFSModule)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isWorldMappingCapable(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isWorldMappingCapable(undefined)).toBe(false);
  });

  it("allows type narrowing after guard check", () => {
    const module: AFSModule = worldMappingModule;

    if (isWorldMappingCapable(module)) {
      // TypeScript should allow these calls after narrowing
      const status: MappingStatus = module.getMappingStatus();
      expect(status.loaded).toBe(true);

      const ref: ExternalRef | null = module.resolve("/test");
      expect(ref).not.toBeNull();
      expect(ref?.type).toBe("http");
    } else {
      // This branch should not be reached
      expect.unreachable("Should have narrowed to AFSWorldMappingCapable");
    }
  });

  it("correctly identifies method types", () => {
    // Ensure the type guard checks function types, not just property existence
    const fakeModule: AFSModule & Record<string, unknown> = {
      name: "fake-module",
      // These are not functions
      loadMapping: "not a function",
      reloadMapping: 123,
      getMappingStatus: {},
      resolve: null,
      project: [],
      mutate: true,
    };

    expect(isWorldMappingCapable(fakeModule as AFSModule)).toBe(false);
  });
});

describe("World Mapping Types", () => {
  it("MappingStatus has correct shape", () => {
    const status: MappingStatus = {
      loaded: true,
      compiled: true,
      loadedAt: new Date(),
      mappingPath: "/config/mapping.yaml",
      stats: {
        routes: 10,
        operations: 25,
      },
    };

    expect(status.loaded).toBe(true);
    expect(status.compiled).toBe(true);
    expect(status.stats?.routes).toBe(10);
  });

  it("ExternalRef supports all types", () => {
    const httpRef: ExternalRef = {
      type: "http",
      target: "https://api.github.com/repos/owner/repo/issues",
      method: "GET",
      params: { state: "open" },
      headers: { Accept: "application/vnd.github+json" },
    };

    const graphqlRef: ExternalRef = {
      type: "graphql",
      target: "query { repository { issues { nodes { title } } } }",
      params: { owner: "test", repo: "test" },
    };

    const mcpRef: ExternalRef = {
      type: "mcp-tool",
      target: "list_issues",
      params: { owner: "test" },
    };

    const customRef: ExternalRef = {
      type: "custom",
      target: "custom://handler/action",
    };

    expect(httpRef.type).toBe("http");
    expect(graphqlRef.type).toBe("graphql");
    expect(mcpRef.type).toBe("mcp-tool");
    expect(customRef.type).toBe("custom");
  });

  it("MutateAction covers all operations", () => {
    const actions: MutateAction[] = ["create", "update", "delete", "exec"];

    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("exec");
  });

  it("MutateResult handles success and failure", () => {
    const successResult: MutateResult = {
      success: true,
      data: { id: 123, title: "New Issue" },
    };

    const failureResult: MutateResult = {
      success: false,
      error: "Permission denied",
    };

    expect(successResult.success).toBe(true);
    expect(successResult.data).toBeDefined();

    expect(failureResult.success).toBe(false);
    expect(failureResult.error).toBe("Permission denied");
  });

  it("ProjectionContext contains all required fields", () => {
    const context: ProjectionContext = {
      path: "/aigne/afs/issues/123",
      template: "/{owner}/{repo}/issues/{number}",
      pathParams: {
        owner: "aigne",
        repo: "afs",
        number: "123",
      },
      rule: {
        // Opaque rule data - can be anything
        method: "GET",
        transform: { items: "$" },
      },
    };

    expect(context.path).toBe("/aigne/afs/issues/123");
    expect(context.pathParams.owner).toBe("aigne");
    expect(context.rule).toBeDefined();
  });
});
