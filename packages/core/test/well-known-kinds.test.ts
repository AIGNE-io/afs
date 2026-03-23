import { describe, expect, test } from "bun:test";
import {
  afsDocument,
  afsExecutable,
  afsImage,
  afsLink,
  afsNode,
  afsProgram,
  commonMetaSchema,
  getWellKnownKind,
  isWellKnownKind,
  WELL_KNOWN_KINDS,
  WELL_KNOWN_KINDS_MAP,
} from "@aigne/afs";

describe("Well-Known Kinds", () => {
  test("WELL_KNOWN_KINDS is exported and not empty", () => {
    expect(WELL_KNOWN_KINDS).toBeDefined();
    expect(Array.isArray(WELL_KNOWN_KINDS)).toBe(true);
    expect(WELL_KNOWN_KINDS.length).toBeGreaterThan(0);
  });

  test("WELL_KNOWN_KINDS_MAP is exported", () => {
    expect(WELL_KNOWN_KINDS_MAP).toBeDefined();
    expect(WELL_KNOWN_KINDS_MAP instanceof Map).toBe(true);
    expect(WELL_KNOWN_KINDS_MAP.size).toBe(WELL_KNOWN_KINDS.length);
  });

  test("afs:node kind is the base kind", () => {
    const kind = WELL_KNOWN_KINDS.find((k) => k.name === "afs:node");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:node");
    expect(kind?.extends).toBeUndefined();
    expect(kind?.description).toBeDefined();
  });

  test("afs:document kind exists and extends afs:node", () => {
    const kind = WELL_KNOWN_KINDS.find((k) => k.name === "afs:document");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:document");
    expect(kind?.extends).toBe("afs:node");
    expect(kind?.description).toBeDefined();
  });

  test("afs:image kind exists and extends afs:node", () => {
    const kind = WELL_KNOWN_KINDS.find((k) => k.name === "afs:image");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:image");
    expect(kind?.extends).toBe("afs:node");
    expect(kind?.description).toBeDefined();
  });

  test("afs:executable kind exists and extends afs:node", () => {
    const kind = WELL_KNOWN_KINDS.find((k) => k.name === "afs:executable");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:executable");
    expect(kind?.extends).toBe("afs:node");
    expect(kind?.description).toBeDefined();
  });

  test("afs:link kind exists and extends afs:node", () => {
    const kind = WELL_KNOWN_KINDS.find((k) => k.name === "afs:link");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:link");
    expect(kind?.extends).toBe("afs:node");
    expect(kind?.description).toBeDefined();
  });

  test("afs:program kind exists and extends afs:executable", () => {
    const kind = WELL_KNOWN_KINDS.find((k) => k.name === "afs:program");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:program");
    expect(kind?.extends).toBe("afs:executable");
    expect(kind?.description).toBeDefined();
  });

  test("all well-known kinds have afs: prefix", () => {
    for (const kind of WELL_KNOWN_KINDS) {
      expect(kind.name.startsWith("afs:")).toBe(true);
    }
  });
});

describe("Individual Kind Exports", () => {
  test("afsNode is exported correctly", () => {
    expect(afsNode).toBeDefined();
    expect(afsNode.name).toBe("afs:node");
  });

  test("afsDocument is exported correctly", () => {
    expect(afsDocument).toBeDefined();
    expect(afsDocument.name).toBe("afs:document");
  });

  test("afsImage is exported correctly", () => {
    expect(afsImage).toBeDefined();
    expect(afsImage.name).toBe("afs:image");
  });

  test("afsExecutable is exported correctly", () => {
    expect(afsExecutable).toBeDefined();
    expect(afsExecutable.name).toBe("afs:executable");
  });

  test("afsLink is exported correctly", () => {
    expect(afsLink).toBeDefined();
    expect(afsLink.name).toBe("afs:link");
  });

  test("afsProgram is exported correctly", () => {
    expect(afsProgram).toBeDefined();
    expect(afsProgram.name).toBe("afs:program");
  });
});

