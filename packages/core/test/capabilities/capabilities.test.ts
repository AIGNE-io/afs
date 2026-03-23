/**
 * Tests for /.meta/.capabilities aggregation (Phase 0)
 *
 * Following plan.md test matrix:
 * - Happy Path
 * - Bad Path
 * - Edge Cases
 * - Security
 * - Data Leak
 * - Data Damage
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../../src/afs.js";
import type {
  ActionCatalog,
  ActionDefinition,
  AggregatedCapabilities,
  CapabilitiesManifest,
  ToolDefinition,
} from "../../src/capabilities/types.js";
import type { AFSListResult, AFSModule, AFSReadResult, AFSStatResult } from "../../src/type.js";

/**
 * Create a mock provider that returns a capabilities manifest
 */
function createMockProvider(
  name: string,
  manifest: CapabilitiesManifest | null,
  options: {
    throwOnCapabilities?: boolean;
    throwError?: Error;
  } = {},
): AFSModule {
  return {
    name,
    description: `Mock provider ${name}`,
    async stat(path: string): Promise<AFSStatResult> {
      if (path === "/") {
        return {
          data: {
            id: name,
            path: "/",
            meta: { childrenCount: 1 },
          },
        };
      }
      return { data: undefined };
    },
    async list(path: string): Promise<AFSListResult> {
      if (path === "/") {
        return {
          data: [{ id: "test", path: "/test" }],
        };
      }
      return { data: [] };
    },
    async read(path: string): Promise<AFSReadResult> {
      if (path === "/.meta/.capabilities") {
        if (options.throwOnCapabilities) {
          throw options.throwError || new Error("Provider error");
        }
        if (manifest === null) {
          return { data: undefined };
        }
        return {
          data: {
            id: ".capabilities",
            path: "/.meta/.capabilities",
            content: manifest,
          },
        };
      }
      if (path === "/") {
        return {
          data: {
            id: name,
            path: "/",
            meta: { childrenCount: 1 },
          },
        };
      }
      return { data: undefined };
    },
  };
}

describe("CapabilitiesManifest Types", () => {
  // Happy Path: CapabilitiesManifest 类型可正确导入和使用
  test("types can be imported and used correctly", () => {
    const tool: ToolDefinition = {
      name: "echo",
      description: "Echo a message",
      path: "/tools/echo",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    };

    const action: ActionDefinition = {
      name: "update",
      description: "Update data",
      inputSchema: { type: "object" },
    };

    const catalog: ActionCatalog = {
      kind: "test:item",
      description: "Test items",
      catalog: [action],
      discovery: {
        pathTemplate: "/:id/.actions",
        note: "List to confirm",
      },
    };

    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "test",
      version: "1.0.0",
      description: "Test provider",
      tools: [tool],
      actions: [catalog],
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.provider).toBe("test");
    expect(manifest.tools).toHaveLength(1);
    expect(manifest.actions).toHaveLength(1);
  });

  test("AggregatedCapabilities extends CapabilitiesManifest with partial/skipped", () => {
    const aggregated: AggregatedCapabilities = {
      schemaVersion: 1,
      provider: "afs",
      tools: [],
      actions: [],
      partial: true,
      skipped: ["/mcp", "/sqlite"],
    };

    expect(aggregated.partial).toBe(true);
    expect(aggregated.skipped).toEqual(["/mcp", "/sqlite"]);
  });
});

