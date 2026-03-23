/**
 * Provider command output formatters.
 */

import type { ViewType } from "../types.js";

// ── Result types ──────────────────────────────────────────────

export interface DIDInitResult {
  batch: boolean;
  name?: string;
  did?: string;
  status?: "created" | "skipped" | "error";
  entityType?: "developer" | "provider" | "blocklet";
  derivedFrom?: string;
  error?: string;
  results?: DIDInitResult[];
}

export interface DIDCheckResult {
  name: string;
  success: boolean;
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
  error?: string;
}

export interface DIDIssueResult {
  batch: boolean;
  name?: string;
  did?: string;
  status?: "issued" | "counter-signed" | "skipped" | "error";
  level?: string;
  entityType?: string;
  error?: string;
  passed?: number;
  total?: number;
  trustWarning?: string;
  results?: Array<{
    name: string;
    did: string;
    status: "issued" | "counter-signed" | "skipped" | "error";
    level?: string;
    error?: string;
    passed?: number;
    total?: number;
  }>;
}

export interface DIDVerifyResult {
  name: string;
  valid: boolean;
  trustLevel?: string;
  error?: string;
  issuer?: string;
  did?: string;
  entityType?: string;
}

export interface DIDInfoResult {
  name: string;
  version?: string;
  did?: string;
  entityType?: string;
  identityStore?: string;
  hasCredential: boolean;
  credentialPath?: string;
  issuer?: string;
  capabilities?: string[];
  riskLevel?: string;
}

// ── Issuer result types ──────────────────────────────────────

export interface IssuerListResult {
  issuers: Array<{
    name: string;
    did: string;
    pk: string;
    label?: string;
    source?: "shipped" | "manual";
    addedAt?: string;
    fileName: string;
  }>;
  total: number;
}

export interface IssuerAddResult {
  name: string;
  did: string;
  pk: string;
  status: "added" | "updated" | "error";
  /** How the issuer was added (CLI output only, not stored) */
  source: "from-key" | "from-file" | "from-vc" | "manual";
  addedAt?: string;
  error?: string;
}

export interface IssuerRemoveResult {
  name: string;
  status: "removed" | "not-found" | "error";
  error?: string;
}

export interface IssuerResetResult {
  removed: string[];
  restored: string[];
}

export interface IssuerInspectResult {
  name: string;
  did: string;
  pk: string;
  label?: string;
  source?: "shipped" | "manual";
  addedAt?: string;
  filePath?: string;
  error?: string;
}

// ── init ──────────────────────────────────────────────────────

export function formatProviderInitOutput(result: DIDInitResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatInitLlm(result);
    case "human":
      return formatInitHuman(result);
    default:
      return formatInitDefault(result);
  }
}

function formatInitDefault(result: DIDInitResult): string {
  if (result.batch && result.results) {
    const lines = result.results.map((r) => {
      const icon = r.status === "created" ? "+" : r.status === "skipped" ? "-" : "!";
      return `${icon} ${r.name}: ${r.status}${r.did ? ` (${r.did})` : ""}${r.error ? ` - ${r.error}` : ""}`;
    });
    const created = result.results.filter((r) => r.status === "created").length;
    const skipped = result.results.filter((r) => r.status === "skipped").length;
    const errors = result.results.filter((r) => r.status === "error").length;
    lines.push(
      `Summary: ${result.results.length} entities: ${created} initialized, ${skipped} skipped, ${errors} errors`,
    );
    return lines.join("\n");
  }
  if (result.status === "error") return `ERROR ${result.name ?? "unknown"}: ${result.error}`;
  const tag = result.status === "created" ? "CREATED" : "SKIPPED";
  const entity = result.entityType ? `${result.entityType}:` : "";
  return `${tag} ${entity}${result.name}${result.did ? ` DID=${result.did}` : ""}`;
}

