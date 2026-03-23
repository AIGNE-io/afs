/**
 * AFSTOML Provider Conformance Tests
 *
 * This file uses the unified provider testing framework to verify
 * that AFSTOML conforms to the AFS provider interface contract.
 *
 * Tested Suites:
 * - Read operations (list, read, stat)
 * - Search operations
 * - Meta operations (/.meta paths)
 * - Access mode validation
 * - List options validation
 * - Deep list (BFS traversal)
 * - Write cases (fixture-defined write tests)
 * - Delete cases (fixture-defined delete tests)
 */
import { describe } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProviderTests } from "@aigne/afs-testing";
import { AFSTOML } from "@aigne/afs-toml";
import { setupPlayground } from "./playground.js";

describe("AFSTOML Conformance", () => {
  let tomlFilePath: string;

  // Test data with pre-existing metadata
  // Metadata storage (mirrors FS provider's .afs structure):
  // - Objects (tables): stored in `.afs.meta` key within the table
  // - Primitives: stored in parent's `.afs[".nodes"][key].meta`
  const testToml = `
# Root-level primitives
root = "root content"
readme = "# Hello World"

# Root-level metadata
[".afs".meta]
projectName = "test-project"
version = "1.0.0"

[".afs".".nodes".readme.meta]
author = "Test Author"
tags = ["readme", "documentation"]

# Documentation section
[docs]
guide = "Guide content"
api = "API documentation"

[docs.examples]
sample = 'console.log("hello");'

# Metadata for /docs directory
[docs.".afs".meta]
category = "documentation"
indexed = true

[docs.".afs".".nodes".guide.meta]
difficulty = "beginner"
readTime = 5

# Empty section
[empty]

# Scratch section for write/delete tests
[scratch]
existing = "existing content"
toDelete = "delete me"

[scratch.subdir]
nested = "nested content"
`;

  runProviderTests({
    name: "AFSTOML",
    providerClass: AFSTOML,
    playground: setupPlayground,

    async beforeAll() {
      // Create temporary TOML file
      tomlFilePath = join(tmpdir(), `afs-toml-conformance-${Date.now()}.toml`);
      await writeFile(tomlFilePath, testToml);
    },

    async afterAll() {
      // Cleanup
      await rm(tomlFilePath, { force: true });
    },

    createProvider() {
      return new AFSTOML({
        tomlPath: tomlFilePath,
        accessMode: "readwrite",
      });
    },

    // Tree-based structure declaration
    structure: {
      root: {
        name: "",
        meta: { projectName: "test-project", version: "1.0.0" },
        children: [
          {
            name: "root",
            content: "root content",
          },
          {
            name: "readme",
            content: "# Hello World",
            meta: { author: "Test Author", tags: ["readme", "documentation"] },
          },
          {
            name: "docs",
            meta: { category: "documentation", indexed: true },
            children: [
              {
                name: "guide",
                content: "Guide content",
                meta: { difficulty: "beginner", readTime: 5 },
              },
              {
                name: "api",
                content: "API documentation",
              },
              {
                name: "examples",
                children: [
                  {
                    name: "sample",
                    content: 'console.log("hello");',
                  },
                ],
              },
            ],
          },
          {
            name: "empty",
            children: [],
          },
          {
            name: "scratch",
            children: [
              {
                name: "existing",
                content: "existing content",
              },
              {
                name: "toDelete",
                content: "delete me",
              },
              {
                name: "subdir",
                children: [
                  {
                    name: "nested",
                    content: "nested content",
                  },
                ],
              },
            ],
          },
        ],
      },
    },

    // Write test cases - run LAST because they modify data
    writeCases: [
      {
        name: "should create a new key with content",
        path: "/scratch/newKey",
        payload: {
          content: "newly created content",
        },
        expected: {
          contentContains: "newly created content",
        },
      },
      {
        name: "should overwrite existing key content",
        path: "/scratch/existing",
        payload: {
          content: "updated content",
        },
        expected: {
          content: "updated content",
        },
      },
      {
        name: "should create nested key",
        path: "/scratch/subdir/newNested",
        payload: {
          content: "nested new content",
        },
        expected: {
          contentContains: "nested new content",
        },
      },
    ],

    // Delete test cases - run LAST because they modify data
    deleteCases: [
      {
        name: "should delete a key",
        path: "/scratch/toDelete",
        verifyDeleted: true,
      },
    ],
  });
});
