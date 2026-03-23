import { describe, expect, test } from "bun:test";
import type {
  AFSExplainResult,
  JSONSchema7,
  KindSchema,
  MetaPathInfo,
  NodeConstraint,
  NodesConstraints,
  ValidationResult,
} from "@aigne/afs";

describe("NodeConstraint structure", () => {
  test("simple path constraint", () => {
    const constraint: NodeConstraint = {
      path: "src",
    };
    expect(constraint.path).toBe("src");
  });

  test("path constraint with kind", () => {
    const constraint: NodeConstraint = {
      path: "src",
      kind: "chamber:source",
    };
    expect(constraint.kind).toBe("chamber:source");
  });

  test("recursive nested nodes constraint", () => {
    const constraint: NodeConstraint = {
      path: "src",
      kind: "chamber:source",
      nodes: {
        optional: [{ path: "components", kind: "chamber:components" }, { path: "utils" }],
      },
    };
    expect(constraint.nodes?.optional).toHaveLength(2);
    expect(constraint.nodes?.optional?.[0]?.kind).toBe("chamber:components");
  });

  test("glob pattern path", () => {
    const constraint: NodeConstraint = {
      path: "*.md",
    };
    expect(constraint.path).toBe("*.md");
  });

  test("deep glob pattern", () => {
    const constraint: NodeConstraint = {
      path: "test/**",
    };
    expect(constraint.path).toBe("test/**");
  });
});

describe("NodesConstraints structure", () => {
  test("required nodes only", () => {
    const constraints: NodesConstraints = {
      required: [{ path: "src" }, { path: ".gitignore" }],
    };
    expect(constraints.required).toHaveLength(2);
  });

  test("optional nodes only", () => {
    const constraints: NodesConstraints = {
      optional: [{ path: "docs" }, { path: "*.md" }],
    };
    expect(constraints.optional).toHaveLength(2);
  });

  test("allowOther flag", () => {
    const constraints: NodesConstraints = {
      required: [{ path: "src" }],
      allowOther: false,
    };
    expect(constraints.allowOther).toBe(false);
  });

  test("combined required and optional", () => {
    const constraints: NodesConstraints = {
      required: [{ path: "src" }],
      optional: [{ path: "docs" }],
      allowOther: true,
    };
    expect(constraints.required).toHaveLength(1);
    expect(constraints.optional).toHaveLength(1);
    expect(constraints.allowOther).toBe(true);
  });
});

describe("KindSchema structure with JSON Schema meta", () => {
  test("minimal kind schema", () => {
    const kind: KindSchema = {
      name: "test:minimal",
    };
    expect(kind.name).toBe("test:minimal");
  });

  test("kind schema with extends", () => {
    const kind: KindSchema = {
      name: "chamber:project",
      extends: "chamber:base",
    };
    expect(kind.extends).toBe("chamber:base");
  });

  test("kind schema with description", () => {
    const kind: KindSchema = {
      name: "chamber:project",
      description: "A project directory",
    };
    expect(kind.description).toBe("A project directory");
  });

  test("kind schema with JSON Schema meta", () => {
    const kind: KindSchema = {
      name: "chamber:project",
      meta: {
        type: "object",
        properties: {
          name: { type: "string" },
          status: { type: "string", enum: ["active", "archived"] },
        },
        required: ["name"],
      },
    };
    expect(kind.meta?.type).toBe("object");
    expect(kind.meta?.properties?.name).toBeDefined();
    expect(kind.meta?.required).toContain("name");
  });

  test("kind schema with nodes", () => {
    const kind: KindSchema = {
      name: "chamber:project",
      nodes: {
        required: [{ path: "src", kind: "chamber:source" }],
        optional: [{ path: "docs" }],
        allowOther: true,
      },
    };
    expect(kind.nodes?.required).toHaveLength(1);
    expect(kind.nodes?.optional).toHaveLength(1);
  });

  test("complete kind schema with JSON Schema", () => {
    const kind: KindSchema = {
      name: "chamber:project",
      extends: "afs:node",
      description: "A chamber project",
      meta: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          status: { type: "string", enum: ["active", "archived", "draft"] },
          icon: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["name"],
      },
      nodes: {
        required: [
          {
            path: "src",
            kind: "chamber:source",
            nodes: {
              optional: [{ path: "components", kind: "chamber:components" }, { path: "utils" }],
            },
          },
          { path: ".gitignore" },
        ],
        optional: [{ path: "docs", kind: "chamber:docs" }, { path: "*.md" }, { path: "test/**" }],
        allowOther: true,
      },
    };
    expect(kind.name).toBe("chamber:project");
    expect(kind.extends).toBe("afs:node");
    const statusProp = kind.meta?.properties?.status as JSONSchema7 | undefined;
    expect(statusProp?.enum).toContain("active");
    expect(kind.nodes?.required?.[0]?.nodes?.optional).toHaveLength(2);
  });

  test("JSON Schema with number constraints", () => {
    const kind: KindSchema = {
      name: "test:image",
      meta: {
        type: "object",
        properties: {
          width: { type: "integer", minimum: 0 },
          height: { type: "integer", minimum: 0 },
          quality: { type: "number", minimum: 0, maximum: 100 },
        },
      },
    };
    const widthProp = kind.meta?.properties?.width as JSONSchema7 | undefined;
    const qualityProp = kind.meta?.properties?.quality as JSONSchema7 | undefined;
    expect(widthProp?.minimum).toBe(0);
    expect(qualityProp?.maximum).toBe(100);
  });

  test("JSON Schema with pattern", () => {
    const kind: KindSchema = {
      name: "test:versioned",
      meta: {
        type: "object",
        properties: {
          version: {
            type: "string",
            pattern: "^\\d+\\.\\d+\\.\\d+$",
          },
        },
      },
    };
    const versionProp = kind.meta?.properties?.version as JSONSchema7 | undefined;
    expect(versionProp?.pattern).toBeDefined();
  });
});

