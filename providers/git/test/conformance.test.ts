/**
 * AFSGit Provider Conformance Tests
 *
 * This file uses the unified provider testing framework to verify
 * that AFSGit conforms to the AFS provider interface contract.
 *
 * AFSGit exposes Git repositories as virtual filesystems:
 * - `/` - root (lists branches)
 * - `/:branch` - branch root directory
 * - `/:branch/:path+` - files and directories within a branch
 */
import { describe } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSGit } from "@aigne/afs-git";
import { runProviderTests } from "@aigne/afs-testing";
import { simpleGit } from "simple-git";
import { setupPlayground } from "./playground.js";

describe("AFSGit Conformance", () => {
  let testDir: string;
  let repoPath: string;
  let afsGit: AFSGit;

  runProviderTests({
    name: "AFSGit",
    providerClass: AFSGit,
    playground: setupPlayground,

    async beforeAll() {
      // Create a temporary directory for test repository
      testDir = join(tmpdir(), `afs-git-conformance-${Date.now()}`);
      repoPath = join(testDir, "test-repo");
      await mkdir(repoPath, { recursive: true });

      // Initialize git repository
      const git = simpleGit(repoPath);
      await git.init(["--initial-branch=main"]);
      await git.addConfig("user.name", "Test User");
      await git.addConfig("user.email", "test@example.com");
      await git.addConfig("commit.gpgsign", "false");

      // Create test structure matching the declared tree
      // Root level files
      await writeFile(join(repoPath, "root.txt"), "root content");
      await writeFile(join(repoPath, "readme.md"), "# Hello World");

      // Subdirectory with files
      await mkdir(join(repoPath, "docs"), { recursive: true });
      await writeFile(join(repoPath, "docs/guide.md"), "Guide content");
      await writeFile(join(repoPath, "docs/api.md"), "API documentation");

      // Nested subdirectory
      await mkdir(join(repoPath, "docs/examples"), { recursive: true });
      await writeFile(join(repoPath, "docs/examples/sample.js"), 'console.log("hello");');

      // Another nested directory for depth testing
      await mkdir(join(repoPath, "src/components"), { recursive: true });
      await writeFile(join(repoPath, "src/index.ts"), 'export * from "./components";');
      await writeFile(
        join(repoPath, "src/components/Button.tsx"),
        "export const Button = () => {};",
      );

      // Empty directory (git doesn't track empty directories, skip this)

      // Scratch directory for write/delete tests
      await mkdir(join(repoPath, "scratch"), { recursive: true });
      await writeFile(join(repoPath, "scratch/existing.txt"), "existing content");
      await writeFile(join(repoPath, "scratch/to-delete.txt"), "delete me");
      await mkdir(join(repoPath, "scratch/subdir"), { recursive: true });
      await writeFile(join(repoPath, "scratch/subdir/nested.txt"), "nested content");

      // Commit all files
      await git.add(".");
      await git.commit("Initial commit for conformance tests");

      // Create AFSGit instance with readwrite mode for write/delete tests
      afsGit = new AFSGit({ repoPath, accessMode: "readwrite", autoCommit: true });
    },

    async afterAll() {
      await afsGit.cleanup();
      await rm(testDir, { recursive: true, force: true });
    },

    createProvider() {
      return afsGit;
    },

    // Tree-based structure declaration
    // Git structure: branches at root, files within branches
    // For simplicity, we test on the main branch
    structure: {
      root: {
        name: "",
        children: [
          {
            name: "main",
            children: [
              {
                name: "root.txt",
                content: "root content",
              },
              {
                name: "readme.md",
                content: "# Hello World",
              },
              {
                name: "docs",
                children: [
                  {
                    name: "guide.md",
                    content: "Guide content",
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
        ],
      },
    },

    expectWriteModes: "/main",

    // Write test cases
    writeCases: [
      {
        name: "should create a new file with content",
        path: "/main/scratch/new-file.txt",
        payload: {
          content: "newly created content",
        },
        expected: {
          contentContains: "newly created content",
        },
      },
      {
        name: "should overwrite existing file content",
        path: "/main/scratch/existing.txt",
        payload: {
          content: "updated content",
        },
        expected: {
          content: "updated content",
        },
      },
    ],

    // Delete test cases
    deleteCases: [
      {
        name: "should delete a file",
        path: "/main/scratch/to-delete.txt",
        verifyDeleted: true,
      },
    ],
  });
});
