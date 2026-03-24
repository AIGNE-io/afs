import { describe, expect, test } from "bun:test";
import {
  AFSPathError,
  getNodePathFromMetaPath,
  isKindsPath,
  isMetaPath,
  parseMetaPath,
} from "@aigne/afs";

describe("isMetaPath", () => {
  describe("Happy Path", () => {
    test("detects directory meta path: /dir/.meta", () => {
      expect(isMetaPath("/dir/.meta")).toBe(true);
    });

    test("detects meta resource path: /dir/.meta/icon.png", () => {
      expect(isMetaPath("/dir/.meta/icon.png")).toBe(true);
    });

    test("detects file meta path: /dir/file.txt/.meta", () => {
      expect(isMetaPath("/dir/file.txt/.meta")).toBe(true);
    });

    test("detects file meta resource path: /dir/file.txt/.meta/thumbnail.png", () => {
      expect(isMetaPath("/dir/file.txt/.meta/thumbnail.png")).toBe(true);
    });

    test("detects root meta path: /.meta", () => {
      expect(isMetaPath("/.meta")).toBe(true);
    });

    test("detects kinds list path: /.meta/.kinds", () => {
      expect(isMetaPath("/.meta/.kinds")).toBe(true);
    });

    test("detects specific kind path: /.meta/.kinds/chamber:project", () => {
      expect(isMetaPath("/.meta/.kinds/chamber:project")).toBe(true);
    });

    test("detects deeply nested meta path: /a/b/c/d/.meta", () => {
      expect(isMetaPath("/a/b/c/d/.meta")).toBe(true);
    });
  });

  describe("Bad Path", () => {
    test("returns false for empty path", () => {
      expect(isMetaPath("")).toBe(false);
    });

    test("returns false for regular path without .meta", () => {
      expect(isMetaPath("/dir/file.txt")).toBe(false);
    });

    test("returns false for .metadata (similar but different)", () => {
      expect(isMetaPath("/dir/.metadata")).toBe(false);
    });

    test("returns false for meta as part of filename", () => {
      expect(isMetaPath("/dir/file.meta.txt")).toBe(false);
    });

    test("returns false for .meta in middle of path without being a virtual path", () => {
      // This tests a file/dir literally named .meta in the middle
      expect(isMetaPath("/dir/.meta-backup/file.txt")).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    test("handles path with trailing slash: /dir/.meta/", () => {
      expect(isMetaPath("/dir/.meta/")).toBe(true);
    });

    test("handles multiple slashes: /dir//.meta", () => {
      expect(isMetaPath("/dir//.meta")).toBe(true);
    });
  });
});

describe("parseMetaPath", () => {
  describe("Happy Path", () => {
    test("parses directory meta path: /dir/.meta", () => {
      const info = parseMetaPath("/dir/.meta");
      expect(info.nodePath).toBe("/dir");
      expect(info.resourcePath).toBeNull();
      expect(info.isKindsPath).toBe(false);
      expect(info.kindName).toBeNull();
    });

    test("parses meta resource path: /dir/.meta/icon.png", () => {
      const info = parseMetaPath("/dir/.meta/icon.png");
      expect(info.nodePath).toBe("/dir");
      expect(info.resourcePath).toBe("icon.png");
      expect(info.isKindsPath).toBe(false);
      expect(info.kindName).toBeNull();
    });

    test("parses nested meta resource: /dir/.meta/assets/logo.svg", () => {
      const info = parseMetaPath("/dir/.meta/assets/logo.svg");
      expect(info.nodePath).toBe("/dir");
      expect(info.resourcePath).toBe("assets/logo.svg");
      expect(info.isKindsPath).toBe(false);
    });

    test("parses file meta path: /dir/file.txt/.meta", () => {
      const info = parseMetaPath("/dir/file.txt/.meta");
      expect(info.nodePath).toBe("/dir/file.txt");
      expect(info.resourcePath).toBeNull();
      expect(info.isKindsPath).toBe(false);
    });

    test("parses file meta resource: /dir/file.txt/.meta/thumbnail.png", () => {
      const info = parseMetaPath("/dir/file.txt/.meta/thumbnail.png");
      expect(info.nodePath).toBe("/dir/file.txt");
      expect(info.resourcePath).toBe("thumbnail.png");
      expect(info.isKindsPath).toBe(false);
    });

    test("parses root meta path: /.meta", () => {
      const info = parseMetaPath("/.meta");
      expect(info.nodePath).toBe("/");
      expect(info.resourcePath).toBeNull();
      expect(info.isKindsPath).toBe(false);
    });

    test("parses kinds list path: /.meta/.kinds", () => {
      const info = parseMetaPath("/.meta/.kinds");
      expect(info.nodePath).toBe("/");
      expect(info.resourcePath).toBeNull();
      expect(info.isKindsPath).toBe(true);
      expect(info.kindName).toBeNull();
    });

    test("parses specific kind path: /.meta/.kinds/chamber:project", () => {
      const info = parseMetaPath("/.meta/.kinds/chamber:project");
      expect(info.nodePath).toBe("/");
      expect(info.resourcePath).toBeNull();
      expect(info.isKindsPath).toBe(true);
      expect(info.kindName).toBe("chamber:project");
    });

    test("parses kind path with afs prefix: /.meta/.kinds/afs:node", () => {
      const info = parseMetaPath("/.meta/.kinds/afs:node");
      expect(info.isKindsPath).toBe(true);
      expect(info.kindName).toBe("afs:node");
    });
  });

  describe("Bad Path", () => {
    test("throws for empty path", () => {
      expect(() => parseMetaPath("")).toThrow();
    });

    test("throws for path without .meta", () => {
      expect(() => parseMetaPath("/dir/file.txt")).toThrow();
    });

    test("throws for relative path", () => {
      expect(() => parseMetaPath("dir/.meta")).toThrow();
    });
  });

  describe("Edge Cases", () => {
    test("handles root kinds path", () => {
      const info = parseMetaPath("/.meta/.kinds");
      expect(info.nodePath).toBe("/");
      expect(info.isKindsPath).toBe(true);
    });

    test("handles path with multiple dots in filename", () => {
      const info = parseMetaPath("/dir/file.test.ts/.meta");
      expect(info.nodePath).toBe("/dir/file.test.ts");
    });

    test("normalizes path with .. components before .meta", () => {
      const info = parseMetaPath("/dir/../other/.meta");
      expect(info.nodePath).toBe("/other");
    });

    test("normalizes path with . components", () => {
      const info = parseMetaPath("/dir/./subdir/.meta");
      expect(info.nodePath).toBe("/dir/subdir");
    });
  });

  describe("Security", () => {
    test("normalizes path traversal: /dir/../.meta returns / meta", () => {
      const info = parseMetaPath("/dir/../.meta");
      expect(info.nodePath).toBe("/");
    });

    test("prevents escape above root with multiple ..", () => {
      const info = parseMetaPath("/dir/../../.meta");
      expect(info.nodePath).toBe("/");
    });

    test("throws for path with control characters", () => {
      expect(() => parseMetaPath("/dir\x00/.meta")).toThrow(AFSPathError);
    });
  });
});

describe("isKindsPath", () => {
  test("returns true for kinds list path: /.meta/.kinds", () => {
    expect(isKindsPath("/.meta/.kinds")).toBe(true);
  });

  test("returns true for specific kind path: /.meta/.kinds/chamber:project", () => {
    expect(isKindsPath("/.meta/.kinds/chamber:project")).toBe(true);
  });

  test("returns false for regular meta path: /dir/.meta", () => {
    expect(isKindsPath("/dir/.meta")).toBe(false);
  });

  test("returns false for meta resource path: /dir/.meta/icon.png", () => {
    expect(isKindsPath("/dir/.meta/icon.png")).toBe(false);
  });

  test("returns false for non-meta path", () => {
    expect(isKindsPath("/dir/file.txt")).toBe(false);
  });

  test("returns false for empty path", () => {
    expect(isKindsPath("")).toBe(false);
  });

  test("returns false for .kinds not under .meta", () => {
    // .kinds must be under .meta
    expect(isKindsPath("/dir/.kinds")).toBe(false);
  });
});

describe("getNodePathFromMetaPath", () => {
  test("extracts node path from directory meta: /dir/.meta -> /dir", () => {
    expect(getNodePathFromMetaPath("/dir/.meta")).toBe("/dir");
  });

  test("extracts node path from meta resource: /dir/.meta/icon.png -> /dir", () => {
    expect(getNodePathFromMetaPath("/dir/.meta/icon.png")).toBe("/dir");
  });

  test("extracts node path from file meta: /dir/file.txt/.meta -> /dir/file.txt", () => {
    expect(getNodePathFromMetaPath("/dir/file.txt/.meta")).toBe("/dir/file.txt");
  });

  test("extracts node path from root meta: /.meta -> /", () => {
    expect(getNodePathFromMetaPath("/.meta")).toBe("/");
  });

  test("extracts node path from kinds path: /.meta/.kinds -> /", () => {
    expect(getNodePathFromMetaPath("/.meta/.kinds")).toBe("/");
  });

  test("extracts node path from specific kind path: /.meta/.kinds/afs:node -> /", () => {
    expect(getNodePathFromMetaPath("/.meta/.kinds/afs:node")).toBe("/");
  });

  test("throws for non-meta path", () => {
    expect(() => getNodePathFromMetaPath("/dir/file.txt")).toThrow();
  });

  test("throws for empty path", () => {
    expect(() => getNodePathFromMetaPath("")).toThrow();
  });
});
