import { describe, expect, test } from "bun:test";
import type { KindSchema, NodesConstraints } from "@aigne/afs";
import { createKindResolver, defineKind, validateNodes } from "@aigne/afs";

describe("validateNodes - Node Constraint Validation", () => {
  const nodesConstraints: NodesConstraints = {
    required: [{ path: "src" }, { path: "README.md" }],
    optional: [{ path: "docs" }, { path: "*.config.js" }],
    allowOther: true,
  };

  describe("Required Nodes Validation", () => {
    test("validates all required nodes present passes", () => {
      const nodeList = ["src", "README.md", "docs"];
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(true);
    });

    test("validates missing required node fails", () => {
      const nodeList = ["README.md"]; // Missing src
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.path).toBe("/project/src");
    });

    test("validates all required nodes missing fails with multiple errors", () => {
      const nodeList = ["other"];
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Optional Nodes Validation", () => {
    test("validates optional node present passes", () => {
      const nodeList = ["src", "README.md", "docs"];
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(true);
    });

    test("validates optional node absent passes", () => {
      const nodeList = ["src", "README.md"]; // No docs
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(true);
    });
  });

  describe("Glob Pattern Matching", () => {
    test("validates glob pattern *.config.js matches", () => {
      const nodeList = ["src", "README.md", "babel.config.js"];
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(true);
    });

    test("validates glob pattern *.md matches", () => {
      const constraints: NodesConstraints = {
        required: [{ path: "*.md" }],
      };
      const nodeList = ["README.md"];
      const result = validateNodes("/project", nodeList, constraints);
      expect(result.valid).toBe(true);
    });

    test("validates deep glob **/*.ts", () => {
      const constraints: NodesConstraints = {
        required: [{ path: "**/*.ts" }],
      };
      const nodeList = ["src/index.ts", "src/utils/helper.ts"];
      const result = validateNodes("/project", nodeList, constraints);
      expect(result.valid).toBe(true);
    });
  });

  describe("allowOther Flag", () => {
    test("validates allowOther=true allows undefined nodes", () => {
      const nodeList = ["src", "README.md", "random-file.txt"];
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(true);
    });

    test("validates allowOther=false rejects undefined nodes", () => {
      const strictConstraints: NodesConstraints = {
        required: [{ path: "src" }],
        allowOther: false,
      };
      const nodeList = ["src", "unexpected-file.txt"];
      const result = validateNodes("/project", nodeList, strictConstraints);
      expect(result.valid).toBe(false);
      expect(result.errors[0]?.message).toContain("nexpected");
    });

    test("validates allowOther=undefined defaults to true", () => {
      const defaultConstraints: NodesConstraints = {
        required: [{ path: "src" }],
      };
      const nodeList = ["src", "extra-file.txt"];
      const result = validateNodes("/project", nodeList, defaultConstraints);
      expect(result.valid).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("validates empty required array passes", () => {
      const emptyConstraints: NodesConstraints = {
        required: [],
      };
      const nodeList = ["any-file.txt"];
      const result = validateNodes("/project", nodeList, emptyConstraints);
      expect(result.valid).toBe(true);
    });

    test("validates undefined constraints passes", () => {
      const nodeList = ["any-file.txt"];
      const result = validateNodes("/project", nodeList, undefined);
      expect(result.valid).toBe(true);
    });

    test("validates empty node list with required fails", () => {
      const nodeList: string[] = [];
      const result = validateNodes("/project", nodeList, nodesConstraints);
      expect(result.valid).toBe(false);
    });
  });
});

describe("Kind Meta Validation with JSON Schema", () => {
  describe("String Type Validation", () => {
    const stringKind = defineKind({
      name: "test:string",
      meta: {
        type: "object",
        properties: {
          value: { type: "string" },
        },
      },
    });

    test("validates string value passes", () => {
      const result = stringKind.validate({ value: "hello" });
      expect(result.valid).toBe(true);
    });

    test("validates empty string passes", () => {
      const result = stringKind.validate({ value: "" });
      expect(result.valid).toBe(true);
    });

    test("validates number as string fails", () => {
      const result = stringKind.validate({ value: 123 });
      expect(result.valid).toBe(false);
    });
  });

  describe("Number Type Validation", () => {
    const numberKind = defineKind({
      name: "test:number",
      meta: {
        type: "object",
        properties: {
          count: { type: "number" },
          age: { type: "integer" },
        },
      },
    });

    test("validates number value passes", () => {
      const result = numberKind.validate({ count: 42 });
      expect(result.valid).toBe(true);
    });

    test("validates zero passes", () => {
      const result = numberKind.validate({ count: 0 });
      expect(result.valid).toBe(true);
    });

    test("validates negative number passes", () => {
      const result = numberKind.validate({ count: -100 });
      expect(result.valid).toBe(true);
    });

    test("validates float passes", () => {
      const result = numberKind.validate({ count: 3.14 });
      expect(result.valid).toBe(true);
    });

    test("validates string as number fails", () => {
      const result = numberKind.validate({ count: "42" });
      expect(result.valid).toBe(false);
    });

    test("validates integer type rejects float", () => {
      const result = numberKind.validate({ age: 25.5 });
      expect(result.valid).toBe(false);
    });
  });

  describe("Boolean Type Validation", () => {
    const boolKind = defineKind({
      name: "test:bool",
      meta: {
        type: "object",
        properties: {
          active: { type: "boolean" },
        },
      },
    });

    test("validates true passes", () => {
      const result = boolKind.validate({ active: true });
      expect(result.valid).toBe(true);
    });

    test("validates false passes", () => {
      const result = boolKind.validate({ active: false });
      expect(result.valid).toBe(true);
    });

    test("validates string 'true' as boolean fails", () => {
      const result = boolKind.validate({ active: "true" });
      expect(result.valid).toBe(false);
    });

    test("validates 1 as boolean fails", () => {
      const result = boolKind.validate({ active: 1 });
      expect(result.valid).toBe(false);
    });
  });

  describe("Enum Type Validation", () => {
    const enumKind = defineKind({
      name: "test:enum",
      meta: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "archived", "draft"] },
        },
      },
    });

    test("validates valid enum value passes", () => {
      const result = enumKind.validate({ status: "active" });
      expect(result.valid).toBe(true);
    });

    test("validates all enum values pass", () => {
      for (const status of ["active", "archived", "draft"]) {
        const result = enumKind.validate({ status });
        expect(result.valid).toBe(true);
      }
    });

    test("validates invalid enum value fails", () => {
      const result = enumKind.validate({ status: "invalid" });
      expect(result.valid).toBe(false);
    });

    test("validates case-sensitive enum", () => {
      const result = enumKind.validate({ status: "ACTIVE" });
      expect(result.valid).toBe(false);
    });
  });

  describe("Array Type Validation", () => {
    const arrayKind = defineKind({
      name: "test:array",
      meta: {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    });

    test("validates array of strings passes", () => {
      const result = arrayKind.validate({ tags: ["a", "b", "c"] });
      expect(result.valid).toBe(true);
    });

    test("validates empty array passes", () => {
      const result = arrayKind.validate({ tags: [] });
      expect(result.valid).toBe(true);
    });

    test("validates non-array fails", () => {
      const result = arrayKind.validate({ tags: "not an array" });
      expect(result.valid).toBe(false);
    });

    test("validates array with invalid item type fails", () => {
      const result = arrayKind.validate({ tags: [1, 2, 3] });
      expect(result.valid).toBe(false);
    });
  });

  describe("Required Field Validation", () => {
    const requiredKind = defineKind({
      name: "test:required",
      meta: {
        type: "object",
        properties: {
          name: { type: "string" },
          optional: { type: "string" },
        },
        required: ["name"],
      },
    });

    test("validates required field present passes", () => {
      const result = requiredKind.validate({ name: "value" });
      expect(result.valid).toBe(true);
    });

    test("validates missing required field fails", () => {
      const result = requiredKind.validate({});
      expect(result.valid).toBe(false);
    });

    test("validates optional field absent passes", () => {
      const result = requiredKind.validate({ name: "test" });
      expect(result.valid).toBe(true);
    });
  });

  describe("Number Constraints", () => {
    const constrainedKind = defineKind({
      name: "test:constrained",
      meta: {
        type: "object",
        properties: {
          age: { type: "integer", minimum: 0, maximum: 150 },
          score: { type: "number", minimum: 0 },
        },
      },
    });

    test("validates value within range passes", () => {
      const result = constrainedKind.validate({ age: 25, score: 95.5 });
      expect(result.valid).toBe(true);
    });

    test("validates value at boundary passes", () => {
      const result = constrainedKind.validate({ age: 0, score: 0 });
      expect(result.valid).toBe(true);
    });

    test("validates value below minimum fails", () => {
      const result = constrainedKind.validate({ age: -1 });
      expect(result.valid).toBe(false);
    });

    test("validates value above maximum fails", () => {
      const result = constrainedKind.validate({ age: 200 });
      expect(result.valid).toBe(false);
    });
  });

  describe("String Pattern Validation", () => {
    const patternKind = defineKind({
      name: "test:pattern",
      meta: {
        type: "object",
        properties: {
          email: { type: "string", pattern: "^[^@]+@[^@]+\\.[^@]+$" },
          version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
        },
      },
    });

    test("validates matching pattern passes", () => {
      const result = patternKind.validate({
        email: "test@example.com",
        version: "1.2.3",
      });
      expect(result.valid).toBe(true);
    });

    test("validates non-matching pattern fails", () => {
      const result = patternKind.validate({ email: "invalid-email" });
      expect(result.valid).toBe(false);
    });
  });
});

