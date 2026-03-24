/**
 * SecretCapability tests — scoped access, audit logging, vault:/// resolution.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCompositeAuditSink,
  createFileAuditSink,
  createMemoryAuditSink,
  createSecretCapability,
  resolveVaultURIs,
  type SecretAuditEntry,
} from "../src/index.js";

/** Minimal mock vault module for testing. */
function createMockVault(secrets: Record<string, string>) {
  return {
    name: "vault",
    async read(path: string) {
      const value = secrets[path];
      if (value === undefined) {
        return { data: undefined };
      }
      return { data: { path, content: value, id: "mock-id" } };
    },
  };
}

describe("SecretCapability", () => {
  describe("createSecretCapability", () => {
    test("get() returns secret value for whitelisted name", async () => {
      const vault = createMockVault({ "/github/token": "ghp_xxx" });
      const cap = createSecretCapability(vault, ["github/token"], "test-provider");

      expect(await cap.get("github/token")).toBe("ghp_xxx");
    });

    test("get() throws for non-whitelisted name", async () => {
      const vault = createMockVault({ "/github/token": "ghp_xxx" });
      const cap = createSecretCapability(vault, ["github/token"], "test-provider");

      await expect(cap.get("aws/secret-key")).rejects.toThrow("access denied");
    });

    test("get() throws for missing secret", async () => {
      const vault = createMockVault({});
      const cap = createSecretCapability(vault, ["github/token"], "test-provider");

      await expect(cap.get("github/token")).rejects.toThrow("not found");
    });

    test("get() logs audit entry", async () => {
      const vault = createMockVault({ "/github/token": "ghp_xxx" });
      const { sink, entries } = createMemoryAuditSink();
      const cap = createSecretCapability(vault, ["github/token"], "test-provider", sink);

      await cap.get("github/token");

      expect(entries).toHaveLength(1);
      expect(entries[0]!.caller).toBe("test-provider");
      expect(entries[0]!.secret).toBe("github/token");
      expect(entries[0]!.operation).toBe("get");
      expect(entries[0]!.timestamp).toBeGreaterThan(0);
    });

    test("denied access does NOT log audit entry", async () => {
      const vault = createMockVault({});
      const { sink, entries } = createMemoryAuditSink();
      const cap = createSecretCapability(vault, [], "test-provider", sink);

      try {
        await cap.get("github/token");
      } catch {
        // expected
      }

      expect(entries).toHaveLength(0);
    });

    test("handles secret names with leading slash", async () => {
      const vault = createMockVault({ "/github/token": "ghp_xxx" });
      const cap = createSecretCapability(vault, ["/github/token"], "test-provider");

      expect(await cap.get("/github/token")).toBe("ghp_xxx");
    });

    test("multiple whitelisted secrets", async () => {
      const vault = createMockVault({
        "/github/token": "ghp_xxx",
        "/aws/key": "AKIAI",
      });
      const cap = createSecretCapability(vault, ["github/token", "aws/key"], "multi-provider");

      expect(await cap.get("github/token")).toBe("ghp_xxx");
      expect(await cap.get("aws/key")).toBe("AKIAI");
    });
  });

  describe("createMemoryAuditSink", () => {
    test("accumulates entries", () => {
      const { sink, entries } = createMemoryAuditSink();

      const entry: SecretAuditEntry = {
        timestamp: Date.now(),
        caller: "test",
        secret: "key",
        operation: "get",
      };

      sink(entry);
      sink({ ...entry, operation: "resolve" });

      expect(entries).toHaveLength(2);
      expect(entries[0]!.operation).toBe("get");
      expect(entries[1]!.operation).toBe("resolve");
    });
  });

  describe("resolveVaultURIs", () => {
    test("resolves vault:/// URIs in flat config", async () => {
      const vault = createMockVault({ "/github/token": "ghp_xxx" });
      const config = {
        owner: "aigne",
        token: "vault:///github/token",
      };

      await resolveVaultURIs(config, vault, "github-provider");

      expect(config.token).toBe("ghp_xxx");
      expect(config.owner).toBe("aigne");
    });

    test("resolves vault:/// URIs in nested config", async () => {
      const vault = createMockVault({
        "/aws/access-key": "AKIAI",
        "/aws/secret-key": "wJalr",
      });
      const config = {
        region: "us-east-1",
        credentials: {
          accessKey: "vault:///aws/access-key",
          secretKey: "vault:///aws/secret-key",
        },
      };

      await resolveVaultURIs(config, vault, "s3-provider");

      expect((config.credentials as any).accessKey).toBe("AKIAI");
      expect((config.credentials as any).secretKey).toBe("wJalr");
    });

    test("throws for missing vault secret", async () => {
      const vault = createMockVault({});
      const config = { token: "vault:///missing/key" };

      await expect(resolveVaultURIs(config, vault, "test")).rejects.toThrow("not found");
    });

    test("logs audit entries for resolved URIs", async () => {
      const vault = createMockVault({ "/github/token": "ghp_xxx" });
      const { sink, entries } = createMemoryAuditSink();
      const config = { token: "vault:///github/token" };

      await resolveVaultURIs(config, vault, "github-provider", sink);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.operation).toBe("resolve");
      expect(entries[0]!.secret).toBe("/github/token");
    });

    test("ignores non-vault strings", async () => {
      const vault = createMockVault({});
      const config = {
        name: "test",
        count: 42,
        flag: true,
        nothing: null,
      };

      await resolveVaultURIs(config as any, vault, "test");

      expect(config.name).toBe("test");
      expect(config.count).toBe(42);
    });
  });

  describe("createFileAuditSink", () => {
    const tempFiles: string[] = [];

    afterEach(async () => {
      for (const f of tempFiles) {
        try {
          await rm(f, { force: true });
        } catch {}
      }
      tempFiles.length = 0;
    });

    test("appends JSON lines to file", async () => {
      const logFile = join(
        tmpdir(),
        `afs-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
      );
      tempFiles.push(logFile);

      const sink = createFileAuditSink(logFile);

      sink({ timestamp: 1000, caller: "test-1", secret: "key-a", operation: "get" });
      sink({ timestamp: 2000, caller: "test-2", secret: "key-b", operation: "resolve" });

      await sink.flush();

      const content = await readFile(logFile, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2);

      const entry1 = JSON.parse(lines[0]!);
      expect(entry1.caller).toBe("test-1");
      expect(entry1.secret).toBe("key-a");
      expect(entry1.operation).toBe("get");

      const entry2 = JSON.parse(lines[1]!);
      expect(entry2.caller).toBe("test-2");
      expect(entry2.operation).toBe("resolve");
    });

    test("creates parent directory if needed", async () => {
      const logDir = join(
        tmpdir(),
        `afs-audit-dir-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      const logFile = join(logDir, "audit.log");
      tempFiles.push(logFile);
      // Also clean up the directory
      afterEach(async () => {
        try {
          await rm(logDir, { recursive: true, force: true });
        } catch {}
      });

      const sink = createFileAuditSink(logFile);
      sink({ timestamp: 1000, caller: "test", secret: "key", operation: "get" });

      await sink.flush();

      const content = await readFile(logFile, "utf-8");
      expect(content.trim()).toContain('"caller":"test"');
    });
  });

  describe("createCompositeAuditSink", () => {
    test("fans out to all provided sinks", () => {
      const { sink: mem1, entries: entries1 } = createMemoryAuditSink();
      const { sink: mem2, entries: entries2 } = createMemoryAuditSink();

      const composite = createCompositeAuditSink(mem1, mem2);

      composite({ timestamp: 1000, caller: "test", secret: "key", operation: "get" });

      expect(entries1).toHaveLength(1);
      expect(entries2).toHaveLength(1);
      expect(entries1[0]!.caller).toBe("test");
      expect(entries2[0]!.caller).toBe("test");
    });
  });
});
