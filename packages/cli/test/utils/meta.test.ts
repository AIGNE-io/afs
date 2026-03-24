import { describe, expect, test } from "bun:test";
import { getNodePath, inferType, isMetaPath, parseSetOptions } from "../../src/utils/meta.js";

describe("isMetaPath", () => {
  test("returns true for /.meta", () => {
    expect(isMetaPath("/.meta")).toBe(true);
  });

  test("returns true for /path/.meta", () => {
    expect(isMetaPath("/path/.meta")).toBe(true);
  });

  test("returns true for /path/to/file.txt/.meta", () => {
    expect(isMetaPath("/path/to/file.txt/.meta")).toBe(true);
  });

  test("returns true for /path/.meta/resource.png", () => {
    expect(isMetaPath("/path/.meta/resource.png")).toBe(true);
  });

  test("returns false for regular path", () => {
    expect(isMetaPath("/path/to/file.txt")).toBe(false);
  });

  test("returns false for path containing meta but not .meta", () => {
    expect(isMetaPath("/path/metadata/file.txt")).toBe(false);
  });

  test("returns false for path ending with .meta file extension", () => {
    expect(isMetaPath("/path/file.meta")).toBe(false);
  });
});

describe("getNodePath", () => {
  test("extracts node path from /.meta", () => {
    expect(getNodePath("/.meta")).toBe("/");
  });

  test("extracts node path from /dir/.meta", () => {
    expect(getNodePath("/dir/.meta")).toBe("/dir");
  });

  test("extracts node path from /dir/file.txt/.meta", () => {
    expect(getNodePath("/dir/file.txt/.meta")).toBe("/dir/file.txt");
  });

  test("extracts node path from nested path", () => {
    expect(getNodePath("/a/b/c/d/.meta")).toBe("/a/b/c/d");
  });

  test("extracts node path from meta resource path", () => {
    expect(getNodePath("/dir/.meta/icon.png")).toBe("/dir");
  });

  test("extracts node path from deep meta resource path", () => {
    expect(getNodePath("/dir/.meta/resources/icon.png")).toBe("/dir");
  });
});

describe("inferType", () => {
  describe("empty string", () => {
    test("returns empty string for empty input", () => {
      expect(inferType("")).toBe("");
    });
  });

  describe("boolean", () => {
    test("returns true for 'true'", () => {
      expect(inferType("true")).toBe(true);
    });

    test("returns false for 'false'", () => {
      expect(inferType("false")).toBe(false);
    });

    test("returns string for 'TRUE' (case sensitive)", () => {
      expect(inferType("TRUE")).toBe("TRUE");
    });

    test("returns string for 'False' (case sensitive)", () => {
      expect(inferType("False")).toBe("False");
    });
  });

  describe("number", () => {
    test("returns number for integer", () => {
      expect(inferType("42")).toBe(42);
    });

    test("returns number for zero", () => {
      expect(inferType("0")).toBe(0);
    });

    test("returns number for negative integer", () => {
      expect(inferType("-42")).toBe(-42);
    });

    test("returns number for decimal", () => {
      expect(inferType("3.14")).toBe(3.14);
    });

    test("returns number for negative decimal", () => {
      expect(inferType("-3.14")).toBe(-3.14);
    });

    test("returns string for number with leading zeros", () => {
      expect(inferType("007")).toBe("007");
    });

    test("returns string for number with trailing text", () => {
      expect(inferType("42abc")).toBe("42abc");
    });

    test("returns string for number with spaces", () => {
      expect(inferType(" 42")).toBe(" 42");
    });
  });

  describe("string", () => {
    test("returns string for regular text", () => {
      expect(inferType("hello")).toBe("hello");
    });

    test("returns string for text with special characters", () => {
      expect(inferType("hello world!")).toBe("hello world!");
    });

    test("returns string for emoji", () => {
      expect(inferType("🏗️")).toBe("🏗️");
    });

    test("returns string for path-like value", () => {
      expect(inferType("/path/to/file")).toBe("/path/to/file");
    });
  });
});

describe("parseSetOptions", () => {
  test("parses single key=value", () => {
    const result = parseSetOptions(["status=active"]);
    expect(result).toEqual({ status: "active" });
  });

  test("parses multiple key=value pairs", () => {
    const result = parseSetOptions(["name=My Project", "status=active"]);
    expect(result).toEqual({ name: "My Project", status: "active" });
  });

  test("infers boolean type", () => {
    const result = parseSetOptions(["enabled=true", "disabled=false"]);
    expect(result).toEqual({ enabled: true, disabled: false });
  });

  test("infers number type", () => {
    const result = parseSetOptions(["count=42", "ratio=3.14"]);
    expect(result).toEqual({ count: 42, ratio: 3.14 });
  });

  test("handles empty value", () => {
    const result = parseSetOptions(["icon="]);
    expect(result).toEqual({ icon: "" });
  });

  test("handles value with equals sign", () => {
    const result = parseSetOptions(["equation=a=b+c"]);
    expect(result).toEqual({ equation: "a=b+c" });
  });

  test("handles emoji value", () => {
    const result = parseSetOptions(["icon=🏗️"]);
    expect(result).toEqual({ icon: "🏗️" });
  });

  test("handles quoted value with spaces", () => {
    const result = parseSetOptions(["name=My Project"]);
    expect(result).toEqual({ name: "My Project" });
  });

  test("throws error for invalid format without equals", () => {
    expect(() => parseSetOptions(["invalid"])).toThrow(
      "Invalid --set format: invalid. Expected key=value",
    );
  });

  test("handles empty array", () => {
    const result = parseSetOptions([]);
    expect(result).toEqual({});
  });

  test("overwrites duplicate keys with last value", () => {
    const result = parseSetOptions(["status=draft", "status=active"]);
    expect(result).toEqual({ status: "active" });
  });
});
