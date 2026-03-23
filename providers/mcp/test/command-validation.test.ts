import { describe, expect, test } from "bun:test";
import { AFSMCP } from "../src/index.js";

describe("MCP command validation", () => {
  describe("validateStdioCommand()", () => {
    test("accepts valid commands", () => {
      expect(() => AFSMCP.validateStdioCommand("npx")).not.toThrow();
      expect(() => AFSMCP.validateStdioCommand("node")).not.toThrow();
      expect(() => AFSMCP.validateStdioCommand("/usr/local/bin/my-mcp-server")).not.toThrow();
      expect(() => AFSMCP.validateStdioCommand("uvx")).not.toThrow();
    });

    test("rejects empty command", () => {
      expect(() => AFSMCP.validateStdioCommand("")).toThrow("cannot be empty");
      expect(() => AFSMCP.validateStdioCommand("  ")).toThrow("cannot be empty");
    });

    test("rejects path traversal in command", () => {
      expect(() => AFSMCP.validateStdioCommand("../../bin/evil")).toThrow("path traversal");
      expect(() => AFSMCP.validateStdioCommand("/usr/../../../etc/evil")).toThrow("path traversal");
    });

    test("rejects shell metacharacters in command", () => {
      expect(() => AFSMCP.validateStdioCommand("cmd; rm -rf /")).toThrow("shell metacharacters");
      expect(() => AFSMCP.validateStdioCommand("cmd | cat /etc/passwd")).toThrow(
        "shell metacharacters",
      );
      expect(() => AFSMCP.validateStdioCommand("cmd & echo pwned")).toThrow("shell metacharacters");
      expect(() => AFSMCP.validateStdioCommand("cmd$(whoami)")).toThrow("shell metacharacters");
      expect(() => AFSMCP.validateStdioCommand("cmd`whoami`")).toThrow("shell metacharacters");
      expect(() => AFSMCP.validateStdioCommand("cmd\nwhoami")).toThrow("shell metacharacters");
    });

    test("rejects shell interpreters by default", () => {
      expect(() => AFSMCP.validateStdioCommand("sh")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("bash")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("zsh")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("/bin/bash")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("/usr/bin/zsh")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("cmd.exe")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("powershell")).toThrow("shell interpreter");
      expect(() => AFSMCP.validateStdioCommand("pwsh")).toThrow("shell interpreter");
    });

    test("allows shell interpreters when allowShellCommand is true", () => {
      expect(() => AFSMCP.validateStdioCommand("bash", undefined, true)).not.toThrow();
      expect(() => AFSMCP.validateStdioCommand("/bin/sh", undefined, true)).not.toThrow();
      expect(() => AFSMCP.validateStdioCommand("zsh", undefined, true)).not.toThrow();
    });

    test("rejects path traversal in args", () => {
      expect(() => AFSMCP.validateStdioCommand("npx", ["../../etc/passwd"])).toThrow(
        "arg contains path traversal",
      );
      expect(() => AFSMCP.validateStdioCommand("npx", ["-c", "../../evil/script"])).toThrow(
        "arg contains path traversal",
      );
    });

    test("allows safe args", () => {
      expect(() =>
        AFSMCP.validateStdioCommand("npx", ["-y", "@modelcontextprotocol/server-sqlite"]),
      ).not.toThrow();
      expect(() =>
        AFSMCP.validateStdioCommand("node", ["./server.js", "--port", "3000"]),
      ).not.toThrow();
    });

    test("allows args with .. but no path separator", () => {
      // ".." without "/" is not path traversal (e.g., filenames containing "..")
      expect(() => AFSMCP.validateStdioCommand("npx", ["file..name"])).not.toThrow();
    });
  });
});
