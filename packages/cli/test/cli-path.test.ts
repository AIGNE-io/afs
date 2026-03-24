/**
 * CLI Path Syntax Tests
 *
 * Tests for the CLI UX layer path conversion:
 * - /path → $afs/path (default namespace)
 * - @namespace/path → $afs:namespace/path (named namespace)
 * - $afs/path → $afs/path (passthrough for canonical)
 * - $afs:namespace/path → $afs:namespace/path (passthrough for canonical)
 *
 * Test categories:
 * 1. Basic Conversion - Happy path conversions
 * 2. Passthrough - Canonical paths passed through unchanged
 * 3. Namespace Validation - Invalid namespace handling
 * 4. Edge Cases - Special characters, unicode, empty paths
 * 5. Security - Injection attempts, traversal
 */

import { describe, expect, test } from "bun:test";
import { cliPathToCanonical, parseCliPath } from "../src/path-utils.js";

// =============================================================================
// 1. BASIC CONVERSION - Happy Path
// =============================================================================

describe("CLI Path: Basic Conversion", () => {
  describe("default namespace (/ prefix)", () => {
    test("converts simple path", () => {
      expect(cliPathToCanonical("/src")).toBe("$afs/src");
    });

    test("converts root path", () => {
      expect(cliPathToCanonical("/")).toBe("$afs/");
    });

    test("converts nested path", () => {
      expect(cliPathToCanonical("/src/components/Button.tsx")).toBe(
        "$afs/src/components/Button.tsx",
      );
    });

    test("converts path with special characters", () => {
      expect(cliPathToCanonical("/data/file-name_v2.json")).toBe("$afs/data/file-name_v2.json");
    });
  });

  describe("named namespace (@ prefix)", () => {
    test("converts simple namespace path", () => {
      expect(cliPathToCanonical("@staging/api")).toBe("$afs:staging/api");
    });

    test("converts namespace with root path", () => {
      expect(cliPathToCanonical("@staging/")).toBe("$afs:staging/");
    });

    test("converts namespace with nested path", () => {
      expect(cliPathToCanonical("@prod/api/v1/users")).toBe("$afs:prod/api/v1/users");
    });

    test("converts hyphenated namespace", () => {
      expect(cliPathToCanonical("@my-namespace/path")).toBe("$afs:my-namespace/path");
    });

    test("converts underscored namespace", () => {
      expect(cliPathToCanonical("@my_namespace/path")).toBe("$afs:my_namespace/path");
    });

    test("converts numeric namespace", () => {
      expect(cliPathToCanonical("@123/path")).toBe("$afs:123/path");
    });

    test("converts dotted namespace", () => {
      expect(cliPathToCanonical("@api.v1/endpoint")).toBe("$afs:api.v1/endpoint");
    });
  });
});

// =============================================================================
// 2. PASSTHROUGH - Canonical Paths
// =============================================================================

describe("CLI Path: Passthrough", () => {
  describe("canonical default namespace", () => {
    test("passes through $afs/path", () => {
      expect(cliPathToCanonical("$afs/src")).toBe("$afs/src");
    });

    test("passes through $afs/", () => {
      expect(cliPathToCanonical("$afs/")).toBe("$afs/");
    });

    test("passes through $afs/nested/path", () => {
      expect(cliPathToCanonical("$afs/a/b/c")).toBe("$afs/a/b/c");
    });
  });

  describe("canonical named namespace", () => {
    test("passes through $afs:namespace/path", () => {
      expect(cliPathToCanonical("$afs:staging/api")).toBe("$afs:staging/api");
    });

    test("passes through $afs:namespace/", () => {
      expect(cliPathToCanonical("$afs:prod/")).toBe("$afs:prod/");
    });

    test("passes through $afs:namespace/nested/path", () => {
      expect(cliPathToCanonical("$afs:user/a/b/c")).toBe("$afs:user/a/b/c");
    });
  });
});

// =============================================================================
// 3. PARSE CLI PATH - Extract namespace and path
// =============================================================================

describe("CLI Path: Parse", () => {
  describe("default namespace", () => {
    test("parses /path", () => {
      const result = parseCliPath("/src");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src");
    });

    test("parses /", () => {
      const result = parseCliPath("/");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/");
    });
  });

  describe("named namespace", () => {
    test("parses @namespace/path", () => {
      const result = parseCliPath("@staging/api");
      expect(result.namespace).toBe("staging");
      expect(result.path).toBe("/api");
    });

    test("parses @namespace/", () => {
      const result = parseCliPath("@staging/");
      expect(result.namespace).toBe("staging");
      expect(result.path).toBe("/");
    });
  });

  describe("canonical passthrough", () => {
    test("parses $afs/path", () => {
      const result = parseCliPath("$afs/src");
      expect(result.namespace).toBeNull();
      expect(result.path).toBe("/src");
    });

    test("parses $afs:namespace/path", () => {
      const result = parseCliPath("$afs:staging/api");
      expect(result.namespace).toBe("staging");
      expect(result.path).toBe("/api");
    });
  });
});

