/**
 * did issuer Command — Trusted issuer management for AFS trust store.
 *
 * Subcommands: list, add, remove, inspect.
 */

import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import type { Argv, CommandModule } from "yargs";
import { CLIError, ExitCode, NotFoundError } from "../../errors.js";
import {
  formatIssuerAddOutput,
  formatIssuerInspectOutput,
  formatIssuerListOutput,
  formatIssuerRemoveOutput,
  formatIssuerResetOutput,
  type IssuerAddResult,
  type IssuerInspectResult,
  type IssuerListResult,
  type IssuerRemoveResult,
  type IssuerResetResult,
} from "../formatters/provider.js";
import type { CommandFactoryOptions } from "./types.js";

// ── Validation helpers ──────────────────────────────────────

function validateIssuerName(name: string): void {
  if (!name || name.trim() === "") {
    throw new CLIError("Issuer name required", ExitCode.RUNTIME_ERROR);
  }
  if (name.includes("..")) {
    throw new CLIError("Invalid issuer name: path traversal not allowed", ExitCode.RUNTIME_ERROR);
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new CLIError("Invalid issuer name: must not contain / or \\", ExitCode.RUNTIME_ERROR);
  }
}

function validateDid(did: string): void {
  if (!did || did.trim() === "") {
    throw new CLIError("DID value must not be empty", ExitCode.RUNTIME_ERROR);
  }
  if (!did.startsWith("z")) {
    throw new CLIError("Invalid DID format: must start with 'z'", ExitCode.RUNTIME_ERROR);
  }
}

// ── Issuers directory helper ────────────────────────────────

function issuersDir(home: string): string {
  return path.join(home, ".afs", "trusted-issuers");
}

// ── perform* functions ──────────────────────────────────────

export async function performIssuerList(params: { home: string }): Promise<IssuerListResult> {
  const dir = issuersDir(params.home);
  const issuers: IssuerListResult["issuers"] = [];

  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".did.json")) continue;
      try {
        const content = await fs.readFile(path.join(dir, entry), "utf-8");
        const issuer = JSON.parse(content) as {
          did?: string;
          pk?: string;
          name?: string;
          source?: string;
          addedAt?: string;
        };
        if (issuer.did) {
          const fileName = entry.replace(/\.did\.json$/, "");
          issuers.push({
            name: fileName,
            did: issuer.did,
            pk: issuer.pk ?? "",
            label: issuer.name,
            source: issuer.source as "shipped" | "manual" | undefined,
            addedAt: issuer.addedAt,
            fileName: entry,
          });
        }
      } catch {
        // Skip corrupted files
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { issuers: [], total: 0 };
    }
    throw err;
  }

  return { issuers, total: issuers.length };
}

export async function performIssuerAdd(params: {
  name: string;
  home: string;
  fromKey?: string;
  fromFile?: string;
  fromVc?: string;
  proofIndex?: number;
  did?: string;
  pk?: string;
}): Promise<IssuerAddResult> {
  const { name, home, fromKey, fromFile, fromVc, proofIndex, did: didArg, pk: pkArg } = params;

  validateIssuerName(name);

  // Mutual exclusion check — count active source flags
  const sources = [fromKey, fromFile, fromVc, didArg || pkArg ? "manual" : undefined].filter(
    Boolean,
  );
  if (sources.length > 1) {
    throw new CLIError("Conflicting source flags", ExitCode.RUNTIME_ERROR);
  }
  if (sources.length === 0) {
    throw new CLIError(
      "No input source: use --from-key <path> or --did <did> --pk <pk>",
      ExitCode.RUNTIME_ERROR,
    );
  }

  let did: string;
  let pk: string;
  let inputSource: IssuerAddResult["source"];

  if (fromKey) {
    ({ did, pk } = await extractFromKeyFile(fromKey, home));
    inputSource = "from-key";
  } else if (fromFile) {
    ({ did, pk } = await extractFromFile(fromFile));
    inputSource = "from-file";
  } else if (fromVc) {
    ({ did, pk } = await extractFromVc(fromVc, proofIndex));
    inputSource = "from-vc";
  } else {
    // Manual --did --pk
    if (!didArg) {
      throw new CLIError("Both --did and --pk required", ExitCode.RUNTIME_ERROR);
    }
    if (!pkArg) {
      throw new CLIError("Both --did and --pk required", ExitCode.RUNTIME_ERROR);
    }
    validateDid(didArg);
    did = didArg;
    pk = pkArg;
    inputSource = "manual";
  }

  // Check if issuer already exists
  const dir = issuersDir(home);
  const filePath = path.join(dir, `${name}.did.json`);
  let existed = false;
  try {
    await fs.access(filePath);
    existed = true;
  } catch {
    // Does not exist
  }

  // Write via trust package
  const { addTrustedIssuer } = await import("@aigne/afs-trust");
  await addTrustedIssuer(home, name, {
    did,
    pk,
    name,
    source: inputSource,
  });

  return {
    name,
    did,
    pk,
    status: existed ? "updated" : "added",
    source: inputSource,
    addedAt: new Date().toISOString(),
  };
}

