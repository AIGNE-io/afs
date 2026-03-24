/**
 * Enrichment helpers for AFS entries.
 *
 * These functions fetch actions and meta from a provider module
 * and merge them into AFS entries. They are pure functions that
 * operate on an AFSModule and a subpath — no AFS instance needed.
 */
import { joinURL } from "ufo";
import type { ActionSummary, AFSModule } from "./type.js";

/**
 * Check if a path should skip enrichment.
 * Virtual system paths (/.meta, /.actions, /.perception) are not enrichable.
 */
export function shouldSkipEnrich(path: string): boolean {
  return path.endsWith("/.meta") || path.endsWith("/.actions") || path.includes("/.perception");
}

/**
 * Fetch actions for a path by listing path/.actions.
 * Returns ActionSummary[] on success, [] on failure.
 */
export async function fetchActions(module: AFSModule, subpath: string): Promise<ActionSummary[]> {
  try {
    const actionsPath = joinURL(subpath, ".actions");
    const result = await module.list?.(actionsPath);
    if (!result?.data) return [];

    return result.data
      .filter((entry) => entry.meta?.kind === "afs:executable")
      .map((entry) => {
        const summary: ActionSummary = {
          name: entry.id,
          description: entry.meta?.description as string | undefined,
          inputSchema: entry.meta?.inputSchema as ActionSummary["inputSchema"],
        };
        const sev = entry.meta?.severity as string | undefined;
        if (sev === "ambient" || sev === "boundary" || sev === "critical") {
          summary.severity = sev;
        }
        return summary;
      });
  } catch {
    return [];
  }
}

/**
 * Fetch meta for a path by reading path/.meta.
 * Returns the meta content on success, null on failure.
 */
export async function fetchMeta(
  module: AFSModule,
  subpath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const metaPath = joinURL(subpath, ".meta");
    const result = await module.read?.(metaPath);
    if (!result?.data?.content) return null;

    // content should be an object containing meta fields
    const content = result.data.content;
    if (typeof content === "object" && content !== null && !Array.isArray(content)) {
      return content as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Enrich an AFS entry with actions and meta from the provider.
 * Skips enrichment for virtual system paths.
 */
export async function enrichData<
  T extends { path: string; actions?: ActionSummary[]; meta?: Record<string, unknown> | null },
>(data: T, module: AFSModule, subpath: string): Promise<T> {
  // Skip enrichment for virtual paths
  if (shouldSkipEnrich(subpath)) {
    return data;
  }

  const result = { ...data };
  const enrichPromises: Promise<void>[] = [];

  // Fetch actions if not present (undefined means fetch, [] means keep as-is)
  if (result.actions === undefined) {
    enrichPromises.push(
      fetchActions(module, subpath).then((actions) => {
        result.actions = actions;
      }),
    );
  }

  // Fetch meta if kind is not present
  if (result.meta?.kind === undefined) {
    enrichPromises.push(
      fetchMeta(module, subpath).then((meta) => {
        if (meta) {
          result.meta = { ...result.meta, ...meta };
        }
      }),
    );
  }

  await Promise.all(enrichPromises);
  return result;
}
