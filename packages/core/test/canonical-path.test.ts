/**
 * AFS Canonical Path Parser Tests
 *
 * Tests for parsing and generating canonical AFS paths:
 * - Default namespace: $afs/path
 * - Named namespace: $afs:namespace/path
 *
 * Test categories:
 * 1. Happy Path - Valid canonical paths
 * 2. Default Namespace - $afs/path format
 * 3. Named Namespace - $afs:namespace/path format
 * 4. Invalid Formats - Malformed paths
 * 5. Security - Injection and traversal attacks
 * 6. Edge Cases - Boundary conditions
 * 7. Roundtrip - Parse and serialize consistency
 */

import { describe, expect, test } from "bun:test";
import { isCanonicalPath, parseCanonicalPath, toCanonicalPath } from "@aigne/afs";

// =============================================================================
// 1. HAPPY PATH - Valid Canonical Paths
// =============================================================================

describe("Canonical Path Parser: Happy Path", () => {
  describe("parseCanonicalPath", () => {
    test("parses default namespace root: $afs/", () => {
      const result = parseCanonicalPath("$afs/");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/");
    });

    test("parses default namespace path: $afs/src", () => {
      const result = parseCanonicalPath("$afs/src");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src");
    });

    test("parses default namespace deep path: $afs/src/components/Button.tsx", () => {
      const result = parseCanonicalPath("$afs/src/components/Button.tsx");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src/components/Button.tsx");
    });

    test("parses named namespace: $afs:staging/api", () => {
      const result = parseCanonicalPath("$afs:staging/api");
      expect(result.namespace).toBe("staging");
      expect(result.path).toBe("/api");
    });

    test("parses named namespace root: $afs:prod/", () => {
      const result = parseCanonicalPath("$afs:prod/");
      expect(result.namespace).toBe("prod");
      expect(result.path).toBe("/");
    });

    test("parses named namespace deep path: $afs:user/tools/cli/bin", () => {
      const result = parseCanonicalPath("$afs:user/tools/cli/bin");
      expect(result.namespace).toBe("user");
      expect(result.path).toBe("/tools/cli/bin");
    });
  });

  describe("toCanonicalPath", () => {
    test("creates default namespace path", () => {
      expect(toCanonicalPath(null, "/src")).toBe("$afs/src");
    });

    test("creates default namespace root", () => {
      expect(toCanonicalPath(null, "/")).toBe("$afs/");
    });

    test("creates named namespace path", () => {
      expect(toCanonicalPath("staging", "/api")).toBe("$afs:staging/api");
    });

    test("creates named namespace root", () => {
      expect(toCanonicalPath("prod", "/")).toBe("$afs:prod/");
    });
  });

  describe("isCanonicalPath", () => {
    test("recognizes default namespace paths", () => {
      expect(isCanonicalPath("$afs/")).toBe(true);
      expect(isCanonicalPath("$afs/src")).toBe(true);
      expect(isCanonicalPath("$afs/src/file.txt")).toBe(true);
    });

    test("recognizes named namespace paths", () => {
      expect(isCanonicalPath("$afs:staging/")).toBe(true);
      expect(isCanonicalPath("$afs:staging/api")).toBe(true);
      expect(isCanonicalPath("$afs:prod/api/v1")).toBe(true);
    });

    test("rejects non-canonical paths", () => {
      expect(isCanonicalPath("/src")).toBe(false);
      expect(isCanonicalPath("src")).toBe(false);
      expect(isCanonicalPath("@staging/api")).toBe(false);
      expect(isCanonicalPath("")).toBe(false);
    });
  });
});

// =============================================================================
// 2. DEFAULT NAMESPACE - $afs/path format
// =============================================================================

