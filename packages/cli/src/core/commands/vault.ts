/**
 * vault Command - Core Implementation
 *
 * Vault management commands for encrypted secret storage.
 * Subcommands: init, get, set, list, delete.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { Argv, CommandModule } from "yargs";
import {
  formatVaultDeleteOutput,
  formatVaultGetOutput,
  formatVaultInitOutput,
  formatVaultListOutput,
  formatVaultSetOutput,
} from "../formatters/vault.js";
import type { CommandFactoryOptions } from "./types.js";

/** Default vault file location */
const DEFAULT_VAULT_DIR = ".afs-config";
const DEFAULT_VAULT_FILE = "vault.enc";

function defaultVaultPath(): string {
  return join(homedir(), DEFAULT_VAULT_DIR, DEFAULT_VAULT_FILE);
}

/**
 * Resolve master key using the vault's key resolution chain:
 * OS keychain → AFS_VAULT_KEY env var → passphrase prompt.
 */
async function loadMasterKey(): Promise<Buffer> {
  const { resolveMasterKey } = await import("@aigne/afs-vault");
  return resolveMasterKey();
}

/**
 * Create vault command factory (with subcommands)
 */
export function createVaultCommand(options: CommandFactoryOptions): CommandModule {
  return {
    command: "vault",
    describe: "Encrypted secret storage",
    builder: (yargs: Argv) =>
      yargs
        .command(createVaultInitSubcommand(options))
        .command(createVaultGetSubcommand(options))
        .command(createVaultSetSubcommand(options))
        .command(createVaultListSubcommand(options))
        .command(createVaultDeleteSubcommand(options))
        .demandCommand(1, "Please specify a subcommand")
        .alias("help", "h"),
    handler: () => {},
  };
}

// ── init ──────────────────────────────────────────────────────────────

interface VaultInitArgs {
  path?: string;
  migrate?: boolean;
}

function createVaultInitSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, VaultInitArgs> {
  return {
    command: "init",
    describe: "Initialize a new encrypted vault",
    builder: {
      path: {
        type: "string",
        description: "Path for vault file",
        default: defaultVaultPath(),
      },
      migrate: {
        type: "boolean",
        description: "Migrate existing credentials.toml into vault",
        default: true,
      },
    },
    handler: async (argv) => {
      const vaultPath = argv.path ?? defaultVaultPath();

      const { generateMasterKey, writeEncryptedVault, vaultFileExists } = await import(
        "@aigne/afs-vault"
      );

      if (await vaultFileExists(vaultPath)) {
        throw new Error(`Vault already exists at ${vaultPath}. Delete it first to re-initialize.`);
      }

      const masterKey = generateMasterKey();

      // Create empty vault
      await writeEncryptedVault(vaultPath, { secrets: {} }, masterKey);

      // Try to store in OS keychain
      const { storeKeychain } = await import("@aigne/afs-vault");
      const stored = await storeKeychain(masterKey);

      let migrated = 0;

      // Migrate from credentials.toml if requested
      if (argv.migrate !== false) {
        migrated = await migrateFromToml(vaultPath, masterKey);
      }

      const hexKey = masterKey.toString("hex");

      options.onResult({
        command: "vault init",
        result: { success: true, vaultPath, migrated, keychainStored: stored },
        format: (result, view) => {
          const base = formatVaultInitOutput(result, view);
          if (view === "json") return base;
          const lines = [base];
          if (stored) {
            lines.push("\nMaster key stored in OS keychain.");
          } else {
            lines.push(
              `\nMaster key (save this securely — it cannot be recovered):\n${hexKey}`,
              `\nSet it as: export AFS_VAULT_KEY=${hexKey}`,
            );
          }
          return lines.join("");
        },
      });
    },
  };
}

/**
 * Migrate credentials.toml entries into the vault.
 * Returns count of migrated credential groups.
 */