describe("AFS.read('/.meta/.capabilities')", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Happy Path: AFS.read("/.meta/.capabilities") 返回聚合后的 manifest
  test("returns aggregated manifest from mounted providers", async () => {
    const mcpManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "mcp",
      version: "1.0.0",
      tools: [
        {
          name: "echo",
          description: "Echo message",
          path: "/tools/echo",
        },
      ],
      actions: [],
    };

    const sqliteManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "sqlite",
      version: "1.0.0",
      tools: [],
      actions: [
        {
          kind: "sqlite:row",
          catalog: [{ name: "update" }, { name: "delete" }],
          discovery: {
            pathTemplate: "/:table/:pk/.actions",
          },
        },
      ],
    };

    await afs.mount(createMockProvider("mcp", mcpManifest), "/mcp");
    await afs.mount(createMockProvider("sqlite", sqliteManifest), "/sqlite");

    const result = await afs.read("/.meta/.capabilities");

    expect(result.data).toBeDefined();
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.schemaVersion).toBe(1);
    expect(content.provider).toBe("afs");
    expect(content.tools).toHaveLength(1);
    expect(content.actions).toHaveLength(1);
  });

  // Happy Path: 聚合结果包含正确的 schemaVersion: 1
  test("aggregated result has schemaVersion: 1", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "test",
      tools: [],
      actions: [],
    };

    await afs.mount(createMockProvider("test", manifest), "/test");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.schemaVersion).toBe(1);
  });

  // Happy Path: Tools 的 name 被正确添加 provider 前缀
  test("tool names are prefixed with provider name", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "mcp",
      tools: [
        { name: "echo", path: "/tools/echo" },
        { name: "add", path: "/tools/add" },
      ],
      actions: [],
    };

    await afs.mount(createMockProvider("mcp", manifest), "/mcp");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools[0]?.name).toBe("mcp.echo");
    expect(content.tools[1]?.name).toBe("mcp.add");
  });

  // Happy Path: Tools 的 path 被正确添加 mount path 前缀
  test("tool paths are prefixed with mount path", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "mcp",
      tools: [{ name: "echo", path: "/tools/echo" }],
      actions: [],
    };

    await afs.mount(createMockProvider("mcp", manifest), "/services/mcp");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools[0]?.path).toBe("/services/mcp/tools/echo");
  });

  // Happy Path: Actions 的 discovery.pathTemplate 被正确添加 mount path 前缀
  test("action pathTemplate is prefixed with mount path", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "sqlite",
      tools: [],
      actions: [
        {
          kind: "sqlite:row",
          catalog: [{ name: "update" }],
          discovery: {
            pathTemplate: "/:table/:pk/.actions",
            note: "List to confirm",
          },
        },
      ],
    };

    await afs.mount(createMockProvider("sqlite", manifest), "/db/sqlite");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.actions[0]?.discovery.pathTemplate).toBe("/db/sqlite/:table/:pk/.actions");
  });
});

describe("Bad Path - Error Handling", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Bad Path: provider.read("/.meta/.capabilities") 返回 undefined 时静默跳过
  test("silently skips providers returning undefined", async () => {
    const goodManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "good",
      tools: [{ name: "test", path: "/test" }],
      actions: [],
    };

    await afs.mount(createMockProvider("good", goodManifest), "/good");
    await afs.mount(createMockProvider("empty", null), "/empty");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // Should have tools from good provider only
    expect(content.tools).toHaveLength(1);
    expect(content.tools[0]?.name).toBe("good.test");
  });

  // Bad Path: provider.read("/.meta/.capabilities") 抛出异常时静默跳过并记录
  test("silently skips providers that throw and records in skipped", async () => {
    const goodManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "good",
      tools: [{ name: "test", path: "/test" }],
      actions: [],
    };

    await afs.mount(createMockProvider("good", goodManifest), "/good");
    await afs.mount(createMockProvider("bad", null, { throwOnCapabilities: true }), "/bad");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools).toHaveLength(1);
    expect(content.partial).toBe(true);
    expect(content.skipped).toContain("/bad");
  });

  // Bad Path: manifest.tools 为 undefined/null 时不报错
  test("handles manifest with undefined tools", async () => {
    // Simulate a provider returning manifest without tools field
    const manifest = {
      schemaVersion: 1,
      provider: "test",
      actions: [],
    } as unknown as CapabilitiesManifest;

    await afs.mount(createMockProvider("test", manifest), "/test");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools).toEqual([]);
  });

  // Bad Path: manifest.actions 为 undefined/null 时不报错
  test("handles manifest with undefined actions", async () => {
    // Simulate a provider returning manifest without actions field
    const manifest = {
      schemaVersion: 1,
      provider: "test",
      tools: [],
    } as unknown as CapabilitiesManifest;

    await afs.mount(createMockProvider("test", manifest), "/test");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.actions).toEqual([]);
  });
});

