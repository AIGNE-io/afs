import { describe, expect, test } from "bun:test";
import type { ProviderTreeSchema, TreeNodeSchema } from "../src/type.js";
import { AFS_CATEGORIES, CAPABILITY_TAGS } from "../src/type.js";

describe("ProviderTreeSchema types", () => {
  test("valid tree schema satisfies interface", () => {
    const schema: ProviderTreeSchema = {
      operations: ["list", "read", "write", "search", "exec", "stat", "explain"],
      tree: {
        "/": { kind: "database:root", actions: ["create_table", "drop_table"] },
        "/{table}": {
          kind: "database:table",
          operations: ["list", "read", "write", "exec"],
          actions: ["insert", "query", "export"],
        },
        "/{table}/{pk}": {
          kind: "database:row",
          operations: ["read", "write", "delete"],
          actions: ["update"],
          destructive: ["delete"],
        },
      },
      auth: { type: "none" },
      bestFor: ["structured data", "SQL queries"],
      notFor: ["large-scale data"],
    };
    expect(schema.operations).toContain("list");
    expect(schema.tree["/{table}"]?.kind).toBe("database:table");
    expect(schema.auth?.type).toBe("none");
  });

  test("minimal tree schema (no optional fields)", () => {
    const schema: ProviderTreeSchema = {
      operations: ["list", "read"],
      tree: {
        "/": { kind: "root" },
      },
    };
    expect(schema.operations).toHaveLength(2);
    expect(schema.auth).toBeUndefined();
    expect(schema.bestFor).toBeUndefined();
  });

  test("tree node with auth env vars", () => {
    const schema: ProviderTreeSchema = {
      operations: ["list", "read", "write"],
      tree: { "/": { kind: "root" } },
      auth: { type: "token", env: ["GITHUB_TOKEN", "GH_TOKEN"] },
    };
    expect(schema.auth?.env).toEqual(["GITHUB_TOKEN", "GH_TOKEN"]);
  });

  test("TreeNodeSchema standalone", () => {
    const node: TreeNodeSchema = {
      kind: "issue",
      operations: ["read", "write", "delete"],
      actions: ["close", "reopen", "assign"],
      destructive: ["delete"],
    };
    expect(node.destructive).toContain("delete");
    expect(node.actions).toHaveLength(3);
  });
});

describe("Controlled Vocabulary", () => {
  test("AFS_CATEGORIES contains Phase 0 categories", () => {
    expect(AFS_CATEGORIES).toContain("storage");
    expect(AFS_CATEGORIES).toContain("database");
    expect(AFS_CATEGORIES).toContain("compute");
    expect(AFS_CATEGORIES).toContain("vcs");
    expect(AFS_CATEGORIES).toContain("devops");
    expect(AFS_CATEGORIES).toContain("messaging");
    expect(AFS_CATEGORIES).toContain("ai");
    expect(AFS_CATEGORIES).toContain("bridge");
    expect(AFS_CATEGORIES).toContain("browser");
    expect(AFS_CATEGORIES).toContain("network");
  });

  test("AFS_CATEGORIES has <= 15 entries", () => {
    expect(AFS_CATEGORIES.length).toBeLessThanOrEqual(15);
  });

  test("CAPABILITY_TAGS contains expected groups", () => {
    // Data operations
    expect(CAPABILITY_TAGS).toContain("crud");
    expect(CAPABILITY_TAGS).toContain("read-only");
    expect(CAPABILITY_TAGS).toContain("query");

    // Auth
    expect(CAPABILITY_TAGS).toContain("auth:token");
    expect(CAPABILITY_TAGS).toContain("auth:none");

    // Features
    expect(CAPABILITY_TAGS).toContain("destructive");
    expect(CAPABILITY_TAGS).toContain("rate-limited");

    // Access
    expect(CAPABILITY_TAGS).toContain("local");
    expect(CAPABILITY_TAGS).toContain("remote");
  });

  test("no duplicate tags", () => {
    const unique = new Set(CAPABILITY_TAGS);
    expect(unique.size).toBe(CAPABILITY_TAGS.length);
  });
});
