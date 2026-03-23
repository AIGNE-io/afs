/**
 * Phase 1: Hardened escapeId for DID full character set.
 * Tests cover 6 categories: happy path, bad input, security, data loss, data damage, data leak.
 */

import { describe, expect, it } from "bun:test";
import { escapeId, migrateLegacyId, unescapeId } from "../../src/blocklet/blocklet-afs.js";

// ─── Happy Path ──────────────────────────────────────────────────────────────

describe("escapeId — Happy Path", () => {
  it("did:abt:z1abc → colons hex-escaped", () => {
    const result = escapeId("did:abt:z1abc");
    expect(result).toBe("did_3aabt_3az1abc");
    expect(unescapeId(result)).toBe("did:abt:z1abc");
  });

  it("did:web:example.com → dot escaped", () => {
    const result = escapeId("did:web:example.com");
    expect(result).toBe("did_3aweb_3aexample_2ecom");
    expect(unescapeId(result)).toBe("did:web:example.com");
  });

  it("did:web:example.com%3Aport → % and : both escaped", () => {
    const result = escapeId("did:web:example.com%3Aport");
    expect(result).toBe("did_3aweb_3aexample_2ecom_253Aport");
    expect(unescapeId(result)).toBe("did:web:example.com%3Aport");
  });

  it("long DID (did:key:z6MkhaXgBZD...) → correct escape", () => {
    const longDid = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";
    const result = escapeId(longDid);
    expect(result).not.toContain(":");
    expect(result).not.toContain(".");
    expect(unescapeId(result)).toBe(longDid);
  });

  it("simple-id-no-special-chars → passes through unchanged", () => {
    expect(escapeId("simple-id-no-special-chars")).toBe("simple-id-no-special-chars");
  });

  it("only alphanumeric and dash pass through", () => {
    expect(escapeId("abc-123-DEF")).toBe("abc-123-DEF");
  });

  it("roundtrip: unescapeId(escapeId(x)) === x for various inputs", () => {
    const inputs = [
      "did:abt:z1abc",
      "did:web:example.com",
      "did:web:example.com%3Aport",
      "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      "simple-id-no-special-chars",
      "hello_world",
      "a.b.c:d:e",
      "",
      ":::...",
    ];
    for (const input of inputs) {
      expect(unescapeId(escapeId(input))).toBe(input);
    }
  });
});

// ─── Bad Input ───────────────────────────────────────────────────────────────

describe("escapeId — Bad Input", () => {
  it("empty string → empty string", () => {
    expect(escapeId("")).toBe("");
    expect(unescapeId("")).toBe("");
  });

  it('only special chars ":::..." → all escaped, no crash', () => {
    const result = escapeId(":::...");
    expect(result).not.toContain(":");
    expect(result).not.toContain(".");
    expect(result.length).toBeGreaterThan(0);
    expect(unescapeId(result)).toBe(":::...");
  });

  it("very long input (10000 chars) → completes without error", () => {
    const longInput = "a".repeat(10000);
    const result = escapeId(longInput);
    expect(result).toBe(longInput); // all safe chars, passes through
  });
});

// ─── Security ────────────────────────────────────────────────────────────────

describe("escapeId — Security", () => {
  it("path traversal: ../../../etc/passwd → no .. or / in result", () => {
    const result = escapeId("../../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
  });

  it("null byte \\x00 → escaped", () => {
    const result = escapeId("did:abt:z1\x00evil");
    expect(result).not.toContain("\x00");
    expect(unescapeId(result)).toBe("did:abt:z1\x00evil");
  });

  it("backslash \\ → escaped", () => {
    const result = escapeId("did:abt:z1\\evil");
    expect(result).not.toContain("\\");
    expect(unescapeId(result)).toBe("did:abt:z1\\evil");
  });

  it("10000 char input → no OOM, completes in reasonable time", () => {
    const input = "did:abt:".repeat(1250); // ~10000 chars with special chars
    const result = escapeId(input);
    expect(result.length).toBeGreaterThan(0);
    expect(unescapeId(result)).toBe(input);
  });
});

// ─── Data Loss Prevention ────────────────────────────────────────────────────

describe("escapeId — Data Loss Prevention", () => {
  it("migrateLegacyId converts old format correctly", () => {
    // Old escapeId: "did:abt:z1" → "did_abt_z1"
    // migrateLegacyId reverses old logic (underscore→colon), then re-escapes
    const legacyEscaped = "did_abt_z1Kp4";
    const migrated = migrateLegacyId(legacyEscaped);
    // Reversed: "did:abt:z1Kp4", then re-escaped with new logic
    expect(migrated).toBe(escapeId("did:abt:z1Kp4"));
    expect(unescapeId(migrated)).toBe("did:abt:z1Kp4");
  });

  it("migrateLegacyId handles simple slug (no underscores)", () => {
    // A slug with no underscores: legacy escape didn't change it
    const migrated = migrateLegacyId("my-agent");
    // No underscores to reverse, "my-agent" is all safe chars
    expect(migrated).toBe("my-agent");
  });
});

// ─── Data Damage Prevention ──────────────────────────────────────────────────

describe("escapeId — Data Damage Prevention", () => {
  it("injectivity: 10 different DIDs → 10 different escaped results", () => {
    const dids = [
      "did:abt:z1abc",
      "did:abt:z1abd",
      "did:web:example.com",
      "did:web:example.org",
      "did:key:z6MkhaXgBZD",
      "did:key:z6MkhaXgBZE",
      "simple-id",
      "another-id",
      "did:abt:z1abc:extra",
      "did_3aabt_3az1abc", // looks like an escaped form but is a raw input
    ];
    const results = new Set(dids.map(escapeId));
    expect(results.size).toBe(dids.length);
  });

  it("non-idempotent: escapeId(escapeId(x)) !== escapeId(x)", () => {
    const input = "did:abt:z1";
    const once = escapeId(input);
    const twice = escapeId(once);
    expect(twice).not.toBe(once);
    // But double-unescaping recovers:
    expect(unescapeId(unescapeId(twice))).toBe(input);
  });

  it("underscore itself escaped to _5f: unescapeId('my_5fagent') === 'my_agent'", () => {
    expect(unescapeId("my_5fagent")).toBe("my_agent");
  });

  it("underscore in input is escaped: escapeId('my_agent') contains _5f", () => {
    const result = escapeId("my_agent");
    expect(result).toBe("my_5fagent");
    expect(unescapeId(result)).toBe("my_agent");
  });
});

// ─── Data Leak Prevention ────────────────────────────────────────────────────

describe("escapeId — Data Leak Prevention", () => {
  it("no collisions between different DIDs", () => {
    // These could collide with naive escaping
    const a = escapeId("did:abt:z1");
    const b = escapeId("did_abt_z1"); // raw input with underscores
    expect(a).not.toBe(b);
  });

  it("_XX pattern is unambiguous", () => {
    // "a_5fb" as raw input → underscore is escaped, so result differs from
    // the escaped form of "a_b" (which would produce "a_5fb")
    const rawWithEscapePattern = escapeId("a_5fb");
    const naturalUnderscore = escapeId("a_b");
    // "a_5fb" raw → "a_5f5fb" (underscore escaped, then "5fb" stays)
    // "a_b"  raw → "a_5fb"
    expect(rawWithEscapePattern).not.toBe(naturalUnderscore);
  });
});
