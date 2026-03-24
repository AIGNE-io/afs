import { describe, expect, test } from "bun:test";
import {
  type DIDCheckResult,
  type DIDInfoResult,
  type DIDInitResult,
  type DIDIssueResult,
  type DIDVerifyResult,
  formatProviderCheckOutput,
  formatProviderInfoOutput,
  formatProviderInitOutput,
  formatProviderIssueOutput,
  formatProviderVerifyOutput,
} from "../../src/core/formatters/provider.js";

// ══════════════════════════════════════════════════════════════
// Test Data
// ══════════════════════════════════════════════════════════════

// ── Init fixtures ──

const initCreated: DIDInitResult = {
  batch: false,
  name: "@aigne/afs-json",
  did: "z1abc123",
  status: "created",
  entityType: "provider",
  derivedFrom: "z0rootkey",
};

const initSkipped: DIDInitResult = {
  batch: false,
  name: "@aigne/afs-json",
  did: "z1abc123",
  status: "skipped",
  entityType: "provider",
};

const initError: DIDInitResult = {
  batch: false,
  name: "@aigne/afs-json",
  status: "error",
  error: "Developer root key not found",
};

const initBatch: DIDInitResult = {
  batch: true,
  results: [
    {
      batch: false,
      name: "@aigne/afs-json",
      did: "z1abc",
      status: "created",
      entityType: "provider",
    },
    {
      batch: false,
      name: "@aigne/afs-sqlite",
      did: "z2def",
      status: "skipped",
      entityType: "provider",
    },
    { batch: false, name: "@aigne/afs-git", status: "error", error: "no package.json" },
  ],
};

// ── Check fixtures ──

const checkPass: DIDCheckResult = {
  name: "@aigne/afs-json",
  success: true,
  passed: 21,
  failed: 0,
  skipped: 0,
  total: 21,
};

const checkFail: DIDCheckResult = {
  name: "@aigne/afs-json",
  success: false,
  passed: 18,
  failed: 3,
  skipped: 0,
  total: 21,
};

const checkError: DIDCheckResult = {
  name: "@aigne/afs-json",
  success: false,
  error: "No conformance test found at test/conformance.test.ts",
};

// ── Issue fixtures ──

const issueIssued: DIDIssueResult = {
  batch: false,
  name: "@aigne/afs-json",
  did: "z1abc123",
  status: "issued",
  level: "conformant",
  entityType: "provider",
};

const issueCounterSigned: DIDIssueResult = {
  batch: false,
  name: "@aigne/afs-json",
  did: "z1abc123",
  status: "counter-signed",
  level: "verified",
  entityType: "provider",
};

const issueError: DIDIssueResult = {
  batch: false,
  name: "@aigne/afs-json",
  status: "error",
  error: "Developer root key not found",
};

const issueSkipped: DIDIssueResult = {
  batch: false,
  name: "@aigne/afs-json",
  did: "",
  status: "skipped",
  error: "no conformance test",
};

const issueBatch: DIDIssueResult = {
  batch: true,
  results: [
    { name: "@aigne/afs-json", did: "z1abc", status: "issued", level: "conformant" },
    { name: "@aigne/afs-sqlite", did: "z2def", status: "counter-signed", level: "verified" },
    { name: "@aigne/afs-git", did: "", status: "skipped", error: "no conformance test" },
    { name: "@aigne/afs-http", did: "", status: "error", error: "no package.json" },
  ],
};

// ── Verify fixtures ──

const verifyValid: DIDVerifyResult = {
  name: "@aigne/afs-json",
  valid: true,
  trustLevel: "verified",
  issuer: "z2issuerDID",
  did: "z1abc123",
};

const verifyValidSelf: DIDVerifyResult = {
  name: "@aigne/afs-json",
  valid: true,
  trustLevel: "conformant",
  issuer: "z1abc123",
  did: "z1abc123",
};

const verifyInvalid: DIDVerifyResult = {
  name: "@aigne/afs-json",
  valid: false,
  error: "Signature verification failed",
};

const verifyNoCredential: DIDVerifyResult = {
  name: "@aigne/afs-json",
  valid: false,
  error: "No credential found at .did/vc.json",
};

// ── Info fixtures ──

const infoFull: DIDInfoResult = {
  name: "@aigne/afs-json",
  version: "1.2.0",
  did: "z1abc123",
  identityStore: "/home/user/.afs/identities/@aigne/afs-json.json",
  hasCredential: true,
  credentialPath: "/providers/json/.did/vc.json",
  issuer: "z2issuerDID",
  capabilities: ["read", "list", "search"],
  riskLevel: "low",
};

