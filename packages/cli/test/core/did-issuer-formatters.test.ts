import { describe, expect, test } from "bun:test";
import {
  formatIssuerAddOutput,
  formatIssuerInspectOutput,
  formatIssuerListOutput,
  formatIssuerRemoveOutput,
  formatIssuerResetOutput,
  type IssuerAddResult,
  type IssuerInspectResult,
  type IssuerListResult,
  type IssuerRemoveResult,
  type IssuerResetResult,
} from "../../src/core/formatters/provider.js";

// ══════════════════════════════════════════════════════════════
// Test Data
// ══════════════════════════════════════════════════════════════

// ── List fixtures ──

const listEmpty: IssuerListResult = { issuers: [], total: 0 };

const listTwo: IssuerListResult = {
  issuers: [
    {
      name: "aigne-official",
      did: "z1OfficalIssuerDID123456789",
      pk: "0x04abc",
      label: "AIGNE Official Issuer",
      source: "shipped",
      addedAt: "2025-01-01T00:00:00.000Z",
      fileName: "aigne-official.did.json",
    },
    {
      name: "dev-team",
      did: "z2DevTeamDID987654321",
      pk: "0x04def",
      source: "manual",
      addedAt: "2025-06-15T12:00:00.000Z",
      fileName: "dev-team.did.json",
    },
  ],
  total: 2,
};

// ── Add fixtures ──

const addAdded: IssuerAddResult = {
  name: "dev-issuer",
  did: "z1TestDid123",
  pk: "0x04abc",
  status: "added",
  source: "from-key",
  addedAt: "2025-06-15T12:00:00.000Z",
};

const addUpdated: IssuerAddResult = {
  name: "dev-issuer",
  did: "z1TestDid123",
  pk: "0x04abc",
  status: "updated",
  source: "manual",
  addedAt: "2025-06-15T12:00:00.000Z",
};

const addError: IssuerAddResult = {
  name: "bad",
  did: "",
  pk: "",
  status: "error",
  source: "manual",
  error: "Key file not found",
};

// ── Remove fixtures ──

const removeRemoved: IssuerRemoveResult = { name: "dev-issuer", status: "removed" };
const removeNotFound: IssuerRemoveResult = { name: "ghost", status: "not-found" };

// ── Inspect fixtures ──

const inspectFull: IssuerInspectResult = {
  name: "dev-issuer",
  did: "z1TestDid123",
  pk: "0x04abc",
  label: "Dev Issuer",
  source: "manual",
  addedAt: "2025-06-15T12:00:00.000Z",
  filePath: "/home/user/.afs/trusted-issuers/dev-issuer.did.json",
};

const inspectMinimal: IssuerInspectResult = {
  name: "old-issuer",
  did: "z1OldDid",
  pk: "0x04old",
};

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe("Issuer Formatter: List", () => {
  test("llm: empty list", () => {
    const output = formatIssuerListOutput(listEmpty, "llm");
    expect(output).toContain("ISSUER_LIST");
    expect(output).toContain("TOTAL 0");
    expect(output).toContain("SUMMARY total=0 shipped=0 manual=0");
  });

  test("llm: two issuers with --- separator", () => {
    const output = formatIssuerListOutput(listTwo, "llm");
    expect(output).toContain("ISSUER_LIST");
    expect(output).toContain("TOTAL 2");
    expect(output).toContain("---");
    expect(output).toContain("NAME aigne-official");
    expect(output).toContain("DID z1OfficalIssuerDID123456789");
    expect(output).toContain("SOURCE shipped");
    expect(output).toContain("NAME dev-team");
    expect(output).toContain("SOURCE manual");
    expect(output).toContain("SUMMARY total=2 shipped=1 manual=1");
    // LLM view does NOT include pk
    expect(output).not.toContain("0x04abc");
  });

  test("json: returns array of issuers", () => {
    const output = formatIssuerListOutput(listTwo, "json");
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("aigne-official");
    expect(parsed[1].name).toBe("dev-team");
  });

  test("human: empty list", () => {
    const output = formatIssuerListOutput(listEmpty, "human");
    expect(output).toContain("No trusted issuers configured");
  });

  test("human: two issuers with truncated DID", () => {
    const output = formatIssuerListOutput(listTwo, "human");
    expect(output).toContain("Trusted Issuers:");
    expect(output).toContain("aigne-official:");
    expect(output).toContain("(shipped)");
    expect(output).toContain("Total: 2");
  });

  test("default: empty list", () => {
    const output = formatIssuerListOutput(listEmpty, "default");
    expect(output).toContain("No trusted issuers");
  });

  test("default: compact format with truncated DID", () => {
    const output = formatIssuerListOutput(listTwo, "default");
    expect(output).toContain("aigne-official");
    expect(output).toContain("shipped");
  });
});

