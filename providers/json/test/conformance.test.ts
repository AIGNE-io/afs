/**
 * AFSJSON Provider Conformance Tests
 *
 * This file uses the unified provider testing framework to verify
 * that AFSJSON conforms to the AFS provider interface contract.
 */
import { describe } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSJSON } from "@aigne/afs-json";
import { runProviderTests } from "@aigne/afs-testing";
import { setupPlayground } from "./playground.js";

describe("AFSJSON Conformance", () => {
  let jsonFilePath: string;

  // Test data with pre-existing metadata
  // Metadata storage (mirrors FS provider's .afs structure):
  // - Objects: stored in `.afs.meta` key within the object
  // - Primitives: stored in parent's `.afs[".nodes"][key].meta`
  const testData = {
    root: "root content",
    readme: "# Hello World",
    docs: {
      guide: "Guide content",
      api: "API documentation",
      examples: {
        sample: 'console.log("hello");',
      },
      // Metadata for /docs directory
      ".afs": {
        meta: { category: "documentation", indexed: true },
        // Metadata for primitive children
        ".nodes": {
          guide: { meta: { difficulty: "beginner", readTime: 5 } },
        },
      },
    },
    src: {
      index: 'export * from "./components";',
      components: {
        Button: "export const Button = () => {};",
      },
    },
    empty: {},
    scratch: {
      existing: "existing content",
      toDelete: "delete me",
      subdir: {
        nested: "nested content",
      },
    },
    // Root-level metadata
    ".afs": {
      meta: { projectName: "test-project", version: "1.0.0" },
      // Metadata for primitive children at root
      ".nodes": {
        readme: { meta: { author: "Test Author", tags: ["readme", "documentation"] } },
        root: { meta: { description: "Root content file", priority: 1 } },
      },
    },
  };

  runProviderTests({
    name: "AFSJSON",
    providerClass: AFSJSON,
    playground: setupPlayground,

    async beforeAll() {
      // Create temporary JSON file
      jsonFilePath = join(tmpdir(), `afs-json-conformance-${Date.now()}.json`);
      await writeFile(jsonFilePath, JSON.stringify(testData, null, 2));
    },

    async afterAll() {
      // Cleanup
      await rm(jsonFilePath, { force: true });
    },

    createProvider() {
      return new AFSJSON({
        jsonPath: jsonFilePath,
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
            meta: { description: "Root content file", priority: 1 },
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
            name: "src",
            children: [
              {
                name: "index",
                content: 'export * from "./components";',
              },
              {
                name: "components",
                children: [
                  {
                    name: "Button",
                    content: "export const Button = () => {};",
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

    // Write test cases
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

    // Delete test cases
    deleteCases: [
      {
        name: "should delete a key",
        path: "/scratch/toDelete",
        verifyDeleted: true,
      },
    ],
  });
});