async function migrateFromToml(vaultPath: string, masterKey: Buffer): Promise<number> {
  const { readFile } = await import("node:fs/promises");
  const { parse } = await import("smol-toml");
  const { AFSVault } = await import("@aigne/afs-vault");

  const tomlPath = join(homedir(), DEFAULT_VAULT_DIR, "credentials.toml");

  let content: string;
  try {
    content = await readFile(tomlPath, "utf-8");
  } catch {
    return 0; // No credentials.toml — nothing to migrate
  }

  let data: Record<string, unknown>;
  try {
    data = parse(content) as Record<string, unknown>;
  } catch {
    return 0; // Corrupted file — skip migration
  }

  const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readwrite" });
  let count = 0;

  for (const [group, values] of Object.entries(data)) {
    if (typeof values !== "object" || values === null || Array.isArray(values)) continue;
    // Sanitize group name for vault
    const safeGroup = group
      .replace(/^[a-z0-9]+:\/\//, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!safeGroup) continue;

    for (const [key, val] of Object.entries(values as Record<string, unknown>)) {
      if (typeof val === "string") {
        await vault.setSecret(safeGroup, key, val);
      }
    }
    count++;
  }

  return count;
}

// ── get ──────────────────────────────────────────────────────────────

interface VaultGetArgs {
  group: string;
  name: string;
  "vault-path"?: string;
}

function createVaultGetSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, VaultGetArgs> {
  return {
    command: "get <group> <name>",
    describe: "Read a secret value",
    builder: {
      group: {
        type: "string",
        demandOption: true,
        description: "Secret group (e.g., aws, github)",
      },
      name: {
        type: "string",
        demandOption: true,
        description: "Secret name (e.g., token, access-key-id)",
      },
      "vault-path": {
        type: "string",
        description: "Path to vault file",
      },
    },
    handler: async (argv) => {
      const { AFSVault } = await import("@aigne/afs-vault");
      const vaultPath = argv["vault-path"] ?? defaultVaultPath();
      const masterKey = await loadMasterKey();
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readonly" });

      const value = await vault.getSecret(argv.group, argv.name);
      if (value === undefined) {
        throw new Error(`Secret not found: ${argv.group}/${argv.name}`);
      }

      options.onResult({
        command: "vault get",
        result: { group: argv.group, name: argv.name, value },
        format: formatVaultGetOutput,
      });
    },
  };
}

// ── set ──────────────────────────────────────────────────────────────

interface VaultSetArgs {
  group: string;
  name: string;
  value: string;
  "vault-path"?: string;
}

function createVaultSetSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, VaultSetArgs> {
  return {
    command: "set <group> <name> <value>",
    describe: "Store a secret",
    builder: {
      group: {
        type: "string",
        demandOption: true,
        description: "Secret group (e.g., aws, github)",
      },
      name: {
        type: "string",
        demandOption: true,
        description: "Secret name (e.g., token, access-key-id)",
      },
      value: {
        type: "string",
        demandOption: true,
        description: "Secret value",
      },
      "vault-path": {
        type: "string",
        description: "Path to vault file",
      },
    },
    handler: async (argv) => {
      const { AFSVault } = await import("@aigne/afs-vault");
      const vaultPath = argv["vault-path"] ?? defaultVaultPath();
      const masterKey = await loadMasterKey();
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readwrite" });

      await vault.setSecret(argv.group, argv.name, argv.value);

      options.onResult({
        command: "vault set",
        result: { group: argv.group, name: argv.name },
        format: formatVaultSetOutput,
      });
    },
  };
}

// ── list ─────────────────────────────────────────────────────────────

interface VaultListArgs {
  group?: string;
  "vault-path"?: string;
}

function createVaultListSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, VaultListArgs> {
  return {
    command: ["list [group]", "ls [group]"],
    describe: "List secrets",
    builder: {
      group: {
        type: "string",
        description: "Secret group to list (omit for all groups)",
      },
      "vault-path": {
        type: "string",
        description: "Path to vault file",
      },
    },
    handler: async (argv) => {
      const { AFSVault } = await import("@aigne/afs-vault");
      const vaultPath = argv["vault-path"] ?? defaultVaultPath();
      const masterKey = await loadMasterKey();
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readonly" });

      const secrets = await vault.listSecrets(argv.group);

      options.onResult({
        command: "vault list",
        result: { group: argv.group, secrets },
        format: formatVaultListOutput,
      });
    },
  };
}

// ── delete ───────────────────────────────────────────────────────────

interface VaultDeleteArgs {
  group: string;
  name?: string;
  "vault-path"?: string;
}

function createVaultDeleteSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, VaultDeleteArgs> {
  return {
    command: ["delete <group> [name]", "rm <group> [name]"],
    describe: "Delete a secret or group",
    builder: {
      group: {
        type: "string",
        demandOption: true,
        description: "Secret group",
      },
      name: {
        type: "string",
        description: "Secret name (omit to delete entire group)",
      },
      "vault-path": {
        type: "string",
        description: "Path to vault file",
      },
    },
    handler: async (argv) => {
      const { AFSVault } = await import("@aigne/afs-vault");
      const vaultPath = argv["vault-path"] ?? defaultVaultPath();
      const masterKey = await loadMasterKey();
      const vault = new AFSVault({ vaultPath, masterKey, accessMode: "readwrite" });

      let deleted: boolean;
      if (argv.name) {
        deleted = await vault.deleteSecret(argv.group, argv.name);
      } else {
        // Delete entire group by listing all secrets and deleting each
        const secrets = await vault.listSecrets(argv.group);
        if (secrets.length === 0) {
          deleted = false;
        } else {
          for (const secretPath of secrets) {
            const secretName = secretPath.split("/").pop()!;
            await vault.deleteSecret(argv.group, secretName);
          }
          deleted = true;
        }
      }

      options.onResult({
        command: "vault delete",
        result: { group: argv.group, name: argv.name, deleted },
        format: formatVaultDeleteOutput,
      });
    },
  };
}
