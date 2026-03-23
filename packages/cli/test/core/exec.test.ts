/**
 * Tests for core exec command functions
 *
 * Tests schema-aware argument parsing:
 * - parseExecArgs with inputSchema
 * - parseValueBySchema for type coercion
 */

import { describe, expect, test } from "bun:test";
import { parseExecArgs, parseValueBySchema } from "../../src/core/commands/exec.js";
import type { JSONSchema } from "../../src/core/types.js";

describe("parseExecArgs with schema", () => {
  const schema: JSONSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "integer" },
      score: { type: "number" },
      active: { type: "boolean" },
      tags: { type: "array" },
      config: { type: "object" },
    },
  };

  test("should parse string as-is", () => {
    const result = parseExecArgs({ name: "test" }, schema);
    expect(result.name).toBe("test");
  });

  test("should parse integer from string", () => {
    const result = parseExecArgs({ age: "25" }, schema);
    expect(result.age).toBe(25);
  });

  test("should floor integer values", () => {
    const result = parseExecArgs({ age: "25.7" }, schema);
    expect(result.age).toBe(25);
  });

  test("should parse number (float) from string", () => {
    const result = parseExecArgs({ score: "3.14" }, schema);
    expect(result.score).toBe(3.14);
  });

  test("should parse boolean true from string", () => {
    const result = parseExecArgs({ active: "true" }, schema);
    expect(result.active).toBe(true);
  });

  test("should parse boolean false from string", () => {
    const result = parseExecArgs({ active: "false" }, schema);
    expect(result.active).toBe(false);
  });

  test("should parse array from JSON string", () => {
    const result = parseExecArgs({ tags: '["a","b","c"]' }, schema);
    expect(result.tags).toEqual(["a", "b", "c"]);
  });

  test("should parse object from JSON string", () => {
    const result = parseExecArgs({ config: '{"key":"value","num":42}' }, schema);
    expect(result.config).toEqual({ key: "value", num: 42 });
  });

  test("should handle already-parsed values from yargs", () => {
    // yargs may pre-parse some values
    const result = parseExecArgs(
      {
        age: 25, // already a number
        active: true, // already a boolean
        tags: ["a", "b"], // already an array
      },
      schema,
    );
    expect(result.age).toBe(25);
    expect(result.active).toBe(true);
    expect(result.tags).toEqual(["a", "b"]);
  });

  test("should handle --args JSON with schema coercion", () => {
    const result = parseExecArgs(
      {
        args: '{"name": "from-json", "age": 30}',
        name: "from-cli", // CLI takes precedence
      },
      schema,
    );
    expect(result.name).toBe("from-cli");
    expect(result.age).toBe(30);
  });

  test("should work without schema (backward compatibility)", () => {
    const result = parseExecArgs({
      name: "test",
      count: "42",
    });
    // Without schema, string values stay as strings
    expect(result.name).toBe("test");
    expect(result.count).toBe("42");
  });

  test("should filter reserved CLI options", () => {
    const result = parseExecArgs(
      {
        name: "test",
        json: true,
        yaml: true,
        view: "human",
        help: true,
        _: ["/path"],
        $0: "afs",
      },
      schema,
    );
    expect(result).toEqual({ name: "test" });
  });
});

describe("parseValueBySchema error handling", () => {
  test("should throw on invalid integer", () => {
    expect(() => parseValueBySchema("abc", { type: "integer" }, "age")).toThrow(
      /Invalid integer for 'age'/,
    );
  });

  test("should throw on invalid number", () => {
    expect(() => parseValueBySchema("not-a-number", { type: "number" }, "score")).toThrow(
      /Invalid number for 'score'/,
    );
  });

  test("should throw on invalid boolean", () => {
    expect(() => parseValueBySchema("yes", { type: "boolean" }, "active")).toThrow(
      /Invalid boolean for 'active'/,
    );
  });

  test("should throw on invalid JSON for array", () => {
    expect(() => parseValueBySchema("[invalid]", { type: "array" }, "tags")).toThrow(
      /Invalid JSON for 'tags'/,
    );
  });

  test("should throw on invalid JSON for object", () => {
    expect(() => parseValueBySchema("{bad}", { type: "object" }, "config")).toThrow(
      /Invalid JSON for 'config'/,
    );
  });

  test("should include hint in array JSON error", () => {
    try {
      parseValueBySchema("[invalid]", { type: "array" }, "tags");
    } catch (e) {
      expect((e as Error).message).toContain("Arrays use [...]");
    }
  });

  test("should include hint in object JSON error", () => {
    try {
      parseValueBySchema("{bad}", { type: "object" }, "config");
    } catch (e) {
      expect((e as Error).message).toContain("Objects use {...}");
    }
  });
});

describe("parseValueBySchema edge cases", () => {
  test("should return string as-is for string type", () => {
    const result = parseValueBySchema("hello", { type: "string" }, "name");
    expect(result).toBe("hello");
  });

  test("should return string as-is for unknown type", () => {
    const result = parseValueBySchema("hello", { type: "unknown" as any }, "field");
    expect(result).toBe("hello");
  });

  test("should return string as-is when no schema", () => {
    const result = parseValueBySchema("hello", undefined, "field");
    expect(result).toBe("hello");
  });

  test("should handle null schema type", () => {
    const result = parseValueBySchema("hello", { type: "null" }, "field");
    expect(result).toBe("hello");
  });

  test("should pass through non-string values unchanged", () => {
    expect(parseValueBySchema(42, { type: "integer" }, "num")).toBe(42);
    expect(parseValueBySchema(true, { type: "boolean" }, "flag")).toBe(true);
    expect(parseValueBySchema(["a"], { type: "array" }, "arr")).toEqual(["a"]);
    expect(parseValueBySchema({ x: 1 }, { type: "object" }, "obj")).toEqual({ x: 1 });
  });
});

describe("complex schema scenarios", () => {
  test("should handle nested object in array", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        columns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
            },
          },
        },
      },
    };

    const result = parseExecArgs(
      {
        columns: '[{"name":"id","type":"INTEGER"},{"name":"name","type":"TEXT"}]',
      },
      schema,
    );

    expect(result.columns).toEqual([
      { name: "id", type: "INTEGER" },
      { name: "name", type: "TEXT" },
    ]);
  });

  test("should handle deeply nested object", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        data: { type: "object" },
      },
    };

    const result = parseExecArgs(
      {
        data: '{"user":{"name":"Alice","address":{"city":"NYC"}}}',
      },
      schema,
    );

    expect(result.data).toEqual({
      user: {
        name: "Alice",
        address: { city: "NYC" },
      },
    });
  });

  test("should handle mixed types in single call", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
        price: { type: "number" },
        enabled: { type: "boolean" },
        items: { type: "array" },
        meta: { type: "object" },
      },
    };

    const result = parseExecArgs(
      {
        name: "test",
        count: "5",
        price: "9.99",
        enabled: "true",
        items: '["a","b"]',
        meta: '{"key":"value"}',
      },
      schema,
    );

    expect(result).toEqual({
      name: "test",
      count: 5,
      price: 9.99,
      enabled: true,
      items: ["a", "b"],
      meta: { key: "value" },
    });
  });
});