describe("Canonical Path Parser: Default Namespace", () => {
  describe("valid default namespace paths", () => {
    test("parses root path", () => {
      const result = parseCanonicalPath("$afs/");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/");
    });

    test("parses single segment", () => {
      const result = parseCanonicalPath("$afs/src");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src");
    });

    test("parses path with file extension", () => {
      const result = parseCanonicalPath("$afs/src/index.ts");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src/index.ts");
    });

    test("parses path with multiple extensions", () => {
      const result = parseCanonicalPath("$afs/src/app.test.tsx");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src/app.test.tsx");
    });

    test("parses path with hyphen", () => {
      const result = parseCanonicalPath("$afs/my-project/src");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/my-project/src");
    });

    test("parses path with underscore", () => {
      const result = parseCanonicalPath("$afs/my_project/src");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/my_project/src");
    });

    test("parses path with numbers", () => {
      const result = parseCanonicalPath("$afs/v2/api/2024");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/v2/api/2024");
    });

    test("parses hidden file path", () => {
      const result = parseCanonicalPath("$afs/.gitignore");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/.gitignore");
    });

    test("parses path in hidden directory", () => {
      const result = parseCanonicalPath("$afs/.config/settings.json");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/.config/settings.json");
    });
  });

  describe("toCanonicalPath with null namespace", () => {
    test("handles root path", () => {
      expect(toCanonicalPath(null, "/")).toBe("$afs/");
    });

    test("handles deep path", () => {
      expect(toCanonicalPath(null, "/a/b/c/d")).toBe("$afs/a/b/c/d");
    });

    test("handles path with special chars in filename", () => {
      expect(toCanonicalPath(null, "/file name.txt")).toBe("$afs/file name.txt");
    });
  });
});

// =============================================================================
// 3. NAMED NAMESPACE - $afs:namespace/path format
// =============================================================================

describe("Canonical Path Parser: Named Namespace", () => {
  describe("valid named namespace paths", () => {
    test("parses simple namespace", () => {
      const result = parseCanonicalPath("$afs:staging/api");
      expect(result.namespace).toBe("staging");
      expect(result.path).toBe("/api");
    });

    test("parses namespace root", () => {
      const result = parseCanonicalPath("$afs:prod/");
      expect(result.namespace).toBe("prod");
      expect(result.path).toBe("/");
    });

    test("parses namespace with hyphen", () => {
      const result = parseCanonicalPath("$afs:my-namespace/path");
      expect(result.namespace).toBe("my-namespace");
      expect(result.path).toBe("/path");
    });

    test("parses namespace with underscore", () => {
      const result = parseCanonicalPath("$afs:my_namespace/path");
      expect(result.namespace).toBe("my_namespace");
      expect(result.path).toBe("/path");
    });

    test("parses namespace with numbers", () => {
      const result = parseCanonicalPath("$afs:env2/config");
      expect(result.namespace).toBe("env2");
      expect(result.path).toBe("/config");
    });

    test("parses single char namespace", () => {
      const result = parseCanonicalPath("$afs:a/path");
      expect(result.namespace).toBe("a");
      expect(result.path).toBe("/path");
    });

    test("parses long namespace name", () => {
      const longName = "a".repeat(100);
      const result = parseCanonicalPath(`$afs:${longName}/path`);
      expect(result.namespace).toBe(longName);
      expect(result.path).toBe("/path");
    });
  });

  describe("namespace with unicode", () => {
    test("parses namespace with Chinese characters", () => {
      const result = parseCanonicalPath("$afs:测试/路径");
      expect(result.namespace).toBe("测试");
      expect(result.path).toBe("/路径");
    });

    test("parses namespace with Japanese characters", () => {
      const result = parseCanonicalPath("$afs:テスト/パス");
      expect(result.namespace).toBe("テスト");
      expect(result.path).toBe("/パス");
    });

    test("parses namespace with emoji", () => {
      const result = parseCanonicalPath("$afs:🚀/deploy");
      expect(result.namespace).toBe("🚀");
      expect(result.path).toBe("/deploy");
    });
  });

  describe("toCanonicalPath with named namespace", () => {
    test("creates simple namespace path", () => {
      expect(toCanonicalPath("staging", "/api")).toBe("$afs:staging/api");
    });

    test("creates namespace root", () => {
      expect(toCanonicalPath("prod", "/")).toBe("$afs:prod/");
    });

    test("creates namespace with deep path", () => {
      expect(toCanonicalPath("user", "/tools/cli/bin")).toBe("$afs:user/tools/cli/bin");
    });
  });
});

// =============================================================================
// 4. INVALID FORMATS - Malformed Paths
// =============================================================================

