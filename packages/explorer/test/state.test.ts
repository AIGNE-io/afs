import { describe, expect, test } from "bun:test";

// Import state.js as CommonJS module
const S = require("../web/state.js");

// ── formatSize ─────────────────────────────────────────

describe("formatSize", () => {
  test("undefined returns empty string", () => {
    expect(S.formatSize(undefined)).toBe("");
  });

  test("null returns empty string", () => {
    expect(S.formatSize(null)).toBe("");
  });

  test("0 returns 0B", () => {
    expect(S.formatSize(0)).toBe("0B");
  });

  test("bytes < 1KB", () => {
    expect(S.formatSize(123)).toBe("123B");
    expect(S.formatSize(1)).toBe("1B");
    expect(S.formatSize(1023)).toBe("1023B");
  });

  test("kilobytes", () => {
    expect(S.formatSize(1024)).toBe("1.0KB");
    expect(S.formatSize(45678)).toBe("44.6KB");
  });

  test("megabytes", () => {
    expect(S.formatSize(1234567)).toBe("1.2MB");
  });

  test("gigabytes", () => {
    expect(S.formatSize(1234567890)).toBe("1.1GB");
  });
});

// ── formatDate ─────────────────────────────────────────

describe("formatDate", () => {
  test("undefined returns empty string", () => {
    expect(S.formatDate(undefined)).toBe("");
  });

  test("null returns empty string", () => {
    expect(S.formatDate(null)).toBe("");
  });

  test("invalid date returns empty string", () => {
    expect(S.formatDate("not-a-date")).toBe("");
  });

  test("same day returns HH:MM", () => {
    // Use a time 1 minute ago to guarantee "today"
    const d = new Date(Date.now() - 60_000);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    expect(S.formatDate(d)).toBe(`${h}:${m}`);
  });

  test("yesterday returns 1d ago", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(S.formatDate(d)).toBe("1d ago");
  });

  test("3 days ago returns 3d ago", () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    expect(S.formatDate(d)).toBe("3d ago");
  });

  test("older date returns Mon DD", () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const result = S.formatDate(d);
    // Should match pattern like "Jan 19"
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{2}$/);
  });

  test("accepts ISO string", () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    expect(S.formatDate(d.toISOString())).toBe("2d ago");
  });
});

// ── inferType ──────────────────────────────────────────

describe("inferType", () => {
  test("executable by kinds", () => {
    expect(S.inferType({ meta: { kinds: ["afs:executable"] } })).toBe("exec");
  });

  test("link by kind", () => {
    expect(S.inferType({ meta: { kind: "afs:link" } })).toBe("link");
  });

  test("link by kinds array", () => {
    expect(S.inferType({ meta: { kinds: ["afs:link"] } })).toBe("link");
  });

  test("directory by childrenCount > 0", () => {
    expect(S.inferType({ childrenCount: 5, meta: {} })).toBe("directory");
  });

  test("directory by childrenCount = -1 (unknown)", () => {
    expect(S.inferType({ childrenCount: -1, meta: {} })).toBe("directory");
  });

  test("directory by meta.childrenCount", () => {
    expect(S.inferType({ meta: { childrenCount: 3 } })).toBe("directory");
  });

  test("file by default", () => {
    expect(S.inferType({ meta: {} })).toBe("file");
    expect(S.inferType({})).toBe("file");
  });

  test("file when childrenCount = 0", () => {
    expect(S.inferType({ childrenCount: 0, meta: {} })).toBe("file");
  });

  test("exec takes priority over directory", () => {
    expect(S.inferType({ childrenCount: 5, meta: { kinds: ["afs:executable"] } })).toBe("exec");
  });
});

// ── getEntryIcon ───────────────────────────────────────

describe("getEntryIcon", () => {
  test("directory", () => expect(S.getEntryIcon("directory")).toBe("[D]"));
  test("up", () => expect(S.getEntryIcon("up")).toBe("[D]"));
  test("exec", () => expect(S.getEntryIcon("exec")).toBe("[X]"));
  test("link", () => expect(S.getEntryIcon("link")).toBe("[L]"));
  test("file", () => expect(S.getEntryIcon("file")).toBe("   "));
});

// ── toExplorerEntry ────────────────────────────────────

describe("toExplorerEntry", () => {
  test("extracts name from path", () => {
    const e = S.toExplorerEntry({ path: "/modules/fs/README.md", meta: {} });
    expect(e.name).toBe("README.md");
    expect(e.path).toBe("/modules/fs/README.md");
  });

  test("preserves size and modified from entry", () => {
    const e = S.toExplorerEntry({ path: "/a", size: 100, updatedAt: "2026-01-01", meta: {} });
    expect(e.size).toBe(100);
    expect(e.modified).toBe("2026-01-01");
  });

  test("falls back to meta for size", () => {
    const e = S.toExplorerEntry({ path: "/a", meta: { size: 200 } });
    expect(e.size).toBe(200);
  });

  test("includes actions", () => {
    const actions = [{ name: "test" }];
    const e = S.toExplorerEntry({ path: "/a", actions, meta: {} });
    expect(e.actions).toEqual(actions);
  });

  test("keeps raw reference", () => {
    const raw = { path: "/a", meta: {} };
    const e = S.toExplorerEntry(raw);
    expect(e.raw).toBe(raw);
  });
});