describe("Edge Cases", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Edge Case: 无任何 provider 挂载时返回空 tools 和 actions
  test("returns empty tools and actions when no providers mounted", async () => {
    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.schemaVersion).toBe(1);
    expect(content.provider).toBe("afs");
    expect(content.tools).toEqual([]);
    expect(content.actions).toEqual([]);
  });

  // Edge Case: 所有 provider 都未实现时返回空结果但 partial: true
  test("returns partial: true when all providers fail", async () => {
    await afs.mount(createMockProvider("a", null, { throwOnCapabilities: true }), "/a");
    await afs.mount(createMockProvider("b", null, { throwOnCapabilities: true }), "/b");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools).toEqual([]);
    expect(content.actions).toEqual([]);
    expect(content.partial).toBe(true);
    expect(content.skipped).toContain("/a");
    expect(content.skipped).toContain("/b");
  });

  // Edge Case: 单个 provider 挂载时正常工作
  test("works correctly with single provider", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "solo",
      tools: [{ name: "run", path: "/run" }],
      actions: [],
    };

    await afs.mount(createMockProvider("solo", manifest), "/solo");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools).toHaveLength(1);
    expect(content.tools[0]?.name).toBe("solo.run");
    expect(content.partial).toBeUndefined();
  });

  // Edge Case: 多个 provider 挂载时正确聚合
  test("correctly aggregates multiple providers", async () => {
    const manifest1: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "p1",
      tools: [{ name: "t1", path: "/t1" }],
      actions: [],
    };

    const manifest2: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "p2",
      tools: [{ name: "t2", path: "/t2" }],
      actions: [
        {
          kind: "p2:item",
          catalog: [{ name: "act" }],
          discovery: { pathTemplate: "/:id/.actions" },
        },
      ],
    };

    const manifest3: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "p3",
      tools: [],
      actions: [
        {
          catalog: [{ name: "archive" }],
          discovery: { pathTemplate: "/:cat/:id/.actions" },
        },
      ],
    };

    await afs.mount(createMockProvider("p1", manifest1), "/p1");
    await afs.mount(createMockProvider("p2", manifest2), "/p2");
    await afs.mount(createMockProvider("p3", manifest3), "/p3");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.tools).toHaveLength(2);
    expect(content.actions).toHaveLength(2);

    // Verify tool prefixes
    const toolNames = content.tools.map((t) => t.name);
    expect(toolNames).toContain("p1.t1");
    expect(toolNames).toContain("p2.t2");

    // Verify path prefixes
    expect(content.actions[0]?.discovery.pathTemplate).toMatch(/^\/p2/);
    expect(content.actions[1]?.discovery.pathTemplate).toMatch(/^\/p3/);
  });
});

describe("Security", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Security: 不暴露 provider 内部错误详情到聚合结果
  test("does not expose provider error details in aggregated result", async () => {
    const sensitiveError = new Error("Connection failed: user=admin pass=secret123");

    await afs.mount(
      createMockProvider("bad", null, {
        throwOnCapabilities: true,
        throwError: sensitiveError,
      }),
      "/bad",
    );

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // Should only contain mount path, not error message
    expect(content.skipped).toContain("/bad");
    expect(JSON.stringify(content)).not.toContain("secret123");
    expect(JSON.stringify(content)).not.toContain("admin");
  });

  // Security: skipped 数组只包含 mount path，不包含错误堆栈
  test("skipped array contains only mount paths", async () => {
    await afs.mount(
      createMockProvider("fail", null, {
        throwOnCapabilities: true,
        throwError: new Error("Stack trace here"),
      }),
      "/fail",
    );

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.skipped).toEqual(["/fail"]);
    expect(content.skipped?.[0]).not.toContain("Error");
    expect(content.skipped?.[0]).not.toContain("Stack");
  });
});

describe("Data Leak Prevention", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Data Leak: 错误信息不泄露文件系统路径
  test("error info does not leak filesystem paths", async () => {
    const fsPathError = new Error(
      "ENOENT: no such file or directory '/home/user/.secrets/db.sqlite'",
    );

    await afs.mount(
      createMockProvider("leak", null, {
        throwOnCapabilities: true,
        throwError: fsPathError,
      }),
      "/leak",
    );

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    const resultStr = JSON.stringify(content);
    expect(resultStr).not.toContain("/home/user");
    expect(resultStr).not.toContain(".secrets");
    expect(resultStr).not.toContain("db.sqlite");
  });

  // Data Leak: 日志不包含 provider 敏感配置
  test("result does not contain sensitive configuration", async () => {
    // The aggregated result should not include any provider config details
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "test",
      tools: [],
      actions: [],
    };

    await afs.mount(createMockProvider("test", manifest), "/test");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // Result should only contain expected fields
    const keys = Object.keys(content);
    expect(keys).not.toContain("config");
    expect(keys).not.toContain("credentials");
    expect(keys).not.toContain("apiKey");
  });
});