describe("getWellKnownKind", () => {
  test("returns kind for valid well-known kind name", () => {
    const kind = getWellKnownKind("afs:node");
    expect(kind).toBeDefined();
    expect(kind?.name).toBe("afs:node");
  });

  test("returns undefined for non-existent kind", () => {
    const kind = getWellKnownKind("afs:nonexistent");
    expect(kind).toBeUndefined();
  });

  test("returns undefined for provider-specific kind", () => {
    const kind = getWellKnownKind("chamber:project");
    expect(kind).toBeUndefined();
  });

  test("returns undefined for empty string", () => {
    const kind = getWellKnownKind("");
    expect(kind).toBeUndefined();
  });
});

describe("isWellKnownKind", () => {
  test("returns true for afs:node", () => {
    expect(isWellKnownKind("afs:node")).toBe(true);
  });

  test("returns true for afs:document", () => {
    expect(isWellKnownKind("afs:document")).toBe(true);
  });

  test("returns true for afs:image", () => {
    expect(isWellKnownKind("afs:image")).toBe(true);
  });

  test("returns true for afs:executable", () => {
    expect(isWellKnownKind("afs:executable")).toBe(true);
  });

  test("returns true for afs:link", () => {
    expect(isWellKnownKind("afs:link")).toBe(true);
  });

  test("returns true for afs:program", () => {
    expect(isWellKnownKind("afs:program")).toBe(true);
  });

  test("returns false for provider-specific kind", () => {
    expect(isWellKnownKind("chamber:project")).toBe(false);
  });

  test("returns false for non-existent kind", () => {
    expect(isWellKnownKind("afs:nonexistent")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isWellKnownKind("")).toBe(false);
  });

  test("returns false for kind without colon", () => {
    expect(isWellKnownKind("file")).toBe(false);
  });
});

describe("Common Meta Schema", () => {
  // Helper to safely get property type
  const getPropType = (prop: unknown) => {
    if (prop && typeof prop === "object" && "type" in prop) {
      return (prop as { type: unknown }).type;
    }
    return undefined;
  };

  test("commonMetaSchema is exported", () => {
    expect(commonMetaSchema).toBeDefined();
    expect(commonMetaSchema.type).toBe("object");
  });

  test("commonMetaSchema has icon property", () => {
    expect(commonMetaSchema.properties?.icon).toBeDefined();
    expect(getPropType(commonMetaSchema.properties?.icon)).toBe("string");
  });

  test("commonMetaSchema has label property", () => {
    expect(commonMetaSchema.properties?.label).toBeDefined();
    expect(getPropType(commonMetaSchema.properties?.label)).toBe("string");
  });

  test("commonMetaSchema has color property", () => {
    expect(commonMetaSchema.properties?.color).toBeDefined();
    expect(getPropType(commonMetaSchema.properties?.color)).toBe("string");
  });

  test("commonMetaSchema has tags property", () => {
    expect(commonMetaSchema.properties?.tags).toBeDefined();
    expect(getPropType(commonMetaSchema.properties?.tags)).toBe("array");
  });

  test("commonMetaSchema has description property", () => {
    expect(commonMetaSchema.properties?.description).toBeDefined();
    expect(getPropType(commonMetaSchema.properties?.description)).toBe("string");
  });
});

