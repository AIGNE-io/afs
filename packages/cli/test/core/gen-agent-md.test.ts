/**
 * Phase 1F: gen-agent-md command tests
 *
 * Tests the AGENT.md generation logic.
 */
import { describe, expect, test } from "bun:test";
import { generateAgentMd } from "../../src/core/commands/gen-agent-md.js";

describe("generateAgentMd", () => {
  test("generates AGENT.md from manifest + treeSchema", () => {
    const result = generateAgentMd(
      {
        name: "sqlite",
        description: "SQLite database access",
        category: "database",
        uriTemplate: "sqlite://{localPath}",
        tags: ["local", "sql"],
        useCases: ["structured data", "application state"],
      },
      {
        operations: ["list", "read", "write", "exec"],
        tree: {
          "/": { kind: "database:root", actions: ["create_table"] },
          "/{table}": { kind: "database:table", operations: ["list", "read", "write"] },
          "/{table}/{pk}": {
            kind: "database:row",
            operations: ["read", "write", "delete"],
            destructive: ["delete"],
          },
        },
        auth: { type: "none" },
        bestFor: ["structured data", "SQL queries"],
      },
    );

    // Should have YAML frontmatter
    expect(result).toMatch(/^---\n/);
    expect(result).toContain("name: sqlite");
    expect(result).toContain("category: database");
    expect(result).toContain("operations:");
    expect(result).toContain("- list");
    expect(result).toContain("tags:");

    // Should have markdown body
    expect(result).toContain("# sqlite");
    expect(result).toContain("SQLite database access");

    // Should include path structure from treeSchema
    expect(result).toContain("## Path Structure");
    expect(result).toContain("`/`");
    expect(result).toContain("database:root");
    expect(result).toContain("`/{table}`");
    expect(result).toContain("database:table");

    // Should include use cases
    expect(result).toContain("## Use Cases");
    expect(result).toContain("structured data");
  });

  test("generates AGENT.md without treeSchema (manifest only)", () => {
    const result = generateAgentMd({
      name: "fs",
      description: "Local filesystem access",
      category: "storage",
      uriTemplate: "fs://{localPath}",
      tags: ["local", "filesystem"],
    });

    expect(result).toMatch(/^---\n/);
    expect(result).toContain("name: fs");
    expect(result).toContain("category: storage");
    expect(result).toContain("# fs");
    expect(result).toContain("Local filesystem access");

    // Should NOT have path structure section
    expect(result).not.toContain("## Path Structure");
  });

  test("includes auth info when present", () => {
    const result = generateAgentMd(
      {
        name: "github",
        description: "GitHub API access",
        category: "vcs",
        uriTemplate: "github://{owner}/{repo}",
        tags: ["remote", "vcs"],
      },
      {
        operations: ["list", "read", "write", "exec"],
        tree: { "/": { kind: "root" } },
        auth: { type: "token", env: ["GITHUB_TOKEN", "GH_TOKEN"] },
      },
    );

    expect(result).toContain("auth: token");
    expect(result).toContain("GITHUB_TOKEN");
  });

  test("includes destructive actions warning", () => {
    const result = generateAgentMd(
      {
        name: "sqlite",
        description: "SQLite database access",
        category: "database",
        uriTemplate: "sqlite://{localPath}",
      },
      {
        operations: ["list", "read", "write", "delete"],
        tree: {
          "/": { kind: "root" },
          "/{table}/{pk}": { kind: "row", destructive: ["delete"] },
        },
      },
    );

    expect(result).toContain("destructive");
  });

  test("includes bestFor/notFor when present", () => {
    const result = generateAgentMd(
      {
        name: "sqlite",
        description: "SQLite database access",
        category: "database",
        uriTemplate: "sqlite://{localPath}",
      },
      {
        operations: ["list", "read"],
        tree: { "/": { kind: "root" } },
        bestFor: ["structured data", "small datasets"],
        notFor: ["large binary files"],
      },
    );

    expect(result).toContain("## Best For");
    expect(result).toContain("structured data");
    expect(result).toContain("## Not Recommended For");
    expect(result).toContain("large binary files");
  });
});
