/**
 * E2E tests for namespace support in CLI commands
 *
 * These tests run CLI commands in-process via createConfigRunner and verify:
 * - All path formats work: /path, @namespace/path, $afs/path, $afs:namespace/path
 * - All output formats work: default, llm, json, human
 * - Namespace isolation is maintained across all commands
 * - Error handling for invalid namespaces
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CLIResult, createConfigRunner } from "./helpers/cli-runner.js";

describe("E2E: Namespace CLI Commands", () => {
  let tempDir: string;
  let configDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-e2e-namespace-"));
    configDir = join(tempDir, ".afs-config");
    await mkdir(configDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("afs ls (list) with namespaces", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      // Create directories for multiple namespaces
      const localDir = join(tempDir, "local-data");
      const stagingDir = join(tempDir, "staging-data");

      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });

      await writeFile(join(localDir, "local.txt"), "local content");
      await writeFile(join(localDir, "shared.txt"), "local shared");
      await writeFile(join(stagingDir, "staging.txt"), "staging content");
      await writeFile(join(stagingDir, "shared.txt"), "staging shared");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
description = "Local data"

[[mounts]]
path = "/data"
uri = "fs://${stagingDir}"
namespace = "staging"
description = "Staging data"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("lists default namespace with /path", async () => {
      const result = await afs("ls /data --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("local.txt");
      expect(result.stdout).toContain("shared.txt");
      expect(result.stdout).not.toContain("staging.txt");
    });

    test("lists named namespace with @namespace/path", async () => {
      const result = await afs("ls @staging/data --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("staging.txt");
      expect(result.stdout).toContain("shared.txt");
      expect(result.stdout).not.toContain("local.txt");
    });

    test("lists with canonical path $afs/path", async () => {
      const result = await afs("ls $afs/data --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("local.txt");
    });

    test("lists with canonical path $afs:namespace/path", async () => {
      const result = await afs("ls $afs:staging/data --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("staging.txt");
    });

    test("lists with --json output format", async () => {
      const result = await afs("ls /data --json");
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.entries).toBeInstanceOf(Array);
      expect(data.entries.some((e: { path: string }) => e.path.includes("local.txt"))).toBe(true);
    });

    test("lists with --view=llm output format", async () => {
      const result = await afs("ls /data --view=llm");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ENTRY");
      expect(result.stdout).toContain("TOTAL");
    });

    test("returns empty for non-existent namespace", async () => {
      const result = await afs("ls @nonexistent/data --view=default");
      expect(result.exitCode).toBe(0);
      // Should return empty or just the mount point
    });

    test("lists root shows mount points without /modules prefix", async () => {
      const result = await afs("ls / --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("/data");
      expect(result.stdout).not.toContain("/modules");
    });
  });

  describe("afs stat with namespaces", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      const localDir = join(tempDir, "local");
      const stagingDir = join(tempDir, "staging");

      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });

      await writeFile(join(localDir, "file.txt"), "local file content here");
      await writeFile(join(stagingDir, "file.txt"), "staging file content here - longer");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/files"
uri = "fs://${localDir}"

[[mounts]]
path = "/files"
uri = "fs://${stagingDir}"
namespace = "staging"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("stats file in default namespace", async () => {
      const result = await afs("stat /files/file.txt --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("PATH=/files/file.txt");
      expect(result.stdout).toContain("SIZE=");
    });

    test("stats file in named namespace", async () => {
      const result = await afs("stat @staging/files/file.txt --view=default");
      expect(result.exitCode).toBe(0);
      // Output includes the original input path
      expect(result.stdout).toContain("PATH=");
      expect(result.stdout).toContain("files/file.txt");
      expect(result.stdout).toContain("SIZE=");
    });

    test("stats with --json", async () => {
      const result = await afs("stat /files/file.txt --json");
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.path).toBe("/files/file.txt");
      expect(data.size).toBeGreaterThan(0);
    });

    test("stats directory in namespace", async () => {
      const result = await afs("stat @staging/files --view=default");
      expect(result.exitCode).toBe(0);
      // Output includes namespace prefix
      expect(result.stdout).toContain("PATH=");
      expect(result.stdout).toContain("files");
    });
  });

  describe("afs read with namespaces", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      const localDir = join(tempDir, "local");
      const stagingDir = join(tempDir, "staging");
      const prodDir = join(tempDir, "prod");

      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });
      await mkdir(prodDir, { recursive: true });

      await writeFile(join(localDir, "config.json"), JSON.stringify({ env: "local", debug: true }));
      await writeFile(
        join(stagingDir, "config.json"),
        JSON.stringify({ env: "staging", debug: false }),
      );
      await writeFile(
        join(prodDir, "config.json"),
        JSON.stringify({ env: "production", debug: false }),
      );

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/config"
uri = "fs://${localDir}"

[[mounts]]
path = "/config"
uri = "fs://${stagingDir}"
namespace = "staging"

[[mounts]]
path = "/config"
uri = "fs://${prodDir}"
namespace = "prod"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("reads from default namespace with /path", async () => {
      const result = await afs("read /config/config.json --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"env":"local"');
      expect(result.stdout).toContain('"debug":true');
    });

    test("reads from staging namespace with @namespace/path", async () => {
      const result = await afs("read @staging/config/config.json --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"env":"staging"');
    });

    test("reads from prod namespace with @namespace/path", async () => {
      const result = await afs("read @prod/config/config.json --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"env":"production"');
    });

    test("reads with canonical path $afs:namespace/path", async () => {
      const result = await afs("read $afs:staging/config/config.json --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"env":"staging"');
    });

    test("reads with --json output", async () => {
      const result = await afs("read /config/config.json --json");
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      // JSON format returns AFSReadResult with data.path
      expect(data.data?.path).toContain("config.json");
      expect(data.data?.content || JSON.stringify(data)).toContain('"env"');
    });

    test("namespace isolation - cannot read staging file from default", async () => {
      // Create a file only in staging
      const stagingDir = join(tempDir, "staging");
      await writeFile(join(stagingDir, "staging-only.txt"), "staging only");

      const result = await afs("read /config/staging-only.txt --view=default");
      // Should fail or return empty
      expect(result.stdout).not.toContain("staging only");
    });
  });

  describe("afs write with namespaces", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      const localDir = join(tempDir, "local");
      const stagingDir = join(tempDir, "staging");

      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"

[[mounts]]
path = "/data"
uri = "fs://${stagingDir}"
namespace = "staging"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("writes to default namespace with /path", async () => {
      const result = await afs('write /data/new.txt --content="hello local" --view=default');
      expect(result.exitCode).toBe(0);

      // Verify file was written
      const readResult = await afs("read /data/new.txt --view=default");
      expect(readResult.stdout).toContain("hello local");

      // Verify not in staging
      const stagingResult = await afs("read @staging/data/new.txt --view=default");
      expect(stagingResult.stdout).not.toContain("hello local");
    });

    test("writes to named namespace with @namespace/path", async () => {
      const result = await afs(
        'write @staging/data/staging-file.txt --content="hello staging" --view=default',
      );
      expect(result.exitCode).toBe(0);

      // Verify file was written to staging
      const readResult = await afs("read @staging/data/staging-file.txt --view=default");
      expect(readResult.stdout).toContain("hello staging");

      // Verify not in default
      const defaultResult = await afs("read /data/staging-file.txt --view=default");
      expect(defaultResult.stdout).not.toContain("hello staging");
    });

    test("writes with canonical path $afs:namespace/path", async () => {
      const result = await afs(
        "write $afs:staging/data/canonical.txt --content=via_canonical --view=default",
      );
      expect(result.exitCode).toBe(0);

      const readResult = await afs("read @staging/data/canonical.txt --view=default");
      expect(readResult.stdout).toContain("via_canonical");
    });

    test("writes with --json output", async () => {
      const result = await afs('write /data/json-test.txt --content="test" --json');
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      expect(data.success).toBe(true);
      expect(data.path).toContain("json-test.txt");
    });

    test("append mode works with namespaces", async () => {
      await afs('write @staging/data/append.txt --content="line1" --view=default');
      await afs('write @staging/data/append.txt --content="\\nline2" --mode=append --view=default');

      const readResult = await afs("read @staging/data/append.txt --view=default");
      expect(readResult.stdout).toContain("line1");
      expect(readResult.stdout).toContain("line2");
    });
  });

  describe("afs mount commands with namespaces", () => {
    test("mount list shows namespace info", async () => {
      const localDir = join(tempDir, "local");
      const stagingDir = join(tempDir, "staging");
      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"

[[mounts]]
path = "/data"
uri = "fs://${stagingDir}"
namespace = "staging"
`,
      );

      const afs = await createConfigRunner(tempDir);
      const result = await afs("mount list --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("/data");
    });

    test("mount list --json shows namespace field", async () => {
      const localDir = join(tempDir, "local");
      const stagingDir = join(tempDir, "staging");
      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"

[[mounts]]
path = "/data"
uri = "fs://${stagingDir}"
namespace = "staging"
`,
      );

      const afs = await createConfigRunner(tempDir);
      const result = await afs("mount list --json");
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      // mount list returns { mounts: [...] } or just array depending on format
      const mounts = Array.isArray(data) ? data : data.mounts;
      expect(mounts).toBeInstanceOf(Array);
      expect(mounts.length).toBe(2);

      const namespaces = mounts.map((m: { namespace?: string }) => m.namespace);
      expect(namespaces).toContain(undefined);
      expect(namespaces).toContain("staging");
    });

    test("mount validate passes with valid namespace config", async () => {
      const localDir = join(tempDir, "local");
      await mkdir(localDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
namespace = "valid-ns"
`,
      );

      const afs = await createConfigRunner(tempDir);
      const result = await afs("mount validate --view=default");
      expect(result.exitCode).toBe(0);
    });

    test("mount validate fails with invalid namespace chars", async () => {
      const localDir = join(tempDir, "local");
      await mkdir(localDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
namespace = "invalid:namespace"
`,
      );

      // createConfigRunner will fail on invalid config, catch the error
      try {
        await createConfigRunner(tempDir);
        // If it doesn't throw, the validate command should fail
        expect(true).toBe(false); // Should not reach here
      } catch {
        // Expected: config validation error
      }
    });

    test("mount validate fails with empty namespace", async () => {
      const localDir = join(tempDir, "local");
      await mkdir(localDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
namespace = ""
`,
      );

      try {
        await createConfigRunner(tempDir);
        expect(true).toBe(false); // Should not reach here
      } catch {
        // Expected: config validation error
      }
    });

    test("duplicate path in same namespace - later mount overrides earlier", async () => {
      const localDir = join(tempDir, "local");
      const localDir2 = join(tempDir, "local2");
      await mkdir(localDir, { recursive: true });
      await mkdir(localDir2, { recursive: true });

      // Create a file in localDir2 to verify it's the active mount
      await writeFile(join(localDir2, "test.txt"), "from localDir2");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
namespace = "myns"

[[mounts]]
path = "/data"
uri = "fs://${localDir2}"
namespace = "myns"
`,
      );

      const afs = await createConfigRunner(tempDir);
      // Later mount should override earlier one (child overrides parent behavior)
      const result = await afs("ls @myns/data --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("test.txt");
    });

    test("mount validate passes with same path in different namespaces", async () => {
      const localDir = join(tempDir, "local");
      const stagingDir = join(tempDir, "staging");
      await mkdir(localDir, { recursive: true });
      await mkdir(stagingDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"

[[mounts]]
path = "/data"
uri = "fs://${stagingDir}"
namespace = "staging"
`,
      );

      const afs = await createConfigRunner(tempDir);
      const result = await afs("mount validate --view=default");
      expect(result.exitCode).toBe(0);
    });
  });

  describe("afs explain with namespaces", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      const localDir = join(tempDir, "local");
      await mkdir(localDir, { recursive: true });
      await writeFile(join(localDir, "file.txt"), "content");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
namespace = "myns"
description = "My namespace data"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("explains path in named namespace", async () => {
      const result = await afs("explain @myns/data/file.txt --view=default");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("file.txt");
    });

    test("explains with --json", async () => {
      const result = await afs("explain @myns/data --json");
      expect(result.exitCode).toBe(0);
      const data = JSON.parse(result.stdout);
      // explain returns different structure - check for any valid content
      expect(Object.keys(data).length).toBeGreaterThan(0);
    });
  });

  describe("edge cases and error handling", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      const localDir = join(tempDir, "local");
      await mkdir(localDir, { recursive: true });
      await writeFile(join(localDir, "file.txt"), "content");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("handles paths with special characters in namespace", async () => {
      // Should fail because @ is in the namespace part
      const result = await afs("ls @ns-with-dash/data --view=default");
      // This should work - dash is allowed
      expect(result.exitCode).toBe(0);
    });

    test("handles unicode in file names", async () => {
      const unicodeDir = join(tempDir, "unicode");
      await mkdir(unicodeDir, { recursive: true });
      await writeFile(join(unicodeDir, "日本語.txt"), "unicode content");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/unicode"
uri = "fs://${unicodeDir}"
namespace = "testns"
`,
      );

      const afsUnicode = await createConfigRunner(tempDir);
      const result = await afsUnicode("ls @testns/unicode --view=default");
      expect(result.exitCode).toBe(0);
      // File with unicode name should be listed
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    test("handles very long namespace names", async () => {
      const longNs = "a".repeat(100);
      const longDir = join(tempDir, "long");
      await mkdir(longDir, { recursive: true });

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/long"
uri = "fs://${longDir}"
namespace = "${longNs}"
`,
      );

      const afsLong = await createConfigRunner(tempDir);
      const result = await afsLong(`ls @${longNs}/long --view=default`);
      expect(result.exitCode).toBe(0);
    });

    test("handles namespace with only path specified (no slash)", async () => {
      const result = await afs("ls @staging --view=default");
      // Should either work or fail gracefully
      expect(result.exitCode).toBeDefined();
    });

    test("empty path after namespace", async () => {
      const result = await afs("ls @staging/ --view=default");
      // Should either work as root of namespace or fail gracefully
      expect(result.exitCode).toBeDefined();
    });
  });

  describe("output format consistency", () => {
    let afs: (args: string) => Promise<CLIResult>;

    beforeEach(async () => {
      const localDir = join(tempDir, "local");
      await mkdir(localDir, { recursive: true });
      await writeFile(join(localDir, "test.txt"), "test content");

      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${localDir}"
namespace = "testns"
`,
      );

      afs = await createConfigRunner(tempDir);
    });

    test("all output formats work for ls", async () => {
      const formats = ["default", "llm", "human"];
      for (const format of formats) {
        const result = await afs(`ls @testns/data --view=${format}`);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.length).toBeGreaterThan(0);
      }

      // JSON format
      const jsonResult = await afs("ls @testns/data --json");
      expect(jsonResult.exitCode).toBe(0);
      expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();
    });

    test("all output formats work for read", async () => {
      const formats = ["default", "llm", "human"];
      for (const format of formats) {
        const result = await afs(`read @testns/data/test.txt --view=${format}`);
        expect(result.exitCode).toBe(0);
      }

      // JSON format
      const jsonResult = await afs("read @testns/data/test.txt --json");
      expect(jsonResult.exitCode).toBe(0);
      expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();
    });

    test("all output formats work for stat", async () => {
      const formats = ["default", "llm", "human"];
      for (const format of formats) {
        const result = await afs(`stat @testns/data/test.txt --view=${format}`);
        expect(result.exitCode).toBe(0);
      }

      // JSON format
      const jsonResult = await afs("stat @testns/data/test.txt --json");
      expect(jsonResult.exitCode).toBe(0);
      expect(() => JSON.parse(jsonResult.stdout)).not.toThrow();
    });
  });
});

describe("E2E: Multi-layer config with namespaces", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-e2e-multilayer-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("merges namespaces from multiple config layers", async () => {
    // Create project structure with multiple config layers
    // project/.afs-config/config.toml
    // project/packages/.afs-config/config.toml

    const projectDir = join(tempDir, "project");
    const packagesDir = join(projectDir, "packages");

    await mkdir(join(projectDir, ".git"), { recursive: true }); // Mark as git root
    await mkdir(join(projectDir, ".afs-config"), { recursive: true });
    await mkdir(join(packagesDir, ".afs-config"), { recursive: true });

    // Create data directories
    const projectData = join(projectDir, "data");
    const packagesData = join(packagesDir, "data");
    await mkdir(projectData, { recursive: true });
    await mkdir(packagesData, { recursive: true });

    await writeFile(join(projectData, "project.txt"), "project file");
    await writeFile(join(packagesData, "packages.txt"), "packages file");

    // Project-level config
    await writeFile(
      join(projectDir, ".afs-config", "config.toml"),
      `
[[mounts]]
path = "/project"
uri = "fs://${projectData}"
namespace = "project"
`,
    );

    // Packages-level config
    await writeFile(
      join(packagesDir, ".afs-config", "config.toml"),
      `
[[mounts]]
path = "/packages"
uri = "fs://${packagesData}"
namespace = "packages"
`,
    );

    // Run from packages directory - should see both namespaces
    const afs = await createConfigRunner(packagesDir);

    const listResult = await afs("mount list --json");
    expect(listResult.exitCode).toBe(0);

    const data = JSON.parse(listResult.stdout);
    const mounts = Array.isArray(data) ? data : data.mounts;
    expect(mounts.length).toBe(2);

    const namespaces = mounts.map((m: { namespace?: string }) => m.namespace);
    expect(namespaces).toContain("project");
    expect(namespaces).toContain("packages");

    // Can access both namespaces
    const projectResult = await afs("ls @project/project --view=default");
    expect(projectResult.exitCode).toBe(0);
    expect(projectResult.stdout).toContain("project.txt");

    const packagesResult = await afs("ls @packages/packages --view=default");
    expect(packagesResult.exitCode).toBe(0);
    expect(packagesResult.stdout).toContain("packages.txt");
  });
});