function formatInitLlm(result: DIDInitResult): string {
  if (result.batch && result.results) {
    const blocks = result.results.map((r) => formatInitLlmSingle(r));
    const created = result.results.filter((r) => r.status === "created").length;
    const skipped = result.results.filter((r) => r.status === "skipped").length;
    const errors = result.results.filter((r) => r.status === "error").length;
    blocks.push(
      `SUMMARY initialized=${created} skipped=${skipped} errors=${errors} total=${result.results.length}`,
    );
    return blocks.join("\n---\n");
  }
  return formatInitLlmSingle(result);
}

function formatInitLlmSingle(r: DIDInitResult): string {
  const lines: string[] = [];
  lines.push(`DID_INIT ${r.name ?? "unknown"}`);
  lines.push(`STATUS ${r.status}`);
  if (r.entityType) lines.push(`ENTITY_TYPE ${r.entityType}`);
  if (r.did) lines.push(`DID ${r.did}`);
  if (r.derivedFrom) lines.push(`DERIVED_FROM ${r.derivedFrom}`);
  if (r.error) lines.push(`ERROR ${r.error}`);
  return lines.join("\n");
}

function formatInitHuman(result: DIDInitResult): string {
  if (result.batch && result.results) {
    const lines: string[] = [];
    for (const r of result.results) {
      const icon = r.status === "created" ? "+" : r.status === "skipped" ? "-" : "!";
      lines.push(
        `  ${icon} ${r.name}: ${r.status}${r.did ? ` (${r.did})` : ""}${r.error ? ` - ${r.error}` : ""}`,
      );
    }
    lines.push("");
    const created = result.results.filter((r) => r.status === "created").length;
    const skipped = result.results.filter((r) => r.status === "skipped").length;
    const errors = result.results.filter((r) => r.status === "error").length;
    lines.push(
      `Summary: ${result.results.length} entities: ${created} initialized, ${skipped} skipped, ${errors} errors`,
    );
    return lines.join("\n");
  }
  if (result.status === "error") return `Error: ${result.error}`;
  const label = result.entityType
    ? `${result.entityType}: ${result.name}`
    : (result.name ?? "unknown");
  if (result.status === "skipped") return `Identity already exists for ${label}: ${result.did}`;
  return `Identity created for ${label}\nDID: ${result.did}`;
}

// ── check ──────────────────────────────────────────────────────

export function formatProviderCheckOutput(result: DIDCheckResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatCheckLlm(result);
    case "human":
      return formatCheckHuman(result);
    default:
      return formatCheckDefault(result);
  }
}

function formatCheckDefault(result: DIDCheckResult): string {
  if (result.error) return `ERROR ${result.name}: ${result.error}`;
  const status = result.failed && result.failed > 0 ? "FAIL" : "PASS";
  return `${status} ${result.name} ${result.passed}/${result.total}${result.failed ? ` ${result.failed}-failed` : ""}`;
}

function formatCheckLlm(result: DIDCheckResult): string {
  const lines: string[] = [];
  lines.push(`DID_CHECK ${result.name}`);
  if (result.error) {
    lines.push("STATUS ERROR");
    lines.push(`ERROR ${result.error}`);
    return lines.join("\n");
  }
  lines.push(`STATUS ${result.failed && result.failed > 0 ? "FAIL" : "PASS"}`);
  if (result.passed !== undefined) lines.push(`PASSED ${result.passed}`);
  if (result.failed !== undefined) lines.push(`FAILED ${result.failed}`);
  if (result.skipped !== undefined) lines.push(`SKIPPED ${result.skipped}`);
  if (result.total !== undefined) lines.push(`TOTAL ${result.total}`);
  return lines.join("\n");
}

function formatCheckHuman(result: DIDCheckResult): string {
  if (result.error) return `${result.name} conformance: FAIL — ${result.error}`;
  const status = result.failed && result.failed > 0 ? "FAIL" : "PASS";
  const detail =
    result.failed && result.failed > 0
      ? `${result.passed}/${result.total} tests, ${result.failed} failed`
      : `${result.passed}/${result.total} tests`;
  return `${result.name} conformance: ${status} (${detail})`;
}

// ── issue ──────────────────────────────────────────────────────

export function formatProviderIssueOutput(result: DIDIssueResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatIssueLlm(result);
    case "human":
      return formatIssueHuman(result);
    default:
      return formatIssueDefault(result);
  }
}

