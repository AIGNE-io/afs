/**
 * AFS Conformance Test Suite — Launcher helper
 *
 * Starts a test server using the TS reference implementation:
 * - Copies fixtures to a temp directory (so tests can modify without affecting originals)
 * - Creates a FS provider (AFSFS) pointed at the temp dir
 * - Wraps it in an HTTP server using createAFSHttpHandler
 * - Returns the URL
 *
 * L1/L2: single FS provider mounted at root
 * L3: AFS compositor with multiple FS providers at different mount paths
 *
 * Usage:
 *   const { url, close } = await launchTestServer({ fixturesDir: "./fixtures" });
 *   // run tests against url
 *   await close();
 */

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface LaunchOptions {
  /** Path to fixtures directory */
  fixturesDir: string;

  /** Port to listen on (0 = auto-assign) */
  port?: number;

  /** Whether the provider should be writable */
  writable?: boolean;

  /**
   * Mount map for L3+ core tests.
   * Each key is a mount path, value is a subdirectory under fixturesDir.
   * Example: { "/alpha": "provider-a", "/beta": "provider-b" }
   *
   * When set, launches an AFS compositor instead of a single provider.
   */
  mounts?: Record<string, string>;

  /**
   * Security config for L5 tests.
   * Applied to all providers after mount.
   */
  security?: {
    actionPolicy?: "safe" | "standard" | "full";
    blockedActions?: string[];
    allowedActions?: string[];
  };
}

export interface LaunchResult {
  /** Full URL to the RPC endpoint */
  url: string;

  /** Port the server is listening on */
  port: number;

  /** Path to the temp directory holding the fixtures copy */
  tempDir: string;

  /** Stop the server and clean up temp directory */
  close: () => Promise<void>;
}

/**
 * Launch a test AFS HTTP server backed by a filesystem provider.
 *
 * Copies fixtures to a temp directory so tests that write/delete
 * don't modify the original fixtures. The temp directory is cleaned
 * up when close() is called.
 *
 * Dynamically imports @aigne/afs-fs and @aigne/afs-http to avoid
 * hard compile-time dependency — the conformance runner can work
 * without these packages (e.g. testing a remote server).
 */
export async function launchTestServer(options: LaunchOptions): Promise<LaunchResult> {
  const { fixturesDir, port = 0, writable = true, mounts, security } = options;
  const absFixturesDir = resolve(fixturesDir);

  // Copy fixtures to a temp directory
  const tempDir = mkdtempSync(join(tmpdir(), "afs-conformance-"));
  cpSync(absFixturesDir, tempDir, { recursive: true });

  // Dynamic import to avoid hard dependency
  const [{ AFSFS }, { createAFSHttpHandler }] = await Promise.all([
    import("@aigne/afs-fs") as Promise<{
      AFSFS: new (opts: { localPath: string; accessMode?: string }) => any;
    }>,
    import("@aigne/afs-http") as Promise<{
      createAFSHttpHandler: (opts: { module: any }) => (req: Request) => Promise<Response>;
    }>,
  ]);

  const accessMode = writable ? "readwrite" : "readonly";

  // Build the module: single provider (L1/L2) or AFS compositor (L3)
  let module: any;

  /** Apply security config to a provider */
  function applySecurityConfig(provider: any): void {
    if (!security) return;
    if (security.actionPolicy) provider.actionPolicy = security.actionPolicy;
    if (security.blockedActions) provider.blockedActions = security.blockedActions;
    if (security.allowedActions) provider.allowedActions = security.allowedActions;
  }

  if (mounts) {
    // L3+: multi-mount AFS compositor
    const { AFS } = (await import("@aigne/afs")) as {
      AFS: new () => any;
    };
    const afs = new AFS();
    for (const [mountPath, subdir] of Object.entries(mounts)) {
      const provider = new AFSFS({
        localPath: join(tempDir, subdir),
        accessMode,
      });
      applySecurityConfig(provider);
      await afs.mount(provider, mountPath);
    }
    module = afs;
  } else {
    // L1/L2: single provider at root
    const provider = new AFSFS({
      localPath: tempDir,
      accessMode,
    });
    applySecurityConfig(provider);
    if (typeof provider.ready === "function") {
      await provider.ready();
    }
    module = provider;
  }

  // Create the HTTP handler
  const handler = createAFSHttpHandler({ module });

  // Create a Node.js HTTP server that bridges to the Web Standard handler
  const server = createServer(async (req, res) => {
    try {
      // Read the body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks).toString("utf-8");

      // Build a Web Standard Request
      const url = `http://localhost${req.url}`;
      const webRequest = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === "POST" ? body : undefined,
      });

      // Call the handler
      const webResponse = await handler(webRequest);

      // Write the response
      res.writeHead(webResponse.status, {
        "Content-Type": webResponse.headers.get("Content-Type") || "application/json",
      });
      const responseBody = await webResponse.text();
      res.end(responseBody);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: false,
          error: {
            code: 5,
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    }
  });

  return new Promise<LaunchResult>((resolvePromise, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to get server address"));
        return;
      }
      const actualPort = addr.port;
      const url = `http://127.0.0.1:${actualPort}/rpc`;

      resolvePromise({
        url,
        port: actualPort,
        tempDir,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => {
              // Clean up temp directory
              try {
                rmSync(tempDir, { recursive: true, force: true });
              } catch {
                // best effort cleanup
              }
              if (typeof module.close === "function") {
                module.close().then(res, res);
              } else {
                res();
              }
            });
          }),
      });
    });
  });
}
