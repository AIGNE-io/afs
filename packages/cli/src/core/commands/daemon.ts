/**
 * AFS Service Command
 *
 * Manages the AFS background service process.
 * Subcommands: start, stop, status, restart, _run (hidden)
 *
 * File is named daemon.ts for historical reasons; the user-facing command is "service".
 */

import type { CommandModule } from "yargs";
import { colors } from "../../ui/index.js";
import type { CommandFactoryOptions } from "./types.js";

export interface ServiceArgs {
  port: number;
  cwd?: string;
}

/** No-op formatter for lifecycle commands that manage their own output. */
const noopFormat = () => "";

/** Print endpoint table for a running service. */
function printEndpoints(url: string, siteNames?: string[]): void {
  console.log("");
  console.log(`  ${colors.dim("Endpoints:")}`);
  console.log(`    ${colors.brightCyan(`${url}/`)}${colors.dim("           AUP Web Client")}`);
  console.log(`    ${colors.brightCyan(`${url}/explorer`)}${colors.dim("    Explorer UI")}`);
  console.log(
    `    ${colors.brightCyan(`${url}/ws`)}${colors.dim("          WebSocket (Explorer)")}`,
  );
  console.log(`    ${colors.brightCyan(`${url}/afs/*`)}${colors.dim("       REST API")}`);
  console.log(
    `    ${colors.brightCyan(`${url}/mcp`)}${colors.dim("         MCP Streamable HTTP")}`,
  );
  if (siteNames && siteNames.length > 0) {
    console.log(
      `    ${colors.brightCyan(`${url}/sites`)}${colors.dim(`       Site Portal (${siteNames.length} site${siteNames.length > 1 ? "s" : ""})`)}`,
    );
    for (const name of siteNames) {
      console.log(`      ${colors.dim("→")} ${colors.brightCyan(`${url}/sites/${name}`)}`);
    }
  }
}

export function createServiceCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ServiceArgs> {
  return {
    command: "service <action>",
    describe: "Manage AFS background service",
    builder: (yargs) =>
      yargs
        .positional("action", {
          type: "string",
          choices: ["start", "stop", "status", "restart"],
          description: "Service action",
        })
        .option("port", {
          type: "number",
          default: 4900,
          description: "Port for service",
        })
        .option("cwd", {
          type: "string",
          hidden: true,
          description: "Working directory (used by _run)",
        }) as any,
    handler: async (argv) => {
      const action = (argv as any).action as string;
      const { getDaemonStatus, stopDaemon, spawnDaemon, getLogFile } = await import(
        "../../daemon/manager.js"
      );

      switch (action) {
        case "start": {
          const existing = await getDaemonStatus();
          if (existing) {
            console.log(
              `${colors.yellow("Service already running")} (PID ${existing.pid}, port ${existing.port})`,
            );
            printEndpoints(existing.url);
            return;
          }

          console.log(colors.dim("Starting AFS service..."));

          try {
            const info = await spawnDaemon(argv.port);
            console.log(colors.green("AFS Service started"));
            console.log(`  ${colors.dim("PID:")}  ${info.pid}`);
            console.log(`  ${colors.dim("Port:")} ${info.port}`);
            console.log(`  ${colors.dim("Log:")}  ${getLogFile()}`);
            printEndpoints(info.url);
          } catch (err) {
            console.error(colors.red(`Failed to start service: ${(err as Error).message}`));
            process.exitCode = 1;
          }
          break;
        }

        case "_run": {
          // Hidden subcommand — the actual service process (runs in detached child)

          // Install crash handlers immediately — before any async work.
          // Without these, uncaught errors kill the process with no trace in the log.
          const logTs = () => new Date().toISOString();
          process.on("uncaughtException", (err) => {
            console.error(`[${logTs()}] FATAL uncaughtException: ${err.stack || err.message}`);
            process.exit(1);
          });
          process.on("unhandledRejection", (reason) => {
            const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
            console.error(`[${logTs()}] FATAL unhandledRejection: ${msg}`);
            process.exit(1);
          });

          // Always use home directory for config discovery — daemon serves a
          // global AFS instance, independent of which directory it was started from.
          const { homedir } = await import("node:os");
          const cwd = argv.cwd ?? homedir();
          const { createAFS } = await import("../../config/afs-loader.js");
          const { startDaemonServer } = await import("../../daemon/server.js");
          const { DaemonConfigManager } = await import("../../daemon/config-manager.js");
          const { writePidFile, writePortFile, ensureDaemonDir, cleanPidFiles } = await import(
            "../../daemon/manager.js"
          );
          const { createCredentialStore } = await import("../../credential/store.js");

          const { afs, failures, configMountPaths, registry, storage } = await createAFS(cwd, {
            credentialStore: createCredentialStore(),
            // No authContext — daemon is non-interactive, relies on stored credentials
          });

          if (failures.length > 0) {
            console.warn(`[${logTs()}] ${failures.length} provider(s) failed to mount:`);
            for (const f of failures) {
              console.warn(`  ${f.path}: ${f.reason}`);
            }
          }

          // Wire portal behavior into the AFSUIProvider (already mounted by config or fresh)
          let portalWebBackend:
            | {
                injectConnection(conn: any, headers?: Record<string, string | undefined>): void;
                getSessionBlocklet?(sessionId: string): string | undefined;
              }
            | undefined;
          try {
            const uiMod = "@aigne/afs-ui";
            const { AFSUIProvider, WebBackend, setupPortal } = (await import(
              /* webpackIgnore: true */ uiMod
            )) as typeof import("@aigne/afs-ui");

            // Find existing /ui mount (from config) or create a fresh one
            const existingMount = afs.getMounts().find((m) => m.path === "/ui");
            let uiProvider: InstanceType<typeof AFSUIProvider> | undefined;

            if (existingMount && existingMount.module instanceof AFSUIProvider) {
              uiProvider = existingMount.module;
            } else if (!existingMount) {
              // No /ui in config — mount a fresh WebBackend-based provider
              const webBackend = new WebBackend(); // no listen() — connections injected externally
              uiProvider = new AFSUIProvider({ backend: webBackend, pagesDir: false });
              await afs.mount(uiProvider, "/ui");
            }

            if (uiProvider) {
              // Extract WebBackend for connection injection (works with both config and fresh)
              const backend = (uiProvider as any).backend as InstanceType<typeof WebBackend>;
              if (backend && typeof backend.injectConnection === "function") {
                portalWebBackend = backend;
              }

              // Auto-detect default blocklet from local blocklets/ directory
              let detectedDefaultBlocklet: string | undefined;
              {
                const { join } = await import("node:path");
                const { existsSync, readdirSync } = await import("node:fs");
                const searchDirs = [join(cwd, "blocklets"), join(process.cwd(), "blocklets")];
                const processDir = process.env.AFS_PROJECT_DIR;
                if (processDir) searchDirs.push(join(processDir, "blocklets"));
                for (const dir of searchDirs) {
                  if (!existsSync(dir)) continue;
                  const entries = readdirSync(dir, { withFileTypes: true });
                  const blockletDirs = entries.filter(
                    (e) => e.isDirectory() && existsSync(join(dir, e.name, "blocklet.yaml")),
                  );
                  if (blockletDirs.length > 0) {
                    detectedDefaultBlocklet = blockletDirs[0]!.name;
                    break;
                  }
                }
              }

              // Wire portal behavior — builds desktop tree on first session start
              // Pass blocklet resolver for ?blocklet=name URL param support
              setupPortal(uiProvider, afs, {
                tone: "clean",
                palette: "warm",
                defaultBlocklet: detectedDefaultBlocklet,
                getSessionBlocklet: (sessionId: string) => backend?.getSessionBlocklet?.(sessionId),
                consumeSessionInitialPage: (sessionId: string) =>
                  backend?.consumeSessionInitialPage?.(sessionId),
                consumeSessionInitialLocale: (sessionId: string) =>
                  backend?.consumeSessionInitialLocale?.(sessionId),
                // System blocklets — code in AFS kernel, no JS execution
                systemBlocklets: {
                  sites: {
                    pageTree: () =>
                      ({
                        id: "sites-root",
                        type: "afs-list",
                        src: "/web/sites",
                        props: {
                          layout: "list",
                          itemStyle: "card",
                          pageSize: 12,
                          searchable: true,
                          labelField: "meta.domain",
                          descriptionField: "meta.status",
                          emptyText: "No sites",
                        },
                      }) as any,
                  },
                },
                resolveBlocklet: (() => {
                  // Cache resolved blocklet modules per template — AUP pages shared across instances
                  const templateCache = new Map<string, import("@aigne/afs-ui").BlockletModule>();

                  return async (name: string) => {
                    // Return cached if already resolved
                    const cached = templateCache.get(name);
                    if (cached) return cached;

                    // Step 1: Find the blocklet directory on disk
                    const blockletDir = findLocalBlockletDir(name, cwd);
                    if (!blockletDir) {
                      console.warn(
                        `[${logTs()}] Blocklet "${name}" not found on disk (cwd=${cwd}, AFS_PROJECT_DIR=${process.env.AFS_PROJECT_DIR})`,
                      );
                      return null;
                    }

                    // Step 2: Mount the blocklet code directory to AFS
                    const blockletMount = `/blocklets/${name}`;
                    try {
                      const existing = afs
                        .getMounts(null)
                        .find((m: { path: string }) => m.path === blockletMount);
                      if (!existing) {
                        const fsMod = "@aigne/afs-fs";
                        const { AFSFS } = (await import(
                          /* webpackIgnore: true */ fsMod
                        )) as typeof import("@aigne/afs-fs");
                        const fsProvider = new AFSFS({
                          localPath: blockletDir,
                          description: `Blocklet "${name}"`,
                        });
                        await afs.mount(fsProvider, blockletMount);
                        console.log(`[${logTs()}] Mounted blocklet "${name}" at ${blockletMount}`);
                      }
                    } catch (err) {
                      console.warn(
                        `[${logTs()}] Failed to mount blocklet: ${err instanceof Error ? err.message : err}`,
                      );
                      return null;
                    }

                    // Step 3: Resolve AUP pages through AFS (before activate replaces the mount)
                    const blockletMod = await resolveBlockletFromAFS(
                      name,
                      blockletMount,
                      afs,
                      blockletDir,
                      logTs,
                    );

                    if (blockletMod) templateCache.set(name, blockletMod);
                    return blockletMod;
                  };
                })(),
              });

              // Wrap onSessionStart to activate blocklet instance and bind per-session Runtime AFS
              if (uiProvider.onSessionStart) {
                const originalOnSessionStart = uiProvider.onSessionStart;
                uiProvider.onSessionStart = async (sessionId, logic) => {
                  // Let setupPortal resolve AUP pages first
                  await originalOnSessionStart(sessionId, logic);

                  const blockletName =
                    backend?.getSessionBlocklet?.(sessionId) ?? detectedDefaultBlocklet;
                  if (!blockletName || !backend) return;

                  // Determine instance ID: ?instanceId= URL param, or default (blocklet name)
                  const instanceId = (backend as any).getSessionInstanceId?.(sessionId) as
                    | string
                    | undefined;
                  // All instances mount under /blocklets/{id} — no sub-directories
                  // Named instances use {blockletName}_{instanceId} to ensure global uniqueness
                  const instanceMount = `/blocklets/${instanceId ? `${blockletName}_${instanceId}` : blockletName}`;

                  // Register instance mount so listBlockletMounts can find it
                  if (!pendingInstanceMounts.has(instanceMount)) {
                    const blockletDir = findLocalBlockletDir(blockletName, cwd);
                    if (blockletDir) {
                      pendingInstanceMounts.set(instanceMount, {
                        mountPath: instanceMount,
                        installPath: blockletDir,
                      });
                    }
                  }

                  // Activate this instance on demand — with lock to prevent concurrent activation
                  if (!blockletManager.getActivatedBlocklets().includes(instanceMount)) {
                    // Wait for any in-flight activation of the same instance
                    const existing = activationLocks.get(instanceMount);
                    if (existing) {
                      await existing;
                    } else {
                      const activationPromise = (async () => {
                        // Mount blocklet code at the instance path so createBlockletAFS can read it
                        const existingMount = afs
                          .getMounts(null)
                          .find((m: { path: string }) => m.path === instanceMount);
                        if (!existingMount) {
                          const blockletDir = findLocalBlockletDir(blockletName, cwd);
                          if (blockletDir) {
                            const fsMod = "@aigne/afs-fs";
                            const { AFSFS } = (await import(
                              /* webpackIgnore: true */ fsMod
                            )) as typeof import("@aigne/afs-fs");
                            const fsProvider = new AFSFS({
                              localPath: blockletDir,
                              description: `Blocklet "${blockletName}" instance "${instanceId}"`,
                            });
                            await afs.mount(fsProvider, instanceMount);
                          }
                        }
                        try {
                          await blockletManager.activate(instanceMount);
                          console.log(
                            `[${logTs()}] Activated blocklet "${blockletName}"${instanceId ? ` instance "${instanceId}"` : ""} on demand`,
                          );
                        } catch (err) {
                          console.warn(
                            `[${logTs()}] Blocklet "${blockletName}"${instanceId ? ` instance "${instanceId}"` : ""} activation failed: ${err instanceof Error ? err.message : err}`,
                          );
                        }
                      })();
                      activationLocks.set(instanceMount, activationPromise);
                      try {
                        await activationPromise;
                      } finally {
                        activationLocks.delete(instanceMount);
                      }
                    }
                  }

                  // Bind session to the instance's Runtime AFS
                  const mount = afs
                    .getMounts(null)
                    .find((m: { path: string }) => m.path === instanceMount);
                  if (mount?.module) {
                    (backend as any).setSessionAFS(sessionId, mount.module as any);
                    console.log(
                      `[${logTs()}] Session ${sessionId} bound to Runtime AFS at ${instanceMount}`,
                    );
                  }
                };
              }
            }
          } catch (err) {
            console.warn(
              `[${logTs()}] UI provider setup failed: ${err instanceof Error ? err.message : err}`,
            );
          }

          const configManager = new DaemonConfigManager({
            cwd,
            afs,
            registry,
            configMountPaths,
            failures: failures.map((f) => ({ path: f.path, uri: "", reason: f.reason })),
            onConfigChanged: (added, removed) => {
              if (serverInfo?.server) {
                serverInfo.server.broadcast("configReloaded", { added, removed });
              }
            },
          });
          configManager.startWatching();

          // Initialize BlockletManager for on-demand blocklet activation
          const { BlockletManager } = await import("../../program/blocklet-manager.js");
          const { scanBlockletTriggers } = await import(
            "../../program/blocklet-trigger-scanner.js"
          );
          const { join: joinPath } = await import("node:path");
          const { existsSync, mkdirSync, readdirSync, cpSync } = await import("node:fs");

          const userDataRoot = joinPath(cwd, ".afs-config", "data");
          // Dynamic instance mounts — registered by onSessionStart before activate
          const pendingInstanceMounts = new Map<
            string,
            { mountPath: string; installPath: string }
          >();
          // Activation locks — prevents concurrent activate calls for the same instance
          const activationLocks = new Map<string, Promise<void>>();
          const blockletManager = new BlockletManager({
            globalAFS: afs,
            createProvider: afs.createProviderFromMount,
            listBlockletMounts: storage
              ? async () => {
                  // DID Space mode: list from storage mount table
                  const mounts = await storage.listMounts();
                  return mounts
                    .filter((m) => m.path.startsWith("/blocklets/"))
                    .map((m) => ({ mountPath: m.path, installPath: m.uri }));
                }
              : async () => {
                  // Scan blocklets/ directories — no config.toml dependency
                  const searchDirs = [joinPath(cwd, "blocklets")];
                  const actualCwd = process.cwd();
                  if (actualCwd !== cwd) searchDirs.push(joinPath(actualCwd, "blocklets"));
                  const projectDir = process.env.AFS_PROJECT_DIR;
                  if (projectDir && projectDir !== cwd && projectDir !== actualCwd) {
                    searchDirs.push(joinPath(projectDir, "blocklets"));
                  }
                  const results: { mountPath: string; installPath: string }[] = [];
                  const seen = new Set<string>();
                  for (const dir of searchDirs) {
                    if (!existsSync(dir)) continue;
                    const entries = readdirSync(dir, { withFileTypes: true });
                    for (const e of entries) {
                      if (
                        e.isDirectory() &&
                        !seen.has(e.name) &&
                        existsSync(joinPath(dir, e.name, "blocklet.yaml"))
                      ) {
                        seen.add(e.name);
                        results.push({
                          mountPath: `/blocklets/${e.name}`,
                          installPath: joinPath(dir, e.name),
                        });
                      }
                    }
                  }
                  // Also include any dynamically registered instance mounts
                  for (const mp of pendingInstanceMounts.keys()) {
                    if (!results.some((r) => r.mountPath === mp)) {
                      results.push(pendingInstanceMounts.get(mp)!);
                    }
                  }
                  return results;
                },
            scanTriggers: async (blockletDir: string) => {
              let compile = null;
              try {
                // Dynamic import — @aigne/ash is an optional peer dependency
                const ashModule = "@aigne/ash";
                const mod = await import(/* webpackIgnore: true */ ashModule);
                compile = mod.compileSource;
              } catch {
                // @aigne/ash not available — use regex fallback
              }
              return scanBlockletTriggers(blockletDir, compile);
            },
            dataDir: storage
              ? (mountPath: string) => mountPath.replace(/^\/blocklets\//, "")
              : (mountPath: string) => {
                  // mountPath is /blocklets/{instanceId}
                  const blockletId = mountPath.replace(/^\/blocklets\//, "");
                  const dataDirName = `blocklets_${blockletId}`;
                  const dataDir = joinPath(userDataRoot, dataDirName);
                  // Create data dir from seed if it doesn't exist
                  if (!existsSync(dataDir)) {
                    mkdirSync(dataDir, { recursive: true });
                    // Find blocklet source dir from pending mounts or by blocklet ID
                    const pending = pendingInstanceMounts.get(mountPath);
                    const seedSource =
                      pending?.installPath ?? findLocalBlockletDir(blockletId, cwd);
                    const seedDir = seedSource ? joinPath(seedSource, "seed") : null;
                    if (seedDir && existsSync(seedDir)) {
                      cpSync(seedDir, dataDir, { recursive: true });
                      console.log(`[${logTs()}] Initialized data for "${dataDirName}" from seed`);
                    }
                  }
                  return dataDir;
                },
            createDataProvider: afs.options.createDataProvider,
            readMountOverrides: storage
              ? async (instanceId) => storage.readMountOverrides(instanceId)
              : async (instanceId) => {
                  // instanceId comes from instanceIdFromMountPath — e.g. "blocklets_persona"
                  const mountsPath = joinPath(userDataRoot, instanceId, "mounts.toml");
                  if (!existsSync(mountsPath)) return [];
                  try {
                    const { readFileSync } = await import("node:fs");
                    const tomlContent = readFileSync(mountsPath, "utf-8");
                    const { parse } = await import("smol-toml");
                    const parsed = parse(tomlContent) as {
                      mounts?: Array<{
                        path?: string;
                        uri?: string;
                        options?: Record<string, unknown>;
                      }>;
                    };
                    return (parsed.mounts ?? [])
                      .filter(
                        (
                          m,
                        ): m is { path: string; uri: string; options?: Record<string, unknown> } =>
                          !!m.path && !!m.uri,
                      )
                      .map((m) => ({ target: m.path, uri: m.uri, options: m.options }));
                  } catch (err) {
                    console.warn(
                      `[${logTs()}] Failed to read mounts.toml for ${instanceId}: ${err instanceof Error ? err.message : err}`,
                    );
                    return [];
                  }
                },
            writeMountOverrides: storage
              ? async (instanceId, overrides) => storage.writeMountOverrides(instanceId, overrides)
              : async (instanceId, overrides) => {
                  const dataDirId = instanceId.startsWith("instances_")
                    ? `blocklets_${instanceId.slice("instances_".length)}`
                    : instanceId;
                  const dataDir = joinPath(userDataRoot, dataDirId);
                  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
                  const mountsPath = joinPath(dataDir, "mounts.toml");
                  // Read existing overrides and merge (upsert by target path)
                  let existing: import("@aigne/afs").MountOverride[] = [];
                  if (existsSync(mountsPath)) {
                    try {
                      const { readFileSync: readFs } = await import("node:fs");
                      const { parse } = await import("smol-toml");
                      const parsed = parse(readFs(mountsPath, "utf-8")) as {
                        mounts?: Array<{
                          path?: string;
                          uri?: string;
                          options?: Record<string, unknown>;
                        }>;
                      };
                      existing = (parsed.mounts ?? [])
                        .filter(
                          (
                            m,
                          ): m is {
                            path: string;
                            uri: string;
                            options?: Record<string, unknown>;
                          } => !!m.path && !!m.uri,
                        )
                        .map((m) => ({ target: m.path, uri: m.uri, options: m.options }));
                    } catch {}
                  }
                  // Merge: new overrides replace existing ones with same target
                  for (const o of overrides) {
                    const idx = existing.findIndex((e) => e.target === o.target);
                    if (idx >= 0) existing[idx] = o;
                    else existing.push(o);
                  }
                  // Write
                  const { writeFileSync: writeFs } = await import("node:fs");
                  const lines = existing.map((o) => {
                    let s = `[[mounts]]\npath = "${o.target}"\nuri = "${o.uri}"\n`;
                    if (o.options && Object.keys(o.options).length > 0) {
                      s += `\n[mounts.options]\n${Object.entries(o.options)
                        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
                        .join("\n")}\n`;
                    }
                    return s;
                  });
                  writeFs(mountsPath, lines.join("\n"), "utf-8");
                },
          });

          // No activateAll() — blocklets are activated on-demand when first accessed

          // Read serve config for sites toggle
          const { ConfigLoader } = await import("../../config/loader.js");
          const configLoader = new ConfigLoader();
          let sitesEnabled = true;
          try {
            const config = await configLoader.load(cwd);
            sitesEnabled = config.serve?.sites ?? true;
          } catch {
            // Config load failure — default to enabled
          }

          // Discover web-device sites and build ServiceHandlers for /sites
          let siteManager: SiteManager | undefined;
          if (sitesEnabled) {
            try {
              siteManager = await discoverWebDeviceSites(afs, logTs);
            } catch (err) {
              console.warn(
                `[${logTs()}] Web-device site discovery failed: ${err instanceof Error ? err.message : err}`,
              );
            }
          } else {
            console.log(`[${logTs()}] Site portal disabled by serve.sites config`);
          }

          // Discover blocklet .web/ directories and add as sites
          if (siteManager) {
            try {
              const { join: pathJoin, dirname } = await import("node:path");
              const { existsSync, readdirSync } = await import("node:fs");
              const { AFSFS } = (await import("@aigne/afs-fs" as string)) as {
                AFSFS: new (opts: {
                  localPath: string;
                  description: string;
                }) => import("@aigne/afs").AFSModule;
              };

              // Mount library themes if no web-device provider discovered them
              if (!siteManager.libraryThemesDir) {
                try {
                  // Try to find web-device themes via package resolution
                  let themesLocalPath: string | undefined;
                  try {
                    const webDevicePkg = require.resolve("@aigne/afs-web-device/package.json");
                    themesLocalPath = pathJoin(dirname(webDevicePkg), "themes");
                  } catch {
                    // Fallback: check providers/web-device/themes/ relative to cwd
                    const fallback = pathJoin(cwd, "providers/web-device/themes");
                    if (existsSync(fallback)) themesLocalPath = fallback;
                  }
                  if (themesLocalPath && existsSync(themesLocalPath)) {
                    const themesMount = "/_blocklet-web/_library/themes";
                    const themesProvider = new AFSFS({
                      localPath: themesLocalPath,
                      description: "Library themes",
                    });
                    await afs.mount(themesProvider, themesMount);
                    siteManager.setLibraryThemesDir(themesMount);
                  }
                } catch {
                  // Library themes not available — continue without
                }
              }

              const searchDirs = [pathJoin(cwd, "blocklets"), pathJoin(process.cwd(), "blocklets")];
              const processDir = process.env.AFS_PROJECT_DIR;
              if (processDir) searchDirs.push(pathJoin(processDir, "blocklets"));
              for (const dir of searchDirs) {
                if (!existsSync(dir)) continue;
                const entries = readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  if (!entry.isDirectory()) continue;
                  const webDir = pathJoin(dir, entry.name, ".web");
                  if (!existsSync(webDir)) continue;
                  // Mount blocklet dir in AFS so SiteServer can read via afs.read()/list()
                  const afsMountPath = `/_blocklet-web/${entry.name}`;
                  const localPath = pathJoin(dir, entry.name);
                  try {
                    const fsProvider = new AFSFS({
                      localPath,
                      description: `Blocklet ${entry.name} web`,
                    });
                    await afs.mount(fsProvider, afsMountPath);
                  } catch {
                    // Already mounted or mount failed — try using the path anyway
                  }
                  const added = await siteManager.addLocalSite(entry.name, afsMountPath);
                  if (added) {
                    console.log(
                      `[${logTs()}] Blocklet "${entry.name}" .web/ registered at /sites/${entry.name}`,
                    );
                  }
                }
                break; // Use first found blocklets/ directory
              }
            } catch (err) {
              console.warn(
                `[${logTs()}] Blocklet web discovery failed: ${err instanceof Error ? err.message : err}`,
              );
            }
          }

          let serverInfo: Awaited<ReturnType<typeof startDaemonServer>> | undefined;
          serverInfo = await startDaemonServer({
            afs,
            port: argv.port,
            configManager,
            blockletManager,
            serviceHandlers: siteManager?.handlers,
            portalWebBackend,
          });

          // Wire lifecycle callbacks for dynamic site registration (after server start)
          if (siteManager) {
            siteManager.wireCallbacks(afs, serverInfo.router);
          }

          // Write PID and port files so parent (and status/stop) can find us
          await ensureDaemonDir();
          await writePidFile(process.pid);
          await writePortFile(serverInfo.port);

          const mounts = afs.getMounts();
          console.log(`[${logTs()}] AFS Service started`);
          console.log(`PID: ${process.pid}, Port: ${serverInfo.port}`);
          console.log(`MCP: ${serverInfo.mcpUrl}`);
          console.log(`AUP: ${serverInfo.url}/`);
          console.log(`Explorer: ${serverInfo.url}/explorer`);
          for (const m of mounts) {
            console.log(`  ${m.path} → ${m.module.name}`);
          }
          if (siteManager && siteManager.siteNames.length > 0) {
            console.log(`Sites: ${siteManager.siteNames.join(", ")} → ${serverInfo.url}/sites`);
          }

          // Graceful shutdown
          let shuttingDown = false;
          const shutdown = async () => {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(`[${logTs()}] Shutting down service...`);
            try {
              await blockletManager.deactivateAll();
            } catch (err) {
              console.warn(
                `[${logTs()}] Blocklet deactivation error: ${err instanceof Error ? err.message : err}`,
              );
            }
            configManager.stopWatching();
            serverInfo?.stop();
            await cleanPidFiles();
            process.exit(0);
          };

          process.on("SIGINT", shutdown);
          process.on("SIGTERM", shutdown);

          // Keep running
          await new Promise(() => {});
          break;
        }

        case "stop": {
          const stopped = await stopDaemon();
          if (stopped) {
            console.log(colors.green("Service stopped"));
          } else {
            console.log(colors.yellow("No running service found"));
          }
          break;
        }

        case "status": {
          const info = await getDaemonStatus();
          if (info) {
            console.log(colors.green("Service is running"));
            console.log(`  PID:  ${info.pid}`);
            console.log(`  Port: ${info.port}`);
            printEndpoints(info.url);
          } else {
            console.log(colors.dim("Service is not running"));
          }
          break;
        }

        case "restart": {
          const wasRunning = await stopDaemon();
          if (wasRunning) {
            console.log(colors.dim("Stopped existing service, restarting..."));
          }

          console.log(colors.dim("Starting AFS service..."));
          try {
            const info = await spawnDaemon(argv.port);
            console.log(colors.green("AFS Service restarted"));
            console.log(`  ${colors.dim("PID:")}  ${info.pid}`);
            console.log(`  ${colors.dim("Port:")} ${info.port}`);
            printEndpoints(info.url);
          } catch (err) {
            console.error(colors.red(`Failed to restart service: ${(err as Error).message}`));
            process.exitCode = 1;
          }
          break;
        }
      }

      // Signal executor that command ran (output already printed above)
      options.onResult({ command: "service", result: null, format: noopFormat });
    },
  };
}

