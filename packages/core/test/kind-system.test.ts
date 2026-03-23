import { describe, expect, test } from "bun:test";
import type { KindSchema } from "@aigne/afs";
import { createKindResolver, defineKind, getInheritanceChain, getWellKnownKind } from "@aigne/afs";

// Test kinds using JSON Schema format
const testKinds: KindSchema[] = [
  {
    name: "test:base",
    description: "Base test kind",
    meta: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "test:project",
    extends: "test:base",
    description: "Project kind extending base",
    meta: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "archived", "draft"] },
        icon: { type: "string" },
      },
    },
    nodes: {
      required: [{ path: "src" }],
      optional: [{ path: "docs" }, { path: "*.md" }],
      allowOther: true,
    },
  },
  {
    name: "test:advanced-project",
    extends: "test:project",
    description: "Advanced project with more structure",
    meta: {
      type: "object",
      properties: {
        version: { type: "string" },
      },
      required: ["version"],
    },
    nodes: {
      required: [{ path: "test" }],
    },
  },
];

describe("defineKind API", () => {
  test("creates a kind with basic properties", () => {
    const kind = defineKind({
      name: "myapp:widget",
      description: "A widget",
    });

    expect(kind.name).toBe("myapp:widget");
    expect(kind.schema.description).toBe("A widget");
  });

  test("creates a kind with meta schema", () => {
    const kind = defineKind({
      name: "myapp:widget",
      meta: {
        type: "object",
        properties: {
          title: { type: "string" },
          count: { type: "integer" },
        },
        required: ["title"],
      },
    });

    expect(kind.schema.meta).toBeDefined();
    expect(kind.schema.meta?.properties?.title).toBeDefined();
  });

  test("creates a kind with nodes constraints", () => {
    const kind = defineKind({
      name: "myapp:project",
      nodes: {
        required: [{ path: "src" }],
        optional: [{ path: "docs" }],
        allowOther: true,
      },
    });

    expect(kind.schema.nodes?.required).toHaveLength(1);
    expect(kind.schema.nodes?.optional).toHaveLength(1);
  });
});