function formatIssueDefault(result: DIDIssueResult): string {
  if (result.batch && result.results) {
    const lines = result.results.map((r) => {
      if (r.status === "issued" || r.status === "counter-signed")
        return `+ ${r.name}: ${r.level ?? r.status}`;
      if (r.status === "skipped") return `- ${r.name}: skipped (${r.error})`;
      return `! ${r.name}: error (${r.error})`;
    });
    const issued = result.results.filter(
      (r) => r.status === "issued" || r.status === "counter-signed",
    ).length;
    lines.push(`Summary: ${issued}/${result.results.length} issued`);
    return lines.join("\n");
  }
  if (result.error || result.status === "error")
    return `ERROR ${result.name ?? "unknown"}: ${result.error}`;
  const line = `${result.status === "counter-signed" ? "COUNTER_SIGNED" : "ISSUED"} ${result.name} LEVEL=${result.level} DID=${result.did}`;
  return result.trustWarning ? `${line}\nWARNING ${result.trustWarning}` : line;
}

function formatIssueLlm(result: DIDIssueResult): string {
  if (result.batch && result.results) {
    const blocks = result.results.map((r) => formatIssueLlmSingle(r));
    const issued = result.results.filter((r) => r.status === "issued").length;
    const counterSigned = result.results.filter((r) => r.status === "counter-signed").length;
    const skipped = result.results.filter((r) => r.status === "skipped").length;
    const errors = result.results.filter((r) => r.status === "error").length;
    blocks.push(
      `SUMMARY issued=${issued} counter_signed=${counterSigned} skipped=${skipped} errors=${errors} total=${result.results.length}`,
    );
    return blocks.join("\n---\n");
  }
  return formatIssueLlmSingle(result);
}

function formatIssueLlmSingle(
  r: Pick<
    DIDIssueResult,
    "name" | "did" | "status" | "level" | "entityType" | "error" | "trustWarning"
  >,
): string {
  const lines: string[] = [];
  lines.push(`DID_ISSUE ${r.name ?? "unknown"}`);
  lines.push(`STATUS ${r.status ?? "unknown"}`);
  if (r.entityType) lines.push(`ENTITY_TYPE ${r.entityType}`);
  if (r.did) lines.push(`DID ${r.did}`);
  if (r.level) lines.push(`LEVEL ${r.level}`);
  if (r.error) lines.push(`ERROR ${r.error}`);
  if (r.trustWarning) lines.push(`WARNING ${r.trustWarning}`);
  return lines.join("\n");
}

function formatIssueHuman(result: DIDIssueResult): string {
  if (result.batch && result.results) {
    const lines: string[] = [];
    for (const r of result.results) {
      if (r.status === "issued") lines.push(`  + ${r.name}: ${r.level}`);
      else if (r.status === "counter-signed")
        lines.push(`  + ${r.name}: ${r.level} (counter-signed)`);
      else if (r.status === "skipped") lines.push(`  - ${r.name}: skipped (${r.error})`);
      else lines.push(`  ! ${r.name}: error (${r.error})`);
    }
    lines.push("");
    const issued = result.results.filter(
      (r) => r.status === "issued" || r.status === "counter-signed",
    ).length;
    const skipped = result.results.filter((r) => r.status === "skipped").length;
    const errors = result.results.filter((r) => r.status === "error").length;
    lines.push(
      `Summary: ${issued}/${result.results.length} entities issued VCs (${skipped} skipped${errors > 0 ? `, ${errors} errors` : ""})`,
    );
    return lines.join("\n");
  }
  if (result.error || result.status === "error") return `Issue failed: ${result.error}`;
  const label = result.entityType
    ? `${result.entityType}: ${result.name}`
    : `provider: ${result.name}`;
  if (result.status === "counter-signed") {
    const base = `VC counter-signed for ${label}\nDID: ${result.did}\nLevel: ${result.level}`;
    return result.trustWarning ? `${base}\nWarning: ${result.trustWarning}` : base;
  }
  return `VC issued for ${label}\nDID: ${result.did}\nLevel: ${result.level}`;
}

// ── verify ──────────────────────────────────────────────────────

