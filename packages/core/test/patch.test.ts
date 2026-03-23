import { describe, expect, test } from "bun:test";
import { AFSPatchError } from "../src/error.js";
import { applyPatch, applyPatches } from "../src/utils/patch.js";

// ─── applyPatch: str_replace ─────────────────────────────────────────────────

describe("applyPatch str_replace", () => {
  test("replaces target with content", () => {
    expect(
      applyPatch("hello world", { op: "str_replace", target: "world", content: "earth" }),
    ).toBe("hello earth");
  });

  test("replaces in the middle of text", () => {
    expect(
      applyPatch("function foo() { return 1; }", {
        op: "str_replace",
        target: "return 1",
        content: "return 42",
      }),
    ).toBe("function foo() { return 42; }");
  });

  test("target not found throws PATCH_TARGET_NOT_FOUND", () => {
    expect(() =>
      applyPatch("hello world", { op: "str_replace", target: "missing", content: "x" }),
    ).toThrow(AFSPatchError);

    try {
      applyPatch("hello world", { op: "str_replace", target: "missing", content: "x" });
    } catch (e) {
      expect((e as AFSPatchError).code).toBe("PATCH_TARGET_NOT_FOUND");
    }
  });

  test("ambiguous target throws PATCH_TARGET_AMBIGUOUS", () => {
    expect(() =>
      applyPatch("foo bar foo", { op: "str_replace", target: "foo", content: "baz" }),
    ).toThrow(AFSPatchError);

    try {
      applyPatch("foo bar foo", { op: "str_replace", target: "foo", content: "baz" });
    } catch (e) {
      expect((e as AFSPatchError).code).toBe("PATCH_TARGET_AMBIGUOUS");
    }
  });

  test("omitted content defaults to empty string (deletion)", () => {
    expect(applyPatch("hello world", { op: "str_replace", target: " world" })).toBe("hello");
  });

  test("empty string content removes target", () => {
    expect(applyPatch("hello world", { op: "str_replace", target: " world", content: "" })).toBe(
      "hello",
    );
  });

  test("multiline target works", () => {
    const text = "line1\nline2\nline3";
    expect(
      applyPatch(text, { op: "str_replace", target: "line2\nline3", content: "replaced" }),
    ).toBe("line1\nreplaced");
  });
});

// ─── applyPatch: insert_before ───────────────────────────────────────────────

describe("applyPatch insert_before", () => {
  test("inserts content before target", () => {
    expect(
      applyPatch("function main() {}", {
        op: "insert_before",
        target: "function main()",
        content: "// Entry point\n",
      }),
    ).toBe("// Entry point\nfunction main() {}");
  });

  test("target not found throws", () => {
    expect(() =>
      applyPatch("hello", { op: "insert_before", target: "missing", content: "x" }),
    ).toThrow(AFSPatchError);
  });

  test("ambiguous target throws", () => {
    expect(() =>
      applyPatch("aa bb aa", { op: "insert_before", target: "aa", content: "x" }),
    ).toThrow(AFSPatchError);
  });
});

// ─── applyPatch: insert_after ────────────────────────────────────────────────

describe("applyPatch insert_after", () => {
  test("inserts content after target", () => {
    expect(
      applyPatch('import React from "react"', {
        op: "insert_after",
        target: 'import React from "react"',
        content: "\nimport { useState } from 'react'",
      }),
    ).toBe("import React from \"react\"\nimport { useState } from 'react'");
  });

  test("target not found throws", () => {
    expect(() =>
      applyPatch("hello", { op: "insert_after", target: "missing", content: "x" }),
    ).toThrow(AFSPatchError);
  });
});

// ─── applyPatch: delete ──────────────────────────────────────────────────────

describe("applyPatch delete", () => {
  test("removes target string", () => {
    expect(applyPatch("hello // TODO world", { op: "delete", target: " // TODO" })).toBe(
      "hello world",
    );
  });

  test("target not found throws", () => {
    expect(() => applyPatch("hello", { op: "delete", target: "missing" })).toThrow(AFSPatchError);
  });

  test("ambiguous target throws", () => {
    expect(() => applyPatch("aa bb aa", { op: "delete", target: "aa" })).toThrow(AFSPatchError);
  });
});

// ─── applyPatch: edge cases ──────────────────────────────────────────────────

describe("applyPatch edge cases", () => {
  test("empty target throws PATCH_TARGET_NOT_FOUND", () => {
    expect(() => applyPatch("hello", { op: "str_replace", target: "", content: "x" })).toThrow(
      AFSPatchError,
    );
  });

  test("target at start of string", () => {
    expect(applyPatch("hello world", { op: "str_replace", target: "hello", content: "hi" })).toBe(
      "hi world",
    );
  });

  test("target at end of string", () => {
    expect(
      applyPatch("hello world", { op: "str_replace", target: "world", content: "earth" }),
    ).toBe("hello earth");
  });

  test("target is entire string", () => {
    expect(applyPatch("hello", { op: "str_replace", target: "hello", content: "bye" })).toBe("bye");
  });

  test("replace with longer content", () => {
    expect(applyPatch("a", { op: "str_replace", target: "a", content: "abcdef" })).toBe("abcdef");
  });
});

// ─── applyPatches (multiple) ─────────────────────────────────────────────────

describe("applyPatches", () => {
  test("applies patches sequentially", () => {
    const text = "version: v1.0\n## Changelog\n// DEPRECATED";
    const result = applyPatches(text, [
      { op: "str_replace", target: "v1.0", content: "v1.1" },
      { op: "insert_after", target: "## Changelog", content: "\n- v1.1: Bug fixes" },
      { op: "delete", target: "\n// DEPRECATED" },
    ]);
    expect(result).toBe("version: v1.1\n## Changelog\n- v1.1: Bug fixes");
  });

  test("later patch operates on result of previous", () => {
    const result = applyPatches("aaa", [
      { op: "str_replace", target: "aaa", content: "bbb" },
      { op: "str_replace", target: "bbb", content: "ccc" },
    ]);
    expect(result).toBe("ccc");
  });

  test("empty patches array returns original text", () => {
    expect(applyPatches("hello", [])).toBe("hello");
  });

  test("atomic: if patch 2 fails, no changes applied", () => {
    const original = "hello world";
    expect(() =>
      applyPatches(original, [
        { op: "str_replace", target: "hello", content: "hi" },
        { op: "str_replace", target: "nonexistent", content: "x" },
      ]),
    ).toThrow(AFSPatchError);
    // original is unchanged (function is pure, no side effects)
  });

  test("single patch works", () => {
    expect(
      applyPatches("hello world", [{ op: "str_replace", target: "world", content: "earth" }]),
    ).toBe("hello earth");
  });
});
