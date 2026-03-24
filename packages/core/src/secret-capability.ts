/**
 * Secret Capability — scoped, audited access to vault secrets.
 *
 * Providers receive a SecretCapability at mount time.
 * They can only read secrets in their declared whitelist.
 * Every access is audit-logged.
 */

import { getPlatform } from "./platform/global.js";
import type { AFSModule, SecretAuditEntry, SecretCapability } from "./type.js";

/**
 * Audit log sink. Consumers provide their own storage (file, memory, etc.).
 */
export type SecretAuditSink = (entry: SecretAuditEntry) => void;

/**
 * In-memory audit log (default). Use createFileAuditSink() for persistence.
 */
export function createMemoryAuditSink(): {
  sink: SecretAuditSink;
  entries: SecretAuditEntry[];
} {
  const entries: SecretAuditEntry[] = [];
  return {
    sink: (entry) => entries.push(entry),
    entries,
  };
}

/**
 * File-based audit log (append-only, one JSON line per access).
 *
 * Returns a sink function with a `flush()` method to wait for all pending writes.
 *
 * @param filePath - Path to the audit log file (e.g., ~/.afs-config/vault-audit.log)
 */
export function createFileAuditSink(
  filePath: string,
): SecretAuditSink & { flush(): Promise<void> } {
  let dirCreated = false;
  // Serialize writes to preserve order
  let chain: Promise<void> = Promise.resolve();

  const sink = ((entry: SecretAuditEntry) => {
    const line = `${JSON.stringify(entry)}\n`;
    // Chain appends so they execute in order, fire-and-forget
    chain = chain
      .then(async () => {
        const platform = getPlatform();
        if (!dirCreated) {
          await platform.fs!.mkdir(platform.path.dirname(filePath), { recursive: true });
          dirCreated = true;
        }
        await platform.fs!.appendFile(filePath, line);
      })
      .catch(() => {
        // Audit write failure must not break secret access
      });
  }) as SecretAuditSink & { flush(): Promise<void> };

  sink.flush = () => chain;

  return sink;
}

/**
 * Composite audit sink — fans out to multiple sinks.
 */
export function createCompositeAuditSink(...sinks: SecretAuditSink[]): SecretAuditSink {
  return (entry: SecretAuditEntry) => {
    for (const sink of sinks) {
      sink(entry);
    }
  };
}

/**
 * Create a scoped SecretCapability for a provider.
 *
 * The vault module is read via its standard AFS read() method.
 * The whitelist restricts which secrets the caller can access.
 * Every access is logged through the audit sink.
 *
 * @param vault - The vault provider module (must support read())
 * @param whitelist - Secret names this provider is allowed to read (e.g., ["github/token"])
 * @param callerIdentity - Provider name or mount path for audit logging
 * @param auditSink - Where to log access events
 */
export function createSecretCapability(
  vault: AFSModule,
  whitelist: string[],
  callerIdentity: string,
  auditSink?: SecretAuditSink,
): SecretCapability {
  const allowedSet = new Set(whitelist);

  return {
    async get(name: string): Promise<string> {
      if (!allowedSet.has(name)) {
        throw new Error(`Secret access denied: "${name}" not in whitelist for ${callerIdentity}`);
      }

      auditSink?.({
        timestamp: Date.now(),
        caller: callerIdentity,
        secret: name,
        operation: "get",
      });

      if (!vault.read) {
        throw new Error("Vault module does not support read operations");
      }

      // Secret paths in vault: /group/name (e.g., /github/token)
      const path = name.startsWith("/") ? name : `/${name}`;
      const result = await vault.read(path);

      if (!result.data?.content) {
        throw new Error(`Secret not found: "${name}"`);
      }

      return result.data.content as string;
    },
  };
}

/**
 * Resolve vault:/// URIs in a config object.
 *
 * Walks the config and replaces any string value matching "vault:///path"
 * with the actual secret value read from the vault.
 *
 * @param config - Provider config object (mutated in place)
 * @param vault - The vault provider module
 * @param callerIdentity - For audit logging
 * @param auditSink - Where to log access events
 * @returns The resolved config (same reference, mutated)
 */
export async function resolveVaultURIs(
  config: Record<string, unknown>,
  vault: AFSModule,
  callerIdentity: string,
  auditSink?: SecretAuditSink,
): Promise<Record<string, unknown>> {
  if (!vault.read) {
    throw new Error("Vault module does not support read operations");
  }

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && value.startsWith("vault:///")) {
      const secretPath = value.slice("vault://".length); // Keep leading /

      auditSink?.({
        timestamp: Date.now(),
        caller: callerIdentity,
        secret: secretPath,
        operation: "resolve",
      });

      const result = await vault.read(secretPath);
      if (!result.data?.content) {
        throw new Error(`Failed to resolve ${value}: secret not found in vault`);
      }
      config[key] = result.data.content as string;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      await resolveVaultURIs(value as Record<string, unknown>, vault, callerIdentity, auditSink);
    }
  }

  return config;
}