// ── Input source extractors ─────────────────────────────────

async function extractFromKeyFile(
  fromKey: string,
  home: string,
): Promise<{ did: string; pk: string }> {
  const resolvedPath = fromKey.startsWith("~")
    ? path.join(home, fromKey.slice(1))
    : path.resolve(fromKey);

  let keyContent: string;
  try {
    keyContent = await fs.readFile(resolvedPath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(`Key file not found: ${resolvedPath}`);
    }
    throw new CLIError(
      `Failed to read key file: ${(err as Error).message}`,
      ExitCode.RUNTIME_ERROR,
    );
  }

  let keyJson: Record<string, unknown>;
  try {
    keyJson = JSON.parse(keyContent);
  } catch {
    throw new CLIError("Key file is not valid JSON", ExitCode.RUNTIME_ERROR);
  }

  if (!keyJson.did || typeof keyJson.did !== "string") {
    throw new CLIError("Key file missing 'did' field", ExitCode.RUNTIME_ERROR);
  }
  if (!keyJson.pk || typeof keyJson.pk !== "string") {
    throw new CLIError("Key file missing 'pk' field", ExitCode.RUNTIME_ERROR);
  }

  return { did: keyJson.did, pk: keyJson.pk };
}

async function extractFromFile(fromFile: string): Promise<{ did: string; pk: string }> {
  // Detect if it's a URL
  if (fromFile.startsWith("http://") || fromFile.startsWith("https://")) {
    return extractFromUrl(fromFile);
  }

  // Local file
  let content: string;
  try {
    content = await fs.readFile(path.resolve(fromFile), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(`File not found: ${fromFile}`);
    }
    throw new CLIError(`Failed to read file: ${(err as Error).message}`, ExitCode.RUNTIME_ERROR);
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(content);
  } catch {
    throw new CLIError("File is not valid JSON", ExitCode.RUNTIME_ERROR);
  }

  if (!json.did || typeof json.did !== "string") {
    throw new CLIError("File missing 'did' field", ExitCode.RUNTIME_ERROR);
  }
  if (!json.pk || typeof json.pk !== "string") {
    throw new CLIError("File missing 'pk' field", ExitCode.RUNTIME_ERROR);
  }

  return { did: json.did, pk: json.pk };
}

async function extractFromUrl(url: string): Promise<{ did: string; pk: string }> {
  // Only allow HTTPS (localhost HTTP is the exception)
  const parsed = new URL(url);
  if (
    parsed.protocol === "http:" &&
    parsed.hostname !== "localhost" &&
    parsed.hostname !== "127.0.0.1"
  ) {
    throw new CLIError(
      "Only HTTPS URLs supported (HTTP allowed for localhost only)",
      ExitCode.RUNTIME_ERROR,
    );
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    const msg =
      (err as Error).name === "AbortError"
        ? "Failed to fetch issuer from URL: timeout"
        : `Failed to fetch issuer from URL: ${(err as Error).message}`;
    throw new CLIError(msg, ExitCode.RUNTIME_ERROR);
  }

  if (!response.ok) {
    throw new CLIError(
      `Failed to fetch issuer from URL: ${response.status}`,
      ExitCode.RUNTIME_ERROR,
    );
  }

  // Size limit: 1MB — check header first, then body
  const MAX_BODY_SIZE = 1_048_576;
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    throw new CLIError("Response too large (max 1MB)", ExitCode.RUNTIME_ERROR);
  }

  let json: Record<string, unknown>;
  try {
    const text = await response.text();
    if (text.length > MAX_BODY_SIZE) {
      throw new CLIError("Response too large (max 1MB)", ExitCode.RUNTIME_ERROR);
    }
    json = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof CLIError) throw err;
    throw new CLIError("Failed to parse response as JSON", ExitCode.RUNTIME_ERROR);
  }

  if (!json.did || typeof json.did !== "string") {
    throw new CLIError("File missing 'did' field", ExitCode.RUNTIME_ERROR);
  }
  if (!json.pk || typeof json.pk !== "string") {
    throw new CLIError("File missing 'pk' field", ExitCode.RUNTIME_ERROR);
  }

  return { did: json.did, pk: json.pk };
}

