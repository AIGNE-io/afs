/**
 * VaultCredentialStore tests.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSVault, generateMasterKey, writeEncryptedVault } from "@aigne/afs-vault";
import {
  createVaultCredentialStore,
  _sanitizeKeyForTesting as sanitizeKey,
} from "../../src/credential/vault-store.js";

describe("VaultCredentialStore", () => {
  let tempDir: string;
  let vaultPath: string;
  let masterKey: Buffer;
  let vault: AFSVault;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `afs-vault-cred-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    vaultPath = join(tempDir, "vault.enc");
    masterKey = generateMasterKey();

    // Create vault with some existing credentials
    await writeEncryptedVault(
      vaultPath,
      {
        secrets: {
          "github.com-aigne": {
            token: "ghp_existing",
          },
        },
      },
      masterKey,
    );

    vault = new AFSVault({ vaultPath, masterKey, accessMode: "readwrite" });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("sanitizeKey", () => {
    test("strips protocol", () => {
      expect(sanitizeKey("https://github.com/aigne")).toBe("github.com-aigne");
    });

    test("replaces special chars", () => {
      expect(sanitizeKey("s3://my-bucket/path")).toBe("my-bucket-path");
    });

    test("collapses dashes", () => {
      expect(sanitizeKey("foo///bar")).toBe("foo-bar");
    });

    test("handles plain string", () => {
      expect(sanitizeKey("simple-key")).toBe("simple-key");
    });
  });

  describe("get", () => {
    test("returns existing credentials", async () => {
      const store = createVaultCredentialStore(vault);
      const creds = await store.get("github.com/aigne");
      expect(creds).toBeDefined();
      expect(creds!.token).toBe("ghp_existing");
    });

    test("returns undefined for non-existent key", async () => {
      const store = createVaultCredentialStore(vault);
      const creds = await store.get("nonexistent://provider");
      expect(creds).toBeUndefined();
    });
  });

  describe("set", () => {
    test("stores new credentials", async () => {
      const store = createVaultCredentialStore(vault);
      await store.set("s3://my-bucket", { accessKey: "AKIAI", secretKey: "wJalr" });

      const creds = await store.get("s3://my-bucket");
      expect(creds).toBeDefined();
      expect(creds!.accessKey).toBe("AKIAI");
      expect(creds!.secretKey).toBe("wJalr");
    });

    test("overwrites existing credentials", async () => {
      const store = createVaultCredentialStore(vault);
      await store.set("github.com/aigne", { token: "ghp_new" });

      const creds = await store.get("github.com/aigne");
      expect(creds).toBeDefined();
      expect(creds!.token).toBe("ghp_new");
    });

    test("persists to disk", async () => {
      const store = createVaultCredentialStore(vault);
      await store.set("test://key", { value: "persisted" });

      // Create new vault instance to verify persistence
      const vault2 = new AFSVault({ vaultPath, masterKey, accessMode: "readwrite" });
      const store2 = createVaultCredentialStore(vault2);
      const creds = await store2.get("test://key");
      expect(creds).toBeDefined();
      expect(creds!.value).toBe("persisted");
    });
  });

  describe("delete", () => {
    test("deletes existing credentials", async () => {
      const store = createVaultCredentialStore(vault);
      const result = await store.delete("github.com/aigne");
      expect(result).toBe(true);

      const creds = await store.get("github.com/aigne");
      expect(creds).toBeUndefined();
    });

    test("returns false for non-existent key", async () => {
      const store = createVaultCredentialStore(vault);
      const result = await store.delete("nonexistent://key");
      expect(result).toBe(false);
    });
  });
});