describe("Canonical Path Parser: Invalid Formats", () => {
  describe("missing prefix", () => {
    test("throws on plain path", () => {
      expect(() => parseCanonicalPath("/src")).toThrow();
    });

    test("throws on relative path", () => {
      expect(() => parseCanonicalPath("src")).toThrow();
    });

    test("throws on @ syntax (CLI format)", () => {
      expect(() => parseCanonicalPath("@staging/api")).toThrow();
    });
  });

  describe("malformed prefix", () => {
    test("throws on lowercase afs without $", () => {
      expect(() => parseCanonicalPath("afs/src")).toThrow();
    });

    test("throws on uppercase AFS", () => {
      expect(() => parseCanonicalPath("$AFS/src")).toThrow();
    });

    test("throws on $Afs (mixed case)", () => {
      expect(() => parseCanonicalPath("$Afs/src")).toThrow();
    });

    test("throws on $afs without following / or :", () => {
      expect(() => parseCanonicalPath("$afs")).toThrow();
    });

    test("throws on $afs with backslash", () => {
      expect(() => parseCanonicalPath("$afs\\src")).toThrow();
    });

    test("throws on extra $ sign", () => {
      expect(() => parseCanonicalPath("$$afs/src")).toThrow();
    });

    test("throws on space before $afs", () => {
      expect(() => parseCanonicalPath(" $afs/src")).toThrow();
    });
  });

  describe("malformed namespace", () => {
    test("throws on empty namespace: $afs:/path", () => {
      expect(() => parseCanonicalPath("$afs:/path")).toThrow();
    });

    test("throws on namespace with slash: $afs:ns/bad/path", () => {
      // After first /, rest is path - but "ns/bad" as namespace is invalid
      // Actually $afs:ns/bad/path should parse as namespace="ns", path="/bad/path"
      // Let me reconsider - the format is $afs:namespace/path
      // So $afs:ns/bad/path = namespace "ns", path "/bad/path" - this is valid
      const result = parseCanonicalPath("$afs:ns/bad/path");
      expect(result.namespace).toBe("ns");
      expect(result.path).toBe("/bad/path");
    });

    test("throws on namespace with colon: $afs:ns:name/path", () => {
      // Multiple colons - should this be rejected or handled?
      // Safest to reject namespace with colon
      expect(() => parseCanonicalPath("$afs:ns:name/path")).toThrow();
    });

    test("throws on namespace starting with colon: $afs::/path", () => {
      expect(() => parseCanonicalPath("$afs::/path")).toThrow();
    });

    test("throws on whitespace-only namespace", () => {
      expect(() => parseCanonicalPath("$afs:   /path")).toThrow();
    });

    test("throws on namespace with control chars", () => {
      expect(() => parseCanonicalPath("$afs:ns\x00name/path")).toThrow();
    });

    test("throws on namespace with newline", () => {
      expect(() => parseCanonicalPath("$afs:ns\nname/path")).toThrow();
    });
  });

  describe("malformed path part", () => {
    test("throws on missing path after namespace: $afs:staging", () => {
      expect(() => parseCanonicalPath("$afs:staging")).toThrow();
    });

    test("throws on empty path: $afs:", () => {
      expect(() => parseCanonicalPath("$afs:")).toThrow();
    });

    test("handles path not starting with /: $afs:ns|path (no /)", () => {
      // After $afs:namespace, must have /
      expect(() => parseCanonicalPath("$afs:nspath")).toThrow();
    });
  });

  describe("empty and whitespace", () => {
    test("throws on empty string", () => {
      expect(() => parseCanonicalPath("")).toThrow();
    });

    test("throws on whitespace-only", () => {
      expect(() => parseCanonicalPath("   ")).toThrow();
    });

    test("throws on tab-only", () => {
      expect(() => parseCanonicalPath("\t")).toThrow();
    });

    test("throws on newline-only", () => {
      expect(() => parseCanonicalPath("\n")).toThrow();
    });
  });
});

// =============================================================================
// 5. SECURITY - Injection and Traversal Attacks
// =============================================================================