export function formatProviderVerifyOutput(result: DIDVerifyResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatVerifyLlm(result);
    case "human":
      return formatVerifyHuman(result);
    default:
      return formatVerifyDefault(result);
  }
}

function formatVerifyDefault(result: DIDVerifyResult): string {
  if (!result.valid) return `INVALID ${result.name}: ${result.error}`;
  const issuerLabel = result.issuer === result.did ? "self" : (result.issuer ?? "unknown");
  return `VALID ${result.name} LEVEL=${result.trustLevel} ISSUER=${issuerLabel}`;
}

function formatVerifyLlm(result: DIDVerifyResult): string {
  const lines: string[] = [];
  lines.push(`DID_VERIFY ${result.name}`);
  lines.push(`VALID ${result.valid}`);
  if (result.trustLevel) lines.push(`TRUST_LEVEL ${result.trustLevel}`);
  if (result.issuer) {
    const issuerLabel = result.issuer === result.did ? "self" : result.issuer;
    lines.push(`ISSUER ${issuerLabel}`);
  }
  if (result.error) lines.push(`ERROR ${result.error}`);
  return lines.join("\n");
}

function formatVerifyHuman(result: DIDVerifyResult): string {
  const label = result.entityType ? `${result.entityType}: ${result.name}` : result.name;
  if (!result.valid) return `VC verification FAILED for ${label}: ${result.error}`;
  const issuerLabel = result.issuer === result.did ? "self" : (result.issuer ?? "unknown");
  return `VC valid for ${label}. Level: ${result.trustLevel}. Issuer: ${issuerLabel}`;
}

// ── info ──────────────────────────────────────────────────────

export function formatProviderInfoOutput(result: DIDInfoResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatInfoLlm(result);
    case "human":
      return formatInfoHuman(result);
    default:
      return formatInfoDefault(result);
  }
}

function formatInfoDefault(result: DIDInfoResult): string {
  const parts = [result.name];
  parts.push(`DID=${result.did ?? "none"}`);
  parts.push(`CREDENTIAL=${result.hasCredential}`);
  if (result.issuer) parts.push(`ISSUER=${result.issuer}`);
  if (result.riskLevel) parts.push(`RISK=${result.riskLevel}`);
  return parts.join(" ");
}

function formatInfoLlm(result: DIDInfoResult): string {
  const lines: string[] = [];
  lines.push(`DID_INFO ${result.name}`);
  if (result.version) lines.push(`VERSION ${result.version}`);
  lines.push(`DID ${result.did ?? "none"}`);
  if (result.identityStore) lines.push(`IDENTITY_STORE ${result.identityStore}`);
  lines.push(`CREDENTIAL ${result.hasCredential}`);
  if (result.credentialPath) lines.push(`CREDENTIAL_PATH ${result.credentialPath}`);
  if (result.issuer) lines.push(`ISSUER ${result.issuer}`);
  if (result.capabilities && result.capabilities.length > 0)
    lines.push(`CAPABILITIES ${result.capabilities.join(",")}`);
  if (result.riskLevel) lines.push(`RISK ${result.riskLevel}`);
  return lines.join("\n");
}

function formatInfoHuman(result: DIDInfoResult): string {
  const typeLabel = result.entityType
    ? result.entityType.charAt(0).toUpperCase() + result.entityType.slice(1)
    : "Provider";
  const lines: string[] = [];
  lines.push(`${typeLabel}: ${result.name}${result.version ? ` v${result.version}` : ""}`);
  lines.push(`DID: ${result.did ?? "Not initialized"}`);
  if (result.identityStore) lines.push(`Identity Store: ${result.identityStore}`);
  lines.push(`Credential: ${result.hasCredential ? result.credentialPath : "No credential"}`);
  if (result.issuer) lines.push(`Issuer: ${result.issuer}`);
  if (result.capabilities && result.capabilities.length > 0)
    lines.push(`Capabilities: ${result.capabilities.join(", ")}`);
  if (result.riskLevel) lines.push(`Risk: ${result.riskLevel}`);
  return lines.join("\n");
}

