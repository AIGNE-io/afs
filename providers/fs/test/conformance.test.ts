/**
 * AFSFS Provider Conformance Tests
 *
 * This file uses the unified provider testing framework to verify
 * that AFSFS conforms to the AFS provider interface contract.
 *
 * Tested Suites:
 * - Read operations (list, read, stat)
 * - Search operations
 * - Meta operations (/.meta paths)
 * - Path normalization (absolute paths with leading /)
 * - Error types (AFSNotFoundError for ENOENT)
 * - Entry fields validation
 * - Access mode validation
 * - List options validation
 * - Deep list (BFS traversal)
 * - Write cases (fixture-defined write tests)
 * - Delete cases (fixture-defined delete tests)
 *
 * Skipped Suites (not applicable to AFSFS):
 * - no-handler: AFSFS has handlers for all paths
 * - route-params: AFSFS uses path patterns, not param-based routing
 * - structure: Strict requirements (list(file) returns file, all nodes have /.meta)
 * - explain: AFSFS returns {content,format} not {data:{content,format}}
 */
import { describe } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";
import { runProviderTests } from "@aigne/afs-testing";
import { dump as yamlDump } from "js-yaml";
import { setupPlayground } from "./playground.js";

describe("AFSFS Conformance", () => {
  let testDir: string;

  runProviderTests({
    name: "AFSFS",
    providerClass: AFSFS,
    playground: setupPlayground,

    async beforeAll() {
      // Create temporary test directory
      testDir = join(tmpdir(), `afs-conformance-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      // Create test file structure matching the declared tree structure
      // Root level files
      await writeFile(join(testDir, "root.txt"), "root content");
      await writeFile(join(testDir, "readme.md"), "# Hello World");

      // Subdirectory with files
      await mkdir(join(testDir, "docs"), { recursive: true });
      await writeFile(join(testDir, "docs", "guide.md"), "Guide content");
      await writeFile(join(testDir, "docs", "api.md"), "API documentation");

      // Nested subdirectory
      await mkdir(join(testDir, "docs", "examples"), { recursive: true });
      await writeFile(join(testDir, "docs", "examples", "sample.js"), 'console.log("hello");');

      // Another nested directory for depth testing
      await mkdir(join(testDir, "src", "components"), { recursive: true });
      await writeFile(join(testDir, "src", "index.ts"), 'export * from "./components";');
      await writeFile(
        join(testDir, "src", "components", "Button.tsx"),
        "export const Button = () => {};",
      );

      // Empty directory
      await mkdir(join(testDir, "empty"), { recursive: true });

      // Directory for write/delete tests (will be modified)
      await mkdir(join(testDir, "scratch"), { recursive: true });
      await writeFile(join(testDir, "scratch", "existing.txt"), "existing content");
      await writeFile(join(testDir, "scratch", "to-delete.txt"), "delete me");
      await mkdir(join(testDir, "scratch", "subdir"), { recursive: true });
      await writeFile(join(testDir, "scratch", "subdir", "nested.txt"), "nested content");

      // Create pre-existing meta data
      // Root directory meta: testDir/.afs/meta.yaml
      await mkdir(join(testDir, ".afs"), { recursive: true });
      await writeFile(
        join(testDir, ".afs", "meta.yaml"),
        yamlDump({ projectName: "test-project", version: "1.0.0" }),
      );

      // File meta: testDir/.afs/.nodes/root.txt/meta.yaml (first file - needed for entry-fields test)
      await mkdir(join(testDir, ".afs", ".nodes", "root.txt"), { recursive: true });
      await writeFile(
        join(testDir, ".afs", ".nodes", "root.txt", "meta.yaml"),
        yamlDump({ description: "Root text file", priority: 1 }),
      );

      // File meta: testDir/.afs/.nodes/readme.md/meta.yaml
      await mkdir(join(testDir, ".afs", ".nodes", "readme.md"), { recursive: true });
      await writeFile(
        join(testDir, ".afs", ".nodes", "readme.md", "meta.yaml"),
        yamlDump({ author: "Test Author", tags: ["readme", "documentation"] }),
      );

      // Directory meta: testDir/docs/.afs/meta.yaml
      await mkdir(join(testDir, "docs", ".afs"), { recursive: true });
      await writeFile(
        join(testDir, "docs", ".afs", "meta.yaml"),
        yamlDump({ category: "documentation", indexed: true }),
      );

      // File in subdirectory meta: testDir/docs/.afs/.nodes/guide.md/meta.yaml
      await mkdir(join(testDir, "docs", ".afs", ".nodes", "guide.md"), { recursive: true });
      await writeFile(
        join(testDir, "docs", ".afs", ".nodes", "guide.md", "meta.yaml"),
        yamlDump({ difficulty: "beginner", readTime: 5 }),
      );
    },

    async afterAll() {
      // Cleanup test directory
      await rm(testDir, { recursive: true, force: true });
    },

    createProvider() {
      return new AFSFS({
        localPath: testDir,
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
            name: "root.txt",
            content: "root content",
            meta: { description: "Root text file", priority: 1 },
          },
          {
            name: "readme.md",
            content: "# Hello World",
            meta: { author: "Test Author", tags: ["readme", "documentation"] },
          },
          {
            name: "docs",
            meta: { category: "documentation", indexed: true },
            children: [
              {
                name: "guide.md",
                content: "Guide content",
                meta: { difficulty: "beginner", readTime: 5 },
              },
              {
                name: "api.md",
                content: "API documentation",
              },
              {
                name: "examples",
                children: [
                  {
                    name: "sample.js",
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
                name: "index.ts",
                content: 'export * from "./components";',
              },
              {
                name: "components",
                children: [
                  {
                    name: "Button.tsx",
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
                name: "existing.txt",
                content: "existing content",
              },
              {
                name: "to-delete.txt",
                content: "delete me",
              },
              {
                name: "subdir",
                children: [
                  {
                    name: "nested.txt",
                    content: "nested content",
                  },
                ],
              },
            ],
          },
        ],
      },
    },

    expectWriteModes: true,

    // Write test cases - run LAST because they modify data
    writeCases: [
      {
        name: "should create a new file with content",
        path: "/scratch/new-file.txt",
        payload: {
          content: "newly created content",
        },
        expected: {
          contentContains: "newly created content",
        },
      },
      {
        name: "should overwrite existing file content",
        path: "/scratch/existing.txt",
        payload: {
          content: "updated content",
        },
        expected: {
          content: "updated content",
        },
      },
      {
        name: "should write file with metadata",
        path: "/scratch/with-meta.txt",
        payload: {
          content: "content with metadata",
          meta: {
            author: "Test",
            version: "1.0",
          },
        },
        expected: (result, expect) => {
          expect(result.data?.content).toBe("content with metadata");
          // Metadata is merged, so check for the fields we set
          expect(result.data?.meta).toMatchObject({
            author: "Test",
            version: "1.0",
          });
        },
      },
      {
        name: "should write JSON object as content",
        path: "/scratch/data.json",
        payload: {
          content: { key: "value", nested: { foo: "bar" } },
        },
        expected: (result, expect) => {
          expect(result.data?.content).toEqual({ key: "value", nested: { foo: "bar" } });
        },
      },
      {
        name: "should create file in nested directory",
        path: "/scratch/subdir/new-nested.txt",
        payload: {
          content: "nested new file",
        },
        expected: {
          contentContains: "nested new file",
        },
      },
      {
        name: "should write metadata only via node path",
        path: "/scratch",
        payload: {
          meta: {
            description: "Scratch directory for testing",
            temporary: true,
          },
        },
        expected: (result, expect) => {
          expect(result.data?.meta).toMatchObject({
            description: "Scratch directory for testing",
            temporary: true,
          });
        },
      },
      {
        name: "should write file metadata via node path",
        path: "/scratch/existing.txt",
        payload: {
          meta: {
            status: "modified",
            reviewer: "bot",
          },
        },
        expected: (result, expect) => {
          expect(result.data?.meta).toMatchObject({
            status: "modified",
            reviewer: "bot",
          });
        },
      },
    ],

    // Delete test cases - run LAST because they modify data
    deleteCases: [
      {
        name: "should delete a file",
        path: "/scratch/to-delete.txt",
        verifyDeleted: true,
      },
    ],
  });
});
