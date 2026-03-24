import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  detectEntityType,
  findEntityDirs,
  readBlockletManifest,
  readEntityInfo,
  validateBlockletPackage,
} from "../../src/core/commands/did-helpers.js";

// ── readBlockletManifest ──────────────────────────────────────

describe("readBlockletManifest", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afs-manifest-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("reads id, name, specVersion from blocklet.yaml", async () => {
    await fs.writeFile(
      path.join(tmpDir, "blocklet.yaml"),
      "specVersion: 1\nid: my-app\nname: My App\n",
    );
    const m = await readBlockletManifest(tmpDir);
    expect(m).toEqual({ id: "my-app", name: "My App", specVersion: 1 });
  });

  test("reads from blocklet.yml if .yaml missing", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yml"), "id: alt-app\nname: Alt App\n");
    const m = await readBlockletManifest(tmpDir);
    expect(m.id).toBe("alt-app");
    expect(m.name).toBe("Alt App");
  });

  test("handles quoted name with double quotes", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), 'id: my-app\nname: "My Quoted App"\n');
    const m = await readBlockletManifest(tmpDir);
    expect(m.name).toBe("My Quoted App");
  });

  test("handles quoted name with single quotes", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "id: my-app\nname: 'Single Quoted'\n");
    const m = await readBlockletManifest(tmpDir);
    expect(m.name).toBe("Single Quoted");
  });

  test("handles name with spaces (unquoted)", async () => {
    await fs.writeFile(
      path.join(tmpDir, "blocklet.yaml"),
      "id: my-app\nname: Telegram Assistant\n",
    );
    const m = await readBlockletManifest(tmpDir);
    expect(m.name).toBe("Telegram Assistant");
  });

  test("falls back to id when name missing", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "id: no-name-app\n");
    const m = await readBlockletManifest(tmpDir);
    expect(m.name).toBe("no-name-app");
  });

  test("specVersion is optional", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "id: my-app\nname: My App\n");
    const m = await readBlockletManifest(tmpDir);
    expect(m.specVersion).toBeUndefined();
  });

  test("throws when no id field", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "name: No Id App\n");
    await expect(readBlockletManifest(tmpDir)).rejects.toThrow("id field");
  });

  test("throws when no manifest file", async () => {
    await expect(readBlockletManifest(tmpDir)).rejects.toThrow("blocklet manifest");
  });
});

// ── detectEntityType ──────────────────────────────────────

describe("detectEntityType", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afs-detect-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("detects provider from package.json", async () => {
    await fs.writeFile(path.join(tmpDir, "package.json"), "{}");
    expect(await detectEntityType(tmpDir)).toBe("provider");
  });

  test("detects blocklet from blocklet.yaml", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "id: x\n");
    expect(await detectEntityType(tmpDir)).toBe("blocklet");
  });

  test("detects blocklet from blocklet.yml", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yml"), "id: x\n");
    expect(await detectEntityType(tmpDir)).toBe("blocklet");
  });

  test("blocklet.yaml takes priority over package.json", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "id: x\n");
    await fs.writeFile(path.join(tmpDir, "package.json"), "{}");
    expect(await detectEntityType(tmpDir)).toBe("blocklet");
  });

  test("returns null when no manifest found", async () => {
    expect(await detectEntityType(tmpDir)).toBeNull();
  });
});

// ── readEntityInfo ──────────────────────────────────────