// ── issuer list ──────────────────────────────────────────────

function truncateDid(did: string): string {
  if (did.length <= 16) return did;
  return `${did.slice(0, 10)}...${did.slice(-3)}`;
}

export function formatIssuerListOutput(result: IssuerListResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result.issuers, null, 2);
    case "llm":
      return formatIssuerListLlm(result);
    case "human":
      return formatIssuerListHuman(result);
    default:
      return formatIssuerListDefault(result);
  }
}

function formatIssuerListDefault(result: IssuerListResult): string {
  if (result.issuers.length === 0) return "No trusted issuers";
  const lines = result.issuers.map((i) => `${i.name} ${truncateDid(i.did)} ${i.source ?? "-"}`);
  return lines.join("\n");
}

function formatIssuerListLlm(result: IssuerListResult): string {
  const lines: string[] = [];
  lines.push("ISSUER_LIST");
  lines.push(`TOTAL ${result.total}`);
  for (const i of result.issuers) {
    lines.push("---");
    lines.push(`NAME ${i.name}`);
    lines.push(`DID ${i.did}`);
    lines.push(`SOURCE ${i.source ?? "unknown"}`);
    if (i.addedAt) lines.push(`ADDED_AT ${i.addedAt}`);
  }
  const shipped = result.issuers.filter((i) => i.source === "shipped").length;
  const manual = result.issuers.filter((i) => i.source === "manual").length;
  lines.push("---");
  lines.push(`SUMMARY total=${result.total} shipped=${shipped} manual=${manual}`);
  return lines.join("\n");
}

function formatIssuerListHuman(result: IssuerListResult): string {
  if (result.issuers.length === 0) return "No trusted issuers configured.";
  const lines: string[] = [];
  lines.push("Trusted Issuers:");
  for (const i of result.issuers) {
    const src = i.source ? ` (${i.source})` : "";
    lines.push(`  ${i.name}: ${truncateDid(i.did)}${src}`);
  }
  lines.push(`\nTotal: ${result.total}`);
  return lines.join("\n");
}

// ── issuer add ──────────────────────────────────────────────

export function formatIssuerAddOutput(result: IssuerAddResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatIssuerAddLlm(result);
    case "human":
      return formatIssuerAddHuman(result);
    default:
      return formatIssuerAddDefault(result);
  }
}

function formatIssuerAddDefault(result: IssuerAddResult): string {
  if (result.status === "error") return `ERROR ${result.name}: ${result.error}`;
  return `${result.status === "updated" ? "UPDATED" : "ADDED"} ${result.name} DID=${truncateDid(result.did)}`;
}

function formatIssuerAddLlm(result: IssuerAddResult): string {
  const lines: string[] = [];
  lines.push(`ISSUER_ADD ${result.name}`);
  lines.push(`STATUS ${result.status}`);
  lines.push(`DID ${result.did}`);
  lines.push(`INPUT_SOURCE ${result.source}`);
  if (result.error) lines.push(`ERROR ${result.error}`);
  return lines.join("\n");
}

function formatIssuerAddHuman(result: IssuerAddResult): string {
  if (result.status === "error") return `Failed to add issuer: ${result.error}`;
  const verb = result.status === "updated" ? "Updated" : "Added";
  return `${verb} trusted issuer "${result.name}"\nDID: ${result.did}\nSource: ${result.source}`;
}

// ── issuer remove ──────────────────────────────────────────────

export function formatIssuerRemoveOutput(result: IssuerRemoveResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatIssuerRemoveLlm(result);
    case "human":
      return formatIssuerRemoveHuman(result);
    default:
      return formatIssuerRemoveDefault(result);
  }
}

function formatIssuerRemoveDefault(result: IssuerRemoveResult): string {
  if (result.status === "error") return `ERROR ${result.name}: ${result.error}`;
  return `${result.status === "removed" ? "REMOVED" : "NOT_FOUND"} ${result.name}`;
}

function formatIssuerRemoveLlm(result: IssuerRemoveResult): string {
  const lines: string[] = [];
  lines.push(`ISSUER_REMOVE ${result.name}`);
  lines.push(`STATUS ${result.status}`);
  if (result.error) lines.push(`ERROR ${result.error}`);
  return lines.join("\n");
}

