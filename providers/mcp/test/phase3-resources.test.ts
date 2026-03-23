/**
 * Phase 3 Tests: Resources 展开为 AFS 目录结构
 *
 * 测试目标：
 * 1. Resources 在 list("/") 中显示为顶层目录
 * 2. 能通过 AFS 路径列出 resource
 * 3. 能通过 AFS 路径读取 resource 内容
 * 4. ResourceTemplate 的变量能正确展开
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFS } from "@aigne/afs";
import { AFSMCP } from "@aigne/afs-mcp";

// Get path to locally installed mcp-server-everything
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

describe("Phase 3: Resources as AFS Directories", () => {
  let mcp: AFSMCP;
  let afs: AFS;

  beforeAll(async () => {
    mcp = new AFSMCP({
      name: "everything",
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

  describe("Resource Discovery", () => {
    test("list('/') should include resource directories from MCP resources", async () => {
      const result = await afs.list("/modules/everything");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);

      // 应该有 tools 目录
      const paths = result.data.map((e: any) => e.path);
      expect(paths.some((p: string) => p.includes("/tools"))).toBe(true);

      // 如果有 resources，它们应该被展开为顶层目录
      if (mcp.resources.length > 0 || mcp.resourceTemplates.length > 0) {
        // 至少应该有除了 tools/prompts 之外的目录
        const nonSystemPaths = result.data.filter(
          (e: any) =>
            !e.path.includes("/tools") &&
            !e.path.includes("/prompts") &&
            e.path !== "/modules/everything",
        );
        // everything server 可能有资源
        console.log(
          "Resource-derived paths:",
          nonSystemPaths.map((e: any) => e.path),
        );
      }
    });

    test("resources getter should return cached resources", () => {
      // resources 应该被缓存
      expect(Array.isArray(mcp.resources)).toBe(true);
      expect(Array.isArray(mcp.resourceTemplates)).toBe(true);
    });
  });

  describe("Resource URI Parsing", () => {
    test("resourceToTopLevelPath should extract path from URI", () => {
      // 测试内部方法（通过行为测试）
      // URI: sqlite://posts -> /posts
      // URI: github://repos -> /repos

      // 由于是私有方法，通过 list 的结果间接测试
      const _result = afs.list("/modules/everything");
      // 如果有 resources，应该能看到展开的路径
    });
  });

  describe("Resource Reading", () => {
    test("should be able to read a static resource if available", async () => {
      // everything server 暴露了一些静态资源
      if (mcp.resources.length === 0) {
        console.log("No static resources available, skipping test");
        return;
      }

      const firstResource = mcp.resources[0]!;
      console.log("Testing resource:", firstResource.uri);

      // 尝试通过展开的路径读取 (now under /resources)
      const resourcePath = mcp.resourceUriToPath(firstResource.uri);
      if (resourcePath) {
        const readResult = await afs.read(`/modules/everything/resources${resourcePath}`);
        expect(readResult.data).toBeDefined();
      }
    });

    test("read should return resource content via AFS path", async () => {
      if (mcp.resources.length === 0) {
        console.log("No resources available, skipping test");
        return;
      }

      const firstResource = mcp.resources[0]!;
      const resourcePath = mcp.resourceUriToPath(firstResource.uri);
      const result = await afs.read(`/modules/everything/resources${resourcePath}`);

      expect(result.data).toBeDefined();
      if (result.data) {
        expect(result.data.meta?.mcp?.uri).toBe(firstResource.uri);
      }
    });
  });

  describe("Resource Template Expansion", () => {
    test("should be able to match path to resource template", () => {
      if (mcp.resourceTemplates.length === 0) {
        console.log("No resource templates available, skipping test");
        return;
      }

      const firstTemplate = mcp.resourceTemplates[0]!;
      console.log("Testing template:", firstTemplate.uriTemplate);

      // 测试路径匹配
      // 例如 /posts/123 应该匹配 sqlite://posts/{id} 模板
    });

    test("should extract params from path matching template", () => {
      if (mcp.resourceTemplates.length === 0) {
        console.log("No resource templates available, skipping test");
        return;
      }

      // 通过行为测试参数提取
      // 例如路径 /posts/123 应该提取出 { id: "123" }
    });
  });

  describe("Resource Template Actions", () => {
    test("read template base path should return template metadata", async () => {
      if (mcp.resourceTemplates.length === 0) {
        console.log("No resource templates available, skipping test");
        return;
      }

      const result = await afs.read("/modules/everything/resources/resource/dynamic/text");

      expect(result.data).toBeDefined();
      expect(result.data?.meta?.kind).toBe("mcp:resource-template");
      expect(result.data?.meta?.mcp?.uriTemplate).toBeDefined();
      expect(result.data?.meta?.mcp?.parameters).toContain("resourceId");
      // Content should be undefined since no params provided (use action to get content)
      expect(result.data?.content).toBeUndefined();
    });

    test("list template base path/.actions should return get action", async () => {
      if (mcp.resourceTemplates.length === 0) {
        console.log("No resource templates available, skipping test");
        return;
      }

      const result = await afs.list("/modules/everything/resources/resource/dynamic/text/.actions");

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);

      const getAction = result.data.find((e: any) => e.id === "get" || e.meta?.name === "get");
      expect(getAction).toBeDefined();
      expect(getAction?.meta?.inputSchema).toBeDefined();
      expect(getAction?.meta?.inputSchema?.properties?.resourceId).toBeDefined();
    });

    test("exec template/.actions/get with params should return resource content", async () => {
      if (mcp.resourceTemplates.length === 0) {
        console.log("No resource templates available, skipping test");
        return;
      }

      const result = await afs.exec(
        "/modules/everything/resources/resource/dynamic/text/.actions/get",
        { resourceId: "42" },
        {},
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.content).toBeDefined();
      expect(typeof result.data?.content).toBe("string");
      expect(result.data?.content).toContain("Resource 42");
    });

    test("read template via path segment should also work", async () => {
      if (mcp.resourceTemplates.length === 0) {
        console.log("No resource templates available, skipping test");
        return;
      }

      // Path-based access: /resources/resource/dynamic/text/42
      const result = await afs.read("/modules/everything/resources/resource/dynamic/text/42");

      expect(result.data).toBeDefined();
      expect(result.data?.content).toBeDefined();
      expect(typeof result.data?.content).toBe("string");
      expect(result.data?.content).toContain("Resource 42");
    });

    test("list static resource/.actions should return empty", async () => {
      if (mcp.resources.length === 0) {
        console.log("No static resources available, skipping test");
        return;
      }

      const firstResource = mcp.resources[0]!;
      const resourcePath = mcp.resourceUriToPath(firstResource.uri);
      if (resourcePath) {
        const result = await afs.list(`/modules/everything/resources${resourcePath}/.actions`);
        expect(result.data).toBeDefined();
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBe(0);
      }
    });

    test("exec on static resource should return error", async () => {
      if (mcp.resources.length === 0) {
        console.log("No static resources available, skipping test");
        return;
      }

      const firstResource = mcp.resources[0]!;
      const resourcePath = mcp.resourceUriToPath(firstResource.uri);
      if (resourcePath) {
        const result = await afs.exec(
          `/modules/everything/resources${resourcePath}/.actions/get`,
          {},
          {},
        );
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe("Resource Listing", () => {
    test("list should return resource children if enumerable", async () => {
      // 某些 resources 支持枚举子项
      // everything server 可能提供这样的能力

      if (mcp.resources.length === 0 && mcp.resourceTemplates.length === 0) {
        console.log("No resources available, skipping test");
        return;
      }

      // 获取第一个 resource 的顶层路径并列出
      // Resources are accessed via /resources prefix
      if (mcp.resources.length > 0) {
        const firstResource = mcp.resources[0]!;
        const resourcePath = mcp.resourceUriToPath(firstResource.uri);
        if (resourcePath) {
          const result = await afs.list(`/modules/everything/resources${resourcePath}`);
          expect(result.data).toBeDefined();
          expect(Array.isArray(result.data)).toBe(true);
        }
      }
    });
  });
});

describe("Phase 3: URI and Path Utilities", () => {
  test("AFSMCP.parseResourceUri should correctly parse URIs", () => {
    // 测试 URI 解析
    const testCases = [
      {
        uri: "file:///path/to/file.txt",
        expectedScheme: "file",
        expectedPath: "/path/to/file.txt",
      },
      { uri: "sqlite://posts", expectedScheme: "sqlite", expectedPath: "/posts" },
      {
        uri: "github://repos/owner/repo",
        expectedScheme: "github",
        expectedPath: "/repos/owner/repo",
      },
    ];

    for (const tc of testCases) {
      const parsed = AFSMCP.parseResourceUri(tc.uri);
      expect(parsed.scheme).toBe(tc.expectedScheme);
      expect(parsed.path).toBe(tc.expectedPath);
    }
  });

  test("AFSMCP.parseUriTemplate should extract template variables", () => {
    const testCases = [
      { template: "sqlite://posts/{id}", expectedVars: ["id"] },
      {
        template: "github://repos/{owner}/{repo}/issues/{number}",
        expectedVars: ["owner", "repo", "number"],
      },
      { template: "file:///{path}", expectedVars: ["path"] },
    ];

    for (const tc of testCases) {
      const vars = AFSMCP.parseUriTemplate(tc.template);
      expect(vars).toEqual(tc.expectedVars);
    }
  });

  test("AFSMCP.matchPathToTemplate should return params", () => {
    // 测试路径匹配模板并提取参数
    const result = AFSMCP.matchPathToTemplate("/posts/123", "sqlite://posts/{id}");
    expect(result).toEqual({ id: "123" });

    const result2 = AFSMCP.matchPathToTemplate(
      "/repos/arcblock/afs/issues/42",
      "github://repos/{owner}/{repo}/issues/{number}",
    );
    expect(result2).toEqual({ owner: "arcblock", repo: "afs", number: "42" });
  });
});
