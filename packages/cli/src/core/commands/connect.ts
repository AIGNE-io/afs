/**
 * AFS Connect Command
 *
 * One-command experience: starts service (if not running) + opens browser + exits.
 * This is the primary user entry point.
 */

import type { CommandModule } from "yargs";
import { colors } from "../../ui/index.js";
import type { CommandFactoryOptions } from "./types.js";

export interface ConnectArgs {
  port: number;
}

/** No-op formatter for lifecycle commands that manage their own output. */
const noopFormat = () => "";

export function createConnectCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ConnectArgs> {
  return {
    command: "connect",
    describe: "Start service and open web explorer",
    builder: {
      port: {
        type: "number",
        default: 4900,
        description: "Port for service",
      },
    },
    handler: async (argv) => {
      const { getDaemonStatus, spawnDaemon } = await import("../../daemon/manager.js");

      let info = await getDaemonStatus();

      if (info) {
        console.log(`${colors.green("Service already running")} on port ${info.port}`);
      } else {
        console.log(colors.dim("Starting AFS service..."));
        try {
          info = await spawnDaemon(argv.port);
          console.log(colors.green("AFS Service started"));
          console.log(`  ${colors.dim("PID:")}  ${info.pid}`);
          console.log(`  ${colors.dim("Port:")} ${info.port}`);
        } catch (err) {
          console.error(colors.red(`Failed to start service: ${(err as Error).message}`));
          options.onResult({ command: "connect", result: null, format: noopFormat });
          process.exitCode = 1;
          return;
        }
      }

      console.log(`  ${colors.dim("URL:")}  ${colors.brightCyan(info.url)}`);
      openBrowser(info.url);

      // Signal executor that command ran (output already printed above)
      options.onResult({ command: "connect", result: null, format: noopFormat });
    },
  };
}

function openBrowser(url: string): void {
  const { exec } = require("node:child_process") as typeof import("node:child_process");
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${url}`);
}
