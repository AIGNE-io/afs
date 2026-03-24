import { AFSError, getPlatform } from "@aigne/afs";

/**
 * Assert that a resolved path stays within the given root directory.
 * Performs both logical path check and realpath-based symlink check.
 */
export async function assertPathWithinRoot(fullPath: string, rootDir: string): Promise<void> {
  const { path } = getPlatform();
  const mountRoot = path.resolve(rootDir);
  const resolved = path.resolve(fullPath);

  // 1. Logical path check (catches ../ traversal)
  if (resolved !== mountRoot && !resolved.startsWith(`${mountRoot}/`)) {
    throw new AFSError("Path traversal is not allowed", "AFS_PERMISSION_DENIED");
  }

  // 2. Symlink-aware check: resolve real path and verify it's still within root
  // realpath is Node-only — dynamic import since PlatformFS doesn't expose it
  try {
    const { realpath } = await import("node:fs/promises");
    let real: string;
    try {
      real = await realpath(resolved);
    } catch {
      // Target doesn't exist yet (e.g. write to new file) — check parent
      const parent = path.dirname(resolved);
      try {
        real = await realpath(parent);
      } catch {
        // Parent also doesn't exist — logical check is sufficient
        return;
      }
    }
    const realMountRoot = await realpath(mountRoot);
    if (real !== realMountRoot && !real.startsWith(`${realMountRoot}/`)) {
      throw new AFSError("Path traversal via symlink is not allowed", "AFS_PERMISSION_DENIED");
    }
  } catch (error) {
    if (error instanceof AFSError) throw error;
    // Other filesystem errors (e.g. permission denied) or non-Node runtime — let the actual operation handle them
  }
}
