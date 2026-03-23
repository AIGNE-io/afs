/**
 * did Command — Identity & trust management for AFS entities.
 *
 * Subcommands: init, check, issue, verify, info.
 */

import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import type { Argv, CommandModule } from "yargs";
import { ExitCode } from "../../errors.js";
import {
  type DIDInfoResult,
  type DIDInitResult,
  type DIDIssueResult,
  type DIDVerifyResult,
  formatProviderCheckOutput,
  formatProviderInfoOutput,
  formatProviderInitOutput,
  formatProviderIssueOutput,
  formatProviderVerifyOutput,
} from "../formatters/provider.js";
import {
  detectEntityType,
  findEntityDirs,
  readEntityInfo,
  validateBlockletPackage,
  validateProviderPackage,
} from "./did-helpers.js";
import { createDIDIssuerSubcommand } from "./did-issuer.js";
import type { CommandFactoryOptions } from "./types.js";

/**
 * Create DID command factory (with subcommands)
 */
export function createDIDCommand(options: CommandFactoryOptions): CommandModule {
  return {
    command: "did",
    describe: "Identity & trust management",
    builder: (yargs: Argv) =>
      yargs
        .command(createDIDInitSubcommand(options))
        .command(createDIDCheckSubcommand(options))
        .command(createDIDIssueSubcommand(options))
        .command(createDIDVerifySubcommand(options))
        .command(createDIDInfoSubcommand(options))
        .command(createDIDIssuerSubcommand(options))
        .demandCommand(1, "Please specify a subcommand")
        .alias("help", "h"),
    handler: () => {},
  };
}

export async function readConformanceResults(
  dir: string,
): Promise<{ passed: number; failed: number; skipped: number; total: number } | undefined> {
  try {
    const xml = await fs.readFile(path.join(dir, ".afs", "conformance-results.xml"), "utf-8");
    const testsMatch = xml.match(/tests="(\d+)"/);
    const failuresMatch = xml.match(/failures="(\d+)"/);
    const errorsMatch = xml.match(/errors="(\d+)"/);
    const skippedMatch = xml.match(/skipped="(\d+)"/);
    const total = testsMatch ? Number.parseInt(testsMatch[1]!, 10) : 0;
    if (total === 0) return undefined;
    const failed =
      (failuresMatch ? Number.parseInt(failuresMatch[1]!, 10) : 0) +
      (errorsMatch ? Number.parseInt(errorsMatch[1]!, 10) : 0);
    const skipped = skippedMatch ? Number.parseInt(skippedMatch[1]!, 10) : 0;
    const passed = total - failed - skipped;
    return { passed, failed, skipped, total };
  } catch {
    return undefined;
  }
}