const infoEmpty: DIDInfoResult = {
  name: "@aigne/afs-json",
  version: "1.0.0",
  hasCredential: false,
};

const infoNoCaps: DIDInfoResult = {
  name: "@aigne/afs-json",
  version: "1.0.0",
  did: "z1abc123",
  hasCredential: true,
  credentialPath: "/providers/json/.did/vc.json",
};

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("DID Formatters", () => {
  // ────────────── Init ──────────────

  describe("formatProviderInitOutput", () => {
    test("llm: single created", () => {
      const output = formatProviderInitOutput(initCreated, "llm");
      expect(output).toContain("DID_INIT @aigne/afs-json");
      expect(output).toContain("STATUS created");
      expect(output).toContain("ENTITY_TYPE provider");
      expect(output).toContain("DID z1abc123");
      expect(output).toContain("DERIVED_FROM z0rootkey");
    });

    test("llm: single skipped omits DERIVED_FROM", () => {
      const output = formatProviderInitOutput(initSkipped, "llm");
      expect(output).toContain("STATUS skipped");
      expect(output).toContain("DID z1abc123");
      expect(output).not.toContain("DERIVED_FROM");
    });

    test("llm: single error", () => {
      const output = formatProviderInitOutput(initError, "llm");
      expect(output).toContain("STATUS error");
      expect(output).toContain("ERROR Developer root key not found");
    });

    test("llm: batch with --- separator and SUMMARY", () => {
      const output = formatProviderInitOutput(initBatch, "llm");
      expect(output).toContain("---");
      expect(output).toContain("SUMMARY");
      expect(output).toContain("initialized=1");
      expect(output).toContain("skipped=1");
      expect(output).toContain("errors=1");
      expect(output).toContain("total=3");
    });

    test("json: returns valid JSON with all fields", () => {
      const output = formatProviderInitOutput(initCreated, "json");
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe("@aigne/afs-json");
      expect(parsed.did).toBe("z1abc123");
      expect(parsed.status).toBe("created");
      expect(parsed.entityType).toBe("provider");
    });

    test("human: single created", () => {
      const output = formatProviderInitOutput(initCreated, "human");
      expect(output).toContain("Identity created for provider: @aigne/afs-json");
      expect(output).toContain("DID: z1abc123");
    });

    test("human: single skipped", () => {
      const output = formatProviderInitOutput(initSkipped, "human");
      expect(output).toContain("Identity already exists");
      expect(output).toContain("z1abc123");
    });

    test("default: single created", () => {
      const output = formatProviderInitOutput(initCreated, "default");
      expect(output).toContain("CREATED");
      expect(output).toContain("provider:");
      expect(output).toContain("@aigne/afs-json");
    });
  });

  // ────────────── Check ──────────────

  describe("formatProviderCheckOutput", () => {
    test("llm: pass", () => {
      const output = formatProviderCheckOutput(checkPass, "llm");
      expect(output).toContain("DID_CHECK @aigne/afs-json");
      expect(output).toContain("STATUS PASS");
      expect(output).toContain("PASSED 21");
      expect(output).toContain("FAILED 0");
      expect(output).toContain("TOTAL 21");
    });

    test("llm: fail", () => {
      const output = formatProviderCheckOutput(checkFail, "llm");
      expect(output).toContain("STATUS FAIL");
      expect(output).toContain("PASSED 18");
      expect(output).toContain("FAILED 3");
    });

    test("llm: error", () => {
      const output = formatProviderCheckOutput(checkError, "llm");
      expect(output).toContain("STATUS ERROR");
      expect(output).toContain("ERROR No conformance test found");
    });

    test("json: returns valid JSON", () => {
      const output = formatProviderCheckOutput(checkPass, "json");
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe("@aigne/afs-json");
      expect(parsed.passed).toBe(21);
      expect(parsed.total).toBe(21);
    });

    test("human: pass", () => {
      const output = formatProviderCheckOutput(checkPass, "human");
      expect(output).toContain("PASS");
      expect(output).toContain("21/21 tests");
    });

    test("human: fail", () => {
      const output = formatProviderCheckOutput(checkFail, "human");
      expect(output).toContain("FAIL");
      expect(output).toContain("3 failed");
    });

    test("default: pass", () => {
      const output = formatProviderCheckOutput(checkPass, "default");
      expect(output).toContain("PASS");
      expect(output).toContain("21/21");
    });
  });

  // ────────────── Issue ──────────────

  describe("formatProviderIssueOutput", () => {
    test("llm: single issued", () => {
      const output = formatProviderIssueOutput(issueIssued, "llm");
      expect(output).toContain("DID_ISSUE @aigne/afs-json");
      expect(output).toContain("STATUS issued");
      expect(output).toContain("DID z1abc123");
      expect(output).toContain("LEVEL conformant");
    });

    test("llm: single counter-signed", () => {
      const output = formatProviderIssueOutput(issueCounterSigned, "llm");
      expect(output).toContain("STATUS counter-signed");
      expect(output).toContain("LEVEL verified");
    });

    test("llm: single error", () => {
      const output = formatProviderIssueOutput(issueError, "llm");
      expect(output).toContain("STATUS error");
      expect(output).toContain("ERROR Developer root key not found");
    });

    test("llm: single skipped", () => {
      const output = formatProviderIssueOutput(issueSkipped, "llm");
      expect(output).toContain("STATUS skipped");
      expect(output).toContain("ERROR no conformance test");
    });

    test("llm: batch with --- separator and SUMMARY", () => {
      const output = formatProviderIssueOutput(issueBatch, "llm");
      expect(output).toContain("---");
      expect(output).toContain("SUMMARY");
      expect(output).toContain("issued=1");
      expect(output).toContain("counter_signed=1");
      expect(output).toContain("skipped=1");
      expect(output).toContain("errors=1");
      expect(output).toContain("total=4");
    });

    test("json: returns valid JSON", () => {
      const output = formatProviderIssueOutput(issueIssued, "json");
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe("@aigne/afs-json");
      expect(parsed.status).toBe("issued");
      expect(parsed.level).toBe("conformant");
    });

    test("human: single issued", () => {
      const output = formatProviderIssueOutput(issueIssued, "human");
      expect(output).toContain("VC issued for provider: @aigne/afs-json");
      expect(output).toContain("Level: conformant");
    });

    test("human: single counter-signed", () => {
      const output = formatProviderIssueOutput(issueCounterSigned, "human");
      expect(output).toContain("counter-signed");
      expect(output).toContain("Level: verified");
    });

    test("human: single error", () => {
      const output = formatProviderIssueOutput(issueError, "human");
      expect(output).toContain("Issue failed:");
    });

    test("default: single issued", () => {
      const output = formatProviderIssueOutput(issueIssued, "default");
      expect(output).toContain("ISSUED");
      expect(output).toContain("LEVEL=conformant");
    });
  });

  // ────────────── Verify ──────────────

  describe("formatProviderVerifyOutput", () => {
    test("llm: valid with external issuer", () => {
      const output = formatProviderVerifyOutput(verifyValid, "llm");
      expect(output).toContain("DID_VERIFY @aigne/afs-json");
      expect(output).toContain("VALID true");
      expect(output).toContain("TRUST_LEVEL verified");
      expect(output).toContain("ISSUER z2issuerDID");
    });

    test("llm: valid self-issued shows ISSUER self", () => {
      const output = formatProviderVerifyOutput(verifyValidSelf, "llm");
      expect(output).toContain("VALID true");
      expect(output).toContain("TRUST_LEVEL conformant");
      expect(output).toContain("ISSUER self");
    });

    test("llm: invalid", () => {
      const output = formatProviderVerifyOutput(verifyInvalid, "llm");
      expect(output).toContain("VALID false");
      expect(output).toContain("ERROR Signature verification failed");
      expect(output).not.toContain("TRUST_LEVEL");
    });

    test("llm: no credential", () => {
      const output = formatProviderVerifyOutput(verifyNoCredential, "llm");
      expect(output).toContain("VALID false");
      expect(output).toContain("ERROR No credential found");
    });

    test("json: returns valid JSON", () => {
      const output = formatProviderVerifyOutput(verifyValid, "json");
      const parsed = JSON.parse(output);
      expect(parsed.valid).toBe(true);
      expect(parsed.trustLevel).toBe("verified");
    });

    test("human: valid", () => {
      const output = formatProviderVerifyOutput(verifyValid, "human");
      expect(output).toContain("VC valid for @aigne/afs-json");
      expect(output).toContain("Level: verified");
    });

    test("human: invalid", () => {
      const output = formatProviderVerifyOutput(verifyInvalid, "human");
      expect(output).toContain("FAILED");
      expect(output).toContain("Signature verification failed");
    });

    test("default: valid", () => {
      const output = formatProviderVerifyOutput(verifyValid, "default");
      expect(output).toContain("VALID");
      expect(output).toContain("LEVEL=verified");
    });
  });

  // ────────────── Info ──────────────

  describe("formatProviderInfoOutput", () => {
    test("llm: full info", () => {
      const output = formatProviderInfoOutput(infoFull, "llm");
      expect(output).toContain("DID_INFO @aigne/afs-json");
      expect(output).toContain("VERSION 1.2.0");
      expect(output).toContain("DID z1abc123");
      expect(output).toContain("IDENTITY_STORE /home/user/.afs/identities/@aigne/afs-json.json");
      expect(output).toContain("CREDENTIAL true");
      expect(output).toContain("CREDENTIAL_PATH /providers/json/.did/vc.json");
      expect(output).toContain("ISSUER z2issuerDID");
      expect(output).toContain("CAPABILITIES read,list,search");
      expect(output).toContain("RISK low");
    });

    test("llm: empty (no identity, no credential)", () => {
      const output = formatProviderInfoOutput(infoEmpty, "llm");
      expect(output).toContain("DID_INFO @aigne/afs-json");
      expect(output).toContain("DID none");
      expect(output).toContain("CREDENTIAL false");
      expect(output).not.toContain("IDENTITY_STORE");
      expect(output).not.toContain("ISSUER");
      expect(output).not.toContain("CAPABILITIES");
    });

    test("llm: no capabilities omits CAPABILITIES line", () => {
      const output = formatProviderInfoOutput(infoNoCaps, "llm");
      expect(output).toContain("DID z1abc123");
      expect(output).not.toContain("CAPABILITIES");
      expect(output).not.toContain("RISK");
    });

    test("json: returns valid JSON", () => {
      const output = formatProviderInfoOutput(infoFull, "json");
      const parsed = JSON.parse(output);
      expect(parsed.name).toBe("@aigne/afs-json");
      expect(parsed.did).toBe("z1abc123");
      expect(parsed.capabilities).toEqual(["read", "list", "search"]);
    });

    test("human: full info", () => {
      const output = formatProviderInfoOutput(infoFull, "human");
      expect(output).toContain("Provider: @aigne/afs-json v1.2.0");
      expect(output).toContain("DID: z1abc123");
      expect(output).toContain("Capabilities: read, list, search");
      expect(output).toContain("Risk: low");
    });

    test("human: empty shows Not initialized", () => {
      const output = formatProviderInfoOutput(infoEmpty, "human");
      expect(output).toContain("DID: Not initialized");
      expect(output).toContain("Credential: No credential");
    });

    test("default: compact format", () => {
      const output = formatProviderInfoOutput(infoFull, "default");
      expect(output).toContain("@aigne/afs-json");
      expect(output).toContain("DID=z1abc123");
      expect(output).toContain("CREDENTIAL=true");
    });
  });
});

