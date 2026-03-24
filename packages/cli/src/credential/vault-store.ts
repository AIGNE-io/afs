/**
 * VaultCredentialStore — encrypted credential storage backed by AFSVault.
 *
 * Implements the same CredentialStore interface as the TOML store.
 * Credentials are stored as vault secrets: group = key (URI-safe), fields = credential values.
 *
 * Storage mapping:
 *   CredentialStore key (mount URI) → vault group (sanitized)
 *   CredentialStore fields → vault secrets within that group
 */

import type { AFSModule } from "@aigne/afs";
import type { CredentialStore, Credentials } from "./store.js";

/**
 * Sanitize a CredentialStore key into a vault-safe group name.
 * Replaces slashes and special chars with dashes, strips protocol.
 */
function sanitizeKey(key: string): string {
  return key
    .replace(/^[a-z0-9]+:\/\//, "") // Strip protocol
    .replace(/[^a-zA-Z0-9._-]/g, "-") // Replace special chars
    .replace(/-+/g, "-") // Collapse multiple dashes
    .replace(/^-|-$/g, ""); // Trim leading/trailing dashes
}

/**
 * Create a CredentialStore backed by AFSVault.
 *
 * The vault module must support read, write, list, and delete operations.
 * Credentials are stored as groups of secrets in the vault.
 */
export function createVaultCredentialStore(vault: AFSModule): CredentialStore {
  return {
    async get(key: string): Promise<Credentials | undefined> {
      const group = sanitizeKey(key);
      if (!vault.list) return undefined;

      try {
        const listResult = await vault.list(`/${group}`);
        if (!listResult.data || listResult.data.length === 0) return undefined;

        const credentials: Credentials = {};
        for (const entry of listResult.data) {
          if (!vault.read) continue;
          const name = entry.path.split("/").pop();
          if (!name) continue;
          const readResult = await vault.read(entry.path);
          if (readResult.data?.content && typeof readResult.data.content === "string") {
            credentials[name] = readResult.data.content;
          }
        }

        return Object.keys(credentials).length > 0 ? credentials : undefined;
      } catch {
        // Group doesn't exist
        return undefined;
      }
    },

    async set(key: string, credentials: Credentials): Promise<void> {
      const group = sanitizeKey(key);
      if (!vault.write) {
        throw new Error("Vault is readonly — cannot store credentials");
      }

      for (const [field, value] of Object.entries(credentials)) {
        await vault.write(`/${group}/${field}`, { content: value });
      }
    },

    async delete(key: string): Promise<boolean> {
      const group = sanitizeKey(key);
      if (!vault.delete) return false;

      try {
        await vault.delete(`/${group}`);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export { sanitizeKey as _sanitizeKeyForTesting };
