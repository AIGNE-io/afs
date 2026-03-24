/**
 * AFS MCP Prompts Registration
 *
 * Registers the "explore" prompt that provides a usage guide with dynamic mount info.
 */

import type { AFS } from "@aigne/afs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register MCP prompts on the server.
 */
export function registerPrompts(server: McpServer, afs: AFS): void {
  server.prompt(
    "explore",
    "Explore the AFS virtual filesystem and learn how to use it",
    async () => {
      const mounts = afs.getMounts();
      const mountList = mounts.map((m) => {
        const mode = m.module.accessMode ?? "readonly";
        return `  - ${m.path} (${m.module.name}, ${mode})`;
      });

      const mountSection =
        mountList.length > 0
          ? `## Current Mounts\n\n${mountList.join("\n")}`
          : "## Current Mounts\n\nNo providers are currently mounted.";

      const guide = `# AFS Explorer Guide

AFS (Agentic File System) provides a unified interface to access various data sources.
Use these tools to navigate and interact with the mounted providers:

## Available Tools

- **afs_list** — List directory contents at a path. Start with \`afs_list /\` to see all mount points.
- **afs_read** — Read the content of a file or entry.
- **afs_stat** — Get metadata (size, type, children count) for any path.
- **afs_search** — Search for content within a path subtree.
- **afs_explain** — Get a human-readable explanation of a path or topic.
- **afs_write** — Write content to a path (if the provider supports it).
- **afs_delete** — Delete a file or directory.
- **afs_exec** — Execute an action. Use \`afs_list {path}/.actions\` to discover available actions.
- **did_info** — Show DID identity and credential information for a provider
- **did_init** — Generate DID identity for developer, provider, or blocklet
- **did_issue** — Issue verifiable credential (self-sign)
- **did_verify** — Verify existing credential and determine trust level
- **did_issuer_list** — List all trusted issuers in the trust store
- **did_issuer_add** — Add a trusted issuer (from key file, VC proof, or manual DID+PK)
- **did_issuer_remove** — Remove a trusted issuer
- **did_issuer_inspect** — Show detailed information about a trusted issuer

## Getting Started

1. Run \`afs_list /\` to see all mount points
2. Pick a mount and run \`afs_list /mount-path\` to explore its contents
3. Use \`afs_read\` to view files, \`afs_stat\` for metadata
4. Use \`afs_list {path}/.actions\` to discover executable actions
5. Mount new providers: \`afs_exec /.actions/mount {uri, path}\` or via registry \`afs_exec /registry/.../.actions/mount\`
6. Unmount providers: \`afs_exec /.actions/unmount {path}\`

${mountSection}`;

      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: guide },
          },
        ],
      };
    },
  );
}