describe("readEntityInfo", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afs-entity-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("resolves provider from package.json", async () => {
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      '{"name": "@aigne/afs-json", "version": "1.0.0"}',
    );
    const info = await readEntityInfo(tmpDir);
    expect(info.entityType).toBe("provider");
    expect(info.name).toBe("@aigne/afs-json");
    expect(info.displayName).toBe("@aigne/afs-json");
    expect(info.version).toBe("1.0.0");
    expect(info.blockletManifest).toBeUndefined();
  });

  test("resolves blocklet from blocklet.yaml", async () => {
    await fs.writeFile(
      path.join(tmpDir, "blocklet.yaml"),
      "id: my-bot\nname: My Bot\nspecVersion: 1\n",
    );
    const info = await readEntityInfo(tmpDir);
    expect(info.entityType).toBe("blocklet");
    expect(info.name).toBe("my-bot");
    expect(info.displayName).toBe("My Bot");
    expect(info.version).toBeUndefined();
    expect(info.blockletManifest).toEqual({
      id: "my-bot",
      name: "My Bot",
      specVersion: 1,
    });
  });

  test("blocklet.yaml takes priority over package.json", async () => {
    await fs.writeFile(path.join(tmpDir, "blocklet.yaml"), "id: my-bot\nname: My Bot\n");
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      '{"name": "some-pkg", "version": "1.0.0"}',
    );
    const info = await readEntityInfo(tmpDir);
    expect(info.entityType).toBe("blocklet");
    expect(info.name).toBe("my-bot");
  });

  test("throws when no manifest found", async () => {
    await expect(readEntityInfo(tmpDir)).rejects.toThrow("No package.json or blocklet.yaml");
  });
});

// ── validateBlockletPackage ──────────────────────────────

describe("validateBlockletPackage", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afs-validate-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns manifest id as name", async () => {
    await fs.writeFile(
      path.join(tmpDir, "blocklet.yaml"),
      "id: telegram-assistant\nname: Telegram Assistant\n",
    );
    const result = await validateBlockletPackage(tmpDir);
    expect(result.name).toBe("telegram-assistant");
  });
});

// ── findEntityDirs ──────────────────────────────────────

describe("findEntityDirs", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "afs-scan-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("scans providers/ with package.json", async () => {
    const pDir = path.join(tmpDir, "providers", "my-provider");
    await fs.mkdir(pDir, { recursive: true });
    await fs.writeFile(path.join(pDir, "package.json"), '{"name": "p1"}');

    const dirs = await findEntityDirs(tmpDir);
    expect(dirs).toEqual([pDir]);
  });

  test("scans blocklets/ with blocklet.yaml", async () => {
    const bDir = path.join(tmpDir, "blocklets", "my-blocklet");
    await fs.mkdir(bDir, { recursive: true });
    await fs.writeFile(path.join(bDir, "blocklet.yaml"), "id: my-blocklet\nname: X\n");

    const dirs = await findEntityDirs(tmpDir);
    expect(dirs).toEqual([bDir]);
  });

  test("scans blocklets/ with blocklet.yml", async () => {
    const bDir = path.join(tmpDir, "blocklets", "my-blocklet");
    await fs.mkdir(bDir, { recursive: true });
    await fs.writeFile(path.join(bDir, "blocklet.yml"), "id: my-blocklet\nname: X\n");

    const dirs = await findEntityDirs(tmpDir);
    expect(dirs).toEqual([bDir]);
  });

  test("returns both providers and blocklets", async () => {
    const pDir = path.join(tmpDir, "providers", "p1");
    await fs.mkdir(pDir, { recursive: true });
    await fs.writeFile(path.join(pDir, "package.json"), '{"name": "p1"}');

    const bDir = path.join(tmpDir, "blocklets", "b1");
    await fs.mkdir(bDir, { recursive: true });
    await fs.writeFile(path.join(bDir, "blocklet.yaml"), "id: b1\nname: B1\n");

    const dirs = await findEntityDirs(tmpDir);
    expect(dirs).toHaveLength(2);
    expect(dirs).toContain(pDir);
    expect(dirs).toContain(bDir);
  });

  test("skips dirs without manifest", async () => {
    const pDir = path.join(tmpDir, "providers", "no-pkg");
    await fs.mkdir(pDir, { recursive: true });
    // No package.json

    const bDir = path.join(tmpDir, "blocklets", "no-manifest");
    await fs.mkdir(bDir, { recursive: true });
    // No blocklet.yaml

    const dirs = await findEntityDirs(tmpDir);
    expect(dirs).toEqual([]);
  });

  test("handles missing providers/ and blocklets/", async () => {
    const dirs = await findEntityDirs(tmpDir);
    expect(dirs).toEqual([]);
  });
});
