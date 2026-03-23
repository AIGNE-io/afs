/**
 * Route config parser — YAML route file parsing + Zod validation.
 *
 * Route files live in `.route/` directories and define how URL paths
 * map to content sources and handlers within a blocklet.
 */

import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { z } from "zod";
import { zodParse } from "../utils/zod.js";

/** Valid handler types for route files */
const VALID_HANDLERS = ["web", "aup", "exec"] as const;

const RouteConfigSchema = z.object({
  site: z.string().min(1),
  path: z
    .string()
    .min(1)
    .startsWith("/")
    .refine((p) => !p.includes(".."), "path must not contain path traversal (..)"),
  source: z
    .string()
    .min(1)
    .refine((s) => !s.includes(".."), "source must not contain path traversal (..)"),
  handler: z.enum(VALID_HANDLERS),
});

/** Parsed route config from a `.route/{name}` file. */
export type RouteConfig = z.infer<typeof RouteConfigSchema>;

/**
 * Parse a YAML string into a validated RouteConfig.
 *
 * @param input - Raw YAML content of a `.route/{name}` file
 * @returns Validated RouteConfig object
 * @throws Error if input is invalid
 */
export function parseRouteConfig(input: string): RouteConfig {
  if (typeof input !== "string") {
    throw new Error("route config content must be a string");
  }
  if (input.trim() === "") {
    throw new Error("route config content is empty");
  }

  const raw = parseYAML(input, { maxAliasCount: 0 });
  return zodParse(RouteConfigSchema, raw, { prefix: "Invalid route config" });
}

/**
 * Serialize a RouteConfig to YAML string.
 */
export function serializeRouteConfig(config: RouteConfig): string {
  return stringifyYAML(config).trim();
}