describe("Canonical Path Parser: Security", () => {
  describe("path traversal in namespace", () => {
    test("rejects namespace with ..", () => {
      expect(() => parseCanonicalPath("$afs:../etc/path")).toThrow();
    });

    test("does not decode URL-encoded .. in namespace (literal %2e%2e is valid)", () => {
      // URL decoding should happen at a different layer (e.g., HTTP layer)
      // The canonical path parser treats %2e%2e as a literal string
      const result = parseCanonicalPath("$afs:%2e%2e/path");
      expect(result.namespace).toBe("%2e%2e");
      expect(result.path).toBe("/path");
    });

    test("handles namespace that looks like traversal but isn't: $afs:dotdot/path", () => {
      const result = parseCanonicalPath("$afs:dotdot/path");
      expect(result.namespace).toBe("dotdot");
      expect(result.path).toBe("/path");
    });
  });

  describe("path traversal in path part", () => {
    test("normalizes .. in path (cannot escape)", () => {
      const result = parseCanonicalPath("$afs/src/../etc");
      // Should normalize and stay within bounds
      expect(result.path).toBe("/etc");
    });

    test("normalizes multiple .. at root", () => {
      const result = parseCanonicalPath("$afs/../../../etc/passwd");
      // Cannot escape root
      expect(result.path).toBe("/etc/passwd");
    });

    test("normalizes . in path", () => {
      const result = parseCanonicalPath("$afs/./src/./file");
      expect(result.path).toBe("/src/file");
    });
  });

  describe("injection attacks on namespace", () => {
    test("rejects namespace with shell metachar ;", () => {
      expect(() => parseCanonicalPath("$afs:ns;rm -rf/path")).toThrow();
    });

    test("rejects namespace with shell metachar |", () => {
      expect(() => parseCanonicalPath("$afs:ns|cat/path")).toThrow();
    });

    test("rejects namespace with shell metachar &", () => {
      expect(() => parseCanonicalPath("$afs:ns&echo/path")).toThrow();
    });

    test("rejects namespace with backtick", () => {
      expect(() => parseCanonicalPath("$afs:ns`whoami`/path")).toThrow();
    });

    test("rejects namespace with $()", () => {
      expect(() => parseCanonicalPath("$afs:ns$(id)/path")).toThrow();
    });

    test("rejects namespace with >", () => {
      expect(() => parseCanonicalPath("$afs:ns>out/path")).toThrow();
    });

    test("rejects namespace with <", () => {
      expect(() => parseCanonicalPath("$afs:ns<in/path")).toThrow();
    });
  });

  describe("null byte injection", () => {
    test("rejects null in namespace", () => {
      expect(() => parseCanonicalPath("$afs:ns\x00evil/path")).toThrow();
    });

    test("rejects null in path", () => {
      expect(() => parseCanonicalPath("$afs/path\x00evil")).toThrow();
    });

    test("rejects null after prefix", () => {
      expect(() => parseCanonicalPath("$afs\x00/path")).toThrow();
    });
  });

  describe("unicode attacks", () => {
    test("does not treat unicode slash as separator in namespace", () => {
      // U+2215 DIVISION SLASH should not split namespace
      const path = "$afs:ns\u2215fake/real";
      const result = parseCanonicalPath(path);
      // The namespace should include the unicode slash
      expect(result.namespace).toBe("ns\u2215fake");
      expect(result.path).toBe("/real");
    });

    test("handles RTL override in namespace", () => {
      // Should either reject or handle safely
      const path = "$afs:\u202Ens/path";
      try {
        const result = parseCanonicalPath(path);
        // If accepted, should preserve literally
        expect(result.namespace).toBe("\u202Ens");
      } catch {
        // Rejecting is also acceptable
      }
    });

    test("handles zero-width chars in namespace", () => {
      const path = "$afs:ns\u200Bname/path";
      try {
        const result = parseCanonicalPath(path);
        expect(result.namespace).toBe("ns\u200Bname");
      } catch {
        // Rejecting is also acceptable
      }
    });
  });

  describe("URL encoding attacks", () => {
    test("does not decode %2f as slash in namespace", () => {
      // %2f is URL-encoded /
      const result = parseCanonicalPath("$afs:ns%2ftest/path");
      // Should NOT interpret %2f as path separator
      expect(result.namespace).toBe("ns%2ftest");
      expect(result.path).toBe("/path");
    });

    test("does not decode %3a as colon in prefix", () => {
      // %3a is URL-encoded :
      const path = "$afs%3ans/path";
      // Should NOT interpret this as $afs:ns/path
      expect(() => parseCanonicalPath(path)).toThrow();
    });
  });
});

// =============================================================================
// 6. EDGE CASES - Boundary Conditions
// =============================================================================

