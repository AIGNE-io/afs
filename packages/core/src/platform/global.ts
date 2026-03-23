/**
 * Global platform adapter accessor.
 *
 * - Node/Bun: auto-detected, zero config needed
 * - Workers/Browser/QuickJS: must call setPlatform() before using AFS
 */

import type { PlatformAdapter } from "./types.js";

let _platform: PlatformAdapter | undefined;
let _autoDetected = false;

/**
 * Get the current platform adapter.
 * Auto-detects Node.js/Bun on first call if no adapter has been set.
 */
export function getPlatform(): PlatformAdapter {
  if (_platform) return _platform;

  // Auto-detect Node/Bun environment
  if (!_autoDetected) {
    _autoDetected = true;
    try {
      // Dynamic require to avoid bundler issues in non-Node environments
      const { createNodeAdapter } = require("./node.js") as typeof import("./node.js");
      _platform = createNodeAdapter();
      return _platform;
    } catch {
      // Not in Node — caller must setPlatform() explicitly
    }
  }

  throw new Error(
    "No platform adapter configured. " +
      "In non-Node environments (Workers, Browser, QuickJS), " +
      "call setPlatform() before using AFS.",
  );
}

/**
 * Set the platform adapter explicitly.
 * Required for Workers, Browser, and QuickJS environments.
 * In Node/Bun, this is optional (auto-detected).
 */
export function setPlatform(adapter: PlatformAdapter): void {
  _platform = adapter;
  _autoDetected = true;
}

/**
 * Reset platform adapter (mainly for testing).
 */
export function resetPlatform(): void {
  _platform = undefined;
  _autoDetected = false;
}