async function extractFromVc(
  vcPath: string,
  proofIndex?: number,
): Promise<{ did: string; pk: string }> {
  let content: string;
  try {
    content = await fs.readFile(path.resolve(vcPath), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(`VC file not found: ${vcPath}`);
    }
    throw new CLIError(`Failed to read VC file: ${(err as Error).message}`, ExitCode.RUNTIME_ERROR);
  }

  let vc: Record<string, unknown>;
  try {
    vc = JSON.parse(content);
  } catch {
    throw new CLIError("VC file is not valid JSON", ExitCode.RUNTIME_ERROR);
  }

  // Extract proof array
  const rawProof = vc.proof as any;
  const proofs: any[] = Array.isArray(rawProof) ? rawProof : rawProof ? [rawProof] : [];

  if (proofs.length === 0) {
    throw new CLIError("No proof array in VC", ExitCode.RUNTIME_ERROR);
  }

  // Get subject DID for self-sign detection
  const subject = vc.credentialSubject as { id?: string } | undefined;
  const subjectDid = subject?.id;

  // Filter counter-sign proofs (signer !== credentialSubject.id)
  const counterProofs = proofs.filter((p) => p.signer && p.signer !== subjectDid);

  if (counterProofs.length === 0) {
    throw new CLIError("No counter-sign proof found in VC", ExitCode.RUNTIME_ERROR);
  }

  let selectedProof: any;

  if (proofIndex !== undefined) {
    if (proofIndex < 0 || proofIndex >= proofs.length) {
      throw new CLIError(
        `Proof index ${proofIndex} out of range (0-${proofs.length - 1})`,
        ExitCode.RUNTIME_ERROR,
      );
    }
    selectedProof = proofs[proofIndex];
    if (!selectedProof.signer || selectedProof.signer === subjectDid) {
      throw new CLIError(
        "Selected proof is a self-sign proof, not a counter-sign",
        ExitCode.RUNTIME_ERROR,
      );
    }
  } else if (counterProofs.length === 1) {
    selectedProof = counterProofs[0];
  } else {
    // Multiple counter-signers, must specify --proof-index
    const signerList = counterProofs
      .map((p) => {
        const originalIdx = proofs.indexOf(p);
        return `  [${originalIdx}] signer=${p.signer}`;
      })
      .join("\n");
    throw new CLIError(
      `Multiple counter-sign proofs found. Use --proof-index to select:\n${signerList}`,
      ExitCode.RUNTIME_ERROR,
    );
  }

  // Validate proof structure
  if (!selectedProof.signer || typeof selectedProof.signer !== "string") {
    throw new CLIError("Proof missing 'signer' field", ExitCode.RUNTIME_ERROR);
  }
  if (!selectedProof.pk || typeof selectedProof.pk !== "string") {
    throw new CLIError("Proof missing 'pk' field", ExitCode.RUNTIME_ERROR);
  }

  return { did: selectedProof.signer, pk: selectedProof.pk };
}

export async function performIssuerRemove(params: {
  name: string;
  home: string;
}): Promise<IssuerRemoveResult> {
  const { name, home } = params;
  validateIssuerName(name);

  const dir = issuersDir(home);
  const filePath = path.join(dir, `${name}.did.json`);

  try {
    await fs.access(filePath);
  } catch {
    return { name, status: "not-found" };
  }

  const { removeTrustedIssuer } = await import("@aigne/afs-trust");
  await removeTrustedIssuer(home, name);
  return { name, status: "removed" };
}

