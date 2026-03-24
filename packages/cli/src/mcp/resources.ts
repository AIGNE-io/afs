/**
 * AFS MCP Resources Registration
 *
 * Registers the afs:///mounts resource that exposes mount point information.
 */

import type { AFS } from "@aigne/afs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register MCP resources on the server.
 */
export function registerResources(server: McpServer, afs: AFS): void {
  server.resource(
    "mounts",
    "afs:///mounts",
    {
      description: "List of all mounted AFS providers",
      mimeType: "application/json",
    },
    async () => {
      const mounts = afs.getMounts();
      const safeList = mounts.map((m) => ({
        path: m.path,
        name: m.module.name,
        accessMode: m.module.accessMode ?? "readonly",
      }));

      return {
        contents: [
          {
            uri: "afs:///mounts",
            mimeType: "application/json",
            text: JSON.stringify(safeList, null, 2),
          },
        ],
      };
    },
  );
}
