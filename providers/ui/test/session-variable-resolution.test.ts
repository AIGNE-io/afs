import { describe, expect, test } from "bun:test";
import { CORE_HEAD_JS, CORE_TAIL_JS } from "../src/web-page/core.js";
import { TEXT_JS } from "../src/web-page/renderers/text.js";

const CORE_JS = CORE_HEAD_JS + CORE_TAIL_JS;

/**
 * Tests $session.* variable resolution in AUP client-side renderers.
 *
 * Since the renderers are client-side JS strings (not importable modules),
 * we test by:
 *   1. Extracting the resolution logic patterns from the source
 *   2. Verifying they match expected behavior via regex + eval
 */

// ── Helper: simulate the $session.* resolution logic from text.ts ──
function resolveSessionContent(rawContent: string, sessionCtx: Record<string, unknown>): string {
  // Mirrors the logic in text.ts lines 20-26
  return String(
    typeof rawContent === "string" && rawContent.indexOf("$session.") === 0
      ? (sessionCtx[rawContent.slice(9)] ?? "")
      : rawContent,
  );
}

// ── Helper: simulate the visible condition logic from core.ts ──
function resolveSessionVisible(
  visible: string | boolean | undefined,
  sessionCtx: Record<string, unknown>,
): boolean {
  // Mirrors the logic in core.ts lines 996-1005
  if (visible === undefined) return true;
  let vis = visible;
  let negate = false;
  if (typeof vis === "string" && vis.charAt(0) === "!") {
    negate = true;
    vis = vis.slice(1);
  }
  let val: unknown = vis;
  if (typeof vis === "string" && vis.indexOf("$session.") === 0) {
    val = sessionCtx[vis.slice(9)];
  }
  const show = negate ? !val : !!val;
  return show;
}

// ── Tests: $session.* in text content ──

describe("$session.* content resolution", () => {
  const ctx = {
    authenticated: true,
    did: "z1abc123",
    displayName: "Alice",
    role: "owner",
    authMethod: "passkey",
    isAdmin: true,
    isOwner: true,
  };

  test("$session.did → actual DID value", () => {
    expect(resolveSessionContent("$session.did", ctx)).toBe("z1abc123");
  });

  test("$session.displayName → actual name", () => {
    expect(resolveSessionContent("$session.displayName", ctx)).toBe("Alice");
  });

  test("$session.role → actual role", () => {
    expect(resolveSessionContent("$session.role", ctx)).toBe("owner");
  });

  test("$session.authMethod → actual method", () => {
    expect(resolveSessionContent("$session.authMethod", ctx)).toBe("passkey");
  });

  test("$session.nonexistent → empty string", () => {
    expect(resolveSessionContent("$session.nonexistent", ctx)).toBe("");
  });

  test("plain text → unchanged", () => {
    expect(resolveSessionContent("Hello World", ctx)).toBe("Hello World");
  });

  test("$t(key) → unchanged (locale, not session)", () => {
    expect(resolveSessionContent("$t(session.title)", ctx)).toBe("$t(session.title)");
  });

  test("empty string → empty string", () => {
    expect(resolveSessionContent("", ctx)).toBe("");
  });

  test("unauthenticated context → empty for missing fields", () => {
    const guest = { authenticated: false };
    expect(resolveSessionContent("$session.did", guest)).toBe("");
    expect(resolveSessionContent("$session.displayName", guest)).toBe("");
    expect(resolveSessionContent("$session.role", guest)).toBe("");
  });
});

// ── Tests: $session.* in visible conditions ──

describe("$session.* visible resolution", () => {
  const authed = {
    authenticated: true,
    did: "z1abc",
    isAdmin: true,
    isOwner: true,
  };
  const guest = { authenticated: false };

  test("$session.authenticated → true when logged in", () => {
    expect(resolveSessionVisible("$session.authenticated", authed)).toBe(true);
  });

  test("$session.authenticated → false when guest", () => {
    expect(resolveSessionVisible("$session.authenticated", guest)).toBe(false);
  });

  test("!$session.authenticated → true when guest", () => {
    expect(resolveSessionVisible("!$session.authenticated", guest)).toBe(true);
  });

  test("!$session.authenticated → false when logged in", () => {
    expect(resolveSessionVisible("!$session.authenticated", authed)).toBe(false);
  });

  test("$session.isAdmin → true for admin", () => {
    expect(resolveSessionVisible("$session.isAdmin", authed)).toBe(true);
  });

  test("$session.isAdmin → false for guest", () => {
    expect(resolveSessionVisible("$session.isAdmin", guest)).toBe(false);
  });

  test("$session.isOwner → true for owner", () => {
    expect(resolveSessionVisible("$session.isOwner", authed)).toBe(true);
  });

  test("undefined visible → always visible", () => {
    expect(resolveSessionVisible(undefined, guest)).toBe(true);
  });

  test("boolean true → visible", () => {
    expect(resolveSessionVisible(true, guest)).toBe(true);
  });

  test("boolean false → hidden", () => {
    expect(resolveSessionVisible(false, guest)).toBe(false);
  });
});

// ── Source code integrity: verify the patterns exist in the actual JS ──

describe("source code contains $session.* resolution", () => {
  test("text.ts has $session.* content resolution", () => {
    expect(TEXT_JS).toContain('rawContent.indexOf("$session.") === 0');
    expect(TEXT_JS).toContain("_sessionCtx[rawContent.slice(9)]");
  });

  test("core.ts has $session.* visible resolution", () => {
    expect(CORE_JS).toContain('vis.indexOf("$session.") === 0');
    expect(CORE_JS).toContain("_sessionCtx[vis.slice(9)]");
  });

  test("core.ts has _sessionCtx initialization", () => {
    expect(CORE_JS).toContain("_sessionCtx = { authenticated: false }");
  });

  test("core.ts syncs sessionContext from server message", () => {
    expect(CORE_JS).toContain("msg.sessionContext");
  });
});
