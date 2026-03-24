/**
 * Tests for AFSCommandExecutor
 *
 * Tests the unified command execution interface.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { AFSCommandExecutor } from "../../src/core/executor/index.js";

describe("AFSCommandExecutor", () => {
  let tempDir: string;
  let afs: AFS;
  let executor: AFSCommandExecutor;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-executor-test-"));
    await mkdir(join(tempDir, "docs"));
    await writeFile(join(tempDir, "hello.txt"), "Hello, World!");
    await writeFile(join(tempDir, "docs/readme.md"), "# Documentation");

    afs = new AFS();
    await afs.mount(
      new AFSFS({
        localPath: tempDir,
        description: "Test filesystem",
      }),
      "/fs",
    );

    executor = new AFSCommandExecutor(afs, { tty: false, cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("execute() basics", () => {
    test("should execute ls command with string input", async () => {
      const result = await executor.execute("ls /fs");

      expect(result.success).toBe(true);
      expect(result.command).toBe("ls");
      expect(result.formatted).toBeDefined();
    });

    test("should execute ls command with array input", async () => {
      const result = await executor.execute(["ls", "/fs"]);

      expect(result.success).toBe(true);
      expect(result.command).toBe("ls");
    });

    test("should handle afs prefix in string", async () => {
      const result = await executor.execute("afs ls /fs");

      expect(result.success).toBe(true);
      expect(result.command).toBe("ls");
    });

    test("should handle afs prefix in array", async () => {
      const result = await executor.execute(["afs", "ls", "/fs"]);

      expect(result.success).toBe(true);
      expect(result.command).toBe("ls");
    });

    test("should handle unknown command with helpful error", async () => {
      const result = await executor.execute("unknown /path");
      expect(result.success).toBe(false);
      expect(result.formatted).toContain('Unknown command: "unknown"');
      // Should include help text showing available commands
      expect(result.formatted).toContain("afs ls [path]");
    });

    test("should suggest similar commands for typos", async () => {
      const result = await executor.execute("explorer /path");
      expect(result.success).toBe(false);
      expect(result.formatted).toContain('Unknown command: "explorer"');
      expect(result.formatted).toContain("Did you mean?");
      expect(result.formatted).toContain("afs explore");
    });
  });

  describe("ls command", () => {
    test("should list directory contents", async () => {
      const result = await executor.execute("ls /fs");

      expect(result.success).toBe(true);
      // Result is AFSListResult with data array
      const listResult = result.result as { data: { path: string }[] };
      expect(listResult.data.length).toBeGreaterThan(0);
    });

    test("should respect depth option", async () => {
      const result = await executor.execute("ls /fs --depth=2");

      expect(result.success).toBe(true);
      const listResult = result.result as { data: { path: string }[] };
      // Should include nested files at depth 2
      const hasNested = listResult.data.some((e) => e.path.includes("/docs/"));
      expect(hasNested).toBe(true);
    });

    test("should support list alias", async () => {
      const result = await executor.execute("list /fs");

      expect(result.success).toBe(true);
      // yargs returns the primary command name, not the alias
      expect(result.command).toBe("ls");
    });

    test("should support -l flag for long listing", async () => {
      const result = await executor.execute("ls -l /fs");

      expect(result.success).toBe(true);
      // -l should produce human/tree format (contains tree characters or icons)
      expect(result.formatted).toMatch(/[├└📁📄]/u);
    });

    test("should support -R flag for recursive listing", async () => {
      const result = await executor.execute("ls -R /fs");

      expect(result.success).toBe(true);
      const listResult = result.result as { data: { path: string }[] };
      // Recursive should include nested files
      const hasNested = listResult.data.some((e) => e.path.includes("/docs/"));
      expect(hasNested).toBe(true);
    });

    test("should support combined -lR flags", async () => {
      const result = await executor.execute("ls -lR /fs");

      expect(result.success).toBe(true);
      // Should be human format AND include nested files
      expect(result.formatted).toMatch(/[├└📁📄]/u);
      expect(result.formatted).toContain("readme.md");
    });
  });

  describe("read command", () => {
    test("should read file content", async () => {
      const result = await executor.execute("read /fs/hello.txt");

      expect(result.success).toBe(true);
      // Result is AFSReadResult with data.content
      const readResult = result.result as { data: { content: string } };
      expect(readResult.data.content).toBe("Hello, World!");
    });

    test("should support cat alias", async () => {
      const result = await executor.execute("cat /fs/hello.txt");

      expect(result.success).toBe(true);
      expect(result.command).toBe("read");
      const readResult = result.result as { data: { content: string } };
      expect(readResult.data.content).toBe("Hello, World!");
    });

    test("should return error when path missing", async () => {
      const result = await executor.execute("read");

      expect(result.success).toBe(false);
      // yargs generates its own error message for missing required arguments
      expect(result.error?.message).toBeDefined();
    });
  });

  describe("stat command", () => {
    test("should return file stats", async () => {
      const result = await executor.execute("stat /fs/hello.txt");

      expect(result.success).toBe(true);
      // Stat result has data with meta.size
      const statResult = result.result as { data: { meta?: { size?: number } } };
      expect(statResult.data.meta?.size).toBeGreaterThan(0);
    });

    test("should return directory stats", async () => {
      const result = await executor.execute("stat /fs/docs");

      expect(result.success).toBe(true);
      // Directory has meta.childrenCount
      const statResult = result.result as { data: { meta?: { childrenCount?: number } } };
      expect(statResult.data.meta?.childrenCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("output formats", () => {
    test("should output JSON with --json flag", async () => {
      const result = await executor.execute("ls /fs --json");

      expect(result.success).toBe(true);
      // Should be valid JSON
      const parsed = JSON.parse(result.formatted);
      expect(parsed.entries).toBeDefined();
    });

    test("should use view option", async () => {
      const result = await executor.execute("ls /fs --view=llm");

      expect(result.success).toBe(true);
      // LLM format should contain "ENTRY" prefix
      expect(result.formatted).toContain("ENTRY");
    });
  });

  describe("help", () => {
    test("should return help text for --help flag", async () => {
      const result = await executor.execute("--help");

      expect(result.success).toBe(true);
      expect(result.formatted).toContain("afs <command>");
    });
  });

  describe("mount command", () => {
    test("should list mounts", async () => {
      const result = await executor.execute("mount list");

      expect(result.success).toBe(true);
      // Mount list returns array of config entries
      const mounts = result.result as { path: string }[];
      expect(mounts.length).toBeGreaterThanOrEqual(0);
    });

    test("should support mount ls alias", async () => {
      const result = await executor.execute("mount ls");

      expect(result.success).toBe(true);
    });
  });

  describe("argument parsing", () => {
    test("should handle quoted strings in command", async () => {
      const result = await executor.execute('stat "/fs/hello.txt"');

      expect(result.success).toBe(true);
    });

    test("should parse --key=value options", async () => {
      const result = await executor.execute("ls /fs --depth=1");

      expect(result.success).toBe(true);
    });

    test("should parse --key value options", async () => {
      const result = await executor.execute("ls /fs --depth 2");

      expect(result.success).toBe(true);
    });
  });
});

describe("AFSCommandExecutor edge cases", () => {
  test("should handle empty argv - shows help with error", async () => {
    const afs = new AFS();
    const executor = new AFSCommandExecutor(afs);
    const result = await executor.execute([]);

    // demandCommand() requires at least one command
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // Error message about missing arguments
    expect(result.formatted).toContain("Not enough non-option arguments");
    // Help text lists available commands
    expect(result.formatted).toContain("afs ls [path]");
    expect(result.formatted).toContain("afs explore [path]");
  });

  test("should handle empty string - shows help with error", async () => {
    const afs = new AFS();
    const executor = new AFSCommandExecutor(afs);
    const result = await executor.execute("");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.formatted).toContain("Not enough non-option arguments");
    expect(result.formatted).toContain("afs ls [path]");
  });
});
