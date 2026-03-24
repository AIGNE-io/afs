/**
 * AFS MCP Provider
 *
 * 将 MCP Server 挂载为 AFS 可访问的世界。
 * - Tools → 可执行的 AFS entries（通过 `exec()`）
 * - Prompts → 可读取的世界描述
 * - Resources → 可读取的世界状态（展开为 AFS 目录结构）
 */

import type {
  AFSEntry,
  AFSExecResult,
  AFSExplainResult,
  AFSListResult,
  AFSModuleClass,
  AFSModuleLoadParams,
  AFSReadResult,
  AFSSearchResult,
  AFSStatResult,
  CapabilitiesManifest,
  ProviderManifest,
  ProviderTreeSchema,
  RouteContext,
  ToolDefinition,
} from "@aigne/afs";
import { AFSNotFoundError } from "@aigne/afs";
import {
  Actions,
  AFSBaseProvider,
  Exec,
  Explain,
  List,
  Meta,
  Read,
  Search,
  Stat,
} from "@aigne/afs/provider";
import { camelize, optionalize, zodParse } from "@aigne/afs/utils/zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { Prompt, Resource, ResourceTemplate, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getKindsArray } from "./kinds.js";

/**
 * Parsed resource URI
 */
export interface ParsedResourceUri {
  scheme: string;
  path: string;
  query?: Record<string, string>;
}

/**
 * Configuration options for AFSMCP
 */
export interface AFSMCPOptions {
  /** Module name (used as mount path segment) */
  name?: string;
  /** Module description */
  description?: string;

  /** Transport type */
  transport: "stdio" | "http" | "sse";

  // Stdio transport options
  /** Command to execute (for stdio transport) */
  command?: string;
  /** Command arguments (for stdio transport) */
  args?: string[];
  /** Environment variables (for stdio transport) */
  env?: Record<string, string>;
  /**
   * If true, inherits the full parent process environment.
   * Default: false — only a safe allowlist (PATH, HOME, USER, LANG, TERM, NODE_ENV, SHELL)
   * is passed to the child process, plus any vars in `env`.
   */
  inheritEnv?: boolean;
  /**
   * If true, allows shell interpreters (sh, bash, zsh, cmd) as the stdio command.
   * Default: false — shell interpreters are rejected to prevent command injection.
   */
  allowShellCommand?: boolean;

  // HTTP/SSE transport options
  /** Server URL (for http/sse transport) */
  url?: string;
  /** HTTP headers (for http/sse transport) */
  headers?: Record<string, string>;

  // Common options
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Maximum reconnection attempts */
  maxReconnects?: number;
}

/**
 * Zod schema for options validation
 */
const afsMCPOptionsSchema = camelize(
  z
    .object({
      name: optionalize(z.string()),
      description: optionalize(z.string()),
      transport: z.enum(["stdio", "http", "sse"]),
      command: optionalize(z.string()),
      args: optionalize(z.array(z.string())),
      env: optionalize(z.record(z.string(), z.string())),
      inheritEnv: optionalize(z.boolean()),
      allowShellCommand: optionalize(z.boolean()),
      url: optionalize(z.string()),
      headers: optionalize(z.record(z.string(), z.string())),
      timeout: optionalize(z.number()),
      maxReconnects: optionalize(z.number()),
    })
    .refine(
      (data) => {
        // stdio transport requires command
        if (data.transport === "stdio" && !data.command) {
          return false;
        }
        // http/sse transport requires url
        if ((data.transport === "http" || data.transport === "sse") && !data.url) {
          return false;
        }
        return true;
      },
      {
        message: "stdio transport requires 'command', http/sse transport requires 'url'",
      },
    ),
);

/**
 * AFS Module for MCP Server integration
 */
export class AFSMCP extends AFSBaseProvider {
  override readonly name: string;
  override readonly description?: string;
  override readonly accessMode = "readwrite" as const;

  /**
   * Get the Zod schema for options validation
   */
  static schema() {
    return afsMCPOptionsSchema;
  }