describe("Kind Validation", () => {
  describe("validate - layer-by-layer validation", () => {
    const resolver = createKindResolver(testKinds);

    test("validates against all ancestor schemas", () => {
      const kind = defineKind(testKinds[2]!); // test:advanced-project

      // Missing name (from test:base) and version (from test:advanced-project)
      const result = kind.validate({}, resolver);
      expect(result.valid).toBe(false);
      // Should have errors from multiple layers
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("passes when all layers are satisfied", () => {
      const kind = defineKind(testKinds[2]!); // test:advanced-project

      const result = kind.validate(
        {
          name: "My Project", // from test:base
          status: "active", // from test:project
          version: "1.0.0", // from test:advanced-project
        },
        resolver,
      );
      expect(result.valid).toBe(true);
    });

    test("reports errors from specific layers", () => {
      const kind = defineKind(testKinds[1]!); // test:project

      const result = kind.validate(
        { status: "invalid-status" }, // missing name, invalid status
        resolver,
      );

      expect(result.valid).toBe(false);
      // Should have error about name from test:base
      // Should have error about status from test:project
      expect(result.errors.some((e) => e.message.includes("test:base"))).toBe(true);
      expect(result.errors.some((e) => e.message.includes("test:project"))).toBe(true);
    });
  });
});

describe("Kind Resolution", () => {
  test("resolves well-known kind", () => {
    const kind = getWellKnownKind("afs:node");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:node");
  });

  test("returns undefined for non-existent well-known kind", () => {
    const kind = getWellKnownKind("afs:nonexistent");
    expect(kind).toBeUndefined();
  });

  test("createKindResolver combines provider and well-known kinds", () => {
    const resolver = createKindResolver(testKinds);

    // Should find provider kind
    expect(resolver("test:project")).toBeDefined();

    // Should find well-known kind
    expect(resolver("afs:node")).toBeDefined();

    // Provider kind takes precedence if name conflicts
    const overrideKinds: KindSchema[] = [{ name: "afs:node", description: "Custom node" }];
    const overrideResolver = createKindResolver(overrideKinds);
    expect(overrideResolver("afs:node")?.description).toBe("Custom node");
  });
});

describe("Inheritance Chain", () => {
  const resolver = createKindResolver(testKinds);

  test("returns single element for kind without extends", () => {
    const chain = getInheritanceChain(testKinds[0]!, resolver);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.name).toBe("test:base");
  });

  test("returns full chain from root to leaf", () => {
    const chain = getInheritanceChain(testKinds[2]!, resolver);

    expect(chain).toHaveLength(3);
    expect(chain[0]!.name).toBe("test:base");
    expect(chain[1]!.name).toBe("test:project");
    expect(chain[2]!.name).toBe("test:advanced-project");
  });

  test("includes well-known kinds in chain", () => {
    const kindsExtendingWellKnown: KindSchema[] = [
      {
        name: "test:custom-document",
        extends: "afs:document",
      },
    ];
    const customResolver = createKindResolver(kindsExtendingWellKnown);

    const chain = getInheritanceChain(kindsExtendingWellKnown[0]!, customResolver);

    // Should include afs:node -> afs:document -> test:custom-document
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[chain.length - 1]!.name).toBe("test:custom-document");
  });

  test("throws error for circular inheritance", () => {
    const circularKinds: KindSchema[] = [
      { name: "test:a", extends: "test:b" },
      { name: "test:b", extends: "test:a" },
    ];
    const circularResolver = createKindResolver(circularKinds);

    expect(() => {
      getInheritanceChain(circularKinds[0]!, circularResolver);
    }).toThrow(/circular/i);
  });

  test("throws error for non-existent parent", () => {
    const brokenKinds: KindSchema[] = [{ name: "test:orphan", extends: "test:nonexistent" }];
    const brokenResolver = createKindResolver(brokenKinds);

    expect(() => {
      getInheritanceChain(brokenKinds[0]!, brokenResolver);
    }).toThrow(/not found/i);
  });
});

describe("Well-known Kinds", () => {
  test("afs:node has common meta properties and node-specific properties", () => {
    const node = getWellKnownKind("afs:node");
    expect(node).toBeDefined();
    // Common properties
    expect(node?.meta?.properties?.icon).toBeDefined();
    expect(node?.meta?.properties?.label).toBeDefined();
    expect(node?.meta?.properties?.tags).toBeDefined();
    // Node-specific properties (no file/directory distinction)
    expect(node?.meta?.properties?.childrenCount).toBeDefined();
    expect(node?.meta?.properties?.mimeType).toBeDefined();
    expect(node?.meta?.properties?.expanded).toBeDefined();
    expect(node?.meta?.properties?.sortOrder).toBeDefined();
  });

  test("afs:image extends afs:node", () => {
    const image = getWellKnownKind("afs:image");
    expect(image?.extends).toBe("afs:node");
    expect(image?.meta?.properties?.width).toBeDefined();
    expect(image?.meta?.properties?.height).toBeDefined();
  });

  test("afs:document extends afs:node", () => {
    const doc = getWellKnownKind("afs:document");
    expect(doc?.extends).toBe("afs:node");
    expect(doc?.meta?.properties?.title).toBeDefined();
  });

  test("afs:executable extends afs:node", () => {
    const exec = getWellKnownKind("afs:executable");
    expect(exec?.extends).toBe("afs:node");
    expect(exec?.meta?.properties?.runtime).toBeDefined();
    expect(exec?.meta?.properties?.command).toBeDefined();
    expect(exec?.meta?.properties?.inputSchema).toBeDefined();
    expect(exec?.meta?.properties?.outputSchema).toBeDefined();
  });

  test("afs:link extends afs:node", () => {
    const link = getWellKnownKind("afs:link");
    expect(link?.extends).toBe("afs:node");
    expect(link?.meta?.properties?.target).toBeDefined();
  });
});
