#!/usr/bin/env node

/**
 * AFS CLI - Command Line Interface
 *
 * Simple CLI that delegates to executor. AFS is lazy-loaded on demand
 * by individual commands, so mount failures don't block config commands.
 */

import "urlpattern-polyfill";
import { hideBin } from "yargs/helpers";
import { AFSCommandExecutor } from "./core/index.js";
import { ExitCode } from "./errors.js";
import { VERSION } from "./version.js";

async function main() {
  const args = hideBin(process.argv);
  const cwd = process.cwd();

  // Check for -i / --interactive before yargs parsing
  if (args.includes("-i") || args.includes("--interactive")) {
    const { startRepl } = await import("./repl.js");
    await startRepl({ cwd, version: VERSION });
    process.exit(ExitCode.OK);
  }

  const executor = new AFSCommandExecutor(undefined, {
    cwd,
    tty: process.stdout.isTTY ?? false,
    version: VERSION,
  });

  const result = await executor.execute(args);

  if (result.success) {
    process.exitCode = ExitCode.OK;
    console.log(result.formatted);
  } else {
    process.exitCode = result.error?.code ?? ExitCode.RUNTIME_ERROR;
    console.error(result.formatted);
  }

  // Force exit — providers may hold background resources (MCP child processes,
  // Telegram long-polling, open HTTP connections) that keep the event loop alive.
  // stdout/stderr are flushed synchronously above via console.log/console.error.
  process.exit(process.exitCode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(ExitCode.RUNTIME_ERROR);
});