// =============================================================================
// 4. INVALID INPUT - Error cases
// =============================================================================

describe("CLI Path: Invalid Input", () => {
  describe("missing path after namespace", () => {
    test("throws for @namespace without path", () => {
      expect(() => cliPathToCanonical("@staging")).toThrow();
    });

    test("throws for @ alone", () => {
      expect(() => cliPathToCanonical("@")).toThrow();
    });
  });

  describe("relative paths", () => {
    test("throws for relative path", () => {
      expect(() => cliPathToCanonical("src/file.ts")).toThrow();
    });

    test("throws for dot-relative path", () => {
      expect(() => cliPathToCanonical("./src/file.ts")).toThrow();
    });

    test("throws for parent-relative path", () => {
      expect(() => cliPathToCanonical("../src/file.ts")).toThrow();
    });
  });

  describe("empty or whitespace", () => {
    test("throws for empty string", () => {
      expect(() => cliPathToCanonical("")).toThrow();
    });

    test("throws for whitespace only", () => {
      expect(() => cliPathToCanonical("   ")).toThrow();
    });
  });

  describe("invalid namespace characters", () => {
    test("throws for namespace with /", () => {
      expect(() => cliPathToCanonical("@name/space/path")).not.toThrow(); // This is valid: ns=name, path=/space/path
    });

    test("throws for namespace with :", () => {
      expect(() => cliPathToCanonical("@ns:bad/path")).toThrow();
    });

    test("throws for namespace with shell metachar", () => {
      expect(() => cliPathToCanonical("@ns;rm/path")).toThrow();
    });

    test("throws for empty namespace", () => {
      expect(() => cliPathToCanonical("@/path")).toThrow();
    });
  });
});

// =============================================================================
// 5. EDGE CASES - Unicode, special chars
// =============================================================================

describe("CLI Path: Edge Cases", () => {
  describe("unicode namespaces", () => {
    test("accepts Chinese namespace", () => {
      expect(cliPathToCanonical("@测试/path")).toBe("$afs:测试/path");
    });

    test("accepts Japanese namespace", () => {
      expect(cliPathToCanonical("@テスト/path")).toBe("$afs:テスト/path");
    });

    test("accepts emoji namespace", () => {
      expect(cliPathToCanonical("@🚀/path")).toBe("$afs:🚀/path");
    });
  });

  describe("unicode paths", () => {
    test("accepts Chinese path", () => {
      expect(cliPathToCanonical("/文档/说明.md")).toBe("$afs/文档/说明.md");
    });

    test("accepts emoji path", () => {
      expect(cliPathToCanonical("/📁/file.txt")).toBe("$afs/📁/file.txt");
    });
  });

  describe("case sensitivity", () => {
    test("preserves namespace case", () => {
      expect(cliPathToCanonical("@Staging/api")).toBe("$afs:Staging/api");
      expect(cliPathToCanonical("@STAGING/api")).toBe("$afs:STAGING/api");
    });

    test("preserves path case", () => {
      expect(cliPathToCanonical("/SRC/Index.ts")).toBe("$afs/SRC/Index.ts");
    });
  });

  describe("long inputs", () => {
    test("handles long namespace", () => {
      const longNs = "a".repeat(200);
      expect(cliPathToCanonical(`@${longNs}/path`)).toBe(`$afs:${longNs}/path`);
    });

    test("handles long path", () => {
      const longPath = "/a".repeat(100);
      expect(cliPathToCanonical(longPath)).toBe(`$afs${longPath}`);
    });
  });
});

// =============================================================================
// 6. SECURITY - Injection, traversal
// =============================================================================

describe("CLI Path: Security", () => {
  describe("namespace injection", () => {
    test("rejects namespace with shell pipe", () => {
      expect(() => cliPathToCanonical("@ns|cat/path")).toThrow();
    });

    test("rejects namespace with backtick", () => {
      expect(() => cliPathToCanonical("@ns`rm`/path")).toThrow();
    });

    test("rejects namespace with $", () => {
      expect(() => cliPathToCanonical("@$HOME/path")).toThrow();
    });

    test("rejects namespace with newline", () => {
      expect(() => cliPathToCanonical("@ns\nrm/path")).toThrow();
    });

    test("rejects namespace with NUL", () => {
      expect(() => cliPathToCanonical("@ns\x00bad/path")).toThrow();
    });
  });

  describe("path traversal via CLI", () => {
    test("path with .. is normalized by toCanonicalPath", () => {
      // The toCanonicalPath function normalizes paths, so .. is resolved
      const result = cliPathToCanonical("/src/../config");
      expect(result).toBe("$afs/config"); // Normalized by toCanonicalPath
    });
  });

  describe("mixed syntax attacks", () => {
    test("rejects $afs inside @ namespace", () => {
      // @$afs:hack/path - the $ should be rejected in namespace
      expect(() => cliPathToCanonical("@$afs:hack/path")).toThrow();
    });

    test("@ inside path is literal", () => {
      // /path/@name is just a literal @ in the path
      expect(cliPathToCanonical("/path/@name")).toBe("$afs/path/@name");
    });
  });
});