describe("Multi-Provider Integration (Phase 4)", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Phase 4: 同一 provider 挂载到多个路径时都正确处理
  test("same provider mounted to multiple paths works correctly", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "shared",
      tools: [{ name: "tool", path: "/tool" }],
      actions: [
        {
          kind: "shared:item",
          catalog: [{ name: "action" }],
          discovery: { pathTemplate: "/:id/.actions" },
        },
      ],
    };

    // Mount same provider at different paths
    await afs.mount(createMockProvider("shared", manifest), "/path1");
    await afs.mount(createMockProvider("shared", manifest), "/path2");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // Should have tools from both mounts with correct paths
    expect(content.tools).toHaveLength(2);
    const toolPaths = content.tools.map((t) => t.path);
    expect(toolPaths).toContain("/path1/tool");
    expect(toolPaths).toContain("/path2/tool");

    // Should have actions from both mounts with correct pathTemplates
    expect(content.actions).toHaveLength(2);
    const actionTemplates = content.actions.map((a) => a.discovery.pathTemplate);
    expect(actionTemplates).toContain("/path1/:id/.actions");
    expect(actionTemplates).toContain("/path2/:id/.actions");
  });

  // Phase 4: provider 动态挂载后 capabilities 更新
  test("capabilities update after dynamic mount", async () => {
    const manifest1: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "first",
      tools: [{ name: "first_tool", path: "/tool" }],
      actions: [],
    };

    const manifest2: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "second",
      tools: [{ name: "second_tool", path: "/tool" }],
      actions: [],
    };

    // Mount first provider
    await afs.mount(createMockProvider("first", manifest1), "/first");

    // Read capabilities - should have 1 tool
    let result = await afs.read("/.meta/.capabilities");
    let content = result.data?.content as AggregatedCapabilities;
    expect(content.tools).toHaveLength(1);
    expect(content.tools[0]?.name).toBe("first.first_tool");

    // Mount second provider
    await afs.mount(createMockProvider("second", manifest2), "/second");

    // Read capabilities again - should now have 2 tools
    result = await afs.read("/.meta/.capabilities");
    content = result.data?.content as AggregatedCapabilities;
    expect(content.tools).toHaveLength(2);

    const toolNames = content.tools.map((t) => t.name);
    expect(toolNames).toContain("first.first_tool");
    expect(toolNames).toContain("second.second_tool");
  });

  // Phase 4: tool name 前缀不冲突
  test("tool name prefixes prevent conflicts", async () => {
    const manifest1: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "p1",
      tools: [{ name: "echo", path: "/echo" }],
      actions: [],
    };

    const manifest2: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "p2",
      tools: [{ name: "echo", path: "/echo" }], // Same tool name
      actions: [],
    };

    await afs.mount(createMockProvider("p1", manifest1), "/p1");
    await afs.mount(createMockProvider("p2", manifest2), "/p2");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // Both tools should be present with different prefixes
    expect(content.tools).toHaveLength(2);
    const toolNames = content.tools.map((t) => t.name);
    expect(toolNames).toContain("p1.echo");
    expect(toolNames).toContain("p2.echo");
  });
});

describe("Data Damage Prevention", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Data Damage: 聚合过程中单个 provider 失败不影响其他 provider
  test("single provider failure does not affect others", async () => {
    const goodManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "good",
      tools: [{ name: "tool", path: "/tool" }],
      actions: [],
    };

    await afs.mount(createMockProvider("good", goodManifest), "/good");
    await afs.mount(createMockProvider("bad", null, { throwOnCapabilities: true }), "/bad");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // Good provider's tools should still be present
    expect(content.tools).toHaveLength(1);
    expect(content.tools[0]?.name).toBe("good.tool");
  });

  // Data Damage: 不修改原始 provider 返回的 manifest
  test("does not modify original provider manifest", async () => {
    const originalTool: ToolDefinition = {
      name: "original",
      path: "/original",
    };

    const originalManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "test",
      tools: [originalTool],
      actions: [],
    };

    await afs.mount(createMockProvider("test", originalManifest), "/test");

    await afs.read("/.meta/.capabilities");

    // Original objects should not be mutated
    expect(originalTool.name).toBe("original");
    expect(originalTool.path).toBe("/original");
    expect(originalManifest.tools[0]?.name).toBe("original");
  });
});