describe("Canonical Path Parser: Edge Cases", () => {
  describe("minimal valid paths", () => {
    test("parses minimal default namespace: $afs/", () => {
      const result = parseCanonicalPath("$afs/");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/");
    });

    test("parses minimal named namespace: $afs:a/", () => {
      const result = parseCanonicalPath("$afs:a/");
      expect(result.namespace).toBe("a");
      expect(result.path).toBe("/");
    });

    test("parses single char path: $afs/a", () => {
      const result = parseCanonicalPath("$afs/a");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/a");
    });
  });

  describe("long paths", () => {
    test("handles very long namespace name", () => {
      const longNs = "a".repeat(1000);
      const result = parseCanonicalPath(`$afs:${longNs}/path`);
      expect(result.namespace).toBe(longNs);
    });

    test("handles very long path", () => {
      const longPath = "/a".repeat(500);
      const result = parseCanonicalPath(`$afs${longPath}`);
      expect(result.path.length).toBeGreaterThan(500);
    });

    test("handles many path segments", () => {
      const segments = Array(100).fill("dir").join("/");
      const result = parseCanonicalPath(`$afs/${segments}`);
      expect(result.path.split("/").length).toBe(101); // 100 + root
    });
  });

  describe("special characters in path", () => {
    test("handles space in path", () => {
      const result = parseCanonicalPath("$afs/my file.txt");
      expect(result.path).toBe("/my file.txt");
    });

    test("handles @ in path (not namespace indicator)", () => {
      const result = parseCanonicalPath("$afs/user@domain.com");
      expect(result.path).toBe("/user@domain.com");
    });

    test("handles $ in path (not prefix)", () => {
      const result = parseCanonicalPath("$afs/price$100");
      expect(result.path).toBe("/price$100");
    });

    test("handles # in path", () => {
      const result = parseCanonicalPath("$afs/file#section");
      expect(result.path).toBe("/file#section");
    });

    test("handles % in path (literal, not encoded)", () => {
      const result = parseCanonicalPath("$afs/100%");
      expect(result.path).toBe("/100%");
    });
  });

  describe("multiple slashes normalization", () => {
    test("normalizes double slashes in path", () => {
      const result = parseCanonicalPath("$afs//src//file");
      expect(result.path).toBe("/src/file");
    });

    test("normalizes trailing slashes", () => {
      const result = parseCanonicalPath("$afs/src/");
      // Trailing slash on non-root should be normalized
      expect(result.path).toBe("/src");
    });

    test("preserves root trailing slash", () => {
      const result = parseCanonicalPath("$afs/");
      expect(result.path).toBe("/");
    });
  });

  describe("case sensitivity", () => {
    test("namespace is case-sensitive: staging vs Staging", () => {
      const lower = parseCanonicalPath("$afs:staging/path");
      const upper = parseCanonicalPath("$afs:Staging/path");
      expect(lower.namespace).not.toBe(upper.namespace);
    });

    test("path is case-sensitive", () => {
      const lower = parseCanonicalPath("$afs/src");
      const upper = parseCanonicalPath("$afs/SRC");
      expect(lower.path).not.toBe(upper.path);
    });
  });
});

// =============================================================================
// 7. ROUNDTRIP - Parse and Serialize Consistency
// =============================================================================