describe("Issuer Formatter: Add", () => {
  test("llm: added", () => {
    const output = formatIssuerAddOutput(addAdded, "llm");
    expect(output).toContain("ISSUER_ADD dev-issuer");
    expect(output).toContain("STATUS added");
    expect(output).toContain("DID z1TestDid123");
    expect(output).toContain("INPUT_SOURCE from-key");
  });

  test("llm: updated", () => {
    const output = formatIssuerAddOutput(addUpdated, "llm");
    expect(output).toContain("STATUS updated");
    expect(output).toContain("INPUT_SOURCE manual");
  });

  test("llm: error", () => {
    const output = formatIssuerAddOutput(addError, "llm");
    expect(output).toContain("STATUS error");
    expect(output).toContain("ERROR Key file not found");
  });

  test("json: returns valid JSON", () => {
    const output = formatIssuerAddOutput(addAdded, "json");
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe("dev-issuer");
    expect(parsed.status).toBe("added");
    expect(parsed.source).toBe("from-key");
  });

  test("human: added", () => {
    const output = formatIssuerAddOutput(addAdded, "human");
    expect(output).toContain('Added trusted issuer "dev-issuer"');
    expect(output).toContain("DID: z1TestDid123");
    expect(output).toContain("Source: from-key");
  });

  test("human: updated", () => {
    const output = formatIssuerAddOutput(addUpdated, "human");
    expect(output).toContain("Updated trusted issuer");
  });

  test("human: error", () => {
    const output = formatIssuerAddOutput(addError, "human");
    expect(output).toContain("Failed to add issuer");
  });

  test("default: added", () => {
    const output = formatIssuerAddOutput(addAdded, "default");
    expect(output).toContain("ADDED");
    expect(output).toContain("dev-issuer");
  });

  test("default: updated", () => {
    const output = formatIssuerAddOutput(addUpdated, "default");
    expect(output).toContain("UPDATED");
  });
});

describe("Issuer Formatter: Remove", () => {
  test("llm: removed", () => {
    const output = formatIssuerRemoveOutput(removeRemoved, "llm");
    expect(output).toContain("ISSUER_REMOVE dev-issuer");
    expect(output).toContain("STATUS removed");
  });

  test("llm: not-found", () => {
    const output = formatIssuerRemoveOutput(removeNotFound, "llm");
    expect(output).toContain("ISSUER_REMOVE ghost");
    expect(output).toContain("STATUS not-found");
  });

  test("json: returns valid JSON", () => {
    const output = formatIssuerRemoveOutput(removeRemoved, "json");
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe("dev-issuer");
    expect(parsed.status).toBe("removed");
  });

  test("human: removed", () => {
    const output = formatIssuerRemoveOutput(removeRemoved, "human");
    expect(output).toContain('Removed trusted issuer "dev-issuer"');
  });

  test("human: not-found", () => {
    const output = formatIssuerRemoveOutput(removeNotFound, "human");
    expect(output).toContain('Issuer "ghost" not found');
  });

  test("default: removed", () => {
    const output = formatIssuerRemoveOutput(removeRemoved, "default");
    expect(output).toContain("REMOVED dev-issuer");
  });

  test("default: not-found", () => {
    const output = formatIssuerRemoveOutput(removeNotFound, "default");
    expect(output).toContain("NOT_FOUND ghost");
  });
});

