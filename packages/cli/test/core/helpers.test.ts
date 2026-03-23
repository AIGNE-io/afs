/**
 * Tests for core helpers module
 *
 * Tests parseExecArgs, parseValueBySchema, and schemaTypeToYargs.
 */

import { describe, expect, test } from "bun:test";
import {
  parseExecArgs,
  parseValueBySchema,
  RESERVED_OPTIONS,
  schemaTypeToYargs,
} from "../../src/core/helpers/index.js";
import type { JSONSchema } from "../../src/core/types.js";

describe("RESERVED_OPTIONS", () => {
  test("should contain common CLI options", () => {
    expect(RESERVED_OPTIONS.has("json")).toBe(true);
    expect(RESERVED_OPTIONS.has("yaml")).toBe(true);
    expect(RESERVED_OPTIONS.has("view")).toBe(true);
    expect(RESERVED_OPTIONS.has("help")).toBe(true);
    expect(RESERVED_OPTIONS.has("_")).toBe(true);
    expect(RESERVED_OPTIONS.has("$0")).toBe(true);
    expect(RESERVED_OPTIONS.has("executable_path")).toBe(true);
    expect(RESERVED_OPTIONS.has("executablePath")).toBe(true);
    expect(RESERVED_OPTIONS.has("action")).toBe(false);
  });
});

describe("schemaTypeToYargs", () => {
  test("should convert integer to number", () => {
    expect(schemaTypeToYargs("integer")).toBe("number");
  });

  test("should convert number to number", () => {
    expect(schemaTypeToYargs("number")).toBe("number");
  });

  test("should convert boolean to boolean", () => {
    expect(schemaTypeToYargs("boolean")).toBe("boolean");
  });

  test("should convert array to string (for JSON parsing)", () => {
    expect(schemaTypeToYargs("array")).toBe("string");
  });

  test("should convert string to string", () => {
    expect(schemaTypeToYargs("string")).toBe("string");
  });

  test("should convert object to string", () => {
    expect(schemaTypeToYargs("object")).toBe("string");
  });

  test("should convert undefined to string", () => {
    expect(schemaTypeToYargs(undefined)).toBe("string");
  });
});

describe("parseExecArgs", () => {
  const schema: JSONSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      count: { type: "integer" },
      price: { type: "number" },
      active: { type: "boolean" },
      items: { type: "array" },
      config: { type: "object" },
    },
  };

  describe("basic type coercion", () => {
    test("should keep string as-is", () => {
      const result = parseExecArgs({ name: "test" }, schema);
      expect(result.name).toBe("test");
    });

    test("should parse integer from string", () => {
      const result = parseExecArgs({ count: "42" }, schema);
      expect(result.count).toBe(42);
    });

    test("should parse number from string", () => {
      const result = parseExecArgs({ price: "19.99" }, schema);
      expect(result.price).toBe(19.99);
    });

    test("should parse boolean from string", () => {
      expect(parseExecArgs({ active: "true" }, schema).active).toBe(true);
      expect(parseExecArgs({ active: "false" }, schema).active).toBe(false);
    });

    test("should parse array from JSON string", () => {
      const result = parseExecArgs({ items: '["a","b","c"]' }, schema);
      expect(result.items).toEqual(["a", "b", "c"]);
    });

    test("should parse object from JSON string", () => {
      const result = parseExecArgs({ config: '{"key":"value"}' }, schema);
      expect(result.config).toEqual({ key: "value" });
    });
  });

  describe("--args JSON parsing", () => {
    test("should parse --args JSON object", () => {
      const result = parseExecArgs({ args: '{"name":"from-args","count":"10"}' }, schema);
      expect(result.name).toBe("from-args");
      expect(result.count).toBe("10"); // --args values are not schema-coerced
    });

    test("should throw on invalid --args JSON", () => {
      expect(() => parseExecArgs({ args: "{invalid}" }, schema)).toThrow(/Invalid JSON in --args/);
    });

    test("CLI options should override --args", () => {
      const result = parseExecArgs(
        {
          args: '{"name":"from-args"}',
          name: "from-cli",
        },
        schema,
      );
      expect(result.name).toBe("from-cli");
    });
  });

  describe("reserved options filtering", () => {
    test("should filter out reserved CLI options", () => {
      const result = parseExecArgs(
        {
          name: "test",
          json: true,
          yaml: true,
          view: "human",
          help: true,
          h: true,
          version: true,
          V: true,
          _: ["/path"],
          $0: "afs",
          executable_path: "/some/action",
          executablePath: "/some/action",
          args: '{"extra":"value"}',
        },
        schema,
      );

      expect(result).toEqual({
        name: "test",
        extra: "value",
      });
    });

    test("should allow 'action' as schema property since it is not reserved", () => {
      const schemaWithAction: JSONSchema = {
        type: "object",
        properties: {
          action: { type: "string", description: "Action type" },
          name: { type: "string" },
        },
      };
      const result = parseExecArgs(
        {
          action: "create",
          name: "test",
          executable_path: "/some/path",
        },
        schemaWithAction,
      );
      expect(result).toEqual({
        action: "create",
        name: "test",
      });
    });

    test("should allow 'path' as action parameter when defined in schema", () => {
      const schemaWithPath: JSONSchema = {
        type: "object",
        properties: {
          path: { type: "string", description: "Mount path" },
          uri: { type: "string", description: "Provider URI" },
        },
        required: ["path", "uri"],
      };
      const result = parseExecArgs(
        {
          path: "/sqlite",
          uri: "sqlite:///test.db",
          executable_path: "/.actions/add",
        },
        schemaWithPath,
      );
      expect(result).toEqual({
        path: "/sqlite",
        uri: "sqlite:///test.db",
      });
    });

    test("should filter undefined and null values", () => {
      const result = parseExecArgs(
        {
          name: "test",
          count: undefined,
          price: null,
        } as Record<string, unknown>,
        schema,
      );

      expect(result).toEqual({ name: "test" });
    });
  });

  describe("backward compatibility", () => {
    test("should work without schema", () => {
      const result = parseExecArgs({
        name: "test",
        count: "42",
      });

      // Without schema, values stay as strings
      expect(result.name).toBe("test");
      expect(result.count).toBe("42");
    });

    test("should pass through already-parsed values", () => {
      const result = parseExecArgs(
        {
          count: 42, // already a number
          active: true, // already a boolean
          items: ["a", "b"], // already an array
        },
        schema,
      );

      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.items).toEqual(["a", "b"]);
    });
  });
});

