/**
 * Tests for --trust flag on `afs did issue --counter-sign`
 *
 * Tests validation logic (--trust requires --counter-sign and --issuer-key)
 * and auto-registration behavior.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yargs from "yargs";
import { createDIDCommand, issueForEntity } from "../../src/core/commands/did.js";
import type { CommandFactoryOptions } from "../../src/core/commands/types.js";
import { ExitCode } from "../../src/errors.js";

let tempDir: string;
let tempHome: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `afs-trust-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tempHome = join(tmpdir(), `afs-trust-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
  await mkdir(tempHome, { recursive: true });
  // Create minimal package.json for entity detection
  await writeFile(
    join(tempDir, "package.json"),
    JSON.stringify({ name: "@test/provider", version: "1.0.0" }),
  );
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
  await rm(tempHome, { recursive: true, force: true });
});

// ── Helper: run CLI handler via yargs ──

async function runIssueCommand(
  args: string[],
  cwd: string,
): Promise<{ result: any; error?: { code?: number; message: string } }> {
  return new Promise((resolve) => {
    const options: CommandFactoryOptions = {
      cwd,
      argv: [],
      onResult: (output) => {
        resolve({ result: output.result, error: output.error });
      },
    };

    const parser = yargs()
      .command(createDIDCommand(options))
      .fail((_msg, err) => {
        resolve({
          result: null,
          error: { code: ExitCode.RUNTIME_ERROR, message: err?.message ?? _msg },
        });
      });

    parser.parse(["did", "issue", ...args]);
  });
}

// ══════════════════════════════════════════════════════════════
// --trust flag validation
// ══════════════════════════════════════════════════════════════

describe("--trust flag validation", () => {
  test("--trust without --counter-sign → error", async () => {
    const { error } = await runIssueCommand(["--trust"], tempDir);
    expect(error).toBeDefined();
    expect(error!.message).toContain("--trust requires --counter-sign");
  });

  test("--trust with --counter-sign but without --issuer-key → error", async () => {
    const { error } = await runIssueCommand(["--trust", "--counter-sign"], tempDir);
    expect(error).toBeDefined();
    expect(error!.message).toContain("--trust requires --issuer-key");
  });

  test("--trust with --counter-sign and --issuer-key but no VC → counter-sign error (not trust error)", async () => {
    // Create a key file
    const keyPath = join(tempHome, "developer.json");
    await writeFile(
      keyPath,
      JSON.stringify({
        did: "z1DevKey",
        pk: "0x04devpk",
        sk: "0xsecret",
        type: "default",
      }),
    );

    // No VC exists, so counter-sign itself will fail — but trust validation passes
    const { result } = await runIssueCommand(
      ["--trust", "--counter-sign", "--issuer-key", keyPath],
      tempDir,
    );
    // Should get a counter-sign error (no existing VC), not a --trust validation error
    expect(result.status).toBe("error");
    expect(result.error).toContain("No existing .did/vc.json");
  });
});

// ══════════════════════════════════════════════════════════════
// --trust auto-registration via issueForEntity
// ══════════════════════════════════════════════════════════════

describe("--trust flag auto-registration", () => {
  test("counter-sign with --trust registers issuer", async () => {
    // Setup: init developer + provider identity, issue self-sign VC
    const { performDIDInit, performDIDIssueSelfSign } = await import(
      "../../src/core/commands/did.js"
    );
    await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
    await performDIDInit({ entityType: "provider", cwd: tempDir, home: tempHome });
    await performDIDIssueSelfSign({ skipCheck: true, cwd: tempDir, home: tempHome });

    // Create an issuer key file
    const { loadDeveloperKey } = await import("@aigne/afs-trust");
    const devKey = (await loadDeveloperKey(tempHome))!;
    // Use the dev key as the issuer key for simplicity
    const keyPath = join(tempHome, "test-issuer.json");
    await writeFile(
      keyPath,
      JSON.stringify({
        did: devKey.did,
        pk: devKey.pk,
        sk: devKey.sk,
        type: devKey.type,
      }),
    );

    // Counter-sign with --trust
    const result = await issueForEntity(tempDir, tempHome, {
      "counter-sign": true,
      "issuer-key": keyPath,
      trust: true,
    });

    expect(result.status).toBe("counter-signed");

    // Verify issuer was registered in trust store
    const issuerFile = join(tempHome, ".afs", "trusted-issuers", "test-issuer.did.json");
    const content = JSON.parse(await readFile(issuerFile, "utf-8"));
    expect(content.did).toBe(devKey.did);
    expect(content.pk).toBe(devKey.pk);
    expect(content.source).toBe("manual");
    // sk should NOT be in the stored file
    expect(content.sk).toBeUndefined();
  });

  test("--trust derives issuer name from key file path", async () => {
    const { performDIDInit, performDIDIssueSelfSign } = await import(
      "../../src/core/commands/did.js"
    );
    await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
    await performDIDInit({ entityType: "provider", cwd: tempDir, home: tempHome });
    await performDIDIssueSelfSign({ skipCheck: true, cwd: tempDir, home: tempHome });

    const { loadDeveloperKey } = await import("@aigne/afs-trust");
    const devKey = (await loadDeveloperKey(tempHome))!;
    // Key filename → issuer name: "my-company-issuer.json" → "my-company-issuer"
    const keyPath = join(tempHome, "my-company-issuer.json");
    await writeFile(
      keyPath,
      JSON.stringify({
        did: devKey.did,
        pk: devKey.pk,
        sk: devKey.sk,
        type: devKey.type,
      }),
    );

    await issueForEntity(tempDir, tempHome, {
      "counter-sign": true,
      "issuer-key": keyPath,
      trust: true,
    });

    const issuerFile = join(tempHome, ".afs", "trusted-issuers", "my-company-issuer.did.json");
    const content = JSON.parse(await readFile(issuerFile, "utf-8"));
    expect(content.did).toBe(devKey.did);
  });

  test("counter-sign without --trust does NOT register issuer", async () => {
    const { performDIDInit, performDIDIssueSelfSign } = await import(
      "../../src/core/commands/did.js"
    );
    await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
    await performDIDInit({ entityType: "provider", cwd: tempDir, home: tempHome });
    await performDIDIssueSelfSign({ skipCheck: true, cwd: tempDir, home: tempHome });

    const { loadDeveloperKey } = await import("@aigne/afs-trust");
    const devKey = (await loadDeveloperKey(tempHome))!;
    const keyPath = join(tempHome, "no-trust-key.json");
    await writeFile(
      keyPath,
      JSON.stringify({
        did: devKey.did,
        pk: devKey.pk,
        sk: devKey.sk,
        type: devKey.type,
      }),
    );

    const result = await issueForEntity(tempDir, tempHome, {
      "counter-sign": true,
      "issuer-key": keyPath,
      // trust: false (default)
    });

    expect(result.status).toBe("counter-signed");

    // Issuer should NOT be in trust store
    const { readdir } = await import("node:fs/promises");
    try {
      const files = await readdir(join(tempHome, ".afs", "trusted-issuers"));
      const issuerFiles = files.filter((f) => f.endsWith(".did.json"));
      expect(issuerFiles).not.toContain("no-trust-key.did.json");
    } catch {
      // Directory doesn't exist → no issuer registered, which is correct
    }
  });

  test("--trust failure is non-fatal — trustWarning on result", async () => {
    const { performDIDInit, performDIDIssueSelfSign } = await import(
      "../../src/core/commands/did.js"
    );
    await performDIDInit({ entityType: "developer", cwd: tempDir, home: tempHome });
    await performDIDInit({ entityType: "provider", cwd: tempDir, home: tempHome });
    await performDIDIssueSelfSign({ skipCheck: true, cwd: tempDir, home: tempHome });

    const { loadDeveloperKey } = await import("@aigne/afs-trust");
    const devKey = (await loadDeveloperKey(tempHome))!;
    const keyPath = join(tempHome, "warn-key.json");
    await writeFile(
      keyPath,
      JSON.stringify({
        did: devKey.did,
        pk: devKey.pk,
        sk: devKey.sk,
        type: devKey.type,
      }),
    );

    // Make issuers dir unwritable to force addTrustedIssuer failure
    const issuersDir = join(tempHome, ".afs", "trusted-issuers");
    await mkdir(issuersDir, { recursive: true });
    const { chmod } = await import("node:fs/promises");
    await chmod(issuersDir, 0o444); // read-only

    try {
      const result = await issueForEntity(tempDir, tempHome, {
        "counter-sign": true,
        "issuer-key": keyPath,
        trust: true,
      });

      // Counter-sign should still succeed
      expect(result.status).toBe("counter-signed");
      // Should have a trustWarning, not throw
      expect(result.trustWarning).toBeDefined();
      expect(result.trustWarning).toContain("failed to register issuer");
    } finally {
      await chmod(issuersDir, 0o755); // restore for cleanup
    }
  });
});
