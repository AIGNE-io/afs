/**
 * Route seed mechanism — copies initial routes from /blocklet/.route/ to /data/.route/
 * on first blocklet activation when /data/.route/ is empty.
 */

import { joinURL } from "ufo";
import type { AFSRoot } from "../type.js";
import { parseRouteConfig } from "./route-config.js";

const PROGRAM_ROUTE_DIR = "/blocklet/.route";
const DATA_ROUTE_DIR = "/data/.route";

/**
 * Seed routes from `/blocklet/.route/` to `/data/.route/` if the data directory is empty.
 *
 * @param afs - The blocklet Runtime AFS (must have /blocklet and /data mounts)
 * @returns Number of routes seeded (0 if skipped or no source routes)
 */
export async function seedRoutes(afs: AFSRoot): Promise<number> {
  if (!afs.list || !afs.read || !afs.write) {
    return 0; // AFS doesn't support required operations
  }

  // Check if /data/.route/ already has content — if so, skip (runtime state takes priority)
  try {
    const existing = await afs.list(DATA_ROUTE_DIR);
    if (existing.data && existing.data.length > 0) {
      return 0;
    }
  } catch {
    // Directory doesn't exist yet — proceed with seeding
  }

  // Check if /blocklet/.route/ exists and has route files
  let sourceRoutes: Array<{ path: string }>;
  try {
    const result = await afs.list(PROGRAM_ROUTE_DIR);
    sourceRoutes = result.data ?? [];
  } catch {
    // No /blocklet/.route/ directory — nothing to seed
    return 0;
  }

  if (sourceRoutes.length === 0) return 0;

  let seeded = 0;
  for (const entry of sourceRoutes) {
    const name = entry.path.split("/").pop();
    if (!name) continue;

    try {
      // Read source route file
      const readResult = await afs.read(joinURL(PROGRAM_ROUTE_DIR, name));
      const content = String(readResult.data?.content ?? "");
      if (!content.trim()) continue;

      // Validate before copying — skip invalid routes
      parseRouteConfig(content);

      // Write to /data/.route/
      await afs.write(joinURL(DATA_ROUTE_DIR, name), { content });
      seeded++;
    } catch {
      // Skip invalid route files
    }
  }

  return seeded;
}