describe("Issuer Formatter: Inspect", () => {
  test("llm: full info", () => {
    const output = formatIssuerInspectOutput(inspectFull, "llm");
    expect(output).toContain("ISSUER_INSPECT dev-issuer");
    expect(output).toContain("DID z1TestDid123");
    expect(output).toContain("PK 0x04abc");
    expect(output).toContain("LABEL Dev Issuer");
    expect(output).toContain("SOURCE manual");
    expect(output).toContain("ADDED_AT 2025-06-15T12:00:00.000Z");
    expect(output).toContain("FILE_PATH");
  });

  test("llm: minimal (no optional fields)", () => {
    const output = formatIssuerInspectOutput(inspectMinimal, "llm");
    expect(output).toContain("ISSUER_INSPECT old-issuer");
    expect(output).toContain("DID z1OldDid");
    expect(output).toContain("SOURCE unknown");
    expect(output).not.toContain("LABEL");
    expect(output).not.toContain("ADDED_AT");
    expect(output).not.toContain("FILE_PATH");
  });

  test("json: returns valid JSON", () => {
    const output = formatIssuerInspectOutput(inspectFull, "json");
    const parsed = JSON.parse(output);
    expect(parsed.name).toBe("dev-issuer");
    expect(parsed.did).toBe("z1TestDid123");
    expect(parsed.pk).toBe("0x04abc");
    expect(parsed.label).toBe("Dev Issuer");
  });

  test("human: full info", () => {
    const output = formatIssuerInspectOutput(inspectFull, "human");
    expect(output).toContain("Issuer: dev-issuer");
    expect(output).toContain("Display Name: Dev Issuer");
    expect(output).toContain("DID: z1TestDid123");
    expect(output).toContain("Public Key: 0x04abc");
    expect(output).toContain("Source: manual");
  });

  test("human: minimal (no optional fields)", () => {
    const output = formatIssuerInspectOutput(inspectMinimal, "human");
    expect(output).toContain("Issuer: old-issuer");
    expect(output).toContain("Source: unknown");
    expect(output).not.toContain("Display Name");
    expect(output).not.toContain("Added");
  });

  test("default: compact format", () => {
    const output = formatIssuerInspectOutput(inspectFull, "default");
    expect(output).toContain("dev-issuer");
    expect(output).toContain("DID=z1TestDid123");
    expect(output).toContain("SOURCE=manual");
  });
});

// ══════════════════════════════════════════════════════════════
// IssuerReset Formatter
// ══════════════════════════════════════════════════════════════

const resetWithRemovedAndRestored: IssuerResetResult = {
  removed: ["dev-team", "staging-issuer"],
  restored: ["aigne-official"],
};

const resetEmpty: IssuerResetResult = {
  removed: [],
  restored: [],
};

const resetOnlyRemoved: IssuerResetResult = {
  removed: ["manual-issuer"],
  restored: [],
};

describe("IssuerReset Formatter", () => {
  test("json: full reset result", () => {
    const output = formatIssuerResetOutput(resetWithRemovedAndRestored, "json");
    const parsed = JSON.parse(output);
    expect(parsed.removed).toEqual(["dev-team", "staging-issuer"]);
    expect(parsed.restored).toEqual(["aigne-official"]);
  });

  test("json: empty reset", () => {
    const output = formatIssuerResetOutput(resetEmpty, "json");
    const parsed = JSON.parse(output);
    expect(parsed.removed).toEqual([]);
    expect(parsed.restored).toEqual([]);
  });

  test("llm: ISSUER_RESET header with REMOVED and RESTORED", () => {
    const output = formatIssuerResetOutput(resetWithRemovedAndRestored, "llm");
    expect(output).toContain("ISSUER_RESET");
    expect(output).toContain("REMOVED");
    expect(output).toContain("dev-team");
    expect(output).toContain("staging-issuer");
    expect(output).toContain("RESTORED");
    expect(output).toContain("aigne-official");
  });

  test("llm: empty reset", () => {
    const output = formatIssuerResetOutput(resetEmpty, "llm");
    expect(output).toContain("ISSUER_RESET");
  });

  test("human: readable reset report", () => {
    const output = formatIssuerResetOutput(resetWithRemovedAndRestored, "human");
    expect(output).toContain("dev-team");
    expect(output).toContain("staging-issuer");
    expect(output).toContain("aigne-official");
  });

  test("human: empty reset", () => {
    const output = formatIssuerResetOutput(resetEmpty, "human");
    expect(output).toContain("Nothing to reset");
  });

  test("default: compact format", () => {
    const output = formatIssuerResetOutput(resetWithRemovedAndRestored, "default");
    expect(output).toContain("REMOVED");
    expect(output).toContain("dev-team");
    expect(output).toContain("RESTORED");
    expect(output).toContain("aigne-official");
  });

  test("default: only removed", () => {
    const output = formatIssuerResetOutput(resetOnlyRemoved, "default");
    expect(output).toContain("REMOVED");
    expect(output).toContain("manual-issuer");
  });

  test("default: empty → no-op", () => {
    const output = formatIssuerResetOutput(resetEmpty, "default");
    expect(output).toContain("no-op");
  });
});
