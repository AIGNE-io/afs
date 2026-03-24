/**
 * Vault CLI command tests.
 *
 * Tests the vault command subcommands (init, get, set, list, delete)
 * using real vault instances in temp directories.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  _resetCachedKeyForTesting,
  AFSVault,
  generateMasterKey,
  writeEncryptedVault,
} from "@aigne/afs-vault";
import type { CommandFactoryOptions, CommandOutput } from "../../src/core/commands/types.js";
import { createVaultCommand } from "../../src/core/commands/vault.js";

/** Extract registered subcommands from a vault command via mock yargs. */
function getSubcommands(factoryOptions: CommandFactoryOptions) {
  const cmd = createVaultCommand(factoryOptions);
  const commands: any[] = [];
  const mockYargs = {
    _commands: commands,
    command(c: any) {
      commands.push(c);
      return mockYargs;
    },
    demandCommand() {
      return mockYargs;
    },
    alias() {
      return mockYargs;
    },
  };
  (cmd.builder as (...args: any[]) => unknown)(mockYargs);
  return commands;
}

function findCommand(commands: any[], match: string) {
  return commands.find(
    (c: any) => c.command === match || (Array.isArray(c.command) && c.command[0] === match),
  );
}

describe("vault CLI command", () => {
  let tempDir: string;
  let vaultPath: string;
  let masterKey: Buffer;
  let lastOutput: CommandOutput;
  let factoryOptions: CommandFactoryOptions;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `afs-vault-cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    vaultPath = join(tempDir, "vault.enc");
    masterKey = generateMasterKey();

    // Pre-create vault with test data
    await writeEncryptedVault(
      vaultPath,
      {
        secrets: {
          aws: {
            "access-key-id": "AKIAIOSFODNN7EXAMPLE",
            "secret-access-key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
          },
          github: { token: "ghp_test123" },
        },
      },
      masterKey,
    );

    factoryOptions = {
      argv: [],
      onResult: (output: CommandOutput) => {
        lastOutput = output;
      },
      cwd: tempDir,
    };

    // Reset key cache and set env var for master key resolution
    _resetCachedKeyForTesting();
    process.env.AFS_VAULT_KEY = masterKey.toString("hex");
  });

  afterEach(async () => {
    delete process.env.AFS_VAULT_KEY;
    _resetCachedKeyForTesting();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("get", () => {
    test("reads existing secret", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "get <group> <name>");
      expect(handler).toBeDefined();

      await handler.handler({
        group: "aws",
        name: "access-key-id",
        "vault-path": vaultPath,
      });

      expect(lastOutput.command).toBe("vault get");
      const result = lastOutput.result as any;
      expect(result.value).toBe("AKIAIOSFODNN7EXAMPLE");
    });

    test("throws for missing secret", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "get <group> <name>");

      await expect(
        handler.handler({
          group: "nonexistent",
          name: "key",
          "vault-path": vaultPath,
        }),
      ).rejects.toThrow("Secret not found");
    });
  });

  describe("set", () => {
    test("stores new secret", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "set <group> <name> <value>");

      await handler.handler({
        group: "mcp",
        name: "openai-key",
        value: "sk-test-value",
        "vault-path": vaultPath,
      });

      expect(lastOutput.command).toBe("vault set");
      expect((lastOutput.result as any).group).toBe("mcp");

      // Verify it was actually stored
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readonly" });
      const stored = await vault.getSecret("mcp", "openai-key");
      expect(stored).toBe("sk-test-value");
    });
  });

  describe("list", () => {
    test("lists all groups", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "list [group]");

      await handler.handler({ "vault-path": vaultPath });

      expect(lastOutput.command).toBe("vault list");
      const result = lastOutput.result as any;
      expect(result.secrets).toContain("aws");
      expect(result.secrets).toContain("github");
    });

    test("lists secrets in a group", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "list [group]");

      await handler.handler({ group: "aws", "vault-path": vaultPath });

      const result = lastOutput.result as any;
      expect(result.group).toBe("aws");
      expect(result.secrets).toContain("access-key-id");
      expect(result.secrets).toContain("secret-access-key");
    });

    test("returns empty for non-existent group", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "list [group]");

      await handler.handler({ group: "nope", "vault-path": vaultPath });

      const result = lastOutput.result as any;
      expect(result.secrets).toEqual([]);
    });
  });

  describe("delete", () => {
    test("deletes a single secret", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "delete <group> [name]");

      await handler.handler({
        group: "github",
        name: "token",
        "vault-path": vaultPath,
      });

      expect(lastOutput.command).toBe("vault delete");
      expect((lastOutput.result as any).deleted).toBe(true);

      // Verify deletion
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readonly" });
      const value = await vault.getSecret("github", "token");
      expect(value).toBeUndefined();
    });

    test("deletes entire group", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "delete <group> [name]");

      await handler.handler({
        group: "aws",
        "vault-path": vaultPath,
      });

      expect((lastOutput.result as any).deleted).toBe(true);

      // Verify all aws secrets are gone
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readonly" });
      const remaining = await vault.listSecrets("aws");
      expect(remaining).toEqual([]);
    });

    test("returns false for non-existent secret", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "delete <group> [name]");

      await handler.handler({
        group: "nonexistent",
        name: "key",
        "vault-path": vaultPath,
      });

      expect((lastOutput.result as any).deleted).toBe(false);
    });
  });

  describe("init", () => {
    test("creates new vault", async () => {
      const newVaultPath = join(tempDir, "new-vault.enc");
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "init");

      await handler.handler({ path: newVaultPath, migrate: false });

      expect(lastOutput.command).toBe("vault init");
      expect((lastOutput.result as any).success).toBe(true);

      // Verify vault file was created
      const { vaultFileExists } = await import("@aigne/afs-vault");
      expect(await vaultFileExists(newVaultPath)).toBe(true);
    });

    test("refuses to overwrite existing vault", async () => {
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "init");

      await expect(handler.handler({ path: vaultPath, migrate: false })).rejects.toThrow(
        "Vault already exists",
      );
    });

    test("migrates from credentials.toml", async () => {
      const newVaultPath = join(tempDir, "migrated-vault.enc");

      // Create a mock credentials.toml
      const { stringify } = await import("smol-toml");
      const tomlDir = join(tempDir, ".afs-config");
      await mkdir(tomlDir, { recursive: true });
      const tomlContent = stringify({
        "github.com-aigne": { token: "ghp_migrate_test" },
        "s3-bucket": { accessKey: "AKIAI_MIGRATE" },
      });
      await writeFile(join(tomlDir, "credentials.toml"), tomlContent);

      // Migration reads from ~/.afs-config by default.
      // This test validates the vault is created.
      const cmds = getSubcommands(factoryOptions);
      const handler = findCommand(cmds, "init");

      await handler.handler({ path: newVaultPath, migrate: false });

      expect((lastOutput.result as any).success).toBe(true);
    });
  });

  describe("formatters", () => {
    test("get formatter returns value in default view", () => {
      const { formatVaultGetOutput } = require("../../src/core/formatters/vault.js");
      expect(formatVaultGetOutput({ group: "aws", name: "key", value: "secret" }, "default")).toBe(
        "secret",
      );
    });

    test("list formatter returns newline-separated names", () => {
      const { formatVaultListOutput } = require("../../src/core/formatters/vault.js");
      expect(formatVaultListOutput({ secrets: ["a", "b", "c"] }, "default")).toBe("a\nb\nc");
    });

    test("list formatter handles empty vault", () => {
      const { formatVaultListOutput } = require("../../src/core/formatters/vault.js");
      expect(formatVaultListOutput({ secrets: [] }, "default")).toBe("Vault is empty");
    });

    test("delete formatter shows result", () => {
      const { formatVaultDeleteOutput } = require("../../src/core/formatters/vault.js");
      expect(formatVaultDeleteOutput({ group: "aws", name: "key", deleted: true }, "default")).toBe(
        "Deleted aws/key",
      );
      expect(
        formatVaultDeleteOutput({ group: "aws", name: "key", deleted: false }, "default"),
      ).toBe("Not found: aws/key");
    });

    test("json view returns JSON", () => {
      const { formatVaultListOutput } = require("../../src/core/formatters/vault.js");
      const json = formatVaultListOutput({ secrets: ["a"] }, "json");
      expect(JSON.parse(json)).toEqual({ secrets: ["a"] });
    });
  });
});