// ── sortEntries ────────────────────────────────────────

describe("sortEntries", () => {
  test("up entry always first", () => {
    const entries = [
      { name: "alpha", type: "file" },
      { name: "..", type: "up" },
      { name: "beta", type: "directory" },
    ];
    const sorted = S.sortEntries(entries);
    expect(sorted[0].type).toBe("up");
  });

  test("directories before files", () => {
    const entries = [
      { name: "file.txt", type: "file" },
      { name: "dir", type: "directory" },
    ];
    const sorted = S.sortEntries(entries);
    expect(sorted[0].name).toBe("dir");
    expect(sorted[1].name).toBe("file.txt");
  });

  test("alphabetical within same type", () => {
    const entries = [
      { name: "zebra", type: "file" },
      { name: "alpha", type: "file" },
      { name: "beta", type: "file" },
    ];
    const sorted = S.sortEntries(entries);
    expect(sorted.map((e: { name: string }) => e.name)).toEqual(["alpha", "beta", "zebra"]);
  });

  test("case-insensitive sort", () => {
    const entries = [
      { name: "Bravo", type: "file" },
      { name: "alpha", type: "file" },
    ];
    const sorted = S.sortEntries(entries);
    expect(sorted[0].name).toBe("alpha");
  });

  test("does not mutate original array", () => {
    const entries = [
      { name: "b", type: "file" },
      { name: "a", type: "file" },
    ];
    S.sortEntries(entries);
    expect(entries[0]!.name).toBe("b");
  });

  test("full sort: up → dirs → files", () => {
    const entries = [
      { name: "zebra.txt", type: "file" },
      { name: "alpha", type: "directory" },
      { name: "..", type: "up" },
      { name: "beta.txt", type: "file" },
      { name: "charlie", type: "directory" },
      { name: "app", type: "exec" },
    ];
    const sorted = S.sortEntries(entries);
    expect(sorted.map((e: { name: string }) => e.name)).toEqual([
      "..",
      "alpha",
      "charlie",
      "app",
      "beta.txt",
      "zebra.txt",
    ]);
  });
});

// ── buildImmediateChildren ─────────────────────────────

describe("buildImmediateChildren", () => {
  test("direct children returned as-is", () => {
    const entries = [
      { path: "/modules/fs", meta: {}, childrenCount: 3 },
      { path: "/modules/git", meta: {}, childrenCount: 2 },
    ];
    const result = S.buildImmediateChildren("/modules", entries);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("fs");
    expect(result[1].name).toBe("git");
  });

  test("deep paths create virtual directories", () => {
    const entries = [
      { path: "/modules/fs/src/index.ts", meta: {} },
      { path: "/modules/fs/src/utils.ts", meta: {} },
    ];
    const result = S.buildImmediateChildren("/modules", entries);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("fs");
    expect(result[0].type).toBe("directory");
  });

  test("skips base path itself", () => {
    const entries = [
      { path: "/modules", meta: {}, childrenCount: 2 },
      { path: "/modules/fs", meta: {}, childrenCount: 1 },
    ];
    const result = S.buildImmediateChildren("/modules", entries);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("fs");
  });

  test("root path handling", () => {
    const entries = [{ path: "/modules", meta: {}, childrenCount: 5 }];
    const result = S.buildImmediateChildren("/", entries);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("modules");
  });

  test("deduplicates entries from same intermediate directory", () => {
    const entries = [
      { path: "/a/b/c", meta: {} },
      { path: "/a/b/d", meta: {} },
    ];
    const result = S.buildImmediateChildren("/a", entries);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("b");
  });
});

// ── filterEntries ──────────────────────────────────────

describe("filterEntries", () => {
  const entries = [
    { name: "..", type: "up" },
    { name: "README.md", type: "file" },
    { name: "src", type: "directory" },
    { name: "package.json", type: "file" },
  ];

  test("empty filter returns all", () => {
    expect(S.filterEntries(entries, "")).toEqual(entries);
    expect(S.filterEntries(entries, null)).toEqual(entries);
    expect(S.filterEntries(entries, undefined)).toEqual(entries);
  });

  test("case-insensitive substring match", () => {
    const result = S.filterEntries(entries, "readme");
    expect(result).toHaveLength(2); // ".." + "README.md"
    expect(result[1].name).toBe("README.md");
  });

  test("up entry always kept", () => {
    const result = S.filterEntries(entries, "zzz-no-match");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("up");
  });

  test("partial match", () => {
    const result = S.filterEntries(entries, "pack");
    expect(result).toHaveLength(2); // ".." + "package.json"
  });
});

// ── getParentPath ──────────────────────────────────────

