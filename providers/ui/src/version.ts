/**
 * Portable version accessor for @aigne/afs-ui.
 *
 * Avoids node:module (createRequire) by using getPlatform().fs to read package.json.
 * Synchronous access via AFS_UI_VERSION (starts as "unknown", resolved at init).
 * Call initVersion() early if you need the real version before first use.
 */

import { getPlatform } from "@aigne/afs";

/** Current version string — "unknown" until initVersion() completes. */
export let AFS_UI_VERSION = "unknown";

let _initPromise: Promise<void> | null = null;

/**
 * Initialize the version by reading package.json via the platform adapter.
 * Safe to call multiple times — only the first call does work.
 */
export function initVersion(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const platform = getPlatform();
      if (!platform.fs) return;

      // Resolve the path to our own package.json.
      // In Node/Bun, import.meta.url gives us a file:// URL.
      // We need to go up from src/ to the package root.
      let pkgDir: string;
      if (typeof import.meta.url === "string" && import.meta.url.startsWith("file://")) {
        const filePath = new URL(import.meta.url).pathname;
        pkgDir = platform.path.dirname(platform.path.dirname(filePath));
      } else {
        // Non-file URL — try cwd-based resolution
        const cwd = platform.process?.cwd?.() ?? ".";
        pkgDir = cwd;
      }

      const pkgPath = platform.path.join(pkgDir, "package.json");
      const exists = await platform.fs.exists(pkgPath);
      if (!exists) return;

      const raw = await platform.fs.readTextFile(pkgPath);
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      if (typeof pkg.version === "string") {
        AFS_UI_VERSION = pkg.version;
      }
    } catch {
      // Keep "unknown" — non-critical
    }
  })();
  return _initPromise;
}

/** Override version externally (e.g. in tests or Workers). */
export function setVersion(version: string): void {
  AFS_UI_VERSION = version;
  _initPromise = Promise.resolve();
}
