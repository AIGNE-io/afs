/**
 * Tests for MCP DID Tools
 *
 * Strategy:
 * - Tool registration: verified via MCP client.listTools()
 * - Tool logic: tested by calling perform* functions with temp filesystem fixtures
 *   (MCP tools are thin wrappers around perform*, no need to test through MCP protocol)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  performDIDInfo,
  performDIDInit,
  performDIDIssueSelfSign,
  performDIDVerify,
} from "../../src/core/commands/did.js";
import { createAFSMcpServer } from "../../src/mcp/server.js";

// ── MCP Registration Tests ──

describe("MCP DID Tools Registration", () => {
  test("listTools includes 4 DID tools alongside 8 AFS tools", async () => {
    const afs = new AFS();
    const { server } = createAFSMcpServer({ afs });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    // 8 AFS tools
    expect(names).toContain("afs_read");
    expect(names).toContain("afs_list");
    expect(names).toContain("afs_write");
    expect(names).toContain("afs_delete");
    expect(names).toContain("afs_search");
    expect(names).toContain("afs_exec");
    expect(names).toContain("afs_stat");
    expect(names).toContain("afs_explain");

    // 4 DID tools
    expect(names).toContain("did_info");
    expect(names).toContain("did_init");
    expect(names).toContain("did_issue");
    expect(names).toContain("did_verify");

    // 4 DID issuer tools
    expect(names).toContain("did_issuer_list");
    expect(names).toContain("did_issuer_add");
    expect(names).toContain("did_issuer_remove");
    expect(names).toContain("did_issuer_inspect");

    await client.close();
    await server.close();
  });
});

// ── perform* Function Tests (core logic, bypass MCP transport) ──

describe("perform* DID Functions", () => {
  let tempDir: string;
  let tempHome: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "afs-did-test-"));
    tempHome = await mkdtemp(join(tmpdir(), "afs-did-home-"));
    // Create a minimal package.json in tempDir
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({ name: "@test/provider", version: "1.0.0" }),
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await rm(tempHome, { recursive: true, force: true });
  });

  describe("performDIDInfo", () => {
    test("returns DID=none when no identity exists", async () => {
      const result = await performDIDInfo({ cwd: tempDir, home: tempHome });
      expect(result.name).toBe("@test/provider");
      expect(result.did).toBeUndefined();
      expect(result.hasCredential).toBe(false);
    });

    test("returns DID after init", async () => {
      await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
      await performDIDInit({ entityType: "provider", cwd: tempDir, home: tempHome });
      const result = await performDIDInfo({ cwd: tempDir, home: tempHome });
      expect(result.name).toBe("@test/provider");
      expect(result.did).toBeTruthy();
      expect(result.did).toMatch(/^z/); // DID starts with z
    });
  });

  describe("performDIDInit", () => {
    test("developer: creates identity", async () => {
      const result = await performDIDInit({
        entityType: "developer",
        cwd: tempDir,
        home: tempHome,
      });
      expect(result.status).toBe("created");
      expect(result.entityType).toBe("developer");
      expect(result.did).toBeTruthy();
    });

    test("developer: skips if exists without force", async () => {
      await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
      const result = await performDIDInit({
        entityType: "developer",
        cwd: tempDir,
        home: tempHome,
      });
      expect(result.status).toBe("skipped");
    });

    test("developer: overwrites with force", async () => {
      await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
      const r2 = await performDIDInit({
        entityType: "developer",
        force: true,
        cwd: tempDir,
        home: tempHome,
      });
      expect(r2.status).toBe("created");
      expect(r2.did).toBeTruthy();
    });

    test("provider: requires developer key", async () => {
      const result = await performDIDInit({
        entityType: "provider",
        cwd: tempDir,
        home: tempHome,
      });
      expect(result.status).toBe("error");
      expect(result.error).toContain("Developer root key not found");
    });

    test("provider: derives from developer key", async () => {
      await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
      const result = await performDIDInit({
        entityType: "provider",
        cwd: tempDir,
        home: tempHome,
      });
      expect(result.status).toBe("created");
      expect(result.entityType).toBe("provider");
      expect(result.derivedFrom).toBeTruthy();
    });

    test("auto-detect: detects provider from package.json", async () => {
      await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
      const result = await performDIDInit({ cwd: tempDir, home: tempHome });
      expect(result.status).toBe("created");
      expect(result.entityType).toBe("provider");
    });

    test("auto-detect: returns error in empty dir", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "afs-did-empty-"));
      try {
        const result = await performDIDInit({ cwd: emptyDir, home: tempHome });
        expect(result.status).toBe("error");
        expect(result.error).toContain("Cannot detect entity type");
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("performDIDVerify", () => {
    test("returns invalid when no credential", async () => {
      const result = await performDIDVerify({ cwd: tempDir, home: tempHome });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("No credential found");
    });
  });

  describe("performDIDIssueSelfSign", () => {
    test("requires conformance test by default", async () => {
      const result = await performDIDIssueSelfSign({ cwd: tempDir, home: tempHome });
      expect(result.status).toBe("skipped");
      expect(result.error).toContain("no conformance test");
    });

    test("skip-check bypasses conformance requirement", async () => {
      await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
      const result = await performDIDIssueSelfSign({
        skipCheck: true,
        cwd: tempDir,
        home: tempHome,
      });
      expect(result.status).toBe("issued");
      expect(result.did).toBeTruthy();
    });
  });
});