export async function performIssuerInspect(params: {
  name: string;
  home: string;
}): Promise<IssuerInspectResult> {
  const { name, home } = params;
  validateIssuerName(name);

  const dir = issuersDir(home);
  const fileName = `${name}.did.json`;
  const filePath = path.join(dir, fileName);

  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new NotFoundError(`Issuer not found: ${name}`);
    }
    throw err;
  }

  const issuer = JSON.parse(content) as {
    did?: string;
    pk?: string;
    name?: string;
    source?: string;
    addedAt?: string;
  };

  return {
    name,
    did: issuer.did ?? "",
    pk: issuer.pk ?? "",
    label: issuer.name,
    source: issuer.source as "shipped" | "manual" | undefined,
    addedAt: issuer.addedAt,
    filePath,
  };
}

export async function performIssuerReset(params: { home: string }): Promise<IssuerResetResult> {
  const { home } = params;
  const dir = issuersDir(home);

  const removed: string[] = [];
  const restored: string[] = [];

  // Step 1: Restore/create shipped seed issuers first (before deleting manual)
  const { SEED_ISSUERS } = await import("@aigne/afs-trust");

  // Force-write seed issuers (overwrite even if they exist with modifications)
  for (const seed of SEED_ISSUERS) {
    const filePath = path.join(dir, seed.fileName);
    await fs.mkdir(dir, { recursive: true });
    const entry = { ...seed.entry, source: "shipped" as const, addedAt: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
    restored.push(seed.fileName.replace(/\.did\.json$/, ""));
  }

  // Step 2: Remove manual issuers (source === "manual")
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".did.json")) continue;
      // Skip seed files
      if (SEED_ISSUERS.some((s) => s.fileName === entry)) continue;
      try {
        const content = await fs.readFile(path.join(dir, entry), "utf-8");
        const issuer = JSON.parse(content) as { source?: string };
        if (issuer.source === "manual") {
          await fs.unlink(path.join(dir, entry));
          removed.push(entry.replace(/\.did\.json$/, ""));
        }
        // source unknown (undefined) → don't delete (per plan: "warning but don't delete")
      } catch {
        // Skip corrupted files
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  return { removed, restored };
}

// ── CLI subcommand factory ──────────────────────────────────

export function createDIDIssuerSubcommand(options: CommandFactoryOptions): CommandModule {
  return {
    command: "issuer",
    describe: "Manage trusted issuers",
    builder: (yargs: Argv) =>
      yargs
        .command(createIssuerListSubcommand(options))
        .command(createIssuerAddSubcommand(options))
        .command(createIssuerResetSubcommand(options))
        .command(createIssuerRemoveSubcommand(options))
        .command(createIssuerInspectSubcommand(options))
        .demandCommand(1, "Please specify a subcommand")
        .alias("help", "h"),
    handler: () => {},
  };
}

// ── list ──

type IssuerListArgs = Record<string, never>;

function createIssuerListSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, IssuerListArgs> {
  return {
    command: "list",
    describe: "List all trusted issuers",
    builder: {},
    handler: async () => {
      const home = homedir();
      try {
        // Bootstrap seed issuers on first use
        const { bootstrapTrustedIssuers } = await import("@aigne/afs-trust");
        await bootstrapTrustedIssuers(home);

        const result = await performIssuerList({ home });
        options.onResult({
          command: "did issuer list",
          result,
          format: formatIssuerListOutput,
        });
      } catch (err) {
        options.onResult({
          command: "did issuer list",
          result: { issuers: [], total: 0 },
          format: formatIssuerListOutput,
          error: {
            code: err instanceof CLIError ? err.exitCode : ExitCode.RUNTIME_ERROR,
            message: (err as Error).message,
          },
        });
      }
    },
  };
}

// ── add ──

interface IssuerAddArgs {
  name: string;
  "from-key"?: string;
  "from-file"?: string;
  "from-vc"?: string;
  "proof-index"?: number;
  did?: string;
  pk?: string;
}

function createIssuerAddSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, IssuerAddArgs> {
  return {
    command: "add <name>",
    describe: "Add a trusted issuer",
    builder: {
      name: {
        type: "string" as const,
        description: "Issuer identifier (used as filename prefix)",
        demandOption: true,
      },
      "from-key": {
        type: "string" as const,
        description: "Path to key file containing did and pk",
      },
      "from-file": {
        type: "string" as const,
        description: "Path or HTTPS URL to .did.json file",
      },
      "from-vc": {
        type: "string" as const,
        description: "Path to VC file (extracts counter-sign proof signer)",
      },
      "proof-index": {
        type: "number" as const,
        description: "Select specific proof by index (for --from-vc with multiple proofs)",
      },
      did: {
        type: "string" as const,
        description: "DID address (base58 z... format)",
      },
      pk: {
        type: "string" as const,
        description: "Public key (hex format)",
      },
    },
    handler: async (argv) => {
      const home = homedir();
      try {
        const result = await performIssuerAdd({
          name: argv.name,
          home,
          fromKey: argv["from-key"],
          fromFile: argv["from-file"],
          fromVc: argv["from-vc"],
          proofIndex: argv["proof-index"],
          did: argv.did,
          pk: argv.pk,
        });
        options.onResult({
          command: "did issuer add",
          result,
          format: formatIssuerAddOutput,
        });
      } catch (err) {
        options.onResult({
          command: "did issuer add",
          result: {
            name: argv.name,
            did: "",
            pk: "",
            status: "error" as const,
            source: "manual" as const,
            error: (err as Error).message,
          },
          format: formatIssuerAddOutput,
          error: {
            code: err instanceof CLIError ? err.exitCode : ExitCode.RUNTIME_ERROR,
            message: (err as Error).message,
          },
        });
      }
    },
  };
}

// ── reset ──

interface IssuerResetArgs {
  yes?: boolean;
}

function createIssuerResetSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, IssuerResetArgs> {
  return {
    command: "reset",
    describe: "Reset trust store: remove manual issuers, restore shipped seeds",
    builder: {
      yes: {
        type: "boolean" as const,
        description: "Skip confirmation prompt",
        default: false,
      },
    },
    handler: async (argv) => {
      const home = homedir();

      // Require --yes for non-interactive confirmation
      if (!argv.yes) {
        options.onResult({
          command: "did issuer reset",
          result: { removed: [], restored: [] },
          format: formatIssuerResetOutput,
          error: {
            code: ExitCode.RUNTIME_ERROR,
            message: "Reset is a destructive operation. Use --yes to confirm.",
          },
        });
        return;
      }

      try {
        const result = await performIssuerReset({ home });
        options.onResult({
          command: "did issuer reset",
          result,
          format: formatIssuerResetOutput,
        });
      } catch (err) {
        options.onResult({
          command: "did issuer reset",
          result: { removed: [], restored: [] },
          format: formatIssuerResetOutput,
          error: {
            code: err instanceof CLIError ? err.exitCode : ExitCode.RUNTIME_ERROR,
            message: (err as Error).message,
          },
        });
      }
    },
  };
}

// ── remove ──

interface IssuerRemoveArgs {
  name: string;
}

function createIssuerRemoveSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, IssuerRemoveArgs> {
  return {
    command: "remove <name>",
    describe: "Remove a trusted issuer",
    builder: {
      name: {
        type: "string" as const,
        description: "Issuer identifier to remove",
        demandOption: true,
      },
    },
    handler: async (argv) => {
      const home = homedir();
      try {
        const result = await performIssuerRemove({ name: argv.name, home });
        options.onResult({
          command: "did issuer remove",
          result,
          format: formatIssuerRemoveOutput,
        });
      } catch (err) {
        options.onResult({
          command: "did issuer remove",
          result: { name: argv.name, status: "error" as const, error: (err as Error).message },
          format: formatIssuerRemoveOutput,
          error: {
            code: err instanceof CLIError ? err.exitCode : ExitCode.RUNTIME_ERROR,
            message: (err as Error).message,
          },
        });
      }
    },
  };
}

// ── inspect ──

interface IssuerInspectArgs {
  name: string;
}

function createIssuerInspectSubcommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, IssuerInspectArgs> {
  return {
    command: "inspect <name>",
    describe: "Show detailed information about a trusted issuer",
    builder: {
      name: {
        type: "string" as const,
        description: "Issuer identifier to inspect",
        demandOption: true,
      },
    },
    handler: async (argv) => {
      const home = homedir();
      try {
        const result = await performIssuerInspect({ name: argv.name, home });
        options.onResult({
          command: "did issuer inspect",
          result,
          format: formatIssuerInspectOutput,
        });
      } catch (err) {
        options.onResult({
          command: "did issuer inspect",
          result: { name: argv.name, did: "", pk: "", error: (err as Error).message },
          format: formatIssuerInspectOutput,
          error: {
            code: err instanceof CLIError ? err.exitCode : ExitCode.RUNTIME_ERROR,
            message: (err as Error).message,
          },
        });
      }
    },
  };
}
