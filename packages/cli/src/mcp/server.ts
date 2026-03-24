/**
 * AFS MCP Server
 *
 * Creates an MCP Server that exposes AFS operations as MCP tools,
 * resources, and prompts.
 */

import type { AFS } from "@aigne/afs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VERSION } from "../version.js";
import { registerDIDTools } from "./did-tools.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

export interface CreateAFSMcpServerOptions {
  /** AFS instance to expose */
  afs: AFS;
  /** Pre-created McpServer instance. If not provided, a new one is created. */
  server?: McpServer;
  /** Working directory for DID tools (defaults to process.cwd()) */
  cwd?: string;
}

export interface AFSMcpServerResult {
  /** The MCP server instance */
  server: McpServer;
}

/**
 * Create a new McpServer instance with AFS capabilities.
 * Useful when you need the server before AFS is created (e.g. for MCP auth context).
 */
export function createMcpServerInstance(): McpServer {
  return new McpServer(
    { name: "afs", version: VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );
}

/**
 * Build MCP instructions string from AFS instance.
 * Includes base AFS description + dynamically mounted provider details.
 */
function buildInstructions(afs: AFS): string {
  const lines: string[] = [];

  lines.push(
    "AFS (Agentic File System) is a virtual filesystem developed by ArcBlock that gives AI agents a unified, path-based interface to any data source.",
  );
  lines.push(
    'Inspired by Unix and Plan 9\'s "everything is a file", AFS extends the idea to "everything is context" — databases, APIs, smart home devices, and cloud services all become files and directories that agents can read, write, search, and act on.',
  );
  lines.push(
    "All data sources are accessed through a consistent path-based API with standard operations: read, list, stat, explain, search, write, delete, exec.",
  );
  lines.push("");
  lines.push("## Mounted Providers");
  lines.push("");

  const mounts = afs.getMounts(null);
  if (mounts.length === 0) {
    lines.push("No providers currently mounted.");
  } else {
    for (const m of mounts) {
      const desc = m.module.description;
      lines.push(`### ${m.module.name} (${m.path})`);
      if (desc) {
        for (const line of desc.split("\n")) {
          lines.push(line);
        }
      }
      lines.push("");
    }
  }

  lines.push("## Usage");
  lines.push("");
  lines.push("- Use `afs_list` to browse directories and discover content");
  lines.push("- Use `afs_read` to read file/node content");
  lines.push("- Use `afs_stat` to get metadata without content");
  lines.push("- Use `afs_explain` to get documentation for any path");
  lines.push("- Use `afs_search` to find content by pattern");
  lines.push("- Use `afs_write` to create or update content");
  lines.push("- Use `afs_delete` to remove files or nodes");
  lines.push("- Use `afs_exec` to execute actions (e.g., `/.actions/mount`)");
  lines.push("");
  lines.push(
    "Start with `afs_list /` to see all mounted providers, or `afs_explain /` for a complete overview.",
  );

  return lines.join("\n");
}

/**
 * Create an MCP Server that exposes AFS operations as tools,
 * resources, and prompts.
 *
 * If `options.server` is provided, registers on that server instead of creating a new one.
 */
export function createAFSMcpServer(options: CreateAFSMcpServerOptions): AFSMcpServerResult {
  const { afs } = options;
  const server = options.server ?? createMcpServerInstance();

  // Set instructions dynamically — includes mounted provider info
  // Access the underlying Server's private _instructions field
  (server.server as unknown as Record<string, unknown>)._instructions = buildInstructions(afs);

  registerTools(server, afs);
  registerDIDTools(server, options.cwd ?? process.cwd());
  registerResources(server, afs);
  registerPrompts(server, afs);

  return { server };
}