describe("getParentPath", () => {
  test("root returns root", () => {
    expect(S.getParentPath("/")).toBe("/");
  });

  test("one level returns root", () => {
    expect(S.getParentPath("/modules")).toBe("/");
  });

  test("nested returns parent", () => {
    expect(S.getParentPath("/modules/fs/src")).toBe("/modules/fs");
  });

  test("empty returns root", () => {
    expect(S.getParentPath("")).toBe("/");
  });

  test("null returns root", () => {
    expect(S.getParentPath(null)).toBe("/");
  });
});

// ── clampIndex ─────────────────────────────────────────

describe("clampIndex", () => {
  test("within range", () => {
    expect(S.clampIndex(3, 10)).toBe(3);
  });

  test("negative clamped to 0", () => {
    expect(S.clampIndex(-1, 10)).toBe(0);
  });

  test("over max clamped to length-1", () => {
    expect(S.clampIndex(15, 10)).toBe(9);
  });

  test("empty list returns 0", () => {
    expect(S.clampIndex(5, 0)).toBe(0);
  });
});

// ── formatExplain ──────────────────────────────────────

describe("formatExplain", () => {
  test("basic entry", () => {
    const result = S.formatExplain({
      path: "/modules/fs",
      meta: { description: "Local files", provider: "afs-fs" },
      size: 1234,
      childrenCount: 5,
    });
    expect(result).toContain("OBJECT /modules/fs");
    expect(result).toContain("DESCRIPTION");
    expect(result).toContain("Local files");
    expect(result).toContain("SIZE");
    expect(result).toContain("1234 bytes");
    expect(result).toContain("CHILDREN");
    expect(result).toContain("5 items");
    expect(result).toContain("PROVIDER");
    expect(result).toContain("afs-fs");
  });

  test("omits undefined fields", () => {
    const result = S.formatExplain({ path: "/test", meta: {} });
    expect(result).toContain("OBJECT /test");
    expect(result).not.toContain("DESCRIPTION");
    expect(result).not.toContain("SIZE");
  });

  test("includes hash", () => {
    const result = S.formatExplain({ path: "/a", meta: { hash: "abc123" } });
    expect(result).toContain("HASH");
    expect(result).toContain("abc123");
  });
});

// ── extractMetadata ────────────────────────────────────

describe("extractMetadata", () => {
  test("null returns null", () => {
    expect(S.extractMetadata(null)).toBeNull();
  });

  test("extracts standard fields", () => {
    const m = S.extractMetadata({
      path: "/test",
      size: 100,
      updatedAt: "2026-01-01",
      meta: { provider: "fs", hash: "abc", description: "test file" },
    });
    expect(m.path).toBe("/test");
    expect(m.size).toBe(100);
    expect(m.provider).toBe("fs");
    expect(m.hash).toBe("abc");
    expect(m.description).toBe("test file");
  });

  test("collects extra fields", () => {
    const m = S.extractMetadata({
      path: "/test",
      meta: { provider: "fs", customField: "hello", anotherField: 42 },
    });
    expect(m.extra.customField).toBe("hello");
    expect(m.extra.anotherField).toBe(42);
    expect(m.extra.provider).toBeUndefined(); // builtin, not in extra
  });

  test("skips undefined extra values", () => {
    const m = S.extractMetadata({
      path: "/test",
      meta: { myField: undefined },
    });
    expect(Object.keys(m.extra)).toHaveLength(0);
  });
});

// ── coerceParamValue ───────────────────────────────────

describe("coerceParamValue", () => {
  test("empty string returns undefined", () => {
    expect(S.coerceParamValue("", "string")).toBeUndefined();
    expect(S.coerceParamValue("  ", "number")).toBeUndefined();
  });

  test("number coercion", () => {
    expect(S.coerceParamValue("42", "number")).toBe(42);
    expect(S.coerceParamValue("3.14", "number")).toBe(3.14);
    expect(S.coerceParamValue("not-a-number", "number")).toBe("not-a-number");
  });

  test("integer coercion", () => {
    expect(S.coerceParamValue("42", "integer")).toBe(42);
  });

  test("boolean coercion", () => {
    expect(S.coerceParamValue("true", "boolean")).toBe(true);
    expect(S.coerceParamValue("TRUE", "boolean")).toBe(true);
    expect(S.coerceParamValue("false", "boolean")).toBe(false);
    expect(S.coerceParamValue("anything", "boolean")).toBe(false);
  });

  test("object coercion (JSON parse)", () => {
    expect(S.coerceParamValue('{"a":1}', "object")).toEqual({ a: 1 });
    expect(S.coerceParamValue("not-json", "object")).toBe("not-json");
  });

  test("array coercion", () => {
    expect(S.coerceParamValue("[1,2,3]", "array")).toEqual([1, 2, 3]);
  });

  test("string type passes through", () => {
    expect(S.coerceParamValue("hello", "string")).toBe("hello");
  });

  test("default type tries JSON parse then string", () => {
    expect(S.coerceParamValue("42", undefined)).toBe(42);
    expect(S.coerceParamValue("hello", undefined)).toBe("hello");
  });
});
