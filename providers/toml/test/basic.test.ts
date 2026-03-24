import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSTOML } from "../src/index.js";

describe("AFSTOML", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-toml-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  describe("basic read operations", () => {
    it("reads root of TOML file", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(
        tomlPath,
        `
title = "Test Config"
version = 1

[database]
host = "localhost"
port = 5432

[[servers]]
name = "alpha"
ip = "10.0.0.1"

[[servers]]
name = "beta"
ip = "10.0.0.2"
`,
      );

      const provider = new AFSTOML({ tomlPath });
      const result = await provider.list("/");

      // list() returns only children, never the path itself (per new semantics)
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.some((e) => e.path === "/")).toBe(false);
    });

    it("reads nested table", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(
        tomlPath,
        `
[database]
host = "localhost"
port = 5432
`,
      );

      const provider = new AFSTOML({ tomlPath });
      const result = await provider.read("/database/host");

      expect(result.data?.content).toBe("localhost");
    });

    it("reads array of tables", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(
        tomlPath,
        `
[[servers]]
name = "alpha"

[[servers]]
name = "beta"
`,
      );

      const provider = new AFSTOML({ tomlPath });
      const result = await provider.list("/servers", { maxDepth: 2 });

      // Should have: /servers, /servers/0, /servers/0/name, /servers/1, /servers/1/name
      expect(result.data.length).toBeGreaterThan(1);
    });

    it("returns name from file path", async () => {
      const tomlPath = join(tempDir, "myconfig.toml");
      await writeFile(tomlPath, "key = 'value'");

      const provider = new AFSTOML({ tomlPath });

      expect(provider.name).toBe("myconfig");
    });

    it("uses custom name if provided", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "key = 'value'");

      const provider = new AFSTOML({
        tomlPath,
        name: "custom-name",
      });

      expect(provider.name).toBe("custom-name");
    });
  });

  describe("write operations", () => {
    it("writes new value", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "existing = 'value'");

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });
      await provider.write("/newkey", { content: "newvalue" });

      const result = await provider.read("/newkey");
      expect(result.data?.content).toBe("newvalue");
    });

    it("writes nested value", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "[section]\nkey = 'value'");

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });
      await provider.write("/section/newkey", { content: "newvalue" });

      const result = await provider.read("/section/newkey");
      expect(result.data?.content).toBe("newvalue");
    });
  });

  describe("delete operations", () => {
    it("deletes a value", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "key = 'value'\nother = 'keep'");

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });
      await provider.delete("/key");

      await expect(provider.read("/key")).rejects.toThrow("Path not found");

      const other = await provider.read("/other");
      expect(other.data?.content).toBe("keep");
    });
  });

  describe("search operations", () => {
    it("searches for values", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(
        tomlPath,
        `
title = "Hello World"
[section]
message = "Hello there"
other = "Goodbye"
`,
      );

      const provider = new AFSTOML({ tomlPath });
      const result = await provider.search("/", "Hello");

      expect(result.data.length).toBe(2);
    });
  });

  describe("non-existent file", () => {
    it("creates empty structure for non-existent file", async () => {
      const tomlPath = join(tempDir, "nonexistent.toml");

      const provider = new AFSTOML({ tomlPath });
      const result = await provider.list("/");

      // Root has no children when file is empty (list returns only children, not self)
      expect(result.data.length).toBe(0);
    });
  });

  describe("meta operations", () => {
    it("writes and reads meta for table (object)", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(
        tomlPath,
        `
[database]
host = "localhost"
port = 5432
`,
      );

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });
      // Write meta via node path (new design: use payload.meta)
      await provider.write("/database", { meta: { description: "Database config" } });

      const result = await provider.read("/database/.meta");
      expect(result.data?.meta?.description).toBe("Database config");
    });

    it("writes and reads meta for primitive value", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "title = 'Test'");

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });
      // Write meta via node path (new design)
      await provider.write("/title", { meta: { label: "Project Title" } });

      const result = await provider.read("/title/.meta");
      expect(result.data?.meta?.label).toBe("Project Title");
    });

    it("does not expose .afs in listings", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(
        tomlPath,
        `
[database]
host = "localhost"
`,
      );

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });
      // Write meta via node path
      await provider.write("/database", { meta: { hidden: true } });

      const result = await provider.list("/database", { maxDepth: 1 });
      const paths = result.data.map((e) => e.path);
      expect(paths).not.toContain("/database/.afs");
    });

    it("merges metadata on subsequent writes", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "[config]\nkey = 'value'");

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });

      // Write first batch of metadata via node path
      await provider.write("/config", { meta: { field1: "value1", field2: "value2" } });

      // Write second batch - should merge
      await provider.write("/config", { meta: { field2: "updated", field3: "value3" } });

      // Read back and verify merge
      const result = await provider.read("/config/.meta");
      expect(result.data?.meta?.field1).toBe("value1");
      expect(result.data?.meta?.field2).toBe("updated");
      expect(result.data?.meta?.field3).toBe("value3");
    });

    it("writes content and metadata together", async () => {
      const tomlPath = join(tempDir, "test.toml");
      await writeFile(tomlPath, "[section]\nkey = 'old'");

      const provider = new AFSTOML({ tomlPath, accessMode: "readwrite" });

      // Write both content and metadata
      await provider.write("/section", { content: { key: "new" }, meta: { tag: "updated" } });

      // Verify content
      const readResult = await provider.read("/section/key");
      expect(readResult.data?.content).toBe("new");

      // Verify metadata
      const metaResult = await provider.read("/section/.meta");
      expect(metaResult.data?.meta?.tag).toBe("updated");
    });
  });
});