describe("ValidationResult and ValidationError", () => {
  test("valid result", () => {
    const result: ValidationResult = {
      valid: true,
      errors: [],
    };
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("invalid result with errors", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        {
          path: "/status",
          message: "must be equal to one of the allowed values",
          code: "enum",
          expected: ["active", "archived"],
          actual: "invalid",
        },
      ],
    };
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.path).toBe("/status");
  });

  test("multiple validation errors", () => {
    const result: ValidationResult = {
      valid: false,
      errors: [
        { path: "/name", message: "must have required property 'name'", code: "required" },
        { path: "/status", message: "must be equal to one of the allowed values", code: "enum" },
        { path: "/src", message: "Required node is missing", code: "REQUIRED_NODE_MISSING" },
      ],
    };
    expect(result.errors).toHaveLength(3);
  });
});

describe("MetaPathInfo structure", () => {
  test("directory meta path", () => {
    const info: MetaPathInfo = {
      nodePath: "/dir",
      resourcePath: null,
      isKindsPath: false,
      kindName: null,
    };
    expect(info.nodePath).toBe("/dir");
    expect(info.resourcePath).toBeNull();
  });

  test("directory meta with resource", () => {
    const info: MetaPathInfo = {
      nodePath: "/dir",
      resourcePath: "icon.png",
      isKindsPath: false,
      kindName: null,
    };
    expect(info.resourcePath).toBe("icon.png");
  });

  test("file meta path", () => {
    const info: MetaPathInfo = {
      nodePath: "/dir/file.txt",
      resourcePath: null,
      isKindsPath: false,
      kindName: null,
    };
    expect(info.nodePath).toBe("/dir/file.txt");
  });

  test("kinds list path", () => {
    const info: MetaPathInfo = {
      nodePath: "/",
      resourcePath: null,
      isKindsPath: true,
      kindName: null,
    };
    expect(info.isKindsPath).toBe(true);
    expect(info.kindName).toBeNull();
  });

  test("specific kind path", () => {
    const info: MetaPathInfo = {
      nodePath: "/",
      resourcePath: null,
      isKindsPath: true,
      kindName: "chamber:project",
    };
    expect(info.isKindsPath).toBe(true);
    expect(info.kindName).toBe("chamber:project");
  });
});

describe("AFSExplainResult structure", () => {
  test("markdown format", () => {
    const result: AFSExplainResult = {
      format: "markdown",
      content: `## /projects/my-project

**Type**: directory (chamber:project)
**Description**: My Project

### Children
- src/ (chamber:source)
- README.md
`,
    };
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("chamber:project");
  });

  test("text format", () => {
    const result: AFSExplainResult = {
      format: "text",
      content: "/projects/my-project: directory (chamber:project) - My Project",
    };
    expect(result.format).toBe("text");
  });
});