describe("Layer-by-Layer Validation with Inheritance", () => {
  const testKinds: KindSchema[] = [
    {
      name: "test:base",
      meta: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "test:project",
      extends: "test:base",
      meta: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "archived"] },
        },
      },
    },
    {
      name: "test:advanced",
      extends: "test:project",
      meta: {
        type: "object",
        properties: {
          version: { type: "string" },
        },
        required: ["version"],
      },
    },
  ];

  const resolver = createKindResolver(testKinds);

  test("validates against all layers in inheritance chain", () => {
    const kind = defineKind(testKinds[2]!);

    // Missing name (from base) and version (from advanced)
    const result = kind.validate({}, resolver);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("passes when all layers are satisfied", () => {
    const kind = defineKind(testKinds[2]!);

    const result = kind.validate(
      {
        name: "My Project",
        status: "active",
        version: "1.0.0",
      },
      resolver,
    );
    expect(result.valid).toBe(true);
  });

  test("reports errors with layer context", () => {
    const kind = defineKind(testKinds[1]!);

    const result = kind.validate({ status: "invalid" }, resolver);
    expect(result.valid).toBe(false);

    // Should have errors from both layers
    const hasBaseError = result.errors.some((e) => e.message.includes("test:base"));
    const hasProjectError = result.errors.some((e) => e.message.includes("test:project"));
    expect(hasBaseError).toBe(true);
    expect(hasProjectError).toBe(true);
  });
});

describe("Kind without Meta Schema", () => {
  test("kind without meta always passes validation", () => {
    const emptyKind = defineKind({
      name: "test:empty",
    });

    const result = emptyKind.validate({ anything: "goes", nested: { deep: true } });
    expect(result.valid).toBe(true);
  });

  test("validate with resolver also passes when no meta", () => {
    const emptyKind = defineKind({
      name: "test:empty",
    });

    const result = emptyKind.validate({ anything: "goes" });
    expect(result.valid).toBe(true);
  });
});

describe("ValidationResult Structure", () => {
  const testKind = defineKind({
    name: "test:structure",
    meta: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    },
  });

  test("returns valid: true with empty errors array", () => {
    const result = testKind.validate({ name: "valid" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("returns valid: false with populated errors array", () => {
    const result = testKind.validate({ name: 123 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("error object has required fields", () => {
    const result = testKind.validate({ name: 123 });
    const error = result.errors[0];
    expect(error).toHaveProperty("path");
    expect(error).toHaveProperty("message");
  });
});