describe("Well-Known Kind Meta Schemas (JSON Schema format)", () => {
  // Helper to safely get property type
  const getPropType = (prop: unknown) => {
    if (prop && typeof prop === "object" && "type" in prop) {
      return (prop as { type: unknown }).type;
    }
    return undefined;
  };

  const getPropEnum = (prop: unknown): unknown[] | undefined => {
    if (prop && typeof prop === "object" && "enum" in prop) {
      return (prop as { enum: unknown[] }).enum;
    }
    return undefined;
  };

  test("afs:node has common meta properties and node-specific properties", () => {
    expect(afsNode.meta).toBeDefined();
    expect(afsNode.meta?.type).toBe("object");
    expect(afsNode.meta?.properties?.icon).toBeDefined();
    expect(afsNode.meta?.properties?.label).toBeDefined();
    expect(afsNode.meta?.properties?.tags).toBeDefined();
    // childrenCount: undefined=unknown, 0=none currently, >0=has children
    expect(afsNode.meta?.properties?.childrenCount).toBeDefined();
    expect(getPropType(afsNode.meta?.properties?.childrenCount)).toBe("integer");
    // Node-specific properties (formerly split between file/directory)
    expect(afsNode.meta?.properties?.mimeType).toBeDefined();
    expect(afsNode.meta?.properties?.expanded).toBeDefined();
    expect(afsNode.meta?.properties?.sortOrder).toBeDefined();
    expect(getPropEnum(afsNode.meta?.properties?.sortOrder)).toContain("name");
  });

  test("afs:image has width, height, and format properties", () => {
    expect(afsImage.meta).toBeDefined();
    expect(afsImage.meta?.properties?.width).toBeDefined();
    expect(getPropType(afsImage.meta?.properties?.width)).toBe("integer");
    expect(afsImage.meta?.properties?.height).toBeDefined();
    expect(afsImage.meta?.properties?.format).toBeDefined();
    expect(getPropEnum(afsImage.meta?.properties?.format)).toContain("png");
  });

  test("afs:document has title, author, and format properties", () => {
    expect(afsDocument.meta).toBeDefined();
    expect(afsDocument.meta?.properties?.title).toBeDefined();
    expect(afsDocument.meta?.properties?.author).toBeDefined();
    expect(afsDocument.meta?.properties?.format).toBeDefined();
    expect(getPropEnum(afsDocument.meta?.properties?.format)).toContain("markdown");
  });

  test("afs:executable has runtime, command, inputSchema and outputSchema properties", () => {
    expect(afsExecutable.meta).toBeDefined();
    expect(afsExecutable.meta?.properties?.runtime).toBeDefined();
    expect(afsExecutable.meta?.properties?.command).toBeDefined();
    expect(afsExecutable.meta?.properties?.inputSchema).toBeDefined();
    expect(getPropType(afsExecutable.meta?.properties?.inputSchema)).toBe("object");
    expect(afsExecutable.meta?.properties?.outputSchema).toBeDefined();
    expect(getPropType(afsExecutable.meta?.properties?.outputSchema)).toBe("object");
  });

  test("afs:link has target property", () => {
    expect(afsLink.meta).toBeDefined();
    expect(afsLink.meta?.properties?.target).toBeDefined();
    expect(getPropType(afsLink.meta?.properties?.target)).toBe("string");
  });

  test("afs:program has entrypoint property as required string", () => {
    expect(afsProgram.meta).toBeDefined();
    expect(afsProgram.meta?.properties?.entrypoint).toBeDefined();
    expect(getPropType(afsProgram.meta?.properties?.entrypoint)).toBe("string");
    expect(afsProgram.meta?.required).toContain("entrypoint");
  });

  test("afs:program extends afs:executable (not itself)", () => {
    expect(afsProgram.extends).toBe("afs:executable");
    expect(afsProgram.extends).not.toBe(afsProgram.name);
  });

  test("afs:program kind inheritance chain: program → executable → node", () => {
    // program extends executable
    expect(afsProgram.extends).toBe("afs:executable");
    // executable extends node
    expect(afsExecutable.extends).toBe("afs:node");
    // node has no parent
    expect(afsNode.extends).toBeUndefined();
  });

  test("afs:program kind schema does not expose internal implementation details", () => {
    // meta properties should describe the kind's public interface only
    const propNames = Object.keys(afsProgram.meta?.properties ?? {});
    expect(propNames).toContain("entrypoint");
    // Should not have internal-only fields
    expect(propNames).not.toContain("_internal");
    expect(propNames).not.toContain("__proto__");
  });

  test("afs:program kind does not contain injectable fields", () => {
    // Verify no eval/exec-like strings in the schema
    const schemaStr = JSON.stringify(afsProgram);
    expect(schemaStr).not.toContain("eval(");
    expect(schemaStr).not.toContain("Function(");
  });

  test("adding afs:program does not break existing kinds", () => {
    // All original kinds should still exist
    expect(getWellKnownKind("afs:node")).toBe(afsNode);
    expect(getWellKnownKind("afs:document")).toBe(afsDocument);
    expect(getWellKnownKind("afs:image")).toBe(afsImage);
    expect(getWellKnownKind("afs:executable")).toBe(afsExecutable);
    expect(getWellKnownKind("afs:link")).toBe(afsLink);
  });
});
