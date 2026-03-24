import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSHttpClient, createAFSHttpHandler } from "@aigne/afs-http";
import { AFSJSON } from "@aigne/afs-json";
import type { PlaygroundSetup } from "@aigne/afs-testing";

const httpTestData = {
  root: "root content",
  readme: "# Hello World",
  docs: {
    guide: "Guide content",
    api: "API documentation",
  },
  scratch: {
    existing: "existing content",
    toDelete: "delete me",
  },
};

export async function setupPlayground(_tempDir: string): Promise<PlaygroundSetup> {
  // Create a JSON-based AFS module to serve
  const jsonFilePath = join(tmpdir(), `afs-integration-http-${Date.now()}.json`);
  await writeFile(jsonFilePath, JSON.stringify(httpTestData, null, 2));

  const backendModule = new AFSJSON({
    jsonPath: jsonFilePath,
    accessMode: "readwrite",
  });

  // Create HTTP handler
  const handler = createAFSHttpHandler({ module: backendModule });

  // Start a Bun HTTP server
  const server = Bun.serve({
    port: 0, // random port
    fetch: handler,
  });
  const baseUrl = `http://localhost:${server.port}`;

  const provider = new AFSHttpClient({
    url: baseUrl,
    name: "http-test",
    description: "HTTP integration test",
    allowPrivateNetwork: true,
  });

  return {
    name: "AFSHttpClient",
    mountPath: "/http",
    provider,
    uri: baseUrl,
    cleanup: async () => {
      server?.stop();
      await rm(jsonFilePath, { force: true });
    },
  };
}
