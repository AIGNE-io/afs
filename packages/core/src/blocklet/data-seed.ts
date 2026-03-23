/**
 * Data seed mechanism — copies initial data from /program/seed/ to /data/
 * on first blocklet initialization when target files don't exist yet.
 *
 * Convention: blocklets place seed data in a `seed/` directory alongside
 * their code. On first use, these files are copied to the user's /data
 * directory (DID Space or filesystem). Existing files are never overwritten,
 * so user modifications are preserved across restarts.
 */

import { joinURL } from "ufo";
import type { AFSEntry, AFSRoot } from "../type.js";

const SEED_DIR = "/program/seed";
const DATA_DIR = "/data";

/**
 * Seed initial data from `/program/seed/` to `/data/`.
 * Copies files that don't already exist in `/data/` (idempotent).
 * Recursively handles subdirectories.
 *
 * @param afs - The blocklet Runtime AFS (must have /program and /data mounts)
 * @returns Number of files seeded (0 if skipped or no seed data)
 */
export async function seedBlockletData(afs: AFSRoot): Promise<number> {
  if (!afs.list || !afs.read || !afs.write) {
    return 0;
  }

  // Check if /data is mounted and writable
  try {
    await afs.list(DATA_DIR);
  } catch {
    return 0; // No /data mount — skip seeding
  }

  // Check if /program/seed/ exists
  let seedEntries: AFSEntry[];
  try {
    const result = await afs.list(SEED_DIR);
    seedEntries = result.data ?? [];
  } catch {
    return 0; // No seed/ directory — nothing to seed
  }

  if (seedEntries.length === 0) return 0;

  return seedDir(afs, SEED_DIR, DATA_DIR);
}

/**
 * Recursively copy files from srcDir to destDir, skipping existing targets.
 */
async function seedDir(afs: AFSRoot, srcDir: string, destDir: string): Promise<number> {
  let entries: AFSEntry[];
  try {
    const result = await afs.list!(srcDir);
    entries = result.data ?? [];
  } catch {
    return 0;
  }

  let seeded = 0;

  for (const entry of entries) {
    const name = entry.path.split("/").pop();
    if (!name) continue;

    const srcPath = joinURL(srcDir, name);
    const destPath = joinURL(destDir, name);

    const isDir =
      (entry as any).type === "directory" ||
      (entry.meta?.childrenCount != null && entry.meta.childrenCount !== 0);

    if (isDir) {
      seeded += await seedDir(afs, srcPath, destPath);
      continue;
    }

    // Skip if target already exists
    try {
      await afs.stat!(destPath);
      continue;
    } catch {
      // Doesn't exist — proceed
    }

    try {
      const readResult = await afs.read!(srcPath);
      const raw = readResult.data;
      const content =
        typeof raw === "string"
          ? raw
          : typeof (raw as any)?.content === "string"
            ? (raw as any).content
            : String(raw ?? "");
      await afs.write!(destPath, { content });
      seeded++;
    } catch {
      // Skip unreadable/unwritable files — best effort
    }
  }

  return seeded;
}
