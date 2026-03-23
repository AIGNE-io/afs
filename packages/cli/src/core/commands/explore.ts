/**
 * AFS Explore Command
 *
 * Interactive TUI explorer or web-based explorer for AFS
 */

import type { CommandModule } from "yargs";
import { VERSION } from "../../version.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

export interface ExploreArgs {
  path: string;
  web: boolean;
  port: number;
}

/**
 * Create explore command
 */
export function createExploreCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ExploreArgs> {
  return {
    command: "explore [path]",
    describe: "Interactive explorer (TUI or web)",
    builder: {
      path: { type: "string", default: "/", description: "Starting path" },
      web: { type: "boolean", default: false, description: "Launch web-based explorer" },
      port: { type: "number", default: 0, description: "Port for web explorer (0 = auto)" },
    },
    handler: async (argv) => {
      const afs = await resolveAFS(options);

      if (argv.web) {
        const { startExplorer } = await import("@aigne/afs-explorer");
        const { resolve } = await import("node:path");

        // Locate web assets: try node_modules first, then relative path
        let webRoot: string | undefined;
        try {
          const { createRequire } = await import("node:module");
          const req = createRequire(import.meta.url);
          const explorerPkg = req.resolve("@aigne/afs-explorer/package.json");
          webRoot = resolve(explorerPkg, "..", "web");
        } catch {
          // Fallback — not critical if embedded assets are used
        }

        const info = await startExplorer(afs, {
          port: argv.port,
          host: "localhost",
          webRoot,
          open: true,
        });

        console.log(`AFS Explorer running at ${info.url}`);
        console.log("Press Ctrl+C to stop");

        // Keep process alive
        process.on("SIGINT", () => {
          info.stop();
          process.exit(0);
        });
        await new Promise(() => {});
      } else {
        const { createExplorerScreen } = await import("../../explorer/screen.js");
        await createExplorerScreen({ afs, startPath: argv.path, version: VERSION });
      }
    },
  };
}
