import type { AFS } from "@aigne/afs";
import { type ConfigManager, ExplorerWSServer, type WSServerOptions } from "./ws-server.js";

export { ExplorerWSServer, type ConfigManager, type WSServerOptions };

/**
 * Start the AFS Explorer web server (Bun.serve + WebSocket JSON-RPC)
 * @param afs - The AFS instance to explore
 * @param options - Server options
 * @returns Object with port, url, and stop function
 */
export async function startExplorer(
  afs: AFS,
  options: WSServerOptions = {},
): Promise<{ port: number; url: string; stop: () => void }> {
  const server = new ExplorerWSServer(afs, options);
  const info = await server.start();
  return { ...info, stop: () => server.stop() };
}
