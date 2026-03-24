/**
 * Blocklet manifest parser — YAML parsing + Zod validation.
 */

import { parse as parseYAML } from "yaml";
import { z } from "zod";
import { zodParse } from "../utils/zod.js";
import type { BlockletManifest } from "./types.js";

/** Valid operation names for mount ops */
const VALID_OPS = ["read", "list", "write", "delete", "search", "exec", "stat"] as const;

/** Reserved target paths that cannot be used for mount targets */
const RESERVED_TARGETS = new Set(["/program", "/blocklet", "/data", "/.actions", "/.meta"]);

const MountDeclarationSchema = z.object({
  uri: z.string().min(1),
  target: z
    .string()
    .refine((t) => t.startsWith("/"), "target must be an absolute path")
    .refine((t) => !RESERVED_TARGETS.has(t), "target conflicts with reserved path")
    .refine((t) => {
      const segments = t.split("/").filter(Boolean);
      return !segments.some((s) => s.startsWith("."));
    }, "target must not contain dot-prefixed segments"),
  required: z.boolean().default(true),
  ops: z.array(z.enum(VALID_OPS)).optional(),
  shared: z.boolean().optional(),
});

const EntrypointSchema = z
  .string()
  .min(1)
  .refine((e) => !e.startsWith("/"), "entrypoint must be a relative path")
  .refine((e) => !e.includes(".."), "entrypoint must not contain path traversal (..)");

/** Common fields shared by both v1 and v2 */
const CommonFields = {
  specVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  mounts: z.array(MountDeclarationSchema).default([]),
};

/** specVersion 1 — requires entrypoint */
const BlockletManifestV1Schema = z
  .object({
    ...CommonFields,
    entrypoint: EntrypointSchema,
  })
  .refine((m) => {
    const targets = m.mounts.map((mount) => mount.target);
    return new Set(targets).size === targets.length;
  }, "duplicate mount targets are not allowed");

/** Domain format: valid DNS hostname — labels separated by dots, no consecutive dots, no leading/trailing hyphens per label. */
const DomainSchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/,
    "invalid domain format",
  )
  .refine((d) => !d.includes(".."), "domain must not contain consecutive dots");

const SiteDeclarationSchema = z.object({
  name: z.string().min(1),
  domain: DomainSchema.optional(),
  port: z.number().int().min(1).max(65535).optional(),
  aliases: z.array(DomainSchema).optional(),
});

/** specVersion 2 — pure packaging: mounts, blocklets, system deps. No UI fields. */
const BlockletManifestV2Schema = z
  .object({
    ...CommonFields,
    entrypoint: EntrypointSchema.optional(),
    blocklets: z.array(z.string().min(1)).optional(),
    system: z.array(z.string().min(1)).optional(),
    sites: z.array(SiteDeclarationSchema).optional(),
  })
  .refine((m) => {
    const targets = m.mounts.map((mount) => mount.target);
    return new Set(targets).size === targets.length;
  }, "duplicate mount targets are not allowed")
  .refine(
    (m) => {
      if (!m.sites) return true;
      const names = m.sites.map((s) => s.name);
      return new Set(names).size === names.length;
    },
    { message: "duplicate site names are not allowed" },
  )
  .refine(
    (m) => {
      if (!m.sites) return true;
      const ports = m.sites.map((s) => s.port).filter((p) => p !== undefined);
      return new Set(ports).size === ports.length;
    },
    { message: "duplicate site port values are not allowed" },
  )
  .refine(
    (m) => {
      if (!m.sites) return true;
      // Collect all domains + aliases across all sites — must be globally unique within blocklet
      const allDomains: string[] = [];
      for (const site of m.sites) {
        if (site.domain) allDomains.push(site.domain);
        if (site.aliases) allDomains.push(...site.aliases);
      }
      return new Set(allDomains).size === allDomains.length;
    },
    { message: "duplicate domain or alias values across sites are not allowed" },
  );

/**
 * Parse a YAML string into a validated BlockletManifest.
 *
 * @param input - Raw YAML string content of blocklet.yaml or program.yaml
 * @returns Validated BlockletManifest object
 * @throws Error if input is not a valid string, YAML syntax is invalid, or validation fails
 */
export function parseBlockletManifest(input: string): BlockletManifest {
  if (typeof input !== "string") {
    throw new Error("blocklet.yaml content must be a string");
  }
  if (input.trim() === "") {
    throw new Error("blocklet.yaml content is empty");
  }

  // Parse YAML with safe defaults (no custom tags)
  const raw = parseYAML(input, { maxAliasCount: 0 });

  // Route to v1 or v2 schema based on specVersion
  const specVersion =
    typeof raw === "object" && raw !== null ? (raw as any).specVersion : undefined;
  if (specVersion === 2) {
    return zodParse(BlockletManifestV2Schema, raw, {
      prefix: "Invalid blocklet.yaml",
    });
  }
  return zodParse(BlockletManifestV1Schema, raw, {
    prefix: "Invalid blocklet.yaml",
  });
}

/** @deprecated Use parseBlockletManifest instead */
export const parseProgramManifest = parseBlockletManifest;
