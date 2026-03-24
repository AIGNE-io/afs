import { describe, expect, test } from "bun:test";
import type { ProviderManifest, ProviderSecurityDeclaration } from "@aigne/afs";
import type { TestConfig } from "../../types.js";

const VALID_RISK_LEVELS = ["sandboxed", "external", "local", "system"] as const;

const VALID_RESOURCE_ACCESS = [
  "local-filesystem",
  "local-network",
  "internet",
  "cloud-api",
  "process-spawn",
  "docker",
  "system-config",
] as const;

const VALID_EXTERNAL_DEPS = ["docker", "git", "sqlite", "cloud-credentials"] as const;

const VALID_DATA_SENSITIVITY = [
  "credentials",
  "personal-data",
  "system-config",
  "financial",
  "media",
  "code",
] as const;

function validateSecurityDeclaration(security: ProviderSecurityDeclaration, label: string): void {
  test(`${label}: declares valid riskLevel`, () => {
    expect(VALID_RISK_LEVELS).toContain(security.riskLevel);
  });

  test(`${label}: resourceAccess is an array`, () => {
    expect(Array.isArray(security.resourceAccess)).toBe(true);
  });

  test(`${label}: all resourceAccess values are valid`, () => {
    for (const access of security.resourceAccess) {
      expect(VALID_RESOURCE_ACCESS as readonly string[]).toContain(access);
    }
  });

  if (security.requires) {
    test(`${label}: all requires values are valid`, () => {
      for (const dep of security.requires!) {
        expect(VALID_EXTERNAL_DEPS as readonly string[]).toContain(dep);
      }
    });
  }

  if (security.dataSensitivity) {
    test(`${label}: all dataSensitivity values are valid`, () => {
      for (const ds of security.dataSensitivity!) {
        expect(VALID_DATA_SENSITIVITY as readonly string[]).toContain(ds);
      }
    });
  }

  if (security.notes) {
    test(`${label}: notes is an array of strings`, () => {
      expect(Array.isArray(security.notes)).toBe(true);
      for (const note of security.notes!) {
        expect(typeof note).toBe("string");
      }
    });
  }
}

/**
 * Run SecurityManifestValidation suite.
 * Verifies that the provider declares a valid security manifest via static manifest().
 *
 * Skips gracefully when providerClass is not provided.
 * Handles both single manifest and manifest array (for multi-scheme providers like mcp, http).
 */
export function runSecurityManifestTests(
  providerClass: { manifest?(): ProviderManifest | ProviderManifest[] } | undefined,
  _config: TestConfig,
): void {
  describe("security-manifest", () => {
    if (!providerClass) {
      test("skipped — no providerClass provided", () => {
        // Graceful skip: no providerClass means we can't validate static manifest
      });
      return;
    }

    if (!providerClass.manifest) {
      test("skipped — providerClass has no manifest() method", () => {
        // Graceful skip: provider without manifest() can't have security declaration
      });
      return;
    }

    const rawManifest = providerClass.manifest();
    const manifests: ProviderManifest[] = Array.isArray(rawManifest) ? rawManifest : [rawManifest];

    test("manifest() returns at least one entry", () => {
      expect(manifests.length).toBeGreaterThan(0);
    });

    for (const manifest of manifests) {
      const label = manifest.name ?? "unnamed";

      test(`${label}: declares security field`, () => {
        expect(manifest.security).toBeDefined();
      });

      if (manifest.security) {
        validateSecurityDeclaration(manifest.security, label);
      }
    }
  });
}
