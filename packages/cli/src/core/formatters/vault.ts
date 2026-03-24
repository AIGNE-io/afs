/**
 * vault Formatter - Core Implementation
 *
 * Formats vault command output without colors.
 */

import type { ViewType } from "../types.js";

export interface VaultInitResult {
  success: boolean;
  vaultPath: string;
  migrated?: number;
}

export interface VaultGetResult {
  group: string;
  name: string;
  value: string;
}

export interface VaultSetResult {
  group: string;
  name: string;
}

export interface VaultDeleteResult {
  group: string;
  name?: string;
  deleted: boolean;
}

export interface VaultListResult {
  group?: string;
  secrets: string[];
}

export function formatVaultInitOutput(result: VaultInitResult, view: ViewType): string {
  if (view === "json") return JSON.stringify(result, null, 2);
  const lines = [`Vault initialized at ${result.vaultPath}`];
  if (result.migrated && result.migrated > 0) {
    lines.push(`Migrated ${result.migrated} credential(s) from credentials.toml`);
  }
  return lines.join("\n");
}

export function formatVaultGetOutput(result: VaultGetResult, view: ViewType): string {
  if (view === "json") return JSON.stringify(result, null, 2);
  return result.value;
}

export function formatVaultSetOutput(result: VaultSetResult, view: ViewType): string {
  if (view === "json") return JSON.stringify({ ...result, success: true }, null, 2);
  return `OK ${result.group}/${result.name}`;
}

export function formatVaultDeleteOutput(result: VaultDeleteResult, view: ViewType): string {
  if (view === "json") return JSON.stringify(result, null, 2);
  const target = result.name ? `${result.group}/${result.name}` : result.group;
  return result.deleted ? `Deleted ${target}` : `Not found: ${target}`;
}

export function formatVaultListOutput(result: VaultListResult, view: ViewType): string {
  if (view === "json") return JSON.stringify(result, null, 2);
  if (result.secrets.length === 0) {
    return result.group ? `No secrets in group: ${result.group}` : "Vault is empty";
  }
  return result.secrets.join("\n");
}