// ────────────── Blocklet entity support ──────────────

describe("Blocklet entity support", () => {
  test("human info: blocklet entity type — no version", () => {
    const output = formatProviderInfoOutput(
      { name: "Telegram Assistant", entityType: "blocklet", did: "z1abc", hasCredential: false },
      "human",
    );
    expect(output).toContain("Blocklet: Telegram Assistant");
    expect(output).not.toContain("undefined");
    expect(output).not.toContain(" v");
  });

  test("human info: provider entity type — with version", () => {
    const output = formatProviderInfoOutput(
      {
        name: "@aigne/afs-json",
        entityType: "provider",
        version: "1.0.0",
        did: "z1abc",
        hasCredential: false,
      },
      "human",
    );
    expect(output).toContain("Provider: @aigne/afs-json v1.0.0");
  });

  test("human info: no entityType — defaults to Provider", () => {
    const output = formatProviderInfoOutput(
      { name: "@aigne/afs-json", version: "1.0.0", did: "z1abc", hasCredential: false },
      "human",
    );
    expect(output).toContain("Provider: @aigne/afs-json v1.0.0");
  });

  test("json info: includes entityType", () => {
    const output = formatProviderInfoOutput(
      { name: "my-bot", entityType: "blocklet", did: "z1abc", hasCredential: false },
      "json",
    );
    const parsed = JSON.parse(output);
    expect(parsed.entityType).toBe("blocklet");
  });

  test("human issue batch: summary says entities not providers", () => {
    const output = formatProviderIssueOutput(
      {
        batch: true,
        results: [
          { name: "@aigne/afs-json", did: "z1abc", status: "issued", level: "conformant" },
          { name: "telegram-assistant", did: "z2def", status: "issued", level: "conformant" },
        ],
      },
      "human",
    );
    expect(output).toContain("entities issued VCs");
    expect(output).not.toContain("providers issued VCs");
  });
});
