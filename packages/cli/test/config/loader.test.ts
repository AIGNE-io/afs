import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigLoader } from "../../src/config/loader.js";

describe("ConfigLoader", () => {
  let tempDir: string;
  let loader: ConfigLoader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-test-"));
    // Use a non-existent user config dir to isolate from real user config
    loader = new ConfigLoader({ userConfigDir: join(tempDir, "nonexistent-user-config") });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("load", () => {
    test("returns empty config when no config files exist", async () => {
      const config = await loader.load(tempDir);
      expect(config.mounts).toEqual([]);
    });

    test("loads config from .afs-config/config.toml", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${tempDir}/src"
description = "Source code"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(1);
      expect(config.mounts[0]!.path).toBe("/src");
      expect(config.mounts[0]!.description).toBe("Source code");
    });

    test("loads config with multiple mounts", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${tempDir}/src"

[[mounts]]
path = "/db"
uri = "sqlite://${tempDir}/app.db"

[[mounts]]
path = "/config"
uri = "json://${tempDir}/config.json"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(3);
      expect(config.mounts[0]!.path).toBe("/src");
      expect(config.mounts[1]!.path).toBe("/db");
      expect(config.mounts[2]!.path).toBe("/config");
    });

    test("loads config with options", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/db"
uri = "sqlite://${tempDir}/app.db"

[mounts.options]
tables = ["users", "posts"]
fts_enabled = true
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts[0]!.options).toEqual({
        tables: ["users", "posts"],
        fts_enabled: true,
      });
    });

    test("resolves environment variables", async () => {
      process.env.TEST_TOKEN = "secret-token";
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "https://api.example.com"
auth = "bearer:\${TEST_TOKEN}"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts[0]!.auth).toBe("bearer:secret-token");

      delete process.env.TEST_TOKEN;
    });

    test("loads serve config", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${tempDir}/data"

[serve]
host = "0.0.0.0"
port = 8080
path = "/api"
readonly = true
cors = true
max_body_size = 5242880
`,
      );

      const config = await loader.load(tempDir);
      expect(config.serve).toBeDefined();
      expect(config.serve?.host).toBe("0.0.0.0");
      expect(config.serve?.port).toBe(8080);
      expect(config.serve?.path).toBe("/api");
      expect(config.serve?.readonly).toBe(true);
      expect(config.serve?.cors).toBe(true);
      expect(config.serve?.max_body_size).toBe(5242880);
    });

    test("serve config is optional", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/data"
uri = "fs://${tempDir}/data"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.serve).toBeUndefined();
    });

    test("throws on invalid TOML", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(join(configDir, "config.toml"), "invalid toml [[[[");

      await expect(loader.load(tempDir)).rejects.toThrow();
    });

    test("throws on invalid config schema", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "invalid-no-slash"
uri = "fs:///path"
`,
      );

      await expect(loader.load(tempDir)).rejects.toThrow();
    });
  });

  describe("config merging", () => {
    test("merges configs from multiple layers", async () => {
      // Create user-level config
      const userConfigDir = join(tempDir, "user", ".afs-config");
      await mkdir(userConfigDir, { recursive: true });
      await writeFile(
        join(userConfigDir, "config.toml"),
        `
[[mounts]]
path = "/global"
uri = "fs://${tempDir}/global"
`,
      );

      // Create project-level config
      const projectDir = join(tempDir, "project");
      const projectConfigDir = join(projectDir, ".afs-config");
      await mkdir(projectConfigDir, { recursive: true });
      await writeFile(
        join(projectConfigDir, "config.toml"),
        `
[[mounts]]
path = "/project"
uri = "fs://${tempDir}/project"
`,
      );

      // Load with custom user config path
      const customLoader = new ConfigLoader({ userConfigDir: userConfigDir });
      const config = await customLoader.load(projectDir);

      expect(config.mounts).toHaveLength(2);
      const paths = config.mounts.map((m) => m.path);
      expect(paths).toContain("/global");
      expect(paths).toContain("/project");
    });

    test("child config overrides parent config with same mount path", async () => {
      // Create user-level config
      const userConfigDir = join(tempDir, "user", ".afs-config");
      await mkdir(userConfigDir, { recursive: true });
      await writeFile(
        join(userConfigDir, "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${tempDir}/user-src"
description = "User level"
`,
      );

      // Create project-level config with same path (should override)
      const projectDir = join(tempDir, "project");
      const projectConfigDir = join(projectDir, ".afs-config");
      await mkdir(projectConfigDir, { recursive: true });
      await writeFile(
        join(projectConfigDir, "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${tempDir}/project-src"
description = "Project level"
`,
      );

      const customLoader = new ConfigLoader({ userConfigDir: userConfigDir });
      const config = await customLoader.load(projectDir);

      // Should have only 1 mount (project overrides user)
      expect(config.mounts).toHaveLength(1);
      expect(config.mounts[0]!.path).toBe("/src");
      expect(config.mounts[0]!.uri).toBe(`fs://${tempDir}/project-src`);
      expect(config.mounts[0]!.description).toBe("Project level");
    });

    test("merges configs from all intermediate directories", async () => {
      // Create nested directory structure:
      // project/.afs-config/config.toml (project root)
      // project/packages/.afs-config/config.toml (intermediate)
      // project/packages/cli/.afs-config/config.toml (cwd)
      const projectDir = join(tempDir, "project");
      const packagesDir = join(projectDir, "packages");
      const cliDir = join(packagesDir, "cli");

      // Create .git to mark project root
      await mkdir(join(projectDir, ".git"), { recursive: true });

      // Create project-level config
      await mkdir(join(projectDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(projectDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/project"
uri = "fs://${projectDir}"
`,
      );

      // Create intermediate packages config
      await mkdir(join(packagesDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(packagesDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/packages"
uri = "fs://${packagesDir}"
`,
      );

      // Create cwd config
      await mkdir(join(cliDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(cliDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/cli"
uri = "fs://${cliDir}"
`,
      );

      const config = await loader.load(cliDir);

      expect(config.mounts).toHaveLength(3);
      const paths = config.mounts.map((m) => m.path);
      expect(paths).toContain("/project");
      expect(paths).toContain("/packages");
      expect(paths).toContain("/cli");
    });

    test("merges configs without .git (finds topmost .afs-config)", async () => {
      // Create nested directory structure without .git:
      // project/.afs-config/config.toml (topmost .afs-config)
      // project/packages/.afs-config/config.toml (intermediate)
      // project/packages/cli/.afs-config/config.toml (cwd)
      const projectDir = join(tempDir, "project");
      const packagesDir = join(projectDir, "packages");
      const cliDir = join(packagesDir, "cli");

      // No .git directory

      // Create project-level config
      await mkdir(join(projectDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(projectDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/project"
uri = "fs://${projectDir}"
`,
      );

      // Create intermediate packages config
      await mkdir(join(packagesDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(packagesDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/packages"
uri = "fs://${packagesDir}"
`,
      );

      // Create cwd config
      await mkdir(join(cliDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(cliDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/cli"
uri = "fs://${cliDir}"
`,
      );

      const config = await loader.load(cliDir);

      expect(config.mounts).toHaveLength(3);
      const paths = config.mounts.map((m) => m.path);
      expect(paths).toContain("/project");
      expect(paths).toContain("/packages");
      expect(paths).toContain("/cli");
    });

    test("multi-level config override (child overrides parent)", async () => {
      // Create nested directory structure with .git:
      // user-config: /global mount
      // project: /src mount (version 1)
      // project/packages: /src mount (version 2) - should override project
      // project/packages/cli: /src mount (version 3) - should override packages
      const userConfigDir = join(tempDir, "user", ".afs-config");
      const projectDir = join(tempDir, "project");
      const packagesDir = join(projectDir, "packages");
      const cliDir = join(packagesDir, "cli");

      // Create .git to mark project root
      await mkdir(join(projectDir, ".git"), { recursive: true });

      // Create user-level config
      await mkdir(userConfigDir, { recursive: true });
      await writeFile(
        join(userConfigDir, "config.toml"),
        `
[[mounts]]
path = "/global"
uri = "fs://${tempDir}/global"
`,
      );

      // Create project-level config
      await mkdir(join(projectDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(projectDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${projectDir}/src-v1"
description = "Project level"
`,
      );

      // Create packages config (overrides project /src)
      await mkdir(join(packagesDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(packagesDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${packagesDir}/src-v2"
description = "Packages level"
`,
      );

      // Create cli config (overrides packages /src)
      await mkdir(join(cliDir, ".afs-config"), { recursive: true });
      await writeFile(
        join(cliDir, ".afs-config", "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${cliDir}/src-v3"
description = "CLI level"
`,
      );

      const customLoader = new ConfigLoader({ userConfigDir });
      const config = await customLoader.load(cliDir);

      // Should have 2 mounts: /global (user) and /src (cli override)
      expect(config.mounts).toHaveLength(2);

      const globalMount = config.mounts.find((m) => m.path === "/global");
      expect(globalMount).toBeDefined();
      expect(globalMount!.uri).toBe(`fs://${tempDir}/global`);

      const srcMount = config.mounts.find((m) => m.path === "/src");
      expect(srcMount).toBeDefined();
      expect(srcMount!.uri).toBe(`fs://${cliDir}/src-v3`);
      expect(srcMount!.description).toBe("CLI level");
    });

    test("does not load user config twice when it is within search path", async () => {
      // Scenario: user config dir is at tempDir/home/.afs-config
      // and cwd is tempDir/home/project (a subdirectory of home)
      // Without the fix, findTopmostAfsDir would find tempDir/home as topmost,
      // causing the user config to be loaded twice (once explicitly, once via collectConfigsFromTo)
      const homeDir = join(tempDir, "home");
      const userConfigDir = join(homeDir, ".afs-config");
      const projectDir = join(homeDir, "project");
      const projectConfigDir = join(projectDir, ".afs-config");

      // Create user-level config
      await mkdir(userConfigDir, { recursive: true });
      await writeFile(
        join(userConfigDir, "config.toml"),
        `
[[mounts]]
path = "/user"
uri = "fs://${homeDir}/user-data"
`,
      );

      // Create project-level config (cwd)
      await mkdir(projectConfigDir, { recursive: true });
      await writeFile(
        join(projectConfigDir, "config.toml"),
        `
[[mounts]]
path = "/project"
uri = "fs://${projectDir}"
`,
      );

      // Load with user config dir inside the search path
      const customLoader = new ConfigLoader({ userConfigDir });
      const config = await customLoader.load(projectDir);

      // Should have exactly 2 mounts, not duplicate user config
      expect(config.mounts).toHaveLength(2);
      const paths = config.mounts.map((m) => m.path);
      expect(paths).toContain("/user");
      expect(paths).toContain("/project");
    });
  });

  describe("getConfigPaths", () => {
    test("returns paths to all config files", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(join(configDir, "config.toml"), "");

      const paths = await loader.getConfigPaths(tempDir);
      expect(paths.some((p) => p.includes(".afs-config/config.toml"))).toBe(true);
    });

    test("returns empty array when no configs exist", async () => {
      const paths = await loader.getConfigPaths(tempDir);
      expect(paths).toEqual([]);
    });
  });

  describe("namespace support", () => {
    test("loads config with namespace field", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api"
namespace = "staging"
description = "Staging API"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(1);
      expect(config.mounts[0]!.path).toBe("/api");
      expect(config.mounts[0]!.namespace).toBe("staging");
    });

    test("namespace is optional (defaults to undefined)", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${tempDir}/src"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts[0]!.namespace).toBeUndefined();
    });

    test("allows same path in different namespaces", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/staging-api"
namespace = "staging"

[[mounts]]
path = "/api"
uri = "fs://${tempDir}/prod-api"
namespace = "prod"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(2);
      expect(config.mounts[0]!.namespace).toBe("staging");
      expect(config.mounts[1]!.namespace).toBe("prod");
    });

    test("allows same path in default and named namespace", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/local-api"

[[mounts]]
path = "/api"
uri = "fs://${tempDir}/staging-api"
namespace = "staging"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(2);
      expect(config.mounts[0]!.namespace).toBeUndefined(); // default namespace
      expect(config.mounts[1]!.namespace).toBe("staging");
    });

    test("later mount overrides earlier one in same namespace within same config file", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api1"
namespace = "staging"
description = "First"

[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api2"
namespace = "staging"
description = "Second"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(1);
      expect(config.mounts[0]!.uri).toBe(`fs://${tempDir}/api2`);
      expect(config.mounts[0]!.description).toBe("Second");
    });

    test("later mount overrides earlier one in default namespace within same config file", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api1"
description = "First"

[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api2"
description = "Second"
`,
      );

      const config = await loader.load(tempDir);
      expect(config.mounts).toHaveLength(1);
      expect(config.mounts[0]!.uri).toBe(`fs://${tempDir}/api2`);
      expect(config.mounts[0]!.description).toBe("Second");
    });

    test("merges namespaced mounts from multiple config files", async () => {
      // Create user-level config
      const userConfigDir = join(tempDir, "user", ".afs-config");
      await mkdir(userConfigDir, { recursive: true });
      await writeFile(
        join(userConfigDir, "config.toml"),
        `
[[mounts]]
path = "/tools"
uri = "fs://${tempDir}/tools"
namespace = "user"
`,
      );

      // Create project-level config
      const projectDir = join(tempDir, "project");
      const projectConfigDir = join(projectDir, ".afs-config");
      await mkdir(projectConfigDir, { recursive: true });
      await writeFile(
        join(projectConfigDir, "config.toml"),
        `
[[mounts]]
path = "/src"
uri = "fs://${projectDir}/src"

[[mounts]]
path = "/api"
uri = "fs://${projectDir}/staging"
namespace = "staging"
`,
      );

      const customLoader = new ConfigLoader({ userConfigDir: userConfigDir });
      const config = await customLoader.load(projectDir);

      expect(config.mounts).toHaveLength(3);
      expect(config.mounts.find((m) => m.namespace === "user")).toBeDefined();
      expect(config.mounts.find((m) => m.namespace === "staging")).toBeDefined();
      expect(config.mounts.find((m) => m.namespace === undefined)).toBeDefined();
    });

    test("validates namespace name", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api"
namespace = "invalid:namespace"
`,
      );

      await expect(loader.load(tempDir)).rejects.toThrow();
    });

    test("rejects empty namespace", async () => {
      const configDir = join(tempDir, ".afs-config");
      await mkdir(configDir);
      await writeFile(
        join(configDir, "config.toml"),
        `
[[mounts]]
path = "/api"
uri = "fs://${tempDir}/api"
namespace = ""
`,
      );

      await expect(loader.load(tempDir)).rejects.toThrow();
    });
  });
});