describe("parseValueBySchema", () => {
  describe("type coercion", () => {
    test("should return non-string values as-is", () => {
      expect(parseValueBySchema(42, { type: "integer" }, "num")).toBe(42);
      expect(parseValueBySchema(true, { type: "boolean" }, "flag")).toBe(true);
      expect(parseValueBySchema(["a"], { type: "array" }, "arr")).toEqual(["a"]);
    });

    test("should return string as-is when no schema", () => {
      expect(parseValueBySchema("test", undefined, "field")).toBe("test");
    });

    test("should return string as-is for string type", () => {
      expect(parseValueBySchema("test", { type: "string" }, "field")).toBe("test");
    });

    test("should return string as-is for unknown type", () => {
      expect(parseValueBySchema("test", { type: "custom" as any }, "field")).toBe("test");
    });
  });

  describe("error handling", () => {
    test("should throw on invalid integer", () => {
      expect(() => parseValueBySchema("abc", { type: "integer" }, "count")).toThrow(
        /Invalid integer for 'count'/,
      );
    });

    test("should throw on invalid number", () => {
      expect(() => parseValueBySchema("xyz", { type: "number" }, "price")).toThrow(
        /Invalid number for 'price'/,
      );
    });

    test("should throw on invalid boolean", () => {
      expect(() => parseValueBySchema("yes", { type: "boolean" }, "flag")).toThrow(
        /Invalid boolean for 'flag'/,
      );
    });

    test("should throw on invalid JSON for array", () => {
      expect(() => parseValueBySchema("[invalid]", { type: "array" }, "items")).toThrow(
        /Invalid JSON for 'items'/,
      );
    });

    test("should throw on invalid JSON for object", () => {
      expect(() => parseValueBySchema("{bad}", { type: "object" }, "config")).toThrow(
        /Invalid JSON for 'config'/,
      );
    });

    test("should include hint in error message", () => {
      try {
        parseValueBySchema("[bad]", { type: "array" }, "items");
      } catch (e) {
        expect((e as Error).message).toContain("Arrays use [...]");
      }

      try {
        parseValueBySchema("{bad}", { type: "object" }, "config");
      } catch (e) {
        expect((e as Error).message).toContain("Objects use {...}");
      }
    });
  });
});