function formatIssuerRemoveHuman(result: IssuerRemoveResult): string {
  if (result.status === "error") return `Failed to remove issuer: ${result.error}`;
  if (result.status === "not-found") return `Issuer "${result.name}" not found`;
  return `Removed trusted issuer "${result.name}"`;
}

// ── issuer inspect ──────────────────────────────────────────────

export function formatIssuerInspectOutput(result: IssuerInspectResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatIssuerInspectLlm(result);
    case "human":
      return formatIssuerInspectHuman(result);
    default:
      return formatIssuerInspectDefault(result);
  }
}

function formatIssuerInspectDefault(result: IssuerInspectResult): string {
  if (result.error) return `ERROR ${result.name}: ${result.error}`;
  return `${result.name} DID=${result.did} SOURCE=${result.source ?? "unknown"}`;
}

function formatIssuerInspectLlm(result: IssuerInspectResult): string {
  const lines: string[] = [];
  lines.push(`ISSUER_INSPECT ${result.name}`);
  lines.push(`DID ${result.did}`);
  lines.push(`PK ${result.pk}`);
  if (result.label) lines.push(`LABEL ${result.label}`);
  lines.push(`SOURCE ${result.source ?? "unknown"}`);
  if (result.addedAt) lines.push(`ADDED_AT ${result.addedAt}`);
  if (result.filePath) lines.push(`FILE_PATH ${result.filePath}`);
  if (result.error) lines.push(`ERROR ${result.error}`);
  return lines.join("\n");
}

function formatIssuerInspectHuman(result: IssuerInspectResult): string {
  if (result.error) return `Error: ${result.error}`;
  const lines: string[] = [];
  lines.push(`Issuer: ${result.name}`);
  if (result.label) lines.push(`Display Name: ${result.label}`);
  lines.push(`DID: ${result.did}`);
  lines.push(`Public Key: ${result.pk}`);
  lines.push(`Source: ${result.source ?? "unknown"}`);
  if (result.addedAt) lines.push(`Added: ${result.addedAt}`);
  if (result.filePath) lines.push(`File: ${result.filePath}`);
  return lines.join("\n");
}

// ── issuer reset ──────────────────────────────────────────────

export function formatIssuerResetOutput(result: IssuerResetResult, view: ViewType): string {
  switch (view) {
    case "json":
      return JSON.stringify(result, null, 2);
    case "llm":
      return formatIssuerResetLlm(result);
    case "human":
      return formatIssuerResetHuman(result);
    default:
      return formatIssuerResetDefault(result);
  }
}

function formatIssuerResetDefault(result: IssuerResetResult): string {
  const parts: string[] = [];
  if (result.removed.length > 0) parts.push(`REMOVED ${result.removed.join(",")}`);
  if (result.restored.length > 0) parts.push(`RESTORED ${result.restored.join(",")}`);
  if (parts.length === 0) return "RESET no-op";
  return parts.join(" ");
}

function formatIssuerResetLlm(result: IssuerResetResult): string {
  const lines: string[] = [];
  lines.push("ISSUER_RESET");
  lines.push(`REMOVED ${result.removed.length > 0 ? result.removed.join(",") : "none"}`);
  lines.push(`RESTORED ${result.restored.length > 0 ? result.restored.join(",") : "none"}`);
  lines.push(`REMOVED_COUNT ${result.removed.length}`);
  lines.push(`RESTORED_COUNT ${result.restored.length}`);
  return lines.join("\n");
}

function formatIssuerResetHuman(result: IssuerResetResult): string {
  const lines: string[] = [];
  if (result.removed.length > 0) {
    lines.push(`Removed ${result.removed.length} manual issuer(s): ${result.removed.join(", ")}`);
  }
  if (result.restored.length > 0) {
    lines.push(
      `Restored ${result.restored.length} shipped issuer(s): ${result.restored.join(", ")}`,
    );
  }
  if (lines.length === 0) {
    lines.push("Nothing to reset.");
  }
  return lines.join("\n");
}
