import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AFSMCP } from "@aigne/afs-mcp";
import type { PlaygroundSetup } from "@aigne/afs-testing";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setupPlayground(_tempDir: string): Promise<PlaygroundSetup> {
  const serverBinPath = resolve(__dirname, "../node_modules/.bin/mcp-server-everything");

  const mcpInstance = new AFSMCP({
    name: "everything",
    description: "Everything MCP server",
    transport: "stdio",
    command: serverBinPath,
    args: [],
  });
  await mcpInstance.connect();

  return {
    name: "AFSMCP",
    mountPath: "/mcp",
    provider: mcpInstance,
    uri: `mcp+stdio://${serverBinPath}`,
    cleanup: async () => {
      await mcpInstance?.disconnect();
    },
  };
}
