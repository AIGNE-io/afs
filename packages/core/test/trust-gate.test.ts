import { describe, expect, test } from "bun:test";
import { AFSMountError } from "../src/error.js";
import {
  checkTrustGate,
  type TrustConfig,
  type TrustGateOptions,
  type VerifyFn,
} from "../src/trust-gate.js";
import type { AFSModule } from "../src/type.js";

// ─── Test helpers ─────────────────────────────────────────────────────────

/** Minimal mock module with optional credential */
function mockModule(name: string, credential?: Record<string, unknown>): AFSModule {
  return {
    name,
    credential,
    async list() {
      return { data: [] };
    },
    async read() {
      return {};
    },
  } as unknown as AFSModule;
}

/** Valid credential mock with proper structure */
function validCredential(subjectDid: string, issuerDid?: string): Record<string, unknown> {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "AFSProviderCredential"],
    issuer: { id: issuerDid ?? subjectDid },
    credentialSubject: {
      id: subjectDid,
      provider: { name: "test-provider", version: "1.0.0" },
    },
    proof: {
      type: "Ed25519Signature2018",
      verificationMethod: `${issuerDid ?? subjectDid}#key-1`,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Trust Gate", () => {
  describe("trust=none", () => {
    const config: TrustConfig = { default: "none", overrides: {} };
    const opts: TrustGateOptions = { config, trustedIssuers: [] };

    test("any provider (no VC) → passes", async () => {
      const mod = mockModule("test-provider");
      await expect(checkTrustGate(mod, opts)).resolves.toBeUndefined();
    });

    test("any provider (with VC) → passes", async () => {
      const mod = mockModule("test-provider", validCredential("z1abc"));
      await expect(checkTrustGate(mod, opts)).resolves.toBeUndefined();
    });
  });

  describe("trust=conformant", () => {
    const config: TrustConfig = { default: "conformant", overrides: {} };

    test("provider without VC → throws AFSMountError", async () => {
      const mod = mockModule("test-provider");
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      await expect(checkTrustGate(mod, opts)).rejects.toThrow(AFSMountError);
      await expect(checkTrustGate(mod, opts)).rejects.toThrow("no credential");
    });

    test("credential missing credentialSubject.id → throws", async () => {
      const mod = mockModule("test-provider", {
        credentialSubject: { provider: { name: "x" } },
      });
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      await expect(checkTrustGate(mod, opts)).rejects.toThrow("credentialSubject.id");
    });
  });

  describe("config overrides", () => {
    test("exact match override → uses override level", async () => {
      const config: TrustConfig = {
        default: "verified",
        overrides: { "my-provider": "none" },
      };
      const mod = mockModule("my-provider");
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      // none = no check, so should pass even without VC
      await expect(checkTrustGate(mod, opts)).resolves.toBeUndefined();
    });

    test("glob match override → uses override level", async () => {
      const config: TrustConfig = {
        default: "verified",
        overrides: { "@aigne/afs-*": "none" },
      };
      const mod = mockModule("@aigne/afs-sqlite");
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      await expect(checkTrustGate(mod, opts)).resolves.toBeUndefined();
    });

    test("no match → falls back to default", async () => {
      const config: TrustConfig = {
        default: "conformant",
        overrides: { "@aigne/afs-*": "none" },
      };
      const mod = mockModule("@community/redis");
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      // default=conformant, no VC → should throw
      await expect(checkTrustGate(mod, opts)).rejects.toThrow("no credential");
    });
  });

  describe("per-mount levelOverride", () => {
    /** Mock verifyFn that returns a configurable result */
    function mockVerifyForOverride(result: {
      valid: boolean;
      trustLevel?: string;
      error?: string;
    }): VerifyFn {
      return async () => result;
    }

    test("levelOverride takes precedence over config default", async () => {
      const config: TrustConfig = { default: "verified", overrides: {} };
      const opts: TrustGateOptions = {
        config,
        trustedIssuers: ["z1abc"],
        levelOverride: "conformant",
      };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerifyForOverride({ valid: true, trustLevel: "conformant" });
      // config default is "verified", but override is "conformant" → conformant VC should pass
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("levelOverride takes precedence over config overrides", async () => {
      const config: TrustConfig = {
        default: "none",
        overrides: { "test-provider": "certified" },
      };
      const opts: TrustGateOptions = {
        config,
        trustedIssuers: ["z1abc"],
        levelOverride: "conformant",
      };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerifyForOverride({ valid: true, trustLevel: "conformant" });
      // config override for "test-provider" is "certified", but per-mount is "conformant"
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("levelOverride=none skips trust gate entirely", async () => {
      const config: TrustConfig = { default: "certified", overrides: {} };
      const opts: TrustGateOptions = {
        config,
        trustedIssuers: [],
        levelOverride: "none",
      };
      const mod = mockModule("no-vc-provider");
      // No VC, config requires "certified", but override is "none" → should pass
      await expect(checkTrustGate(mod, opts)).resolves.toBeUndefined();
    });

    test("levelOverride can be stricter than config", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = {
        config,
        trustedIssuers: ["z1abc"],
        levelOverride: "verified",
      };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerifyForOverride({ valid: true, trustLevel: "conformant" });
      // config is "conformant" but override is "verified" → conformant VC should fail
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow("insufficient");
    });
  });

  // ─── Full-chain tests (inject verifyFn to reach post-import branches) ───

  describe("VC verification full chain", () => {
    /** Mock verifyFn that returns a configurable result */
    function mockVerify(result: { valid: boolean; trustLevel?: string; error?: string }): VerifyFn {
      return async () => result;
    }

    test("valid conformant VC + trust=conformant → passes", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true, trustLevel: "conformant" });
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("valid verified VC + trust=conformant → passes (higher than required)", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true, trustLevel: "verified" });
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("valid certified VC + trust=verified → passes (higher than required)", async () => {
      const config: TrustConfig = { default: "verified", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true, trustLevel: "certified" });
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("conformant VC + trust=verified → throws insufficient level", async () => {
      const config: TrustConfig = { default: "verified", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true, trustLevel: "conformant" });
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow("insufficient");
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow(AFSMountError);
    });

    test("conformant VC + trust=certified → throws insufficient level", async () => {
      const config: TrustConfig = { default: "certified", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true, trustLevel: "conformant" });
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow(
        "'conformant' insufficient, 'certified' required",
      );
    });

    test("verified VC + trust=certified → throws insufficient level", async () => {
      const config: TrustConfig = { default: "certified", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true, trustLevel: "verified" });
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow(
        "'verified' insufficient, 'certified' required",
      );
    });

    test("invalid VC (verify returns valid=false) → throws verification failed", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: false, error: "signature mismatch" });
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow("VC verification failed");
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow("signature mismatch");
    });

    test("self-signed VC passes when ownerDid is NOT in trustedIssuers (BUG-1)", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      // trustedIssuers is empty — does NOT include the ownerDid "z1self"
      const opts: TrustGateOptions = { config, trustedIssuers: [] };
      const mod = mockModule("self-signed-provider", validCredential("z1self"));
      // verifyFn receives trustedIssuers that should now include ownerDid automatically
      const verify: VerifyFn = async (params) => {
        // The fix ensures ownerDid is always in trustedIssuers
        if (!params.trustedIssuers.includes(params.ownerDid)) {
          return { valid: false, error: "Proof signer not in trusted issuers" };
        }
        return { valid: true, trustLevel: "conformant" };
      };
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("ownerDid is passed to verifyFn in trustedIssuers even when not in options", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1other"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      let capturedIssuers: string[] = [];
      const verify: VerifyFn = async (params) => {
        capturedIssuers = params.trustedIssuers;
        return { valid: true, trustLevel: "conformant" };
      };
      await checkTrustGate(mod, opts, verify);
      expect(capturedIssuers).toContain("z1abc"); // ownerDid added
      expect(capturedIssuers).toContain("z1other"); // original preserved
    });

    test("ownerDid is not duplicated when already in trustedIssuers", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc", "z1other"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      let capturedIssuers: string[] = [];
      const verify: VerifyFn = async (params) => {
        capturedIssuers = params.trustedIssuers;
        return { valid: true, trustLevel: "conformant" };
      };
      await checkTrustGate(mod, opts, verify);
      const count = capturedIssuers.filter((i) => i === "z1abc").length;
      expect(count).toBe(1); // not duplicated
    });

    test("verify returns no trustLevel → defaults to conformant", async () => {
      const config: TrustConfig = { default: "conformant", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true }); // no trustLevel
      await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
    });

    test("verify returns no trustLevel + trust=verified → throws insufficient", async () => {
      const config: TrustConfig = { default: "verified", overrides: {} };
      const opts: TrustGateOptions = { config, trustedIssuers: ["z1abc"] };
      const mod = mockModule("test-provider", validCredential("z1abc"));
      const verify = mockVerify({ valid: true }); // defaults to conformant
      await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow("insufficient");
    });

    test("level order: none < conformant < verified < certified", async () => {
      const levels = ["none", "conformant", "verified", "certified"] as const;
      const did = "z1test";
      const cred = validCredential(did);

      for (let required = 0; required < levels.length; required++) {
        for (let actual = 0; actual < levels.length; actual++) {
          if (levels[required] === "none") continue; // none skips check entirely
          const config: TrustConfig = { default: levels[required]!, overrides: {} };
          const opts: TrustGateOptions = { config, trustedIssuers: [did] };
          const mod = mockModule("lvl-test", cred);
          const verify = mockVerify({ valid: true, trustLevel: levels[actual] });

          if (actual >= required) {
            await expect(checkTrustGate(mod, opts, verify)).resolves.toBeUndefined();
          } else {
            await expect(checkTrustGate(mod, opts, verify)).rejects.toThrow(AFSMountError);
          }
        }
      }
    });
  });
});