/**
 * Find the local blocklet directory by name.
 * Searches cwd/blocklets/{name}/ and project root alternatives.
 */
function findLocalBlockletDir(name: string, cwd: string): string | null {
  const { join } = require("node:path");
  const { existsSync } = require("node:fs");

  const searchPaths = [join(cwd, "blocklets", name)];
  const actualCwd = process.cwd();
  if (actualCwd !== cwd) searchPaths.push(join(actualCwd, "blocklets", name));
  const processCwd = process.env.AFS_PROJECT_DIR;
  if (processCwd && processCwd !== cwd && processCwd !== actualCwd) {
    searchPaths.push(join(processCwd, "blocklets", name));
  }

  for (const dir of searchPaths) {
    if (existsSync(join(dir, "blocklet.yaml"))) return dir;
  }
  return null;
}

/**
 * Resolve a blocklet from AFS after it has been mounted.
 *
 * Reads blocklet.yaml and .aup/app.json through AFS — works for any
 * backend (local FS, R2, registry), not just local filesystem.
 *
 * specVersion 2 → loads `.aup/app.json` via AFS for page navigation
 * specVersion 1 → JS import from local path (imperative blocklets)
 */
async function resolveBlockletFromAFS(
  name: string,
  mountPath: string,
  afs: { read(path: string, opts?: unknown): Promise<{ data?: unknown }> },
  localDir: string,
  logTs: () => string,
): Promise<import("@aigne/afs-ui").BlockletModule | null> {
  const { joinURL } = await import("ufo");
  const { parseBlockletManifest } = await import("@aigne/afs");

  try {
    // Read blocklet.yaml through AFS
    const manifestResult = await afs.read(joinURL(mountPath, "blocklet.yaml"));
    const manifestContent =
      typeof manifestResult?.data === "string"
        ? manifestResult.data
        : typeof (manifestResult?.data as { content?: string })?.content === "string"
          ? (manifestResult.data as { content: string }).content
          : String(manifestResult?.data ?? "");
    const manifest = parseBlockletManifest(manifestContent);

    // ── specVersion 2 → read .aup/app.json through AFS ──
    if (manifest.specVersion >= 2) {
      const appConfigPath = joinURL(mountPath, ".aup", "app.json");
      try {
        const appResult = await afs.read(appConfigPath);
        const appRaw = appResult?.data;
        const appConfig =
          typeof appRaw === "string"
            ? JSON.parse(appRaw)
            : typeof (appRaw as { content?: string })?.content === "string"
              ? JSON.parse((appRaw as { content: string }).content)
              : appRaw;

        if (appConfig?.pages || appConfig?.defaultPage) {
          const { loadAUPApp } = await import("@aigne/afs-ui");

          // readFile reads page JSON through AFS
          const readFile = async (relativePath: string) => {
            const filePath = joinURL(mountPath, ".aup", relativePath);
            const result = await afs.read(filePath);
            const raw = result?.data;
            if (typeof raw === "string") return JSON.parse(raw);
            if (typeof (raw as { content?: string })?.content === "string") {
              return JSON.parse((raw as { content: string }).content);
            }
            return raw;
          };

          const app = await loadAUPApp(appConfig, readFile);

          const mod: import("@aigne/afs-ui").BlockletModule = {
            pageTree: () => app.defaultTree,
            defaultPage: app.defaultPage,
            pageResolver: app.pageResolver,
          };

          console.log(`[${logTs()}] Resolved AUP app blocklet "${name}" via AFS at ${mountPath}`);
          return mod;
        }
      } catch {
        // No .aup/app.json — fall through to specVersion 1
      }
    }

    // ── specVersion 1 → JS import from local path (imperative blocklets) ──
    const { join } = await import("node:path");
    const entrypointPath = join(localDir, manifest.entrypoint || "index.ts");
    const mod = (await import(/* webpackIgnore: true */ entrypointPath)) as Record<string, unknown>;
    if (typeof mod.pageTree !== "function") {
      console.warn(`[${logTs()}] Blocklet "${name}" has no pageTree() export`);
      return null;
    }
    console.log(`[${logTs()}] Resolved blocklet "${name}" from ${localDir}`);
    return mod as unknown as import("@aigne/afs-ui").BlockletModule;
  } catch (err) {
    console.warn(
      `[${logTs()}] Failed to resolve blocklet "${name}": ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/** Mutable site manager — handles initial discovery and dynamic lifecycle callbacks. */
interface SiteManager {
  handlers: Record<string, import("@aigne/afs").ServiceHandler>;
  siteNames: string[];
  /** AFS path to library themes directory (if discovered). */
  libraryThemesDir: string | undefined;
  /** Set the library themes directory for blocklet sites. */
  setLibraryThemesDir(dir: string): void;
  /** Add a local site from a filesystem path (e.g., blocklet .web/ directory). */
  addLocalSite(name: string, sitePath: string): Promise<boolean>;
  /**
   * Wire `onSiteChanged` callbacks on all web-device mounts so that
   * runtime-declared sites are dynamically registered/unregistered in the router.
   * Call AFTER startDaemonServer() so router is available.
   */
  wireCallbacks(afs: import("@aigne/afs").AFS, router: import("@aigne/afs").ServiceRouter): void;
}

/**
 * Discover web-device providers among AFS mounts and build a SitePortal
 * with ServiceHandlers for /sites.
 *
 * Uses shared discoverDeclaredSites() from @aigne/afs-web-device for duck-typed
 * site discovery, then builds CLI-specific SiteServer + WebDeviceHandler instances.
 *
 * Returns a SiteManager with a `wireCallbacks()` method for runtime site updates.
 */
async function discoverWebDeviceSites(
  afs: import("@aigne/afs").AFS,
  logTs: () => string,
): Promise<SiteManager | undefined> {
  // Dynamic import — @aigne/afs-web-device is an optional peer
  const webDeviceModule = "@aigne/afs-web-device";
  const { discoverDeclaredSites, SiteServer, SitePortal, WebDeviceHandler } = (await import(
    /* webpackIgnore: true */ webDeviceModule
  )) as {
    discoverDeclaredSites: (
      afs: import("@aigne/afs").AFS,
    ) => Promise<Array<{ mountPath: string; sites: Array<{ name: string; sourcePath: string }> }>>;
    SiteServer: new (
      afs: unknown,
      sitePath: string,
      options?: { libraryThemesDir?: string },
    ) => {
      basePath: string;
      config: { locale?: string };
      init(): Promise<void>;
    };
    SitePortal: new () => {
      addSite(name: string, server: unknown, basePath: string): void;
      removeSite(name: string): boolean;
      renderPortal(): string;
    };
    WebDeviceHandler: new (server: unknown) => import("@aigne/afs").ServiceHandler;
  };

  // Library themes are served by the web-device provider itself at /.library/themes.
  // The provider auto-detects its package directory and reads theme files from the filesystem.
  // SiteServers access them via the web-device's AFS mount path (e.g., /web/.library/themes).

  const portal = new SitePortal();
  const siteServers = new Map<string, InstanceType<typeof SiteServer>>();

  // Discover web-device mounts and derive library themes dir from mount path
  const discoveredMounts = await discoverDeclaredSites(afs);
  let libraryThemesDir: string | undefined =
    discoveredMounts.length > 0 ? `${discoveredMounts[0]!.mountPath}/.library/themes` : undefined;

  /** Create a SiteServer, add to portal + siteServers map. Returns true on success. */
  async function addSiteToPortal(name: string, sourcePath: string): Promise<boolean> {
    if (siteServers.has(name)) return false; // idempotent
    try {
      const server = new SiteServer(afs, sourcePath, { libraryThemesDir });
      server.basePath = `/sites/${name}/`;
      await server.init();
      portal.addSite(name, server, `/sites/${name}`);
      siteServers.set(name, server);
      return true;
    } catch (err) {
      console.warn(
        `[${logTs()}] Failed to init site "${name}": ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  // Register discovered sites
  for (const mount of discoveredMounts) {
    for (const site of mount.sites) {
      await addSiteToPortal(site.name, site.sourcePath);
    }
  }

  // Always create the manager (even with 0 sites) so wireCallbacks can catch runtime declarations
  if (siteServers.size > 0) {
    console.log(`[${logTs()}] Discovered ${siteServers.size} web-device site(s) → /sites`);
  }

  // Build flat handlers map — each entry gets registered directly into the main ServiceRouter
  const handlers: Record<string, import("@aigne/afs").ServiceHandler> = {};

  // Portal index page at /sites (dynamic — renderPortal() regenerates on each request)
  handlers["/sites"] = {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/" || url.pathname === "") {
        return new Response(portal.renderPortal(), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return new Response("Not Found", { status: 404 });
    },
  };

  // Each site at /sites/{name} — WebDeviceHandler wraps SiteServer
  for (const [name, server] of siteServers) {
    handlers[`/sites/${name}`] = new WebDeviceHandler(server);
  }

  const siteNamesList = [...siteServers.keys()];

  return {
    handlers,
    siteNames: siteNamesList,
    libraryThemesDir,

    setLibraryThemesDir(dir: string) {
      libraryThemesDir = dir;
    },

    async addLocalSite(name: string, sitePath: string): Promise<boolean> {
      const added = await addSiteToPortal(name, sitePath);
      if (added) {
        handlers[`/sites/${name}`] = new WebDeviceHandler(siteServers.get(name)!);
        siteNamesList.push(name);
      }
      return added;
    },

    wireCallbacks(afs, router) {
      for (const mount of afs.getMounts()) {
        const mod = mount.module as unknown as Record<string, unknown>;
        if (typeof mod.getDeclaredSites !== "function") continue;

        // Duck-type: set onSiteChanged callback for dynamic updates
        (mod as { onSiteChanged?: unknown }).onSiteChanged = async (event: {
          action: "declared" | "undeclared";
          site: { name: string; sourcePath: string };
        }) => {
          if (event.action === "declared") {
            const added = await addSiteToPortal(event.site.name, event.site.sourcePath);
            if (added) {
              const server = siteServers.get(event.site.name);
              if (server) {
                router.register(`/sites/${event.site.name}`, new WebDeviceHandler(server));
              }
              console.log(
                `[${logTs()}] Site "${event.site.name}" registered at /sites/${event.site.name}`,
              );
            }
          } else if (event.action === "undeclared") {
            siteServers.delete(event.site.name);
            portal.removeSite(event.site.name);
            router.unregister(`/sites/${event.site.name}`);
            console.log(`[${logTs()}] Site "${event.site.name}" unregistered from /sites`);
          }
        };
      }
    },
  };
}