  static manifest(): ProviderManifest[] {
    return [
      {
        name: "mcp-stdio",
        description:
          "MCP (Model Context Protocol) server — access external tools and resources via stdio.\n- Discover and execute tools exposed by the MCP server\n- Browse resources as virtual files, access prompt templates\n- Path structure: `/tools/{name}`, `/resources/{uri}`, `/prompts/{name}`",
        uriTemplate: "mcp+stdio://{command+}",
        category: "bridge",
        schema: z.object({
          command: z.string(),
          args: z.array(z.string()).optional(),
          env: z.record(z.string(), z.string()).optional(),
        }),
        tags: ["mcp", "stdio", "integration"],
        capabilityTags: ["read-write", "search", "auth:none", "stdio"],
        security: {
          riskLevel: "system",
          resourceAccess: ["process-spawn"],
          notes: ["Spawns a child process — the MCP server has full access to the host"],
        },
        capabilities: {
          process: { spawn: true },
        },
      },
      {
        name: "mcp-http",
        description:
          "MCP (Model Context Protocol) server — access external tools and resources via HTTP.\n- Discover and execute tools exposed by the MCP server\n- Browse resources as virtual files, access prompt templates\n- Path structure: `/tools/{name}`, `/resources/{uri}`, `/prompts/{name}`",
        uriTemplate: "mcp+http://{url+}",
        category: "bridge",
        schema: z.object({
          url: z.string(),
        }),
        tags: ["mcp", "http", "integration"],
        capabilityTags: ["read-write", "search", "auth:token", "remote", "http"],
        security: {
          riskLevel: "external",
          resourceAccess: ["internet"],
          notes: ["Connects to a remote MCP server — security depends on the remote server"],
        },
        capabilities: {
          network: { egress: true },
        },
      },
      {
        name: "mcp-sse",
        description:
          "MCP (Model Context Protocol) server — access external tools and resources via SSE.\n- Discover and execute tools exposed by the MCP server\n- Browse resources as virtual files, access prompt templates\n- Path structure: `/tools/{name}`, `/resources/{uri}`, `/prompts/{name}`",
        uriTemplate: "mcp+sse://{url+}",
        category: "bridge",
        schema: z.object({
          url: z.string(),
        }),
        tags: ["mcp", "sse", "integration"],
        capabilityTags: ["read-write", "search", "auth:token", "remote", "http", "streaming"],
        security: {
          riskLevel: "external",
          resourceAccess: ["internet"],
          notes: ["Connects to a remote MCP server — security depends on the remote server"],
        },
        capabilities: {
          network: { egress: true },
        },
      },
    ];
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "exec", "search", "stat", "explain"],
      tree: {
        "/": { kind: "mcp:module", operations: ["list", "read"] },
        "/WORLD.md": { kind: "afs:document", operations: ["read"] },
        "/tools": { kind: "afs:node", operations: ["list", "read"] },
        "/tools/{name}": { kind: "mcp:tool", operations: ["read", "exec"] },
        "/prompts": { kind: "afs:node", operations: ["list", "read"] },
        "/prompts/{name}": { kind: "mcp:prompt", operations: ["read"], actions: ["get"] },
        "/resources": { kind: "afs:node", operations: ["list", "read"] },
        "/resources/{path+}": { kind: "mcp:resource", operations: ["read"], actions: ["get"] },
      },
      auth: { type: "none" },
      bestFor: ["MCP server bridge", "tool discovery"],
      notFor: ["direct data storage"],
    };
  }

  /**
   * Load module from configuration file
   */
  static async load({ basePath, config }: AFSModuleLoadParams = {}): Promise<AFSMCP> {
    const valid = await AFSMCP.schema().parseAsync(config);
    return new AFSMCP({ ...valid, cwd: basePath });
  }

  /**
   * Parse a resource URI into its components
   *
   * Examples:
   * - "file:///path/to/file.txt" -> { scheme: "file", path: "/path/to/file.txt" }
   * - "sqlite://posts" -> { scheme: "sqlite", path: "/posts" }
   * - "github://repos/owner/repo" -> { scheme: "github", path: "/repos/owner/repo" }
   */
  static parseResourceUri(uri: string): ParsedResourceUri {
    // Handle standard URI format: scheme://path or scheme:///path
    // Scheme can contain alphanumeric, +, -, . (per RFC 3986)
    const match = uri.match(/^([\w+.-]+):\/\/\/?(.*)$/);
    if (match) {
      const scheme = match[1] as string;
      const rest = match[2] as string;
      // Ensure path starts with /
      const path = rest.startsWith("/") ? rest : `/${rest}`;
      return { scheme, path };
    }

    // Fallback: treat entire string as path
    return { scheme: "unknown", path: uri };
  }

  /**
   * Parse a URI template and extract variable names
   *
   * Examples:
   * - "sqlite://posts/{id}" -> ["id"]
   * - "github://repos/{owner}/{repo}/issues/{number}" -> ["owner", "repo", "number"]
   */
  static parseUriTemplate(template: string): string[] {
    const vars: string[] = [];
    const regex = /\{(\w+)\}/g;
    let match: RegExpExecArray | null = regex.exec(template);
    while (match !== null) {
      vars.push(match[1] as string);
      match = regex.exec(template);
    }
    return vars;
  }

  /**
   * Match a path against a URI template and extract parameters
   *
   * Examples:
   * - matchPathToTemplate("/posts/123", "sqlite://posts/{id}") -> { id: "123" }
   * - matchPathToTemplate("/repos/arcblock/afs/issues/42", "github://repos/{owner}/{repo}/issues/{number}")
   *   -> { owner: "arcblock", repo: "afs", number: "42" }
   *
   * Returns null if path doesn't match the template
   */
  static matchPathToTemplate(path: string, uriTemplate: string): Record<string, string> | null {
    // Parse the template to get the path pattern
    const parsed = AFSMCP.parseResourceUri(uriTemplate);
    const templatePath = parsed.path;

    // Convert template path to regex
    // Replace {var} with capture groups, escape non-variable portions
    const vars: string[] = [];
    const parts = templatePath.split(/(\{\w+\})/);
    const regexStr = parts
      .map((part) => {
        const varMatch = part.match(/^\{(\w+)\}$/);
        if (varMatch) {
          vars.push(varMatch[1]!);
          return "([^/]+)";
        }
        // Escape regex-special characters in literal portions
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");

    const regex = new RegExp(`^${regexStr}$`);
    const match = path.match(regex);

    if (!match) {
      return null;
    }

    // Extract matched values
    const params: Record<string, string> = {};
    for (let i = 0; i < vars.length; i++) {
      const varName = vars[i];
      const value = match[i + 1];
      if (varName && value) {
        params[varName] = value;
      }
    }

    return params;
  }

  /**
   * Build a complete URI from a template and parameters
   */
  static buildUriFromTemplate(template: string, params: Record<string, string>): string {
    let uri = template;
    for (const [key, value] of Object.entries(params)) {
      uri = uri.replace(`{${key}}`, value);
    }
    return uri;
  }

  // MCP Client instance
  private client: Client | null = null;
  private transport: Transport | null = null;

  // Cached capabilities
  private _tools: Tool[] = [];
  private _prompts: Prompt[] = [];
  private _resources: Resource[] = [];
  private _resourceTemplates: ResourceTemplate[] = [];

  // Resource path mapping cache
  private _resourcePathMap: Map<string, { resource?: Resource; template?: ResourceTemplate }> =
    new Map();

  // Connection state
  private _isConnected = false;

  constructor(public readonly options: AFSMCPOptions & { cwd?: string; uri?: string }) {
    super();

    // Normalize registry-passed options: infer transport from URI scheme
    if (!options.transport && (options as any).uri) {
      const uri = (options as any).uri as string;
      if (uri.startsWith("mcp+stdio://")) {
        options.transport = "stdio";
        if (!options.command) {
          // Extract command from URI body (strip query params)
          const body = uri.slice("mcp+stdio://".length).split("?")[0]!;
          options.command = body;
        }
      } else if (uri.startsWith("mcp+http://")) {
        options.transport = "http";
        if (!options.url) options.url = uri.replace("mcp+", "");
      } else if (uri.startsWith("mcp+sse://")) {
        options.transport = "sse";
        if (!options.url) options.url = uri.replace("mcp+sse://", "http://");
      }
    }

    // Coerce query-param types: args (string|string[] → string[]), env (string|string[] → Record)
    // At runtime, URI query params may deliver args as string (single value) or string[]
    // Supports comma-separated: "a,b" → ["a", "b"], and mixed: ["a,b", "c"] → ["a", "b", "c"]
    if (typeof options.args === "string") {
      const argsStr = options.args as string;
      options.args = argsStr.includes(",") ? argsStr.split(",") : [argsStr];
    } else if (Array.isArray(options.args)) {
      options.args = (options.args as string[]).flatMap((a) =>
        a.includes(",") ? a.split(",") : [a],
      );
    }
    if (options.env && !Array.isArray(options.env) && typeof options.env === "string") {
      // Single env string "KEY=VALUE"
      const [key, ...rest] = (options.env as string).split("=");
      options.env = key ? { [key]: rest.join("=") } : {};
    } else if (Array.isArray(options.env)) {
      // Array of "KEY=VALUE" strings
      const envRecord: Record<string, string> = {};
      for (const entry of options.env as string[]) {
        const [key, ...rest] = entry.split("=");
        if (key) envRecord[key] = rest.join("=");
      }
      options.env = envRecord;
    }

    zodParse(afsMCPOptionsSchema, options);

    this.name = options.name || "mcp";
    this.description = options.description;
  }

  // ========== Root Handlers ==========

  /**
   * List root directory children.
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/")
  async listRootHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureConnected();

    const entries: AFSEntry[] = [];

    // WORLD.md file
    entries.push({
      id: "/WORLD.md",
      path: "/WORLD.md",
      summary: "MCP Server World Documentation",
      meta: {
        kind: "afs:document",
        kinds: getKindsArray("afs:document"),
        description: "MCP Server World Documentation",
        mimeType: "text/markdown",
        mcp: { type: "world" },
      },
    });

    // tools directory
    entries.push({
      id: "/tools",
      path: "/tools",
      summary: `${this._tools.length} tools available`,
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._tools.length} tools available`,
        childrenCount: this._tools.length,
      },
    });

    // prompts directory (only if there are prompts)
    if (this._prompts.length > 0) {
      entries.push({
        id: "/prompts",
        path: "/prompts",
        summary: `${this._prompts.length} prompts available`,
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          description: `${this._prompts.length} prompts available`,
          childrenCount: this._prompts.length,
        },
      });
    }

    // resources directory (only if there are resources or templates)
    if (this._resources.length > 0 || this._resourceTemplates.length > 0) {
      entries.push({
        id: "/resources",
        path: "/resources",
        summary: `${this._resources.length} resources available`,
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          description: `${this._resources.length} resources available`,
          childrenCount: this._resources.length,
        },
      });
    }

    return { data: entries };
  }

  /**
   * Read root directory entry
   */
  @Read("/")
  async readRootHandler(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    return {
      id: "/",
      path: "/",
      summary: this.description || "MCP Server",
      meta: {
        kind: "mcp:module",
        kinds: getKindsArray("mcp:module"),
        description: this.description || "MCP Server",
        childrenCount:
          2 + (this._prompts.length > 0 ? 1 : 0) + (this._resources.length > 0 ? 1 : 0),
        mcp: {
          server: { name: this.name },
          capabilities: {
            tools: this._tools.length > 0,
            prompts: this._prompts.length > 0,
            resources: this._resources.length > 0,
          },
        },
      },
    };
  }

  /**
   * Read root metadata
   */
  @Meta("/")
  async readRootMeta(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    return {
      id: "/.meta",
      path: "/.meta",
      meta: {
        kind: "mcp:module",
        kinds: getKindsArray("mcp:module"),
        description: this.description || "MCP Server",
        childrenCount:
          2 + (this._prompts.length > 0 ? 1 : 0) + (this._resources.length > 0 ? 1 : 0),
        mcp: {
          server: { name: this.name },
          capabilities: {
            tools: this._tools.length > 0,
            prompts: this._prompts.length > 0,
            resources: this._resources.length > 0,
          },
        },
      },
    };
  }

  /**
   * Read capabilities manifest
   *
   * Returns all MCP tools as ToolDefinition objects.
   * MCP has no node-level actions, so actions is always empty.
   */
  @Read("/.meta/.capabilities")
  async readCapabilities(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    const tools: ToolDefinition[] = this._tools
      .filter((tool) => tool.name) // Skip tools without name
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        path: `/tools/${tool.name}`,
        inputSchema: tool.inputSchema as ToolDefinition["inputSchema"],
      }));

    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: this.name,
      version: "1.0.0",
      description: this.description,
      tools,
      actions: [], // MCP has no node-level actions
      operations: this.getOperationsDeclaration(),
    };

    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: manifest,
      meta: {
        kind: "afs:capabilities",
        description: "MCP Provider capabilities manifest",
      },
    };
  }

  /**
   * Stat root directory
   */
  @Stat("/")
  async statRootHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    await this.ensureConnected();

    const childrenCount =
      2 + (this._prompts.length > 0 ? 1 : 0) + (this._resources.length > 0 ? 1 : 0);

    return {
      data: {
        id: "/",
        path: "/",
        meta: {
          kind: "mcp:module",
          kinds: getKindsArray("mcp:module"),
          description: this.description || "MCP Server",
          childrenCount,
        },
      },
    };
  }

  /**
   * Read WORLD.md file
   */
  @Read("/WORLD.md")
  async readWorldMdHandler(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    return {
      id: "/WORLD.md",
      path: "/WORLD.md",
      content: this.generateWorldMd(),
      meta: {
        kind: "afs:document",
        kinds: getKindsArray("afs:document"),
        description: "MCP Server World Documentation",
        mimeType: "text/markdown",
        mcp: { type: "world" },
      },
    };
  }

  /**
   * List WORLD.md - files have no children
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/WORLD.md")
  async listWorldMdHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureConnected();
    // Files are leaf nodes - they have no children
    return { data: [] };
  }

  /**
   * Read WORLD.md metadata
   */
  @Meta("/WORLD.md")
  async readWorldMdMeta(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    return {
      id: "/WORLD.md/.meta",
      path: "/WORLD.md/.meta",
      meta: {
        kind: "afs:document",
        kinds: getKindsArray("afs:document"),
        description: "MCP Server World Documentation",
        mimeType: "text/markdown",
        mcp: { type: "world" },
      },
    };
  }

  /**
   * Read /tools directory entry
   */
  @Read("/tools")
  async readToolsDir(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    return {
      id: "/tools",
      path: "/tools",
      summary: `${this._tools.length} tools available`,
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._tools.length} tools available`,
        childrenCount: this._tools.length,
      },
    };
  }

  /**
   * Read /tools metadata
   */
  @Meta("/tools")
  async readToolsMeta(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    return {
      id: "/tools/.meta",
      path: "/tools/.meta",
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._tools.length} tools available`,
        childrenCount: this._tools.length,
      },
    };
  }

  /**
   * Read /prompts directory entry
   */
  @Read("/prompts")
  async readPromptsDir(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    if (this._prompts.length === 0) {
      throw new AFSNotFoundError("/prompts");
    }

    return {
      id: "/prompts",
      path: "/prompts",
      summary: `${this._prompts.length} prompts available`,
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._prompts.length} prompts available`,
        childrenCount: this._prompts.length,
      },
    };
  }

  /**
   * Read /prompts metadata
   */
  @Meta("/prompts")
  async readPromptsMeta(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    if (this._prompts.length === 0) {
      throw new AFSNotFoundError("/prompts/.meta");
    }

    return {
      id: "/prompts/.meta",
      path: "/prompts/.meta",
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._prompts.length} prompts available`,
        childrenCount: this._prompts.length,
      },
    };
  }

  /**
   * Read /resources directory entry
   */
  @Read("/resources")
  async readResourcesDir(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    if (this._resources.length === 0 && this._resourceTemplates.length === 0) {
      throw new AFSNotFoundError("/resources");
    }

    // Calculate immediate children count (not total resources)
    const immediateChildrenCount = this.getResourcesImmediateChildrenCount();

    return {
      id: "/resources",
      path: "/resources",
      summary: `${this._resources.length} resources available`,
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._resources.length} resources available`,
        childrenCount: immediateChildrenCount,
      },
    };
  }

  /**
   * Read /resources metadata
   */
  @Meta("/resources")
  async readResourcesMeta(_ctx: RouteContext): Promise<AFSEntry> {
    await this.ensureConnected();

    if (this._resources.length === 0 && this._resourceTemplates.length === 0) {
      throw new AFSNotFoundError("/resources/.meta");
    }

    // Calculate immediate children count (not total resources)
    const immediateChildrenCount = this.getResourcesImmediateChildrenCount();

    return {
      id: "/resources/.meta",
      path: "/resources/.meta",
      meta: {
        kind: "afs:node",
        kinds: getKindsArray("afs:node"),
        description: `${this._resources.length} resources available`,
        childrenCount: immediateChildrenCount,
      },
    };
  }

  /**
   * Calculate immediate children count for /resources directory
   */
  private getResourcesImmediateChildrenCount(): number {
    const immediateChildren = new Set<string>();
    for (const resource of this._resources) {
      const resourcePath = this.resourceUriToPath(resource.uri);
      if (!resourcePath) continue;
      const segments = resourcePath.split("/").filter(Boolean);
      if (segments.length > 0) {
        immediateChildren.add(segments[0]!);
      }
    }
    return immediateChildren.size;
  }

  /**
   * Stat WORLD.md file
   */
  @Stat("/WORLD.md")
  async statWorldMdHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    await this.ensureConnected();

    return {
      data: {
        id: "WORLD.md",
        path: "/WORLD.md",
        meta: {
          kind: "afs:document",
          kinds: getKindsArray("afs:document"),
          description: "MCP Server World Documentation",
          mimeType: "text/markdown",
          childrenCount: 0,
        },
      },
    };
  }

  /**
   * Stat /tools directory
   */
  @Stat("/tools")
  async statToolsHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    await this.ensureConnected();

    return {
      data: {
        id: "tools",
        path: "/tools",
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          description: `${this._tools.length} tools available`,
          childrenCount: this._tools.length,
        },
      },
    };
  }

  /**
   * Stat /prompts directory
   */
  @Stat("/prompts")
  async statPromptsHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    await this.ensureConnected();

    if (this._prompts.length === 0) {
      throw new AFSNotFoundError("/prompts");
    }

    return {
      data: {
        id: "prompts",
        path: "/prompts",
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          description: `${this._prompts.length} prompts available`,
          childrenCount: this._prompts.length,
        },
      },
    };
  }

  /**
   * Stat /resources directory
   */
  @Stat("/resources")
  async statResourcesHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    await this.ensureConnected();

    if (this._resources.length === 0 && this._resourceTemplates.length === 0) {
      throw new AFSNotFoundError("/resources");
    }

    // Calculate immediate children count (not total resources)
    const immediateChildrenCount = this.getResourcesImmediateChildrenCount();

    return {
      data: {
        id: "resources",
        path: "/resources",
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          description: `${this._resources.length} resources available`,
          childrenCount: immediateChildrenCount,
        },
      },
    };
  }

  /**
   * Stat specific tool
   */
  @Stat("/tools/:name")
  async statToolHandler(ctx: RouteContext<{ name: string }>): Promise<AFSStatResult> {
    await this.ensureConnected();
    const tool = this._tools.find((t) => t.name === ctx.params.name);
    if (!tool) {
      throw new AFSNotFoundError(ctx.path);
    }

    const { content: _content, ...statData } = this.toolToEntry(tool);
    return { data: statData };
  }

  /**
   * Stat specific prompt
   */
  @Stat("/prompts/:name")
  async statPromptHandler(ctx: RouteContext<{ name: string }>): Promise<AFSStatResult> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      throw new AFSNotFoundError(ctx.path);
    }

    const { content: _content, ...statData } = this.promptToEntry(prompt);
    return { data: statData };
  }

  /**
   * Stat resource paths (wildcard handler under /resources)
   */
  @Stat("/resources/:path+")
  async statResourceHandler(ctx: RouteContext<{ path: string }>): Promise<AFSStatResult> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;
    const afsPath = `/resources${resourcePath}`;
    const resourceId = ctx.params.path.split("/").pop() || ctx.params.path;

    // Check for exact match or children
    const resourceMatch = this.findResourceForPath(resourcePath);

    if (resourceMatch) {
      if (resourceMatch.resource) {
        return {
          data: {
            id: resourceId,
            path: afsPath,
            meta: {
              kind: "mcp:resource",
              kinds: getKindsArray("mcp:resource"),
              description: resourceMatch.resource.description,
              mimeType: resourceMatch.resource.mimeType,
              childrenCount: 0,
            },
          },
        };
      } else if (resourceMatch.template) {
        return {
          data: {
            id: resourceId,
            path: afsPath,
            meta: {
              kind: "mcp:resource-template",
              kinds: getKindsArray("mcp:resource"),
              description: resourceMatch.template.description,
              mimeType: resourceMatch.template.mimeType,
              childrenCount: 0,
            },
          },
        };
      }
    }

    // Check if this is an intermediate directory (count immediate children)
    const immediateChildren = this.getImmediateResourceChildren(resourcePath);

    if (immediateChildren.size > 0) {
      return {
        data: {
          id: resourceId,
          path: afsPath,
          meta: {
            kind: "afs:node",
            kinds: getKindsArray("afs:node"),
            childrenCount: immediateChildren.size,
          },
        },
      };
    }

    // Check if this is a template base path (dynamic children)
    if (this.isTemplateBasePath(resourcePath)) {
      return {
        data: {
          id: resourceId,
          path: afsPath,
          meta: {
            kind: "afs:node",
            kinds: getKindsArray("afs:node"),
            childrenCount: 0,
          },
        },
      };
    }

    throw new AFSNotFoundError(ctx.path);
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Get cached tools
   */
  get tools(): Tool[] {
    return this._tools;
  }

  /**
   * Get cached prompts
   */
  get prompts(): Prompt[] {
    return this._prompts;
  }

  /**
   * Get cached resources
   */
  get resources(): Resource[] {
    return this._resources;
  }

  /**
   * Get cached resource templates
   */
  get resourceTemplates(): ResourceTemplate[] {
    return this._resourceTemplates;
  }

  /** Promise for in-progress connection */
  private _connectPromise: Promise<void> | null = null;

  /**
   * Ensure connection is established (lazy connect)
   */
  async ensureConnected(): Promise<void> {
    if (this._isConnected) return;
    if (this._connectPromise) return this._connectPromise;
    this._connectPromise = this.connect();
    try {
      await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this._isConnected) return;

    // Create transport based on configuration
    this.transport = this.createTransport();

    // Create and connect client
    this.client = new Client(
      {
        name: "afs-mcp-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    await this.client.connect(this.transport);
    this._isConnected = true;

    // Cache capabilities
    await this.refreshCapabilities();

    // Build resource path mapping
    this.buildResourcePathMap();
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this._isConnected) return;

    try {
      await this.client?.close();
    } catch (error) {
      // Ignore EPIPE errors during disconnect - the pipe may already be closed
      const isEpipe =
        error instanceof Error &&
        (error.message.includes("EPIPE") || (error as NodeJS.ErrnoException).code === "EPIPE");
      if (!isEpipe) {
        throw error;
      }
    }
    this.client = null;
    this.transport = null;
    this._isConnected = false;

    // Clear caches
    this._tools = [];
    this._prompts = [];
    this._resources = [];
    this._resourceTemplates = [];
    this._resourcePathMap.clear();
  }

  /**
   * Safe environment variable allowlist for child processes.
   * Only these vars are inherited from the parent process by default.
   */
  static readonly ENV_ALLOWLIST = ["PATH", "HOME", "USER", "LANG", "TERM", "NODE_ENV", "SHELL"];

  /**
   * Shell interpreter basenames that are rejected by default.
   */
  static readonly SHELL_INTERPRETERS = [
    "sh",
    "bash",
    "zsh",
    "dash",
    "fish",
    "csh",
    "tcsh",
    "ksh",
    "cmd",
    "cmd.exe",
    "powershell",
    "pwsh",
  ];

  /**
   * Shell metacharacters that indicate command injection in command/args.
   */
  static readonly SHELL_METACHAR_PATTERN = /[;|&$`\\><()\n\r]/;

  /**
   * Validate a stdio command for safety.
   * Rejects path traversal, shell metacharacters, and shell interpreters (unless opted in).
   *
   * @throws Error if the command is unsafe
   */
  static validateStdioCommand(command: string, args?: string[], allowShellCommand?: boolean): void {
    if (!command || command.trim() === "") {
      throw new Error("MCP stdio command cannot be empty");
    }

    // Reject path traversal
    if (command.includes("..")) {
      throw new Error(`MCP stdio command contains path traversal: ${command}`);
    }

    // Reject shell metacharacters in the command itself
    if (AFSMCP.SHELL_METACHAR_PATTERN.test(command)) {
      throw new Error(`MCP stdio command contains shell metacharacters: ${command}`);
    }

    // Reject shell interpreters unless explicitly allowed
    if (!allowShellCommand) {
      const basename = command.split("/").pop()?.toLowerCase() ?? "";
      if (AFSMCP.SHELL_INTERPRETERS.includes(basename)) {
        throw new Error(
          `MCP stdio command is a shell interpreter: ${command}. ` +
            `Set allowShellCommand: true to allow this.`,
        );
      }
    }

    // Validate args for shell metacharacters
    if (args) {
      for (const arg of args) {
        if (arg.includes("..") && (arg.includes("/") || arg.includes("\\"))) {
          throw new Error(`MCP stdio arg contains path traversal: ${arg}`);
        }
      }
    }
  }

  /**
   * Build a safe environment for child processes.
   * By default only passes an allowlist of safe variables from the parent.
   */
  static buildChildEnv(
    userEnv?: Record<string, string>,
    inheritEnv?: boolean,
  ): Record<string, string> {
    let baseEnv: Record<string, string>;

    if (inheritEnv) {
      baseEnv = { ...process.env } as Record<string, string>;
    } else {
      baseEnv = {};
      for (const key of AFSMCP.ENV_ALLOWLIST) {
        if (process.env[key] !== undefined) {
          baseEnv[key] = process.env[key]!;
        }
      }
    }

    // User-declared vars always override
    if (userEnv) {
      Object.assign(baseEnv, userEnv);
    }

    return baseEnv;
  }

  /**
   * Create transport based on configuration
   */
  private createTransport(): Transport {
    switch (this.options.transport) {
      case "stdio":
        AFSMCP.validateStdioCommand(
          this.options.command!,
          this.options.args,
          this.options.allowShellCommand,
        );

        return new StdioClientTransport({
          command: this.options.command!,
          args: this.options.args,
          env: AFSMCP.buildChildEnv(this.options.env, this.options.inheritEnv),
          stderr: "pipe", // Capture stderr to prevent debug output from polluting terminal
        });

      case "http":
        return new StreamableHTTPClientTransport(new URL(this.options.url!), {
          requestInit: {
            headers: this.options.headers,
          },
        });

      case "sse":
        return new SSEClientTransport(new URL(this.options.url!), {
          requestInit: {
            headers: this.options.headers,
          },
        });

      default:
        throw new Error(`Unknown transport: ${this.options.transport}`);
    }
  }

  /**
   * Refresh cached capabilities from the server
   */
  private async refreshCapabilities(): Promise<void> {
    if (!this.client) return;

    try {
      const toolsResult = await this.client.listTools();
      this._tools = toolsResult.tools || [];
    } catch {
      this._tools = [];
    }

    try {
      const promptsResult = await this.client.listPrompts();
      this._prompts = promptsResult.prompts || [];
    } catch {
      this._prompts = [];
    }

    try {
      const resourcesResult = await this.client.listResources();
      this._resources = resourcesResult.resources || [];
    } catch {
      this._resources = [];
    }

    try {
      const templatesResult = await this.client.listResourceTemplates();
      this._resourceTemplates = templatesResult.resourceTemplates || [];
    } catch {
      this._resourceTemplates = [];
    }
  }

  /**
   * Build the resource path mapping from cached resources
   */
  private buildResourcePathMap(): void {
    this._resourcePathMap.clear();

    // Map static resources
    for (const resource of this._resources) {
      const path = this.resourceUriToPath(resource.uri);
      if (path) {
        this._resourcePathMap.set(path, { resource });
      }
    }

    // Map resource templates (store the base path)
    for (const template of this._resourceTemplates) {
      const basePath = this.getTemplateBasePath(template.uriTemplate);
      if (basePath) {
        this._resourcePathMap.set(basePath, { template });
      }
    }
  }

  /**
   * Convert a resource URI to an AFS path
   *
   * Examples:
   * - "file:///path/to/file.txt" -> "/path/to/file.txt"
   * - "sqlite://posts" -> "/posts"
   * - "github://repos" -> "/repos"
   */
  resourceUriToPath(uri: string): string | null {
    const parsed = AFSMCP.parseResourceUri(uri);
    return parsed.path;
  }

  /**
   * Get the base path from a URI template (path before first variable)
   *
   * Examples:
   * - "sqlite://posts/{id}" -> "/posts"
   * - "github://repos/{owner}/{repo}" -> "/repos"
   */
  private getTemplateBasePath(uriTemplate: string): string | null {
    const parsed = AFSMCP.parseResourceUri(uriTemplate);
    // Find the position of first { and get path before it
    const varIndex = parsed.path.indexOf("{");
    if (varIndex === -1) {
      return parsed.path;
    }
    // Get path up to but not including the variable segment
    const basePath = parsed.path.substring(0, varIndex);
    // Remove trailing slash if present
    return basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  }

  /**
   * Check if a resource path is a template base path (has dynamic children).
   */
  private isTemplateBasePath(resourcePath: string): boolean {
    return this._resourceTemplates.some((template) => {
      const basePath = this.getTemplateBasePath(template.uriTemplate);
      return basePath === resourcePath;
    });
  }

  /**
   * Get immediate child segments under a resource parent path,
   * scanning both static resources and template base paths.
   */
  private getImmediateResourceChildren(parentPath: string): Set<string> {
    const depth = parentPath.split("/").filter(Boolean).length;
    const childSegments = new Set<string>();

    for (const resource of this._resources) {
      const rPath = this.resourceUriToPath(resource.uri);
      if (!rPath || !rPath.startsWith(`${parentPath}/`)) continue;
      const segments = rPath.split("/").filter(Boolean);
      if (segments.length > depth) {
        childSegments.add(segments[depth]!);
      }
    }

    for (const template of this._resourceTemplates) {
      const basePath = this.getTemplateBasePath(template.uriTemplate);
      if (!basePath || !basePath.startsWith(`${parentPath}/`)) continue;
      const segments = basePath.split("/").filter(Boolean);
      if (segments.length > depth) {
        childSegments.add(segments[depth]!);
      }
    }

    return childSegments;
  }

  /**
   * Find a resource or template that matches a given path
   */
  private findResourceForPath(
    path: string,
  ): { resource?: Resource; template?: ResourceTemplate; params?: Record<string, string> } | null {
    // First check for exact match in static resources
    for (const resource of this._resources) {
      const resourcePath = this.resourceUriToPath(resource.uri);
      if (resourcePath === path) {
        return { resource };
      }
    }

    // Then check templates
    for (const template of this._resourceTemplates) {
      const params = AFSMCP.matchPathToTemplate(path, template.uriTemplate);
      if (params) {
        return { template, params };
      }
    }

    return null;
  }

  /**
   * Convert a Tool to an AFSEntry (Meta Spec compliant)
   */
  private toolToEntry(tool: Tool): AFSEntry {
    return {
      id: `/tools/${tool.name}`,
      path: `/tools/${tool.name}`,
      summary: tool.description,
      meta: {
        kind: "mcp:tool",
        kinds: getKindsArray("mcp:tool"),
        description: tool.description,
        inputSchema: tool.inputSchema,
        mcp: {
          name: tool.name,
        },
      },
    };
  }

  /**
   * Convert a Prompt to an AFSEntry (Meta Spec compliant)
   * Note: inputSchema is NOT included in prompt entry meta.
   * For prompts with arguments, use the action system (/.actions/get) to execute.
   */
  private promptToEntry(prompt: Prompt): AFSEntry {
    return {
      id: `/prompts/${prompt.name}`,
      path: `/prompts/${prompt.name}`,
      summary: prompt.description,
      meta: {
        kind: "mcp:prompt",
        kinds: getKindsArray("mcp:prompt"),
        description: prompt.description,
        mcp: {
          name: prompt.name,
          arguments: prompt.arguments,
        },
      },
    };
  }

  /**
   * Convert prompt arguments to JSON Schema (for action inputSchema)
   */
  private promptArgsToSchema(args: Prompt["arguments"]): Record<string, unknown> {
    if (!args || args.length === 0) {
      return { type: "object", properties: {} };
    }

    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const arg of args) {
      properties[arg.name] = {
        type: "string",
        ...(arg.description ? { description: arg.description } : {}),
      };
      if (arg.required) {
        required.push(arg.name);
      }
    }

    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  /**
   * Extract text content from MCP prompt messages
   */
  private extractTextFromMessages(messages: any[]): string {
    const textParts: string[] = [];
    for (const msg of messages) {
      const c = msg.content;
      if (typeof c === "string") {
        textParts.push(c);
      } else if (c && typeof c === "object" && "text" in c) {
        textParts.push(c.text as string);
      }
    }
    return textParts.join("\n");
  }

  /**
   * Convert a Resource to an AFSEntry (Meta Spec compliant)
   */
  private resourceToEntry(resource: Resource, path: string): AFSEntry {
    return {
      id: path,
      path: path,
      summary: resource.description || resource.name,
      meta: {
        kind: "mcp:resource",
        kinds: getKindsArray("mcp:resource"),
        description: resource.description,
        mimeType: resource.mimeType,
        mcp: {
          uri: resource.uri,
          name: resource.name,
        },
      },
    };
  }

  /**
   * Convert a ResourceTemplate to an AFSEntry (Meta Spec compliant)
   */
  private resourceTemplateToEntry(template: ResourceTemplate, path: string): AFSEntry {
    return {
      id: path,
      path: path,
      summary: template.description || template.name,
      meta: {
        kind: "mcp:resource-template",
        kinds: getKindsArray("mcp:resource"),
        description: template.description,
        mimeType: template.mimeType,
        mcp: {
          uriTemplate: template.uriTemplate,
          name: template.name,
        },
      },
    };
  }

  // ========== List Handlers ==========

  /**
   * List tools.
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/tools")
  async listToolsHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureConnected();
    const entries = this._tools.map((tool) => this.toolToEntry(tool));
    return { data: entries };
  }

  /**
   * List prompts.
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/prompts")
  async listPromptsHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureConnected();

    if (this._prompts.length === 0) {
      throw new AFSNotFoundError("/prompts");
    }

    const entries = this._prompts.map((prompt) => this.promptToEntry(prompt));
    return { data: entries };
  }

  /**
   * List specific tool - tools are leaf nodes with no children
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/tools/:name")
  async listToolHandler(ctx: RouteContext<{ name: string }>): Promise<AFSListResult> {
    await this.ensureConnected();
    const tool = this._tools.find((t) => t.name === ctx.params.name);
    if (!tool) {
      throw new AFSNotFoundError(ctx.path);
    }
    // Tools are leaf nodes - they have no children
    return { data: [] };
  }

  /**
   * List specific prompt - prompts are leaf nodes with no children
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/prompts/:name")
  async listPromptHandler(ctx: RouteContext<{ name: string }>): Promise<AFSListResult> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      throw new AFSNotFoundError(ctx.path);
    }
    // Prompts are leaf nodes - they have no children
    return { data: [] };
  }

  /**
   * List resources directory.
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/resources")
  async listResourcesHandler(_ctx: RouteContext): Promise<AFSListResult> {
    await this.ensureConnected();

    if (this._resources.length === 0 && this._resourceTemplates.length === 0) {
      throw new AFSNotFoundError("/resources");
    }

    // Synthesize immediate children (directories or files at depth 1)
    const immediateChildren = new Map<string, { isDir: boolean; resource?: Resource }>();

    for (const resource of this._resources) {
      const resourcePath = this.resourceUriToPath(resource.uri);
      if (!resourcePath) continue;

      const segments = resourcePath.split("/").filter(Boolean);
      if (segments.length === 0) continue;

      const firstSegment = segments[0]!;
      const childPath = `/resources/${firstSegment}`;

      if (segments.length === 1) {
        immediateChildren.set(childPath, { isDir: false, resource });
      } else {
        if (!immediateChildren.has(childPath)) {
          immediateChildren.set(childPath, { isDir: true });
        }
      }
    }

    // Include template base paths in the tree
    for (const template of this._resourceTemplates) {
      const basePath = this.getTemplateBasePath(template.uriTemplate);
      if (!basePath) continue;

      const segments = basePath.split("/").filter(Boolean);
      if (segments.length === 0) continue;

      const firstSegment = segments[0]!;
      const childPath = `/resources/${firstSegment}`;

      if (!immediateChildren.has(childPath)) {
        immediateChildren.set(childPath, { isDir: true });
      }
    }

    const entries: AFSEntry[] = [];
    for (const [path, info] of immediateChildren) {
      if (info.isDir) {
        const resourceSubPath = path.replace("/resources", "");
        const childrenCount = this.getImmediateResourceChildren(resourceSubPath).size;
        entries.push({
          id: path,
          path,
          summary: `Resource directory: ${resourceSubPath}`,
          meta: {
            kind: "afs:node",
            kinds: getKindsArray("afs:node"),
            childrenCount,
            mcp: { isResource: true },
          },
        });
      } else if (info.resource) {
        entries.push(this.resourceToEntry(info.resource, path));
      }
    }

    return { data: entries };
  }

  /**
   * List resource paths (wildcard handler under /resources)
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  @List("/resources/:path+")
  async listResourceHandler(ctx: RouteContext<{ path: string }>): Promise<AFSListResult> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;
    const entries: AFSEntry[] = [];

    // Check for exact match or collect children
    let exactMatch: Resource | null = null;
    const immediateChildren = new Map<string, { isDir: boolean; resource?: Resource }>();
    const resourcePathSegments = resourcePath.split("/").filter(Boolean);
    const depth = resourcePathSegments.length;

    for (const resource of this._resources) {
      const rPath = this.resourceUriToPath(resource.uri);
      if (!rPath) continue;

      if (rPath === resourcePath) {
        exactMatch = resource;
      } else if (rPath.startsWith(`${resourcePath}/`)) {
        const segments = rPath.split("/").filter(Boolean);
        if (segments.length <= depth) continue;

        const childSegment = segments[depth]!;
        const childPath = `/resources${resourcePath}/${childSegment}`;

        if (segments.length === depth + 1) {
          immediateChildren.set(childPath, { isDir: false, resource });
        } else {
          if (!immediateChildren.has(childPath)) {
            immediateChildren.set(childPath, { isDir: true });
          }
        }
      }
    }

    // Include template base paths in the tree
    for (const template of this._resourceTemplates) {
      const basePath = this.getTemplateBasePath(template.uriTemplate);
      if (!basePath) continue;

      if (basePath === resourcePath) {
        // This is a template base path - it has dynamic children
        // Return empty since children are parameterized
        return { data: [] };
      } else if (basePath.startsWith(`${resourcePath}/`)) {
        const segments = basePath.split("/").filter(Boolean);
        if (segments.length <= depth) continue;

        const childSegment = segments[depth]!;
        const childPath = `/resources${resourcePath}/${childSegment}`;

        if (!immediateChildren.has(childPath)) {
          immediateChildren.set(childPath, { isDir: true });
        }
      }
    }

    if (exactMatch) {
      // Exact resource match - resources are leaf nodes with no children
      return { data: [] };
    }

    if (immediateChildren.size > 0) {
      for (const [path, info] of immediateChildren) {
        if (info.isDir) {
          const resourceSubPath = path.replace("/resources", "");
          const childrenCount = this.getImmediateResourceChildren(resourceSubPath).size;
          entries.push({
            id: path,
            path,
            summary: `Resource directory: ${resourceSubPath}`,
            meta: {
              kind: "afs:node",
              kinds: getKindsArray("afs:node"),
              childrenCount,
              mcp: { isResource: true },
            },
          });
        } else if (info.resource) {
          entries.push(this.resourceToEntry(info.resource, path));
        }
      }
      return { data: entries };
    }

    // No match found
    throw new AFSNotFoundError(ctx.path);
  }

  // ========== Meta Handlers ==========

  /**
   * Read metadata for tools (dynamic entries not in static tree).
   * Static entries metadata is handled by AFSBaseProvider.
   */
  @Meta("/tools/:name")
  async readToolMeta(ctx: RouteContext<{ name: string }>): Promise<AFSEntry> {
    await this.ensureConnected();
    const tool = this._tools.find((t) => t.name === ctx.params.name);
    if (!tool) {
      throw new AFSNotFoundError(ctx.path);
    }
    const entry = this.toolToEntry(tool);
    return {
      id: `/tools/${ctx.params.name}/.meta`,
      path: `/tools/${ctx.params.name}/.meta`,
      meta: entry.meta,
    };
  }

  /**
   * Read metadata for prompts (dynamic entries not in static tree).
   */
  @Meta("/prompts/:name")
  async readPromptMeta(ctx: RouteContext<{ name: string }>): Promise<AFSEntry> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      throw new AFSNotFoundError(ctx.path);
    }
    const entry = this.promptToEntry(prompt);
    return {
      id: `/prompts/${ctx.params.name}/.meta`,
      path: `/prompts/${ctx.params.name}/.meta`,
      meta: entry.meta,
    };
  }

  /**
   * Read metadata for resources (dynamic entries not in static tree).
   * Handles both actual resources and synthesized intermediate directories.
   */
  @Meta("/resources/:path+")
  async readResourceMeta(ctx: RouteContext<{ path: string }>): Promise<AFSEntry> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;
    const metaPath = `/resources${resourcePath}/.meta`;

    // Try to match as resource path
    const resourceMatch = this.findResourceForPath(resourcePath);

    if (resourceMatch) {
      if (resourceMatch.resource) {
        // Static resource
        const entry = this.resourceToEntry(resourceMatch.resource, `/resources${resourcePath}`);
        return {
          id: metaPath,
          path: metaPath,
          meta: entry.meta,
        };
      } else if (resourceMatch.template) {
        // Template resource
        const entry = this.resourceTemplateToEntry(
          resourceMatch.template,
          `/resources${resourcePath}`,
        );
        return {
          id: metaPath,
          path: metaPath,
          meta: entry.meta,
        };
      }
    }

    // Check if this is an intermediate directory (has child resources or templates)
    const immediateChildren = this.getImmediateResourceChildren(resourcePath);

    if (immediateChildren.size > 0) {
      return {
        id: metaPath,
        path: metaPath,
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          mcp: { isResource: true },
        },
      };
    }

    // Check if this is a template base path
    if (this.isTemplateBasePath(resourcePath)) {
      const template = this._resourceTemplates.find(
        (t) => this.getTemplateBasePath(t.uriTemplate) === resourcePath,
      );
      if (template) {
        const entry = this.resourceTemplateToEntry(template, `/resources${resourcePath}`);
        return {
          id: metaPath,
          path: metaPath,
          meta: entry.meta,
        };
      }
    }

    throw new AFSNotFoundError(ctx.path);
  }

  // ========== Read Handlers ==========

  /**
   * Read tool
   */
  @Read("/tools/:name")
  async readToolHandler(ctx: RouteContext<{ name: string }>): Promise<AFSEntry> {
    await this.ensureConnected();
    const tool = this._tools.find((t) => t.name === ctx.params.name);
    if (!tool) {
      throw new AFSNotFoundError(ctx.path);
    }
    return this.toolToEntry(tool);
  }

  /**
   * Read prompt
   *
   * Behavior:
   * - Prompts with NO arguments: returns content directly
   * - Prompts with ONLY optional arguments: returns content (empty params)
   * - Prompts with REQUIRED arguments: returns metadata only (use /.actions/get to execute)
   */
  @Read("/prompts/:name")
  async readPromptHandler(ctx: RouteContext<{ name: string }>): Promise<AFSEntry> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      throw new AFSNotFoundError(ctx.path);
    }

    const entry = this.promptToEntry(prompt);

    // Only auto-fetch content for prompts without required args
    const hasRequiredArgs = prompt.arguments?.some((arg) => arg.required) ?? false;

    if (this.client && !hasRequiredArgs) {
      try {
        const result = await this.client.getPrompt({
          name: prompt.name,
          arguments: {},
        });
        const content = this.extractTextFromMessages(result.messages);
        if (content) {
          entry.content = content;
        }
      } catch {
        // Silently fall back to metadata-only if getPrompt fails
      }
    }

    return entry;
  }

  // ========== Prompt Action Handlers ==========

  /**
   * List actions for a prompt
   *
   * Only prompts with arguments expose a "get" action.
   */
  @Actions("/prompts/:name")
  async listPromptActions(ctx: RouteContext<{ name: string }>): Promise<{ data: AFSEntry[] }> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      throw new AFSNotFoundError(ctx.path);
    }

    // Only expose "get" action for prompts with arguments
    if (!prompt.arguments || prompt.arguments.length === 0) {
      return { data: [] };
    }

    const actionPath = `/prompts/${prompt.name}/.actions/get`;
    return {
      data: [
        {
          id: "get",
          path: actionPath,
          summary: `Get ${prompt.name} prompt content with arguments`,
          meta: {
            kind: "afs:executable",
            kinds: getKindsArray("afs:executable"),
            name: "get",
            description: prompt.description,
            inputSchema: this.promptArgsToSchema(prompt.arguments),
          },
        },
      ],
    };
  }

  /**
   * Execute prompt "get" action
   *
   * Fetches prompt content with provided arguments.
   */
  @Actions.Exec("/prompts/:name", "get")
  async execPromptGetHandler(
    ctx: RouteContext<{ name: string }>,
    params: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `Prompt not found: ${ctx.params.name}` },
      };
    }

    if (!this.client) {
      return {
        success: false,
        error: { code: "NOT_CONNECTED", message: "MCP client not connected" },
      };
    }

    try {
      const result = await this.client.getPrompt({
        name: prompt.name,
        arguments: params as Record<string, string>,
      });

      const content = this.extractTextFromMessages(result.messages);

      return {
        success: true,
        data: {
          content,
          meta: {
            mcp: {
              name: prompt.name,
              arguments: prompt.arguments,
            },
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "EXECUTION_ERROR", message: error.message },
      };
    }
  }

  // ========== Resource Action Handlers ==========

  /**
   * List actions for a resource template
   *
   * Only resource templates expose a "get" action.
   * Static resources do not have actions.
   */
  @Actions("/resources/:path+")
  async listResourceActions(ctx: RouteContext<{ path: string }>): Promise<{ data: AFSEntry[] }> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;

    // Check if this is a template base path
    if (!this.isTemplateBasePath(resourcePath)) {
      // Not a template - no actions
      return { data: [] };
    }

    const template = this._resourceTemplates.find(
      (t) => this.getTemplateBasePath(t.uriTemplate) === resourcePath,
    );

    if (!template) {
      return { data: [] };
    }

    const vars = AFSMCP.parseUriTemplate(template.uriTemplate);
    if (vars.length === 0) {
      // No variables - no action needed
      return { data: [] };
    }

    // Build inputSchema from template variables
    const properties: Record<string, unknown> = {};
    for (const v of vars) {
      properties[v] = { type: "string", description: `Template variable: ${v}` };
    }
    const inputSchema = {
      type: "object",
      properties,
      required: vars, // All template variables are required
    };

    const afsPath = `/resources${resourcePath}`;
    const actionPath = `${afsPath}/.actions/get`;

    return {
      data: [
        {
          id: "get",
          path: actionPath,
          summary: `Get resource with template parameters`,
          meta: {
            kind: "afs:executable",
            kinds: getKindsArray("afs:executable"),
            name: "get",
            description: template.description,
            inputSchema,
          },
        },
      ],
    };
  }

  /**
   * Execute resource template "get" action
   *
   * Fetches resource content with provided template parameters.
   */
  @Actions.Exec("/resources/:path+", "get")
  async execResourceGetHandler(
    ctx: RouteContext<{ path: string }>,
    params: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;

    // Check if this is a template base path
    if (!this.isTemplateBasePath(resourcePath)) {
      return {
        success: false,
        error: { code: "NOT_TEMPLATE", message: `Not a resource template: ${resourcePath}` },
      };
    }

    const template = this._resourceTemplates.find(
      (t) => this.getTemplateBasePath(t.uriTemplate) === resourcePath,
    );

    if (!template) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `Resource template not found: ${resourcePath}` },
      };
    }

    if (!this.client) {
      return {
        success: false,
        error: { code: "NOT_CONNECTED", message: "MCP client not connected" },
      };
    }

    try {
      const uri = AFSMCP.buildUriFromTemplate(
        template.uriTemplate,
        params as Record<string, string>,
      );
      const result = await this.readResourceByUri(uri);

      if (!result.data) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: result.message || "Resource not found" },
        };
      }

      return {
        success: true,
        data: {
          content: result.data.content,
          meta: {
            mcp: {
              uri,
              name: template.name,
              uriTemplate: template.uriTemplate,
            },
          },
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "EXECUTION_ERROR", message: error.message },
      };
    }
  }

  /**
   * Read resource (wildcard handler under /resources)
   */
  @Read("/resources/:path+")
  async readResourceHandler(ctx: RouteContext<{ path: string }>): Promise<AFSEntry> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;
    const afsPath = `/resources${resourcePath}`;

    // Try to match as resource path
    const resourceMatch = this.findResourceForPath(resourcePath);

    if (resourceMatch) {
      if (resourceMatch.resource) {
        // Static resource - read it directly
        const result = await this.readResourceByUri(resourceMatch.resource.uri);
        if (!result.data) {
          throw new AFSNotFoundError(ctx.path, result.message || `Resource not found: ${ctx.path}`);
        }
        // Update path to include /resources prefix
        result.data.path = `/resources${result.data.path}`;
        result.data.id = result.data.path;
        return result.data;
      } else if (resourceMatch.template && resourceMatch.params) {
        // Template match - build URI and read
        const uri = AFSMCP.buildUriFromTemplate(
          resourceMatch.template.uriTemplate,
          resourceMatch.params,
        );
        const result = await this.readResourceByUri(uri);
        if (!result.data) {
          throw new AFSNotFoundError(ctx.path, result.message || `Resource not found: ${ctx.path}`);
        }
        // Update path to include /resources prefix
        result.data.path = `/resources${result.data.path}`;
        result.data.id = result.data.path;
        return result.data;
      }
    }

    // Check if this is an intermediate directory (has child resources or templates)
    const immediateChildrenSet = this.getImmediateResourceChildren(resourcePath);

    if (immediateChildrenSet.size > 0) {
      return {
        id: afsPath,
        path: afsPath,
        summary: `Resource directory: ${resourcePath}`,
        meta: {
          kind: "afs:node",
          kinds: getKindsArray("afs:node"),
          childrenCount: immediateChildrenSet.size,
          mcp: { isResource: true },
        },
      };
    }

    // Check if this is a template base path (dynamic children, not enumerable)
    // For templates, return metadata only. Use /.actions/get to fetch with params.
    if (this.isTemplateBasePath(resourcePath)) {
      const template = this._resourceTemplates.find(
        (t) => this.getTemplateBasePath(t.uriTemplate) === resourcePath,
      );
      return {
        id: afsPath,
        path: afsPath,
        summary: template?.description || `Resource template: ${resourcePath}`,
        meta: {
          kind: "mcp:resource-template",
          kinds: getKindsArray("mcp:resource"),
          description: template?.description,
          mimeType: template?.mimeType,
          childrenCount: 0,
          mcp: {
            uriTemplate: template?.uriTemplate,
            name: template?.name,
            parameters: template ? AFSMCP.parseUriTemplate(template.uriTemplate) : [],
          },
        },
      };
    }

    throw new AFSNotFoundError(ctx.path);
  }

  /**
   * Read a resource by its URI (internal helper)
   */
  private async readResourceByUri(uri: string): Promise<AFSReadResult> {
    if (!this.client) {
      return {
        data: undefined,
        message: "MCP client not connected",
      };
    }

    try {
      const result = await this.client.readResource({ uri });
      const path = this.resourceUriToPath(uri) || uri;

      // Extract content from the result
      let content: any;
      let mimeType: string | undefined;

      if (result.contents && result.contents.length > 0) {
        const firstContent = result.contents[0]!;
        mimeType = firstContent.mimeType;

        if ("text" in firstContent) {
          content = firstContent.text;
        } else if ("blob" in firstContent) {
          content = firstContent.blob;
        }
      }

      return {
        data: {
          id: path,
          path: path,
          content: content,
          meta: {
            mcp: {
              uri: uri,
              mimeType: mimeType,
            },
          },
        },
      };
    } catch (error: any) {
      return {
        data: undefined,
        message: `Failed to read resource: ${error.message}`,
      };
    }
  }

  /**
   * Read a prompt with arguments, returning the prompt content
   *
   * This is a specialized method that calls the MCP getPrompt API
   * to get the actual prompt content with substituted arguments.
   */
  async readPrompt(path: string, args: Record<string, string>): Promise<AFSReadResult> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    if (!normalizedPath.startsWith("/prompts/")) {
      return {
        data: undefined,
        message: `readPrompt only supported on /prompts/* paths, got: ${normalizedPath}`,
      };
    }

    if (!this.client) {
      return {
        data: undefined,
        message: "MCP client not connected",
      };
    }

    const promptName = normalizedPath.slice("/prompts/".length);
    const prompt = this._prompts.find((p) => p.name === promptName);

    if (!prompt) {
      return {
        data: undefined,
        message: `Prompt not found: ${promptName}`,
      };
    }

    try {
      // Call MCP getPrompt to get the actual prompt content
      const result = await this.client.getPrompt({
        name: promptName,
        arguments: args,
      });

      return {
        data: {
          id: `/prompts/${promptName}`,
          path: `/prompts/${promptName}`,
          summary: prompt.description,
          content: result.messages,
          meta: {
            arguments: prompt.arguments,
            mcp: {
              name: prompt.name,
              description: prompt.description,
              arguments: prompt.arguments,
            },
          },
        },
      };
    } catch (error: any) {
      return {
        data: undefined,
        message: `Failed to get prompt: ${error.message}`,
      };
    }
  }

  /**
   * Generate WORLD.md content describing this MCP server's capabilities
   */
  generateWorldMd(): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${this.name}`);
    lines.push("");
    if (this.description) {
      lines.push(this.description);
      lines.push("");
    }

    // Server Info
    lines.push("## Server Information");
    lines.push("");
    lines.push(`- **Name**: ${this.name}`);
    lines.push(`- **Transport**: ${this.options.transport}`);
    if (this.options.transport === "stdio") {
      lines.push(`- **Command**: ${this.options.command}`);
    } else {
      lines.push(`- **URL**: ${this.options.url}`);
    }
    lines.push("");

    // Capabilities Summary
    lines.push("## Capabilities");
    lines.push("");
    lines.push(`- Tools: ${this._tools.length}`);
    lines.push(`- Prompts: ${this._prompts.length}`);
    lines.push(`- Resources: ${this._resources.length}`);
    lines.push(`- Resource Templates: ${this._resourceTemplates.length}`);
    lines.push("");

    // Tools
    if (this._tools.length > 0) {
      lines.push("## Tools");
      lines.push("");
      for (const tool of this._tools) {
        lines.push(`### ${tool.name}`);
        lines.push("");
        if (tool.description) {
          lines.push(tool.description);
          lines.push("");
        }
        lines.push(`**Path**: \`/tools/${tool.name}\``);
        lines.push("");
        if (tool.inputSchema) {
          lines.push("**Input Schema**:");
          lines.push("```json");
          lines.push(JSON.stringify(tool.inputSchema, null, 2));
          lines.push("```");
          lines.push("");
        }
      }
    }

    // Prompts
    if (this._prompts.length > 0) {
      lines.push("## Prompts");
      lines.push("");
      for (const prompt of this._prompts) {
        lines.push(`### ${prompt.name}`);
        lines.push("");
        if (prompt.description) {
          lines.push(prompt.description);
          lines.push("");
        }
        lines.push(`**Path**: \`/prompts/${prompt.name}\``);
        lines.push("");
        if (prompt.arguments && prompt.arguments.length > 0) {
          lines.push("**Arguments**:");
          for (const arg of prompt.arguments) {
            const required = arg.required ? " (required)" : " (optional)";
            lines.push(`- \`${arg.name}\`${required}: ${arg.description || ""}`);
          }
          lines.push("");
        }
      }
    }

    // Resources
    if (this._resources.length > 0) {
      lines.push("## Resources");
      lines.push("");
      for (const resource of this._resources) {
        lines.push(`### ${resource.name}`);
        lines.push("");
        if (resource.description) {
          lines.push(resource.description);
          lines.push("");
        }
        lines.push(`**URI**: \`${resource.uri}\``);
        const afsPath = this.resourceUriToPath(resource.uri);
        if (afsPath) {
          lines.push(`**AFS Path**: \`${afsPath}\``);
        }
        if (resource.mimeType) {
          lines.push(`**MIME Type**: ${resource.mimeType}`);
        }
        lines.push("");
      }
    }

    // Resource Templates
    if (this._resourceTemplates.length > 0) {
      lines.push("## Resource Templates");
      lines.push("");
      for (const template of this._resourceTemplates) {
        lines.push(`### ${template.name}`);
        lines.push("");
        if (template.description) {
          lines.push(template.description);
          lines.push("");
        }
        lines.push(`**URI Template**: \`${template.uriTemplate}\``);
        const vars = AFSMCP.parseUriTemplate(template.uriTemplate);
        if (vars.length > 0) {
          lines.push(`**Variables**: ${vars.map((v) => `\`{${v}}\``).join(", ")}`);
        }
        if (template.mimeType) {
          lines.push(`**MIME Type**: ${template.mimeType}`);
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }

  // ========== Explain Handlers ==========

  /**
   * Explain root → server name, tools/prompts/resources counts
   */
  @Explain("/")
  async explainRoot(_ctx: RouteContext): Promise<AFSExplainResult> {
    await this.ensureConnected();

    const lines: string[] = [];
    lines.push(`# ${this.name}`);
    lines.push("");
    if (this.description) {
      lines.push(this.description);
      lines.push("");
    }
    lines.push("## Overview");
    lines.push("");
    lines.push(`- **Tool count**: ${this._tools.length}`);
    lines.push(`- **Prompt count**: ${this._prompts.length}`);
    lines.push(`- **Resource count**: ${this._resources.length}`);
    lines.push(`- **Resource template count**: ${this._resourceTemplates.length}`);
    lines.push("");

    if (this._tools.length > 0) {
      lines.push("## Tools");
      lines.push("");
      for (const tool of this._tools) {
        lines.push(`- **${tool.name}**: ${tool.description ?? "(no description)"}`);
      }
      lines.push("");
    }

    if (this._prompts.length > 0) {
      lines.push("## Prompts");
      lines.push("");
      for (const prompt of this._prompts) {
        const argNames = prompt.arguments?.map((a) => a.name).join(", ") ?? "";
        lines.push(
          `- **${prompt.name}**: ${prompt.description ?? "(no description)"}${argNames ? ` (args: ${argNames})` : ""}`,
        );
      }
      lines.push("");
    }

    if (this._resources.length > 0) {
      lines.push("## Resources");
      lines.push("");
      for (const resource of this._resources) {
        lines.push(`- **${resource.name}**: ${resource.description ?? resource.uri}`);
      }
      lines.push("");
    }

    return { format: "markdown", content: lines.join("\n") };
  }

  /**
   * Explain a specific tool → name, description, inputSchema
   */
  @Explain("/tools/:name")
  async explainTool(ctx: RouteContext<{ name: string }>): Promise<AFSExplainResult> {
    await this.ensureConnected();
    const tool = this._tools.find((t) => t.name === ctx.params.name);
    if (!tool) {
      throw new AFSNotFoundError(ctx.path, `Tool not found: ${ctx.params.name}`);
    }

    const lines: string[] = [];
    lines.push(`# Tool: ${tool.name}`);
    lines.push("");
    if (tool.description) {
      lines.push(tool.description);
      lines.push("");
    }
    if (tool.inputSchema) {
      lines.push("## Input Schema");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(tool.inputSchema, null, 2));
      lines.push("```");
      lines.push("");
      const props = (tool.inputSchema as Record<string, unknown>).properties as
        | Record<string, unknown>
        | undefined;
      if (props) {
        lines.push("## Parameters");
        lines.push("");
        for (const [key, val] of Object.entries(props)) {
          const prop = val as Record<string, unknown>;
          lines.push(
            `- **${key}** (${prop.type ?? "unknown"}): ${prop.description ?? "(no description)"}`,
          );
        }
        lines.push("");
      }
    }

    return { format: "markdown", content: lines.join("\n") };
  }

  /**
   * Explain a specific prompt → name, description, arguments
   */
  @Explain("/prompts/:name")
  async explainPrompt(ctx: RouteContext<{ name: string }>): Promise<AFSExplainResult> {
    await this.ensureConnected();
    const prompt = this._prompts.find((p) => p.name === ctx.params.name);
    if (!prompt) {
      throw new AFSNotFoundError(ctx.path, `Prompt not found: ${ctx.params.name}`);
    }

    const lines: string[] = [];
    lines.push(`# Prompt: ${prompt.name}`);
    lines.push("");
    if (prompt.description) {
      lines.push(prompt.description);
      lines.push("");
    }
    if (prompt.arguments && prompt.arguments.length > 0) {
      lines.push("## Arguments");
      lines.push("");
      for (const arg of prompt.arguments) {
        const required = arg.required ? " (required)" : " (optional)";
        lines.push(`- **${arg.name}**${required}: ${arg.description ?? "(no description)"}`);
      }
      lines.push("");
    } else {
      lines.push("*No arguments required.*");
      lines.push("");
    }

    return { format: "markdown", content: lines.join("\n") };
  }

  /**
   * Explain a specific resource → name, URI, description
   */
  @Explain("/resources/:path+")
  async explainResource(ctx: RouteContext<{ path: string }>): Promise<AFSExplainResult> {
    await this.ensureConnected();
    const resourcePath = `/${ctx.params.path}`;

    const resourceMatch = this.findResourceForPath(resourcePath);
    if (resourceMatch?.resource) {
      const resource = resourceMatch.resource;
      const lines: string[] = [];
      lines.push(`# Resource: ${resource.name}`);
      lines.push("");
      if (resource.description) {
        lines.push(resource.description);
        lines.push("");
      }
      lines.push(`- **URI**: ${resource.uri}`);
      if (resource.mimeType) {
        lines.push(`- **MIME Type**: ${resource.mimeType}`);
      }
      lines.push("");
      return { format: "markdown", content: lines.join("\n") };
    }

    if (resourceMatch?.template) {
      const template = resourceMatch.template;
      const lines: string[] = [];
      lines.push(`# Resource Template: ${template.name}`);
      lines.push("");
      if (template.description) {
        lines.push(template.description);
        lines.push("");
      }
      lines.push(`- **URI Template**: ${template.uriTemplate}`);
      const vars = AFSMCP.parseUriTemplate(template.uriTemplate);
      if (vars.length > 0) {
        lines.push(`- **Variables**: ${vars.join(", ")}`);
      }
      lines.push("");
      return { format: "markdown", content: lines.join("\n") };
    }

    throw new AFSNotFoundError(ctx.path, `Resource not found: ${ctx.path}`);
  }

  // ========== Search Handler ==========

  /**
   * Search tools, prompts, and resources by name or description
   */
  @Search("/:path*")
  async searchHandler(
    _ctx: RouteContext<{ path?: string }>,
    query: string,
    options?: { limit?: number; caseSensitive?: boolean },
  ): Promise<AFSSearchResult> {
    await this.ensureConnected();

    const results: AFSEntry[] = [];
    const limit = options?.limit;

    // Escape regex special characters to prevent injection
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = options?.caseSensitive ? "" : "i";
    const pattern = new RegExp(escapedQuery, flags);
    const matchAll = query === "";

    // Search tools
    for (const tool of this._tools) {
      if (limit && results.length >= limit) break;
      if (
        matchAll ||
        pattern.test(tool.name) ||
        (tool.description && pattern.test(tool.description))
      ) {
        results.push(this.toolToEntry(tool));
      }
    }

    // Search prompts
    for (const prompt of this._prompts) {
      if (limit && results.length >= limit) break;
      if (
        matchAll ||
        pattern.test(prompt.name) ||
        (prompt.description && pattern.test(prompt.description))
      ) {
        results.push(this.promptToEntry(prompt));
      }
    }

    // Search resources
    for (const resource of this._resources) {
      if (limit && results.length >= limit) break;
      if (
        matchAll ||
        pattern.test(resource.name) ||
        (resource.description && pattern.test(resource.description))
      ) {
        const path = this.resourceUriToPath(resource.uri);
        results.push(this.resourceToEntry(resource, `/resources${path}`));
      }
    }

    return { data: results };
  }

  // ========== Exec Handlers ==========

  /**
   * Execute a tool
   */
  @Exec("/tools/:name")
  async execToolHandler(
    ctx: RouteContext<{ name: string }>,
    args: Record<string, any>,
  ): Promise<AFSExecResult> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    const tool = this._tools.find((t) => t.name === ctx.params.name);

    if (!tool) {
      throw new Error(`Tool not found: ${ctx.params.name}`);
    }

    // Call the MCP tool
    const result = await this.client.callTool({
      name: ctx.params.name,
      arguments: args,
    });

    return {
      success: true,
      data: result as Record<string, any>,
    };
  }
}

// Type check for AFSModuleClass compliance
const _typeCheck: AFSModuleClass<AFSMCP, AFSMCPOptions> = AFSMCP;

export default AFSMCP;
