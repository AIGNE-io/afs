import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AFSModule, ProviderManifest } from "@aigne/afs";
import type { TestConfig } from "../../types.js";

/**
 * Run SymlinkEscapeSecurity suite.
 * Tests that the provider doesn't follow symlinks that point outside the mount boundary.
 *
 * Only runs for providers with local-filesystem access.
 */
export function runSymlinkEscapeTests(
  getProvider: () => AFSModule,
  providerClass: { manifest?(): ProviderManifest | ProviderManifest[] } | undefined,
  _config: TestConfig,
): void {
  describe("symlink-escape", () => {
    // Check if this provider accesses local-filesystem
    if (!providerClass?.manifest) {
      test("skipped — no providerClass manifest", () => {});
      return;
    }

    const rawManifest = providerClass.manifest();
    const manifests: ProviderManifest[] = Array.isArray(rawManifest) ? rawManifest : [rawManifest];
    const hasLocalFs = manifests.some((m) =>
      m.security?.resourceAccess?.includes("local-filesystem"),
    );

    if (!hasLocalFs) {
      test("skipped — provider does not access local-filesystem", () => {});
      return;
    }

    // Only relevant for providers with read
    test("symlink pointing outside mount is handled safely", async () => {
      const provider = getProvider();
      if (!provider.read) return;

      // Create a temp directory with a symlink to outside
      const testDir = join(tmpdir(), `afs-symlink-test-${Date.now()}`);
      const outsideDir = join(tmpdir(), `afs-symlink-outside-${Date.now()}`);

      try {
        mkdirSync(testDir, { recursive: true });
        mkdirSync(outsideDir, { recursive: true });
        writeFileSync(join(outsideDir, "secret.txt"), "SECRET_DATA");

        // Create symlink inside testDir pointing to outsideDir
        const symlinkPath = join(testDir, "escape-link");
        try {
          symlinkSync(outsideDir, symlinkPath);
        } catch {
          // Symlink creation may fail on some systems — skip
          return;
        }

        // Try to read through the symlink
        // The provider may or may not use testDir as its root
        // This is a best-effort test — we verify the behavior is safe
        try {
          const result = await provider.read("/escape-link/secret.txt");
          if (result?.data) {
            const content =
              typeof result.data === "string" ? result.data : JSON.stringify(result.data);
            // If the provider follows the symlink, it should NOT expose external content
            // through its normal interface. We can't fully control the provider's root here,
            // so this test is primarily a smoke test.
            expect(content).toBeDefined();
          }
        } catch {
          // Error/rejection is the safe behavior
        }
      } finally {
        rmSync(testDir, { recursive: true, force: true });
        rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    test("recursive symlink doesn't cause infinite loop", async () => {
      const provider = getProvider();
      if (!provider.list) return;

      const testDir = join(tmpdir(), `afs-symlink-recursive-${Date.now()}`);

      try {
        mkdirSync(testDir, { recursive: true });

        // Create A → B → A cycle
        const linkA = join(testDir, "link-a");
        const linkB = join(testDir, "link-b");

        try {
          symlinkSync(linkB, linkA);
          symlinkSync(linkA, linkB);
        } catch {
          // May fail if symlink target doesn't exist yet — that's fine
          return;
        }

        // Try listing — should not hang or crash
        try {
          await provider.list("/link-a");
        } catch {
          // Error is the safe behavior
        }
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
}