describe("Trust Gate Integration with AFS", () => {
  // This test verifies that AFS.mount() respects trust config
  test("AFS without trust config → mount succeeds without VC", async () => {
    const { AFS } = await import("../src/afs.js");

    const afs = new AFS();
    const mod = mockModule("test-provider");

    // Need to make the mock satisfy checkProviderOnMount
    (mod as any).stat = async () => ({ data: { path: "/" } });

    await afs.mount(mod, "/test-no-trust");
    // Should not throw — no trust checking when config is absent
  });

  test("AFS with trust config (none) → mount succeeds without VC", async () => {
    const { AFS } = await import("../src/afs.js");

    const afs = new AFS({
      trust: {
        config: { default: "none", overrides: {} },
        issuers: [],
      },
    });

    const mod = mockModule("test-provider");
    (mod as any).stat = async () => ({ data: { path: "/" } });

    await afs.mount(mod, "/test-none-trust");
    // Should not throw — trust level is "none"
  });

  test("AFS with trust config (conformant) → mount fails without VC", async () => {
    const { AFS } = await import("../src/afs.js");

    const afs = new AFS({
      trust: {
        config: { default: "conformant", overrides: {} },
        issuers: [],
      },
    });

    const mod = mockModule("no-vc-provider");
    (mod as any).stat = async () => ({ data: { path: "/" } });

    await afs.mount(mod, "/test-conf-trust");
    await expect(afs.check("/test-conf-trust")).rejects.toThrow(AFSMountError);
    await expect(afs.check("/test-conf-trust")).rejects.toThrow("no credential");
  });

  test("AFS with trust config + lenient → mount succeeds but emits mountError", async () => {
    const { AFS } = await import("../src/afs.js");

    const changes: any[] = [];
    const afs = new AFS({
      trust: {
        config: { default: "conformant", overrides: {} },
        issuers: [],
      },
      onChange: (event) => changes.push(event),
    });

    const mod = mockModule("no-vc-provider-lenient");
    (mod as any).stat = async () => ({ data: { path: "/" } });

    // lenient mode: mount succeeds, async check emits mountError
    await afs.mount(mod, "/test-lenient-trust", { lenient: true });

    // Wait for async check to complete
    try {
      await afs.check("/test-lenient-trust");
    } catch {
      // expected — trust gate failure
    }

    const mountError = changes.find(
      (c) => c.kind === "mountError" && c.moduleName === "no-vc-provider-lenient",
    );
    expect(mountError).toBeDefined();
    expect(mountError.meta.error).toContain("no credential");
  });

  test("setTrustConfig / setTrustedIssuers work", async () => {
    const { AFS } = await import("../src/afs.js");

    const afs = new AFS();
    afs.setTrustConfig({ default: "conformant", overrides: {} });
    afs.setTrustedIssuers(["z1abc"]);

    const mod = mockModule("no-vc-setter");
    (mod as any).stat = async () => ({ data: { path: "/" } });

    await afs.mount(mod, "/test-setter");
    await expect(afs.check("/test-setter")).rejects.toThrow("no credential");
  });
});