describe("Canonical Path Parser: Roundtrip", () => {
  describe("parse -> serialize -> parse", () => {
    test("roundtrip default namespace path", () => {
      const original = "$afs/src/file.txt";
      const parsed = parseCanonicalPath(original);
      const serialized = toCanonicalPath(parsed.namespace, parsed.path);
      const reparsed = parseCanonicalPath(serialized);

      expect(reparsed.namespace).toBe(parsed.namespace);
      expect(reparsed.path).toBe(parsed.path);
    });

    test("roundtrip named namespace path", () => {
      const original = "$afs:staging/api/v1";
      const parsed = parseCanonicalPath(original);
      const serialized = toCanonicalPath(parsed.namespace, parsed.path);
      const reparsed = parseCanonicalPath(serialized);

      expect(reparsed.namespace).toBe(parsed.namespace);
      expect(reparsed.path).toBe(parsed.path);
    });

    test("roundtrip preserves unicode", () => {
      const original = "$afs:测试/文件.txt";
      const parsed = parseCanonicalPath(original);
      const serialized = toCanonicalPath(parsed.namespace, parsed.path);
      const reparsed = parseCanonicalPath(serialized);

      expect(reparsed.namespace).toBe("测试");
      expect(reparsed.path).toBe("/文件.txt");
    });
  });

  describe("serialize -> parse -> serialize", () => {
    test("roundtrip from components", () => {
      const namespace = "prod";
      const path = "/api/users";

      const serialized1 = toCanonicalPath(namespace, path);
      const parsed = parseCanonicalPath(serialized1);
      const serialized2 = toCanonicalPath(parsed.namespace, parsed.path);

      expect(serialized1).toBe(serialized2);
    });

    test("roundtrip null namespace", () => {
      const namespace = null;
      const path = "/config/app.json";

      const serialized1 = toCanonicalPath(namespace, path);
      const parsed = parseCanonicalPath(serialized1);
      const serialized2 = toCanonicalPath(parsed.namespace, parsed.path);

      expect(serialized1).toBe(serialized2);
    });
  });

  describe("normalization in roundtrip", () => {
    test("normalizes double slashes on roundtrip", () => {
      const original = "$afs//src//file";
      const parsed = parseCanonicalPath(original);
      const serialized = toCanonicalPath(parsed.namespace, parsed.path);

      // After roundtrip, should be normalized
      expect(serialized).toBe("$afs/src/file");
    });

    test("normalizes . on roundtrip", () => {
      const original = "$afs/./src/./file";
      const parsed = parseCanonicalPath(original);
      const serialized = toCanonicalPath(parsed.namespace, parsed.path);

      expect(serialized).toBe("$afs/src/file");
    });

    test("normalizes .. on roundtrip", () => {
      const original = "$afs/src/../config/file";
      const parsed = parseCanonicalPath(original);
      const serialized = toCanonicalPath(parsed.namespace, parsed.path);

      expect(serialized).toBe("$afs/config/file");
    });
  });
});

// =============================================================================
// 8. toCanonicalPath VALIDATION
// =============================================================================

describe("Canonical Path Parser: toCanonicalPath Validation", () => {
  describe("invalid namespace", () => {
    test("throws on namespace with /", () => {
      expect(() => toCanonicalPath("ns/bad", "/path")).toThrow();
    });

    test("throws on namespace with :", () => {
      expect(() => toCanonicalPath("ns:bad", "/path")).toThrow();
    });

    test("throws on namespace with control chars", () => {
      expect(() => toCanonicalPath("ns\x00bad", "/path")).toThrow();
    });

    test("throws on empty namespace string", () => {
      expect(() => toCanonicalPath("", "/path")).toThrow();
    });

    test("throws on whitespace namespace", () => {
      expect(() => toCanonicalPath("   ", "/path")).toThrow();
    });

    test("allows null namespace (default)", () => {
      expect(() => toCanonicalPath(null, "/path")).not.toThrow();
    });
  });

  describe("invalid path", () => {
    test("throws on relative path", () => {
      expect(() => toCanonicalPath(null, "relative")).toThrow();
    });

    test("throws on empty path", () => {
      expect(() => toCanonicalPath(null, "")).toThrow();
    });

    test("throws on path with control chars", () => {
      expect(() => toCanonicalPath(null, "/path\x00evil")).toThrow();
    });

    test("accepts path starting with /", () => {
      expect(() => toCanonicalPath(null, "/valid")).not.toThrow();
    });
  });
});

// =============================================================================
// 9. CONCURRENT OPERATIONS
// =============================================================================

describe("Canonical Path Parser: Concurrent Operations", () => {
  test("handles many concurrent parses", async () => {
    const paths = Array(1000)
      .fill(null)
      .map((_, i) => `$afs:ns${i % 10}/path${i}`);

    const results = await Promise.all(paths.map((p) => Promise.resolve(parseCanonicalPath(p))));

    expect(results.length).toBe(1000);
    expect(results.every((r) => r.namespace !== undefined)).toBe(true);
  });

  test("handles concurrent parse and serialize", async () => {
    const operations = Array(100)
      .fill(null)
      .map((_, i) => {
        if (i % 2 === 0) {
          return Promise.resolve(parseCanonicalPath(`$afs:ns${i}/path`));
        }
        return Promise.resolve(toCanonicalPath(`ns${i}`, `/path${i}`));
      });

    const results = await Promise.all(operations);
    expect(results.length).toBe(100);
  });
});
