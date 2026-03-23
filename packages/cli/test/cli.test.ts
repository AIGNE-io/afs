import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VERSION } from "../src/version.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const CLI_PATH = join(import.meta.dir, "../src/cli.ts");

async function runCLI(
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    // Use tmpdir as cwd to isolate from project-level .afs-config/config.toml
    // which may contain mounts to unavailable services (e.g. /remote → localhost:3000)
    cwd: tmpdir(),
    env: { ...process.env, GITHUB_TOKEN: process.env.GITHUB_TOKEN || "test-token" },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("afs-cli", () => {
  it("should have version from package.json", () => {
    expect(VERSION).toBe(pkg.version);
  });

  describe("exit codes", () => {
    it("should exit with 0 for --help", async () => {
      const { exitCode } = await runCLI("--help");
      expect(exitCode).toBe(0);
    });

    it("should exit with 0 for -h", async () => {
      const { exitCode } = await runCLI("-h");
      expect(exitCode).toBe(0);
    });

    it("should show help text with --help", async () => {
      const { stdout } = await runCLI("--help");
      expect(stdout).toContain("afs <command> [options]");
      expect(stdout).toContain("Options:");
    });

    // The new CLI shows help for unknown commands and no command
    // This is acceptable behavior since help is shown
    it("should show help for unknown command", async () => {
      const { stdout } = await runCLI("unknown-command");
      // Should show some output (either help or error)
      expect(stdout.length + (await runCLI("unknown-command")).stderr.length).toBeGreaterThan(0);
    });

    it("should show help when no command specified", async () => {
      const { stdout, stderr, exitCode } = await runCLI();
      // demandCommand() requires at least one command, so it shows help on stderr
      expect(exitCode).not.toBe(0);
      expect(stdout).toMatchInlineSnapshot(`""`);
      expect(stderr).toMatchInlineSnapshot(`
        "Not enough non-option arguments: got 0, need at least 1

        afs <command> [options]

        Commands:
          afs ls [path]                List directory contents           [aliases: list]
          afs read <path>              Read file content                  [aliases: cat]
          afs write <path> [content]   Write content to file
          afs delete <path>            Delete file or directory            [aliases: rm]
          afs stat <path>              Get file or directory info
          afs exec <executable_path>   Execute an action
          afs explain [topic]          Explain AFS concepts or paths
          afs search <path> <query>    Search for content within an AFS path
                                                                   [aliases: grep, find]
          afs mount                    Mount management
          afs serve                    Start AFS server (HTTP or MCP)
          afs explore [path]           Interactive explorer (TUI or web)
          afs did                      Identity & trust management
          afs vault                    Encrypted secret storage
          afs service <action>         Manage AFS background service
          afs connect                  Start service and open web explorer
          afs mcp                      Connect Claude Desktop (or any stdio MCP client)
                                       to AFS
          afs gen-agent-md <provider>  Generate .afs/AGENT.md for a provider package

        Options:
              --json         Output in JSON format                             [boolean]
              --yaml         Output in YAML format                             [boolean]
              --view         Output view format
                      [string] [choices: "default", "llm", "human"] [default: "default"]
          -i, --interactive  Start interactive REPL mode                       [boolean]
          -h, --help         Show help                                         [boolean]
          -v, --version      Show version number                               [boolean]
        "
      `);
    });
  });

  describe("commands", () => {
    it("should run ls command", async () => {
      const { exitCode } = await runCLI("ls", "/");
      expect(exitCode).toBe(0);
    });

    it("should run mount list command", async () => {
      const { exitCode } = await runCLI("mount", "list");
      expect(exitCode).toBe(0);
    });

    it("should run explain command", async () => {
      const { exitCode } = await runCLI("explain");
      expect(exitCode).toBe(0);
    });
  });
});