export async function readAgentMdCapabilities(
  dir: string,
): Promise<{ operations?: string[]; riskLevel?: string } | undefined> {
  try {
    const agentMd = await fs.readFile(path.join(dir, ".afs", "AGENT.md"), "utf-8");
    // Simple frontmatter extraction
    const match = agentMd.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return undefined;
    const yamlContent = match[1]!;
    const operations = yamlContent
      .match(/operations:\s*\[([^\]]*)\]/)?.[1]
      ?.split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
    const riskLevel = yamlContent.match(/riskLevel:\s*['"]?(\w+)/)?.[1];
    return { operations, riskLevel };
  } catch {
    return undefined;
  }
}

// ── init ──────────────────────────────────────────────────────

interface DIDInitArgs {
  force?: boolean;
  developer?: boolean;
  provider?: boolean;
  blocklet?: boolean;
}

function createDIDInitSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, DIDInitArgs> {
  return {
    command: "init",
    describe: "Generate DID identity (--developer | --provider | --blocklet | auto-detect)",
    builder: {
      force: {
        type: "boolean",
        description: "Overwrite existing identity",
        default: false,
      },
      developer: {
        type: "boolean",
        description: "Generate developer root key (ROLE_ACCOUNT)",
        default: false,
      },
      provider: {
        type: "boolean",
        description: "Derive provider DID from developer key (ROLE_PROVIDER)",
        default: false,
      },
      blocklet: {
        type: "boolean",
        description: "Derive blocklet DID from developer key (ROLE_BLOCKLET)",
        default: false,
      },
    },
    handler: async (argv) => {
      const cwd = options.cwd ?? process.cwd();
      const home = homedir();

      // CLI-specific: multi-flag validation
      const flagCount = [argv.developer, argv.provider, argv.blocklet].filter(Boolean).length;
      if (flagCount > 1) {
        options.onResult({
          command: "did init",
          result: {
            batch: false,
            status: "error" as const,
            error: "Only one of --developer, --provider, --blocklet can be specified",
          },
          format: formatProviderInitOutput,
          error: {
            code: ExitCode.RUNTIME_ERROR,
            message: "Only one of --developer, --provider, --blocklet can be specified",
          },
        });
        return;
      }

      const entityType = argv.developer
        ? ("developer" as const)
        : argv.provider
          ? ("provider" as const)
          : argv.blocklet
            ? ("blocklet" as const)
            : undefined;

      const result = await performDIDInit({ entityType, force: argv.force, cwd, home });
      options.onResult({
        command: "did init",
        result,
        format: formatProviderInitOutput,
        ...(result.status === "error" && {
          error: {
            code: result.error?.includes("not found") ? ExitCode.NOT_FOUND : ExitCode.RUNTIME_ERROR,
            message: result.error!,
          },
        }),
      });
    },
  };
}

// ── check ──────────────────────────────────────────────────────

type DIDCheckArgs = Record<string, never>;

function createDIDCheckSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, DIDCheckArgs> {
  return {
    command: "check",
    describe: "Run conformance tests for current provider",
    builder: {},
    handler: async (_argv) => {
      const cwd = options.cwd ?? process.cwd();
      const entity = await readEntityInfo(cwd);

      // Conformance check is not applicable to blocklets
      if (entity.entityType === "blocklet") {
        options.onResult({
          command: "did check",
          result: {
            name: entity.name,
            success: false,
            error:
              "Conformance check is not applicable to blocklets. Use `afs did issue --skip-check` to issue a VC.",
          },
          format: formatProviderCheckOutput,
        });
        return;
      }

      // Check if conformance test exists
      const testFile = path.join(cwd, "test", "conformance.test.ts");
      try {
        await fs.access(testFile);
      } catch {
        options.onResult({
          command: "did check",
          result: {
            name: entity.name,
            success: false,
            error: "No conformance test found at test/conformance.test.ts",
          },
          format: formatProviderCheckOutput,
          error: {
            code: ExitCode.NOT_FOUND,
            message: "No conformance test found at test/conformance.test.ts",
          },
        });
        return;
      }

      // Run bun test with JUnit reporter
      const { execSync } = await import("node:child_process");
      const xmlFile = path.join(cwd, ".afs", "conformance-results.xml");
      await fs.mkdir(path.join(cwd, ".afs"), { recursive: true });

      try {
        execSync(
          `bun test test/conformance.test.ts --reporter=junit --reporter-outfile=${xmlFile}`,
          { cwd, timeout: 120000, stdio: "pipe" },
        );
      } catch {
        // Test may fail but still produce XML output
      }

      // Parse JUnit XML
      let passed = 0;
      let failed = 0;
      let total = 0;
      try {
        const xml = await fs.readFile(xmlFile, "utf-8");
        const testsMatch = xml.match(/tests="(\d+)"/);
        const failuresMatch = xml.match(/failures="(\d+)"/);
        const errorsMatch = xml.match(/errors="(\d+)"/);
        total = testsMatch ? Number.parseInt(testsMatch[1]!, 10) : 0;
        failed =
          (failuresMatch ? Number.parseInt(failuresMatch[1]!, 10) : 0) +
          (errorsMatch ? Number.parseInt(errorsMatch[1]!, 10) : 0);
        passed = total - failed;
      } catch {
        options.onResult({
          command: "did check",
          result: {
            name: entity.name,
            success: false,
            error: "Failed to parse test results",
          },
          format: formatProviderCheckOutput,
          error: { code: ExitCode.RUNTIME_ERROR, message: "Failed to parse test results" },
        });
        return;
      }

      options.onResult({
        command: "did check",
        result: {
          name: entity.name,
          success: failed === 0,
          passed,
          failed,
          total,
        },
        format: formatProviderCheckOutput,
      });
    },
  };
}

// ── issue ──────────────────────────────────────────────────────

interface DIDIssueArgs {
  "skip-check"?: boolean;
  "counter-sign"?: boolean;
  "issuer-key"?: string;
  expiration?: string;
  all?: boolean;
  trust?: boolean;
}

function createDIDIssueSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, DIDIssueArgs> {
  return {
    command: "issue",
    describe: "Issue verifiable credential",
    builder: {
      "skip-check": {
        type: "boolean",
        description: "Skip conformance check",
        default: false,
      },
      "counter-sign": {
        type: "boolean",
        description: "Counter-sign existing VC with trusted issuer key",
        default: false,
      },
      "issuer-key": {
        type: "string",
        description: "Path to issuer key file (for counter-sign)",
      },
      expiration: {
        type: "string",
        description: "Expiration date (ISO format)",
      },
      all: {
        type: "boolean",
        description: "Issue VCs for all entities (providers + blocklets)",
        default: false,
      },
      trust: {
        type: "boolean",
        description: "Auto-register issuer as trusted after counter-sign",
        default: false,
      },
    },
    handler: async (argv) => {
      const cwd = options.cwd ?? process.cwd();
      const home = homedir();

      // Validate --trust flag requirements
      if (argv.trust) {
        if (!argv["counter-sign"]) {
          options.onResult({
            command: "did issue",
            result: { batch: false, status: "error", error: "--trust requires --counter-sign" },
            format: formatProviderIssueOutput,
            error: { code: ExitCode.RUNTIME_ERROR, message: "--trust requires --counter-sign" },
          });
          return;
        }
        if (!argv["issuer-key"]) {
          options.onResult({
            command: "did issue",
            result: { batch: false, status: "error", error: "--trust requires --issuer-key" },
            format: formatProviderIssueOutput,
            error: { code: ExitCode.RUNTIME_ERROR, message: "--trust requires --issuer-key" },
          });
          return;
        }
      }

      if (argv.all) {
        const dirs = await findEntityDirs(cwd);
        const results: Array<{
          name: string;
          did: string;
          status: "issued" | "counter-signed" | "skipped" | "error";
          level?: string;
          error?: string;
          passed?: number;
          total?: number;
        }> = [];

        for (const dir of dirs) {
          try {
            const result = await issueForEntity(dir, home, argv);
            results.push(result);
          } catch (err) {
            let name = path.basename(dir);
            try {
              name = (await readEntityInfo(dir)).name;
            } catch {
              /* fallback to dirname */
            }
            results.push({
              name,
              did: "",
              status: "error",
              error: (err as Error).message,
            });
          }
        }

        const hasErrors = results.some((r) => r.status === "error");
        options.onResult({
          command: "did issue",
          result: { batch: true, results },
          format: formatProviderIssueOutput,
          ...(hasErrors && {
            error: { code: ExitCode.PARTIAL, message: "Some providers failed" },
          }),
        });
      } else {
        try {
          const result = await issueForEntity(cwd, home, argv);
          options.onResult({
            command: "did issue",
            result: { batch: false, ...result },
            format: formatProviderIssueOutput,
            ...(result.status === "error" && {
              error: {
                code: ExitCode.RUNTIME_ERROR,
                message: result.error ?? "Unknown error",
              },
            }),
          });
        } catch (err) {
          options.onResult({
            command: "did issue",
            result: { batch: false, status: "error", error: (err as Error).message },
            format: formatProviderIssueOutput,
            error: { code: ExitCode.RUNTIME_ERROR, message: (err as Error).message },
          });
        }
      }
    },
  };
}

export async function issueForEntity(
  dir: string,
  home: string,
  argv: DIDIssueArgs,
): Promise<{
  name: string;
  did: string;
  status: "issued" | "counter-signed" | "skipped" | "error";
  level?: string;
  entityType?: string;
  error?: string;
  passed?: number;
  total?: number;
  trustWarning?: string;
}> {
  const {
    createDerivedIdentity,
    loadDeveloperKey,
    saveIdentity,
    loadIdentity,
    issueProviderVC,
    issueBlockletVC,
    counterSignProviderVC,
    saveCredential,
    loadCredential,
    identityToWallet,
    verifyVC,
    buildTrustedIssuers,
  } = await import("@aigne/afs-trust");

  const entity = await readEntityInfo(dir);

  // ── Counter-sign mode: append Trusted Issuer proof to existing VC ──
  if (argv["counter-sign"]) {
    const issuerKeyPath = argv["issuer-key"];
    if (!issuerKeyPath) {
      return {
        name: entity.name,
        did: "",
        status: "error",
        error: "--counter-sign requires --issuer-key <path>",
      };
    }

    // Load existing credential (must exist — self-sign first)
    const loaded = await loadCredential(dir);
    if (!loaded.credential) {
      return {
        name: entity.name,
        did: "",
        status: "error",
        error:
          "No existing .did/vc.json found. Run `afs did issue` first (self-sign), then counter-sign.",
      };
    }

    // Load issuer key
    let issuerKeyJson: { did: string; pk: string; sk: string; type: string };
    try {
      const resolvedPath = issuerKeyPath.startsWith("~")
        ? path.join(home, issuerKeyPath.slice(1))
        : path.resolve(issuerKeyPath);
      const keyContent = await fs.readFile(resolvedPath, "utf-8");
      issuerKeyJson = JSON.parse(keyContent);
      if (!issuerKeyJson.sk) {
        throw new Error("Issuer key file missing sk (secret key)");
      }
    } catch (err) {
      return {
        name: entity.name,
        did: loaded.did ?? "",
        status: "error",
        error: `Failed to load issuer key: ${(err as Error).message}`,
      };
    }

    const issuerWallet = identityToWallet(issuerKeyJson as any);

    // Counter-sign (chain mode — AFS default)
    const counterSigned = await counterSignProviderVC(loaded.credential, issuerWallet);
    await saveCredential(dir, counterSigned);

    // Verify and determine trust level
    const ownerDid = loaded.did ?? "";
    const trustedIssuers = await buildTrustedIssuers(ownerDid, home);
    // Also include the issuer key DID in case it's not yet registered
    if (!trustedIssuers.includes(issuerKeyJson.did)) {
      trustedIssuers.push(issuerKeyJson.did);
    }
    const result = await verifyVC({
      vc: counterSigned,
      ownerDid,
      trustedIssuers,
    });

    // Auto-register issuer if --trust flag is set
    let trustWarning: string | undefined;
    if (argv.trust && argv["issuer-key"]) {
      try {
        const { addTrustedIssuer } = await import("@aigne/afs-trust");
        const issuerName = path.basename(argv["issuer-key"], path.extname(argv["issuer-key"]));
        await addTrustedIssuer(home, issuerName, {
          did: issuerKeyJson.did,
          pk: issuerKeyJson.pk,
          name: issuerName,
          source: "manual",
        });
      } catch (err) {
        // Trust registration failure is non-fatal — keep counter-sign result, pass warning via result
        trustWarning = `Counter-sign succeeded but failed to register issuer as trusted: ${(err as Error).message}`;
      }
    }

    return {
      name: entity.name,
      did: ownerDid,
      status: "counter-signed",
      level: result.trustLevel ?? "verified",
      entityType: entity.entityType,
      trustWarning,
    };
  }

  // ── Self-sign mode (default): create new VC ──

  // Check for conformance test if not skipping (providers only — blocklets have no conformance)
  if (!argv["skip-check"] && entity.entityType === "provider") {
    const testFile = path.join(dir, "test", "conformance.test.ts");
    try {
      await fs.access(testFile);
    } catch {
      return {
        name: entity.name,
        did: "",
        status: "skipped",
        error: "no conformance test",
        entityType: entity.entityType,
      };
    }
  }

  // Ensure identity exists (auto-derive from developer key if not)
  let identity = await loadIdentity(entity.name, home);
  if (!identity) {
    const developerKey = await loadDeveloperKey(home);
    if (!developerKey) {
      return {
        name: entity.name,
        did: "",
        status: "error",
        error: "Developer root key not found. Run `afs did init --developer` first.",
        entityType: entity.entityType,
      };
    }
    identity = createDerivedIdentity(entity.entityType, entity.name, developerKey);
    await saveIdentity(entity.name, identity, home);
  }

  const resolvedIdentity = identity!;
  const wallet = identityToWallet(resolvedIdentity);
  const capabilities = await readAgentMdCapabilities(dir);
  const conformance = await readConformanceResults(dir);

  // Issue VC — branch by entity type
  let vc: Record<string, unknown>;
  if (entity.entityType === "blocklet" && entity.blockletManifest) {
    vc = await issueBlockletVC({
      subject: {
        id: resolvedIdentity.did,
        blocklet: entity.blockletManifest,
        verification: {
          capabilities: capabilities ? { operations: capabilities.operations } : undefined,
          securityManifest: capabilities?.riskLevel
            ? { declared: true, riskLevel: capabilities.riskLevel }
            : undefined,
        },
      },
      issuerWallet: wallet,
      issuerName: "self",
      expirationDate: argv.expiration,
    });
  } else {
    vc = await issueProviderVC({
      subject: {
        id: resolvedIdentity.did,
        provider: {
          name: entity.name,
          version: entity.version,
        },
        verification: {
          conformance: conformance
            ? {
                passed: conformance.passed,
                failed: conformance.failed,
                skipped: conformance.skipped,
              }
            : undefined,
          capabilities: capabilities ? { operations: capabilities.operations } : undefined,
          securityManifest: capabilities?.riskLevel
            ? {
                declared: true,
                riskLevel: capabilities.riskLevel,
              }
            : undefined,
        },
      },
      issuerWallet: wallet,
      issuerName: "self",
      expirationDate: argv.expiration,
    });
  }

  await saveCredential(dir, vc);

  // Determine trust level
  const result = await verifyVC({
    vc,
    ownerDid: resolvedIdentity.did,
    trustedIssuers: [resolvedIdentity.did],
  });

  return {
    name: entity.name,
    did: resolvedIdentity.did,
    status: "issued",
    level: result.trustLevel ?? "conformant",
    entityType: entity.entityType,
  };
}

// ── verify ──────────────────────────────────────────────────────

type DIDVerifyArgs = Record<string, never>;

function createDIDVerifySubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, DIDVerifyArgs> {
  return {
    command: "verify",
    describe: "Verify credential",
    builder: {},
    handler: async (_argv) => {
      const cwd = options.cwd ?? process.cwd();
      const result = await performDIDVerify({ cwd, home: homedir() });
      options.onResult({
        command: "did verify",
        result,
        format: formatProviderVerifyOutput,
        ...(!result.valid && {
          error: {
            code: result.error?.includes("No credential")
              ? ExitCode.NOT_FOUND
              : ExitCode.RUNTIME_ERROR,
            message: result.error!,
          },
        }),
      });
    },
  };
}

// ── info ──────────────────────────────────────────────────────

type DIDInfoArgs = Record<string, never>;

function createDIDInfoSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, DIDInfoArgs> {
  return {
    command: "info",
    describe: "Show identity and credential info",
    builder: {},
    handler: async (_argv) => {
      const cwd = options.cwd ?? process.cwd();
      const result = await performDIDInfo({ cwd, home: homedir() });
      options.onResult({
        command: "did info",
        result,
        format: formatProviderInfoOutput,
      });
    },
  };
}

// ── perform* functions — shared by CLI handlers and MCP tools ──

/**
 * Core logic for `did init`. Returns a result object, no side-effect on CLI output.
 */
export async function performDIDInit(params: {
  entityType?: "developer" | "provider" | "blocklet";
  force?: boolean;
  cwd: string;
  home: string;
}): Promise<DIDInitResult> {
  const {
    createDeveloperIdentity,
    saveDeveloperKey,
    loadDeveloperKey,
    createDerivedIdentity,
    saveIdentity,
    loadIdentity,
  } = await import("@aigne/afs-trust");

  const { entityType, force, cwd, home } = params;

  // ── Developer mode ──
  if (entityType === "developer") {
    const existing = await loadDeveloperKey(home);
    if (existing && !force) {
      return { batch: false, name: "developer", did: existing.did, status: "skipped" };
    }
    const identity = createDeveloperIdentity();
    await saveDeveloperKey(identity, home, { force });
    return {
      batch: false,
      name: "developer",
      did: identity.did,
      status: "created",
      entityType: "developer",
    };
  }

  // ── Derived mode (explicit or auto-detect) ──
  let resolvedType: "provider" | "blocklet";
  let name: string;

  if (entityType === "provider") {
    resolvedType = "provider";
    name = (await validateProviderPackage(cwd)).name;
  } else if (entityType === "blocklet") {
    resolvedType = "blocklet";
    name = (await validateBlockletPackage(cwd)).name;
  } else {
    // Auto-detect
    const detected = await detectEntityType(cwd);
    if (!detected) {
      return {
        batch: false,
        status: "error",
        error:
          "Cannot detect entity type. Use --developer, --provider, or --blocklet explicitly. (No package.json or blocklet.yaml found)",
      };
    }
    resolvedType = detected;
    name =
      detected === "blocklet"
        ? (await validateBlockletPackage(cwd)).name
        : (await validateProviderPackage(cwd)).name;
  }

  // Load developer root key — required for derivation
  const developerKey = await loadDeveloperKey(home);
  if (!developerKey) {
    return {
      batch: false,
      name,
      status: "error",
      error: "Developer root key not found. Run `afs did init --developer` first.",
    };
  }

  const existing = await loadIdentity(name, home);
  if (existing && !force) {
    return { batch: false, name, did: existing.did, status: "skipped", entityType: resolvedType };
  }

  const identity = createDerivedIdentity(resolvedType, name, developerKey);
  await saveIdentity(name, identity, home, { force });
  return {
    batch: false,
    name,
    did: identity.did,
    status: "created",
    entityType: resolvedType,
    derivedFrom: developerKey.did,
  };
}

/**
 * Core logic for `did verify`. Returns a result object.
 */
export async function performDIDVerify(params: {
  cwd: string;
  home: string;
}): Promise<DIDVerifyResult> {
  const { loadCredential, verifyVC, buildTrustedIssuers } = await import("@aigne/afs-trust");
  const { cwd, home } = params;
  const entity = await readEntityInfo(cwd);

  const loaded = await loadCredential(cwd);
  if (!loaded.credential) {
    return {
      name: entity.name,
      entityType: entity.entityType,
      valid: false,
      error: "No credential found at .did/vc.json",
    };
  }

  const ownerDid = loaded.did ?? "";
  const issuers = await buildTrustedIssuers(ownerDid, home);
  const result = await verifyVC({ vc: loaded.credential, ownerDid, trustedIssuers: issuers });

  return {
    name: entity.name,
    entityType: entity.entityType,
    valid: result.valid,
    trustLevel: result.trustLevel,
    error: result.error,
    issuer: (loaded.credential as any).issuer?.id,
    did: ownerDid,
  };
}

/**
 * Core logic for `did info`. Returns a result object.
 */
export async function performDIDInfo(params: {
  cwd: string;
  home: string;
}): Promise<DIDInfoResult> {
  const { loadIdentity, loadCredential } = await import("@aigne/afs-trust");
  const { cwd, home } = params;
  const entity = await readEntityInfo(cwd);

  const identity = await loadIdentity(entity.name, home);
  const loaded = await loadCredential(cwd);
  const capabilities = await readAgentMdCapabilities(cwd);

  return {
    name: entity.displayName,
    entityType: entity.entityType,
    version: entity.version,
    did: identity?.did ?? loaded.did,
    identityStore: identity
      ? path.join(home, ".afs", "identities", `${entity.name}.json`)
      : undefined,
    hasCredential: !!loaded.credential,
    credentialPath: loaded.credential ? path.join(cwd, ".did", "vc.json") : undefined,
    issuer: (loaded.credential as any)?.issuer?.id,
    capabilities: capabilities?.operations,
    riskLevel: capabilities?.riskLevel,
  };
}

/**
 * Core logic for `did issue` (self-sign mode only).
 * Counter-sign mode stays in the CLI handler (requires --issuer-key file path).
 */
export async function performDIDIssueSelfSign(params: {
  skipCheck?: boolean;
  cwd: string;
  home: string;
}): Promise<DIDIssueResult> {
  const result = await issueForEntity(params.cwd, params.home, {
    "skip-check": params.skipCheck,
    "counter-sign": false,
  });
  return { batch: false, ...result };
}
