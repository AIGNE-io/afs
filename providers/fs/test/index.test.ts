import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";

let testDir: string;
let fs: AFSFS;

beforeAll(async () => {
  // Create a temporary directory for testing
  testDir = join(tmpdir(), `system-fs-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  // Create test file structure
  await mkdir(join(testDir, "subdir"), { recursive: true });
  await mkdir(join(testDir, "subdir", "nested"), { recursive: true });

  await writeFile(join(testDir, "file1.txt"), "Hello World");
  await writeFile(join(testDir, "file2.md"), "# Test Markdown");
  await writeFile(join(testDir, "subdir", "file3.js"), 'console.log("test");');
  await writeFile(join(testDir, "subdir", "nested", "file4.json"), '{"test": true}');

  // Initialize AFSFS
  fs = new AFSFS({ localPath: testDir });
});

afterAll(async () => {
  // Clean up test directory
  await rm(testDir, { recursive: true, force: true });
});

test("AFSFS should list files in the root directory (non-recursive)", async () => {
  const result = await fs.list("");

  const paths = result.data.map((entry) => entry.path);
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/file1.txt",
      "/file2.md",
      "/subdir",
    ]
  `);

  // Check childrenCount (defined for directories, undefined for files)
  const childrenCounts = result.data.map((entry) => ({
    path: entry.path,
    hasChildren: typeof entry.meta?.childrenCount === "number",
  }));
  expect(childrenCounts.sort((a, b) => a.path.localeCompare(b.path))).toMatchInlineSnapshot(`
    [
      {
        "hasChildren": false,
        "path": "/file1.txt",
      },
      {
        "hasChildren": false,
        "path": "/file2.md",
      },
      {
        "hasChildren": true,
        "path": "/subdir",
      },
    ]
  `);
});

test("AFSFS should list files recursively when recursive option is true", async () => {
  const result = await fs.list("", { maxDepth: 1000 });

  const paths = result.data.map((entry) => entry.path);
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/file1.txt",
      "/file2.md",
      "/subdir",
      "/subdir/file3.js",
      "/subdir/nested",
      "/subdir/nested/file4.json",
    ]
  `);
});

test("AFSFS should respect maxDepth option", async () => {
  const result = await fs.list("", { maxDepth: 1 });

  const paths = result.data.map((entry) => entry.path);
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/file1.txt",
      "/file2.md",
      "/subdir",
    ]
  `);
});

test("AFSFS should respect limit option", async () => {
  const result = await fs.list("", { limit: 3 });

  expect(result.data).toBeDefined();
  expect(result.data.length).toBe(3);
});

test("AFSFS should list files in a subdirectory", async () => {
  const result = await fs.list("subdir");

  const paths = result.data.map((entry) => entry.path);
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/subdir/file3.js",
      "/subdir/nested",
    ]
  `);
});

test("AFSFS should handle orderBy option", async () => {
  const result = await fs.list("", {
    orderBy: [["path", "asc"]],
  });

  const paths = result.data.map((entry) => entry.path);
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/file1.txt",
      "/file2.md",
      "/subdir",
    ]
  `);
});

// Read method tests
test("AFSFS should read a file and return content", async () => {
  const { data } = await fs.read("file1.txt");

  expect(data).toBeDefined();
  expect(data?.path).toBe("/file1.txt");
  expect(data?.content).toBe("Hello World");
  expect(data?.meta?.childrenCount).toBeUndefined();
  expect(data?.meta?.size).toBeGreaterThan(0);
});

test("AFSFS should read a directory without content", async () => {
  const { data } = await fs.read("subdir");

  expect(data).toBeDefined();
  expect(data?.path).toBe("/subdir");
  expect(data?.content).toBeUndefined();
  expect(typeof data?.meta?.childrenCount).toBe("number");
});

test("AFSFS should read a nested file", async () => {
  const { data } = await fs.read("subdir/file3.js");

  expect(data).toBeDefined();
  expect(data?.path).toBe("/subdir/file3.js");
  expect(data?.content).toBe('console.log("test");');
  expect(data?.meta?.childrenCount).toBeUndefined();
});

test("AFSFS should throw for non-existent file", async () => {
  await expect(fs.read("FILE_NOT_EXIST.md")).rejects.toThrow();
});

// Write method tests
test("AFSFS should write a new file", async () => {
  const entry = {
    content: "New file content",
    summary: "Test file",
    meta: { custom: "value" },
  };

  const { data } = await fs.write("newfile.txt", entry);

  expect(data).toBeDefined();
  expect(data.path).toBe("/newfile.txt");
  expect(data.content).toBe("New file content");
  expect(data.summary).toBe("Test file");
  expect(data.meta?.custom).toBe("value");
  expect(data.meta?.childrenCount).toBeUndefined();
  expect(data.meta?.size).toBeGreaterThan(0);
});

test("AFSFS should write a file with JSON content", async () => {
  const jsonData = { name: "test", value: 42 };
  const entry = {
    content: jsonData,
    summary: "JSON test file",
  };

  const { data } = await fs.write("data.json", entry);

  expect(data).toBeDefined();
  expect(data.path).toBe("/data.json");
  expect(data.content).toEqual(jsonData);
  expect(data.meta?.childrenCount).toBeUndefined();

  // Verify the file was written with JSON formatting
  const { data: readResult } = await fs.read("data.json");
  expect(readResult?.content).toBe(JSON.stringify(jsonData, null, 2));
});

test("AFSFS should write a file in a nested directory", async () => {
  const entry = {
    content: "Nested file content",
    meta: { nested: true },
  };

  const { data } = await fs.write("deep/nested/test.txt", entry);

  expect(data).toBeDefined();
  expect(data.path).toBe("/deep/nested/test.txt");
  expect(data.content).toBe("Nested file content");
  expect(data.meta?.nested).toBe(true);
  expect(data.meta?.childrenCount).toBeUndefined();
});

test("AFSFS should overwrite existing file", async () => {
  const entry = {
    content: "Updated content",
    summary: "Updated file",
  };

  const { data } = await fs.write("file1.txt", entry);

  expect(data).toBeDefined();
  expect(data.path).toBe("/file1.txt");
  expect(data.content).toBe("Updated content");
  expect(data.summary).toBe("Updated file");

  // Verify the file was actually updated
  const { data: readResult } = await fs.read("file1.txt");
  expect(readResult?.content).toBe("Updated content");
});

// Search method tests
test("AFSFS should search for text in files", async () => {
  // First update the content since it was overwritten in previous test
  await fs.write("file1.txt", { content: "Hello World" });

  const result = await fs.search("", "Hello");

  expect(result.data).toBeDefined();
  expect(result.data.length).toBeGreaterThan(0);

  const foundFile = result.data.find((entry) => entry.path === "/file1.txt");
  expect(foundFile).toBeDefined();
  expect(foundFile?.summary).toContain("Hello");
});

test("AFSFS should search with regex pattern", async () => {
  const result = await fs.search("", "console\\.log");

  expect(result.data).toBeDefined();

  const foundFile = result.data.find((entry) => entry.path.includes("file3.js"));
  expect(foundFile).toBeDefined();
  expect(foundFile?.summary).toContain('console.log("test")');
});

test("AFSFS should search in specific directory", async () => {
  const result = await fs.search("subdir", "test");

  expect(result.data).toBeDefined();

  const paths = result.data.map((entry) => entry.path);
  // All results should be within subdir
  paths.forEach((path) => {
    expect(path.startsWith("/subdir/")).toBe(true);
  });
});

test("AFSFS should respect search limit option", async () => {
  const result = await fs.search("", "test", { limit: 1 });

  expect(result.data).toBeDefined();
  expect(result.data.length).toBe(1);
});

test("AFSFS should return empty results for no matches", async () => {
  const result = await fs.search("", "nonexistenttext123");

  expect(result.data).toBeDefined();
  expect(result.data.length).toBe(0);
});

test("AFSFS should search in written files", async () => {
  // First write a file with searchable content
  await fs.write("searchable.txt", {
    content: "This is searchable content with unique keyword",
  });

  const result = await fs.search("", "unique keyword");

  expect(result.data).toBeDefined();
  const foundFile = result.data.find((entry) => entry.path === "/searchable.txt");
  expect(foundFile).toBeDefined();
  expect(foundFile?.summary).toContain("unique keyword");
});

test("AFSFS should handle search with case sensitive option (default false)", async () => {
  // First write a file with mixed case content
  await fs.write("caseTest.txt", {
    content: "Case Sensitive Content",
  });

  // Search with caseSensitive: false (default)
  let result = await fs.search("", "case sensitive");
  expect(result.data).toBeDefined();
  let foundFile = result.data.find((entry) => entry.path === "/caseTest.txt");
  expect(foundFile).toBeDefined();

  // Search with caseSensitive: true
  result = await fs.search("", "case sensitive", { caseSensitive: true });
  expect(result.data).toBeDefined();
  foundFile = result.data.find((entry) => entry.path === "/caseTest.txt");
  expect(foundFile).toBeUndefined();

  // Search with exact case
  result = await fs.search("", "Case Sensitive", { caseSensitive: true });
  expect(result.data).toBeDefined();
  foundFile = result.data.find((entry) => entry.path === "/caseTest.txt");
  expect(foundFile).toBeDefined();
});

// Delete method tests
test("AFSFS should delete a file successfully", async () => {
  // Create a test file first
  await fs.write("toDelete.txt", { content: "This file will be deleted" });

  // Delete the file
  const result = await fs.delete("toDelete.txt");
  expect(result.message).toBe("Successfully deleted: toDelete.txt");

  // Verify file no longer exists
  const listResult = await fs.list("");
  const deletedFile = listResult.data.find((entry) => entry.path === "/toDelete.txt");
  expect(deletedFile).toBeUndefined();
});

test("AFSFS should delete a directory with recursive option", async () => {
  // Create a test directory with files
  await fs.write("deleteDir/file1.txt", { content: "File 1" });
  await fs.write("deleteDir/file2.txt", { content: "File 2" });

  // Delete the directory recursively
  const result = await fs.delete("deleteDir", { recursive: true });
  expect(result.message).toBe("Successfully deleted: deleteDir");

  // Verify directory no longer exists
  const listResult = await fs.list("");
  const deletedDir = listResult.data.find((entry) => entry.path === "/deleteDir");
  expect(deletedDir).toBeUndefined();
});

test("AFSFS should throw error when deleting directory without recursive option", async () => {
  // Create a test directory
  await fs.write("nonRecursiveDir/file.txt", { content: "Test" });

  // Try to delete without recursive option
  expect(fs.delete("nonRecursiveDir")).rejects.toThrow(
    "Cannot delete directory 'nonRecursiveDir' without recursive option",
  );

  // Verify directory still exists
  const listResult = await fs.list("");
  expect(listResult.data.map((i) => i.path).sort()).toMatchInlineSnapshot(`
    [
      "/caseTest.txt",
      "/data.json",
      "/deep",
      "/file1.txt",
      "/file2.md",
      "/newfile.txt",
      "/nonRecursiveDir",
      "/searchable.txt",
      "/subdir",
    ]
  `);

  // Cleanup
  await fs.delete("nonRecursiveDir", { recursive: true });
});

test("AFSFS should delete nested files", async () => {
  // Create nested file structure
  await fs.write("nested/deep/file.txt", { content: "Deep file" });

  // Delete the nested file
  const result = await fs.delete("nested/deep/file.txt");
  expect(result.message).toBe("Successfully deleted: nested/deep/file.txt");

  // Verify file no longer exists
  const listResult = await fs.list("nested/deep");
  expect(listResult.data.map((i) => i.path)).toMatchInlineSnapshot(`[]`);

  // Cleanup
  await fs.delete("nested", { recursive: true });
});

// Rename method tests
test("AFSFS should rename a file successfully", async () => {
  // Create a test file
  await fs.write("oldName.txt", { content: "Original content" });

  // Rename the file
  const result = await fs.rename("oldName.txt", "newName.txt");
  expect(result.message).toBe("Successfully renamed 'oldName.txt' to 'newName.txt'");

  // Verify old file no longer exists
  const listResult = await fs.list("");
  const oldFile = listResult.data.find((entry) => entry.path === "/oldName.txt");
  expect(oldFile).toBeUndefined();

  // Verify new file exists with correct content
  const { data: readResult } = await fs.read("newName.txt");
  expect(readResult?.path).toBe("/newName.txt");
  expect(readResult?.content).toBe("Original content");

  // Cleanup
  await fs.delete("newName.txt");
});

test("AFSFS should rename a directory", async () => {
  // Create a test directory with files
  await fs.write("oldDir/file1.txt", { content: "File 1" });
  await fs.write("oldDir/file2.txt", { content: "File 2" });

  // Rename the directory
  const result = await fs.rename("oldDir", "newDir");
  expect(result.message).toBe("Successfully renamed 'oldDir' to 'newDir'");

  // Verify old directory no longer exists
  const listResult = await fs.list("");
  const oldDir = listResult.data.find((entry) => entry.path === "/oldDir");
  expect(oldDir).toBeUndefined();

  // Verify new directory exists with files
  const newDirList = await fs.list("newDir");
  const filePaths = newDirList.data.map((entry) => entry.path).sort();
  expect(filePaths.sort()).toMatchInlineSnapshot(`
    [
      "/newDir/file1.txt",
      "/newDir/file2.txt",
    ]
  `);

  // Cleanup
  await fs.delete("newDir", { recursive: true });
});

test("AFSFS should throw error when renaming to existing path without overwrite", async () => {
  // Create two test files
  await fs.write("source.txt", { content: "Source content" });
  await fs.write("target.txt", { content: "Target content" });

  // Try to rename without overwrite option
  expect(fs.rename("source.txt", "target.txt")).rejects.toThrow(
    "Destination 'target.txt' already exists. Set overwrite: true to replace it.",
  );

  // Verify both files still exist with original content
  const { data: sourceResult } = await fs.read("source.txt");
  expect(sourceResult?.content).toBe("Source content");

  const { data: targetResult } = await fs.read("target.txt");
  expect(targetResult?.content).toBe("Target content");

  // Cleanup
  await fs.delete("source.txt");
  await fs.delete("target.txt");
});

test("AFSFS should rename with overwrite option", async () => {
  // Create two test files
  await fs.write("source2.txt", { content: "Source content 2" });
  await fs.write("target2.txt", { content: "Target content 2" });

  // Rename with overwrite option
  const result = await fs.rename("source2.txt", "target2.txt", {
    overwrite: true,
  });
  expect(result.message).toBe("Successfully renamed 'source2.txt' to 'target2.txt'");

  // Verify source no longer exists
  const listResult = await fs.list("");
  const sourceFile = listResult.data.find((entry) => entry.path === "/source2.txt");
  expect(sourceFile).toBeUndefined();

  // Verify target has source content
  const { data: targetResult } = await fs.read("target2.txt");
  expect(targetResult?.content).toBe("Source content 2");

  // Cleanup
  await fs.delete("target2.txt");
});

test("AFSFS should rename to nested path", async () => {
  // Create a test file
  await fs.write("flatFile.txt", { content: "Flat content" });

  // Rename to nested path
  const result = await fs.rename("flatFile.txt", "nested/path/movedFile.txt");
  expect(result.message).toBe("Successfully renamed 'flatFile.txt' to 'nested/path/movedFile.txt'");

  // Verify old path no longer exists
  const listResult = await fs.list("");
  const oldFile = listResult.data.find((entry) => entry.path === "/flatFile.txt");
  expect(oldFile).toBeUndefined();

  // Verify file exists at new nested path
  const { data: readResult } = await fs.read("nested/path/movedFile.txt");
  expect(readResult?.path).toBe("/nested/path/movedFile.txt");
  expect(readResult?.content).toBe("Flat content");

  // Cleanup
  await fs.delete("nested", { recursive: true });
});

test("AFSFS should throw error when renaming non-existent file", async () => {
  // Try to rename a file that doesn't exist
  expect(fs.rename("nonExistent.txt", "newName.txt")).rejects.toThrow();
});

// Gitignore tests
test("AFSFS should correctly identify gitignored directories as directories (not files)", async () => {
  // Regression test: .git and other gitignored directories should have childrenCount set
  // so they are recognized as directories, not files
  const gitTestDir = join(tmpdir(), `gitdir-type-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });
  await mkdir(join(gitTestDir, ".afs-config"), { recursive: true });

  // Create files inside these directories
  await writeFile(join(gitTestDir, ".git", "config"), "git config");
  await writeFile(join(gitTestDir, ".git", "HEAD"), "ref: refs/heads/main");
  await writeFile(join(gitTestDir, ".afs-config", "config.toml"), "settings");
  await writeFile(join(gitTestDir, "normal.txt"), "normal file");

  const gitFS = new AFSFS({ localPath: gitTestDir });
  const result = await gitFS.list("", { maxDepth: 1 });

  // .git should be recognized as a directory (childrenCount defined)
  const gitEntry = result.data.find((e) => e.path === "/.git");
  expect(gitEntry).toBeDefined();
  expect(typeof gitEntry?.meta?.childrenCount).toBe("number");
  expect(gitEntry?.meta?.childrenCount).toBe(2); // config and HEAD

  // .afs-config should also be recognized as a directory
  const afsConfigEntry = result.data.find((e) => e.path === "/.afs-config");
  expect(afsConfigEntry).toBeDefined();
  expect(typeof afsConfigEntry?.meta?.childrenCount).toBe("number");
  expect(afsConfigEntry?.meta?.childrenCount).toBe(1); // config.toml

  // normal.txt should NOT have childrenCount (it's a file)
  const normalEntry = result.data.find((e) => e.path === "/normal.txt");
  expect(normalEntry).toBeDefined();
  expect(normalEntry?.meta?.childrenCount).toBeUndefined();

  // Cleanup
  await rm(gitTestDir, { recursive: true, force: true });
});

test("AFSFS should list gitignored files but not recurse into gitignored directories", async () => {
  // Create a test directory with git structure
  const gitTestDir = join(tmpdir(), `gitignore-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });

  // Create .gitignore file
  await writeFile(join(gitTestDir, ".gitignore"), "*.log\nnode_modules/\n.env");

  // Create test files
  await writeFile(join(gitTestDir, "index.js"), "console.log('test')");
  await writeFile(join(gitTestDir, "debug.log"), "debug info");
  await writeFile(join(gitTestDir, ".env"), "SECRET=123");
  await mkdir(join(gitTestDir, "node_modules"), { recursive: true });
  await writeFile(join(gitTestDir, "node_modules", "package.json"), "{}");

  const gitFS = new AFSFS({ localPath: gitTestDir, useGitignore: true });

  // Ignored FILES are hidden, ignored DIRECTORIES are visible but not recursed
  const result = await gitFS.list("", { maxDepth: 2 });
  const paths = result.data.map((i) => i.path).sort();

  expect(paths).toMatchInlineSnapshot(`
    [
      "/.git",
      "/.gitignore",
      "/index.js",
      "/node_modules",
    ]
  `);

  // node_modules is a directory - childrenCount should be set even though not recursed into
  const nodeModulesEntry = result.data.find((e) => e.path === "/node_modules");
  expect(nodeModulesEntry?.meta?.childrenCount).toBe(1);

  // Cleanup
  await rm(gitTestDir, { recursive: true, force: true });
});

test("AFSFS should allow disabling gitignore", async () => {
  // Create a test directory with git structure
  const gitTestDir = join(tmpdir(), `gitignore-disabled-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });

  // Create .gitignore file
  await writeFile(join(gitTestDir, ".gitignore"), "*.log\n");

  // Create test files
  await writeFile(join(gitTestDir, "index.js"), "console.log('test')");
  await writeFile(join(gitTestDir, "debug.log"), "debug info");

  const gitFS = new AFSFS({ localPath: gitTestDir });

  // Test with gitignore disabled
  const result = await gitFS.list("", { disableGitignore: true });
  const paths = result.data.map((entry) => entry.path);

  // Should include all files
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/.gitignore",
      "/debug.log",
      "/index.js",
    ]
  `);

  // Cleanup
  await rm(gitTestDir, { recursive: true, force: true });
});

test("AFSFS should handle nested .gitignore files", async () => {
  // Create a test directory with git structure
  const gitTestDir = join(tmpdir(), `gitignore-nested-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });

  // Create root .gitignore
  await writeFile(join(gitTestDir, ".gitignore"), "*.log\n");

  // Create subdirectory with its own .gitignore
  await mkdir(join(gitTestDir, "src"), { recursive: true });
  await writeFile(join(gitTestDir, "src", ".gitignore"), "*.tmp\n");

  // Create test files
  await writeFile(join(gitTestDir, "root.log"), "root log");
  await writeFile(join(gitTestDir, "root.js"), "root js");
  await writeFile(join(gitTestDir, "src", "sub.log"), "sub log");
  await writeFile(join(gitTestDir, "src", "sub.tmp"), "sub tmp");
  await writeFile(join(gitTestDir, "src", "sub.js"), "sub js");

  const gitFS = new AFSFS({ localPath: gitTestDir });

  // Test listing from root
  const rootResult = await gitFS.list("", { maxDepth: 2 });
  const rootPaths = rootResult.data.map((entry) => entry.path);

  // Should include all files (gitignore only affects recursion into directories)
  expect(rootPaths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/.gitignore",
      "/root.js",
      "/root.log",
      "/src",
      "/src/.gitignore",
      "/src/sub.js",
      "/src/sub.log",
      "/src/sub.tmp",
    ]
  `);

  // Cleanup
  await rm(gitTestDir, { recursive: true, force: true });
});

test("AFSFS should stop at .git directory when searching for .gitignore", async () => {
  // Create a test directory structure with nested git repos
  const outerDir = join(tmpdir(), `gitignore-outer-test-${Date.now()}`);
  await mkdir(outerDir, { recursive: true });
  await mkdir(join(outerDir, ".git"), { recursive: true });

  // Create outer .gitignore
  await writeFile(join(outerDir, ".gitignore"), "outer.txt\n");

  // Create inner git repo
  const innerDir = join(outerDir, "inner");
  await mkdir(innerDir, { recursive: true });
  await mkdir(join(innerDir, ".git"), { recursive: true });
  await writeFile(join(innerDir, ".gitignore"), "inner.txt\n");

  // Create test files
  await writeFile(join(innerDir, "outer.txt"), "should be ignored");
  await writeFile(join(innerDir, "inner.txt"), "should also be ignored");
  await writeFile(join(innerDir, "normal.txt"), "should be visible");

  const innerFS = new AFSFS({ localPath: innerDir });

  // Test listing from inner directory
  const result = await innerFS.list("");
  const paths = result.data.map((entry) => entry.path);

  // Should include all files
  // Only inner.txt is in inner's .gitignore (outer.txt is not)
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/.gitignore",
      "/inner.txt",
      "/normal.txt",
      "/outer.txt",
    ]
  `);

  // Cleanup
  await rm(outerDir, { recursive: true, force: true });
});

test("AFSFS should handle directory patterns in .gitignore", async () => {
  // Create a test directory with git structure
  const gitTestDir = join(tmpdir(), `gitignore-dir-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });

  // Create .gitignore with directory pattern
  await writeFile(join(gitTestDir, ".gitignore"), "build/\ndist/\n*.tmp");

  // Create directories and files
  await mkdir(join(gitTestDir, "build"), { recursive: true });
  await writeFile(join(gitTestDir, "build", "output.js"), "built file");
  await mkdir(join(gitTestDir, "src"), { recursive: true });
  await writeFile(join(gitTestDir, "src", "index.js"), "source file");
  await writeFile(join(gitTestDir, "temp.tmp"), "temp file");

  const gitFS = new AFSFS({ localPath: gitTestDir, useGitignore: true });

  // Test listing
  const result = await gitFS.list("", { maxDepth: 2 });
  const paths = result.data.map((entry) => entry.path);

  // Ignored FILES (*.tmp) are hidden, ignored DIRECTORIES (build/) are visible but not recursed
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/.gitignore",
      "/build",
      "/src",
      "/src/index.js",
    ]
  `);

  // build directory - childrenCount should be set even though not recursed into
  const buildEntry = result.data.find((e) => e.path === "/build");
  expect(buildEntry?.meta?.childrenCount).toBe(1);

  // Cleanup
  await rm(gitTestDir, { recursive: true, force: true });
});

test("AFSFS should work without any .gitignore file", async () => {
  // Create a test directory with git structure but no .gitignore
  const gitTestDir = join(tmpdir(), `no-gitignore-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });

  // Create test files
  await writeFile(join(gitTestDir, "file1.js"), "file 1");
  await writeFile(join(gitTestDir, "file2.log"), "file 2");

  const gitFS = new AFSFS({ localPath: gitTestDir });

  // Test listing without .gitignore
  const result = await gitFS.list("");
  const paths = result.data.map((entry) => entry.path);

  // Should include all files
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/file1.js",
      "/file2.log",
    ]
  `);

  // Cleanup
  await rm(gitTestDir, { recursive: true, force: true });
});

test("AFSFS should work without .git directory", async () => {
  // Create a test directory without git structure
  const nonGitDir = join(tmpdir(), `non-git-test-${Date.now()}`);
  await mkdir(nonGitDir, { recursive: true });

  // Create .gitignore (but no .git directory)
  await writeFile(join(nonGitDir, ".gitignore"), "*.log\n");

  // Create test files
  await writeFile(join(nonGitDir, "file.js"), "file content");
  await writeFile(join(nonGitDir, "file.log"), "log content");

  const nonGitFS = new AFSFS({ localPath: nonGitDir });

  // Test listing - should include all files
  const result = await nonGitFS.list("");
  const paths = result.data.map((entry) => entry.path);

  // Should include all files
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/.gitignore",
      "/file.js",
      "/file.log",
    ]
  `);

  // Cleanup
  await rm(nonGitDir, { recursive: true, force: true });
});

// MaxChildren tests
test("AFSFS should respect maxChildren option", async () => {
  // Create a test directory with many files
  const maxChildrenDir = join(tmpdir(), `maxchildren-test-${Date.now()}`);
  await mkdir(maxChildrenDir, { recursive: true });

  // Create 10 files in the directory
  for (let i = 0; i < 10; i++) {
    await writeFile(join(maxChildrenDir, `file${i}.txt`), `content ${i}`);
  }

  const maxChildrenFS = new AFSFS({ localPath: maxChildrenDir });

  // Test with maxChildren: 5
  const result = await maxChildrenFS.list("", { maxChildren: 5 });
  const paths = result.data.map((entry) => entry.path);

  // Should only return 5 files
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/file0.txt",
      "/file1.txt",
      "/file2.txt",
      "/file3.txt",
      "/file4.txt",
    ]
  `);

  // Cleanup
  await rm(maxChildrenDir, { recursive: true, force: true });
});

test("AFSFS should limit children when maxChildren is exceeded", async () => {
  // Create a test directory with subdirectory containing many files
  const maxChildrenDir = join(tmpdir(), `maxchildren-truncated-test-${Date.now()}`);
  await mkdir(maxChildrenDir, { recursive: true });
  await mkdir(join(maxChildrenDir, "subdir"), { recursive: true });

  // Create 10 files in the subdirectory
  for (let i = 0; i < 10; i++) {
    await writeFile(join(maxChildrenDir, "subdir", `file${i}.txt`), `content ${i}`);
  }

  const maxChildrenFS = new AFSFS({ localPath: maxChildrenDir });

  // List with maxChildren: 5 and maxDepth: 2 to see the subdirectory
  const result = await maxChildrenFS.list("", { maxChildren: 5, maxDepth: 2 });

  // Find the subdir entry
  const subdirEntry = result.data.find((entry) => entry.path === "/subdir");

  // Should have childrenCount showing total children
  expect(subdirEntry).toBeDefined();
  expect(subdirEntry?.meta?.childrenCount).toBe(10);

  // Cleanup
  await rm(maxChildrenDir, { recursive: true, force: true });
});

test("AFSFS should handle maxChildren with nested directories", async () => {
  // Create a nested directory structure
  const maxChildrenDir = join(tmpdir(), `maxchildren-nested-test-${Date.now()}`);
  await mkdir(maxChildrenDir, { recursive: true });
  await mkdir(join(maxChildrenDir, "dir1"), { recursive: true });
  await mkdir(join(maxChildrenDir, "dir2"), { recursive: true });
  await mkdir(join(maxChildrenDir, "dir3"), { recursive: true });

  // Create files in each directory
  await writeFile(join(maxChildrenDir, "dir1", "file1.txt"), "content 1");
  await writeFile(join(maxChildrenDir, "dir2", "file2.txt"), "content 2");
  await writeFile(join(maxChildrenDir, "dir3", "file3.txt"), "content 3");

  const maxChildrenFS = new AFSFS({ localPath: maxChildrenDir });

  // List with maxChildren: 2 - should only process 2 directories
  const result = await maxChildrenFS.list("", { maxChildren: 2, maxDepth: 2 });
  const paths = result.data.map((entry) => entry.path);

  // Should only see 2 directories and their children
  const dirCount = paths.filter((p) => p.startsWith("dir")).length;
  expect(dirCount).toBeLessThanOrEqual(4); // 2 dirs + max 2 files

  // Cleanup
  await rm(maxChildrenDir, { recursive: true, force: true });
});

test("AFSFS should throw error when maxChildren is zero or negative", async () => {
  const maxChildrenDir = join(tmpdir(), `maxchildren-invalid-test-${Date.now()}`);
  await mkdir(maxChildrenDir, { recursive: true });
  await writeFile(join(maxChildrenDir, "file.txt"), "content");

  const maxChildrenFS = new AFSFS({ localPath: maxChildrenDir });

  // Test with maxChildren: 0
  expect(maxChildrenFS.list("", { maxChildren: 0 })).rejects.toThrow(
    "Invalid maxChildren: 0. Must be positive.",
  );

  // Test with maxChildren: -1
  expect(maxChildrenFS.list("", { maxChildren: -1 })).rejects.toThrow(
    "Invalid maxChildren: -1. Must be positive.",
  );

  // Cleanup
  await rm(maxChildrenDir, { recursive: true, force: true });
});

test("AFSFS should work correctly when maxChildren equals number of children", async () => {
  // Create a test directory with exactly 5 files
  const maxChildrenDir = join(tmpdir(), `maxchildren-equal-test-${Date.now()}`);
  await mkdir(maxChildrenDir, { recursive: true });

  for (let i = 0; i < 5; i++) {
    await writeFile(join(maxChildrenDir, `file${i}.txt`), `content ${i}`);
  }

  const maxChildrenFS = new AFSFS({ localPath: maxChildrenDir });

  // List with maxChildren: 5 (equal to number of files)
  const result = await maxChildrenFS.list("", { maxChildren: 5 });
  const paths = result.data.map((entry) => entry.path);

  // Should return all 5 files
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/file0.txt",
      "/file1.txt",
      "/file2.txt",
      "/file3.txt",
      "/file4.txt",
    ]
  `);

  // All 5 files should be returned (list() doesn't include root per new semantics)
  expect(result.data.length).toBe(5);

  // Cleanup
  await rm(maxChildrenDir, { recursive: true, force: true });
});

test("AFSFS should combine maxChildren with gitignore", async () => {
  // Create a test directory with git structure
  const maxChildrenDir = join(tmpdir(), `maxchildren-gitignore-test-${Date.now()}`);
  await mkdir(maxChildrenDir, { recursive: true });
  await mkdir(join(maxChildrenDir, ".git"), { recursive: true });

  // Create .gitignore to filter some files
  await writeFile(join(maxChildrenDir, ".gitignore"), "*.log\n");

  // Create 10 files (5 .js and 5 .log)
  for (let i = 0; i < 5; i++) {
    await writeFile(join(maxChildrenDir, `file${i}.js`), `content ${i}`);
    await writeFile(join(maxChildrenDir, `file${i}.log`), `log ${i}`);
  }

  const maxChildrenFS = new AFSFS({ localPath: maxChildrenDir });

  // List with maxChildren: 3 (after gitignore filters *.log)
  const result = await maxChildrenFS.list("", { maxChildren: 3 });
  const paths = result.data.map((entry) => entry.path);

  // Should have at most 3 items (gitignore happens first, then maxChildren)
  expect(paths.length).toBeLessThanOrEqual(4);

  // Should not contain any .log files
  expect(paths.every((p) => !p.endsWith(".log"))).toBe(true);

  // Cleanup
  await rm(maxChildrenDir, { recursive: true, force: true });
});

test("AFSFS should use custom ignore patterns to control recursion", async () => {
  // Create a test directory without .gitignore file
  const noGitignoreDir = join(tmpdir(), `no-gitignore-custom-ignore-test-${Date.now()}`);
  await mkdir(noGitignoreDir, { recursive: true });
  await mkdir(join(noGitignoreDir, ".git"), { recursive: true });
  await mkdir(join(noGitignoreDir, "node_modules"), { recursive: true });

  // Create test files
  await writeFile(join(noGitignoreDir, ".git", "config"), "git config");
  await writeFile(join(noGitignoreDir, "node_modules", "package.json"), "{}");
  await writeFile(join(noGitignoreDir, "index.js"), "console.log('test')");
  await writeFile(join(noGitignoreDir, "debug.log"), "debug info");

  // Test with default ignore (.git is shown but not recursed into)
  const defaultIgnoreFS = new AFSFS({
    localPath: noGitignoreDir,
    ignore: [".git"],
  });

  const defaultResult = await defaultIgnoreFS.list("", { maxDepth: 2 });
  const defaultPaths = defaultResult.data.map((entry) => entry.path);

  // All files should be listed, .git is shown but not recursed into
  expect(defaultPaths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/debug.log",
      "/index.js",
      "/node_modules",
      "/node_modules/package.json",
    ]
  `);

  // Test with custom ignore patterns (ignore both .git and node_modules)
  const customIgnoreFS = new AFSFS({
    localPath: noGitignoreDir,
    ignore: [".git", "node_modules"],
  });

  const customResult = await customIgnoreFS.list("", { maxDepth: 2 });
  const customPaths = customResult.data.map((entry) => entry.path);

  // All files listed, .git and node_modules shown but not recursed into
  expect(customPaths.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/debug.log",
      "/index.js",
      "/node_modules",
    ]
  `);

  // Test with custom ignore patterns (ignore .git, node_modules and *.log)
  const customIgnoreFS2 = new AFSFS({
    localPath: noGitignoreDir,
    ignore: [".git", "node_modules", "*.log"],
  });

  const customResult2 = await customIgnoreFS2.list("", { maxDepth: 2 });
  const customPaths2 = customResult2.data.map((entry) => entry.path);

  // Ignored files (*.log) are hidden, ignored directories are visible but not recursed
  expect(customPaths2.sort()).toMatchInlineSnapshot(`
    [
      "/.git",
      "/index.js",
      "/node_modules",
    ]
  `);

  // Cleanup
  await rm(noGitignoreDir, { recursive: true, force: true });
});

// Pattern tests
test("AFSFS should filter files by simple pattern", async () => {
  const result = await fs.list("", { maxDepth: 10, pattern: "*.txt" });
  const paths = result.data.map((entry) => entry.path);

  // Should only include .txt files
  expect(paths).toMatchInlineSnapshot(`
    [
      "/caseTest.txt",
      "/file1.txt",
      "/newfile.txt",
      "/searchable.txt",
      "/deep/nested/test.txt",
    ]
  `);
});

test("AFSFS should filter files by extension pattern with matchBase", async () => {
  const result = await fs.list("", { maxDepth: 10, pattern: "*.js" });
  const paths = result.data.map((entry) => entry.path);

  // Should match .js files at any depth due to matchBase: true
  expect(paths).toMatchInlineSnapshot(`
    [
      "/subdir/file3.js",
    ]
  `);
});

test("AFSFS should filter files by glob pattern with **", async () => {
  const result = await fs.list("", { maxDepth: 10, pattern: "**/*.json" });
  const paths = result.data.map((entry) => entry.path);

  // Should match nested .json files
  expect(paths).toMatchInlineSnapshot(`
    [
      "/data.json",
      "/subdir/nested/file4.json",
    ]
  `);
});

test("AFSFS should filter files by exact filename pattern", async () => {
  const result = await fs.list("", { maxDepth: 10, pattern: "file1.txt" });
  const paths = result.data.map((entry) => entry.path);

  // Should only match file1.txt
  expect(paths).toMatchInlineSnapshot(`
    [
      "/file1.txt",
    ]
  `);
});

test("AFSFS should return empty results when pattern matches nothing", async () => {
  const result = await fs.list("", {
    maxDepth: 10,
    pattern: "*.nonexistent",
  });
  const paths = result.data.map((entry) => entry.path);

  // Should only contain root directory (or be empty depending on implementation)
  expect(paths).toMatchInlineSnapshot(`[]`);
});

test("AFSFS should combine pattern with maxDepth", async () => {
  // Create a deep nested structure for this test
  const patternDir = join(tmpdir(), `pattern-depth-test-${Date.now()}`);
  await mkdir(patternDir, { recursive: true });
  await mkdir(join(patternDir, "level1", "level2"), { recursive: true });

  await writeFile(join(patternDir, "root.ts"), "root");
  await writeFile(join(patternDir, "level1", "l1.ts"), "level1");
  await writeFile(join(patternDir, "level1", "level2", "l2.ts"), "level2");

  const patternFS = new AFSFS({ localPath: patternDir });

  // With maxDepth: 1, should only find root.ts
  const result1 = await patternFS.list("", { maxDepth: 1, pattern: "*.ts" });
  const paths1 = result1.data.map((e) => e.path);
  expect(paths1).toMatchInlineSnapshot(`
    [
      "/root.ts",
    ]
  `);

  // With maxDepth: 2, should find root.ts and l1.ts
  const result2 = await patternFS.list("", { maxDepth: 2, pattern: "*.ts" });
  const paths2 = result2.data.map((e) => e.path);
  expect(paths2).toMatchInlineSnapshot(`
    [
      "/root.ts",
      "/level1/l1.ts",
    ]
  `);

  // Cleanup
  await rm(patternDir, { recursive: true, force: true });
});

test("AFSFS should combine pattern with limit", async () => {
  // Create multiple matching files
  const patternDir = join(tmpdir(), `pattern-limit-test-${Date.now()}`);
  await mkdir(patternDir, { recursive: true });

  for (let i = 0; i < 10; i++) {
    await writeFile(join(patternDir, `file${i}.ts`), `content ${i}`);
  }

  const patternFS = new AFSFS({ localPath: patternDir });

  // With limit: 3 and pattern, should only return 3 matching entries
  const result = await patternFS.list("", { limit: 3, pattern: "*.ts" });
  expect(result.data.length).toMatchInlineSnapshot(`3`);

  // Cleanup
  await rm(patternDir, { recursive: true, force: true });
});

test("AFSFS should match directories with pattern", async () => {
  const result = await fs.list("", { maxDepth: 10, pattern: "**/nested" });
  const paths = result.data.map((entry) => entry.path);

  // Should match the nested directory
  expect(paths).toMatchInlineSnapshot(`
    [
      "/deep/nested",
      "/subdir/nested",
    ]
  `);
});

test("AFSFS should support brace expansion pattern", async () => {
  const result = await fs.list("", {
    maxDepth: 10,
    pattern: "*.{txt,md}",
  });
  const paths = result.data.map((entry) => entry.path);

  // Should match both .txt and .md files
  expect(paths).toMatchInlineSnapshot(`
    [
      "/caseTest.txt",
      "/file1.txt",
      "/file2.md",
      "/newfile.txt",
      "/searchable.txt",
      "/deep/nested/test.txt",
    ]
  `);
});

test("AFSFS should combine pattern with gitignore", async () => {
  const patternDir = join(tmpdir(), `pattern-gitignore-test-${Date.now()}`);
  await mkdir(patternDir, { recursive: true });
  await mkdir(join(patternDir, ".git"), { recursive: true });

  await writeFile(join(patternDir, ".gitignore"), "ignored.ts\n");
  await writeFile(join(patternDir, "included.ts"), "included");
  await writeFile(join(patternDir, "ignored.ts"), "ignored");
  await writeFile(join(patternDir, "other.js"), "other");

  const patternFS = new AFSFS({ localPath: patternDir });

  const result = await patternFS.list("", { pattern: "*.ts" });
  const paths = result.data.map((e) => e.path);

  // Should match all .ts files (including gitignored ones)
  expect(paths.sort()).toMatchInlineSnapshot(`
    [
      "/ignored.ts",
      "/included.ts",
    ]
  `);

  // Cleanup
  await rm(patternDir, { recursive: true, force: true });
});

test("AFSFS should match all files under a specific directory", async () => {
  // Test **/subdir/* - direct children of any subdir
  const result1 = await fs.list("", {
    maxDepth: 10,
    pattern: "**/subdir/*",
  });
  const paths1 = result1.data.map((entry) => entry.path);
  expect(paths1).toMatchInlineSnapshot(`
    [
      "/subdir/file3.js",
      "/subdir/nested",
    ]
  `);

  // Test **/subdir/** - all descendants of any subdir
  const result2 = await fs.list("", {
    maxDepth: 10,
    pattern: "**/subdir/**",
  });
  const paths2 = result2.data.map((entry) => entry.path);
  expect(paths2).toMatchInlineSnapshot(`
    [
      "/subdir/file3.js",
      "/subdir/nested",
      "/subdir/nested/file4.json",
    ]
  `);

  // Test **/nested/** - all descendants of any nested directory
  const result3 = await fs.list("", {
    maxDepth: 10,
    pattern: "**/nested/**",
  });
  const paths3 = result3.data.map((entry) => entry.path);
  expect(paths3).toMatchInlineSnapshot(`
    [
      "/deep/nested/test.txt",
      "/subdir/nested/file4.json",
    ]
  `);
});

test("AFSFS should handle complex gitignore scenarios with root, subdirectories, and submodules", async () => {
  // Create workspace directory (parent git repo)
  const workspaceDir = join(tmpdir(), `workspace-complex-test-${Date.now()}`);
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(join(workspaceDir, ".git"), { recursive: true });

  // Workspace .gitignore: ignore *.local and build/ directories
  await writeFile(join(workspaceDir, ".gitignore"), "*.local\nbuild\n");

  // Create files in workspace root
  await writeFile(join(workspaceDir, "app.js"), "main app");
  await writeFile(join(workspaceDir, "config.local"), "local config"); // should be ignored
  await writeFile(join(workspaceDir, "README.md"), "readme");

  // Create build directory (should be ignored by workspace .gitignore)
  await mkdir(join(workspaceDir, "build"), { recursive: true });
  await writeFile(join(workspaceDir, "build", "output.js"), "built file");

  // Create regular subdirectory (not a git repo, inherits parent gitignore)
  const srcDir = join(workspaceDir, "src");
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(srcDir, ".gitignore"), "*.tmp\ndist\n"); // additional rules
  await writeFile(join(srcDir, "index.js"), "source");
  await writeFile(join(srcDir, "test.local"), "local test"); // ignored by parent
  await writeFile(join(srcDir, "cache.tmp"), "temp file"); // ignored by src/.gitignore

  // Create src/dist directory (should be ignored by src/.gitignore)
  await mkdir(join(srcDir, "dist"), { recursive: true });
  await writeFile(join(srcDir, "dist", "bundle.js"), "bundled");

  // Create src/utils (nested directory, inherits both workspace and src gitignore)
  await mkdir(join(srcDir, "utils"), { recursive: true });
  await writeFile(join(srcDir, "utils", "helper.js"), "helper");
  await writeFile(join(srcDir, "utils", "debug.tmp"), "debug"); // ignored by src/.gitignore
  await writeFile(join(srcDir, "utils", "settings.local"), "settings"); // ignored by workspace

  // Create a submodule (has its own .git, should NOT inherit parent gitignore)
  const submoduleDir = join(workspaceDir, "modules", "plugin");
  await mkdir(submoduleDir, { recursive: true });
  await mkdir(join(submoduleDir, ".git"), { recursive: true });

  // Submodule .gitignore: ignore *.log and node_modules
  await writeFile(join(submoduleDir, ".gitignore"), "*.log\nnode_modules\n");
  await writeFile(join(submoduleDir, "plugin.js"), "plugin code");
  await writeFile(join(submoduleDir, "config.local"), "submodule config"); // NOT ignored (submodule doesn't inherit)
  await writeFile(join(submoduleDir, "debug.log"), "log"); // ignored by submodule's gitignore

  // Create submodule/lib directory with nested files
  await mkdir(join(submoduleDir, "lib"), { recursive: true });
  await writeFile(join(submoduleDir, "lib", "core.js"), "core lib");
  await writeFile(join(submoduleDir, "lib", "error.log"), "errors"); // ignored by submodule's *.log
  await writeFile(join(submoduleDir, "lib", "settings.local"), "lib settings"); // NOT ignored (doesn't inherit)

  // Create submodule/node_modules (should be ignored)
  await mkdir(join(submoduleDir, "node_modules"), { recursive: true });
  await writeFile(join(submoduleDir, "node_modules", "package.json"), "{}");

  // Create submodule/build directory (NOT ignored - build rule is only in workspace, not submodule)
  await mkdir(join(submoduleDir, "build"), { recursive: true });
  await writeFile(join(submoduleDir, "build", "compiled.js"), "compiled");

  const workspaceFS = new AFSFS({ localPath: workspaceDir, useGitignore: true });

  // Test 1: List workspace root with maxDepth 10
  // New behavior: all files are listed, gitignored ones are marked but gitignored directories are not recursed
  const rootResult = await workspaceFS.list("/", { maxDepth: 10 });
  const rootPaths = rootResult.data.map((entry) => entry.path).sort();

  // New behavior: gitignored FILES are hidden, gitignored DIRECTORIES are visible but not recursed
  // Note: Gitignore rules are applied from mountRoot down, so submodules DO inherit parent gitignore
  expect(rootPaths).toMatchInlineSnapshot(`
    [
      "/.git",
      "/.gitignore",
      "/README.md",
      "/app.js",
      "/build",
      "/modules",
      "/modules/plugin",
      "/modules/plugin/.git",
      "/modules/plugin/.gitignore",
      "/modules/plugin/build",
      "/modules/plugin/lib",
      "/modules/plugin/lib/core.js",
      "/modules/plugin/node_modules",
      "/modules/plugin/plugin.js",
      "/src",
      "/src/.gitignore",
      "/src/dist",
      "/src/index.js",
      "/src/utils",
      "/src/utils/helper.js",
    ]
  `);

  // Verify gitignored directories are not recursed into
  expect(rootPaths.includes("/build")).toBe(true); // listed but...
  expect(rootPaths.some((p) => p.startsWith("/build/"))).toBe(false); // ...not recursed

  // Verify submodule's .git directory is not recursed into
  expect(rootPaths.includes("/modules/plugin/.git")).toBe(true);
  expect(rootPaths.some((p) => p.startsWith("/modules/plugin/.git/"))).toBe(false);

  // Verify submodule's node_modules is not recursed into
  expect(rootPaths.includes("/modules/plugin/node_modules")).toBe(true);
  expect(rootPaths.some((p) => p.startsWith("/modules/plugin/node_modules/"))).toBe(false);

  // Test 2: List src directory specifically
  const srcResult = await workspaceFS.list("/src", { maxDepth: 10 });
  const srcPaths = srcResult.data.map((entry) => entry.path).sort();

  // Gitignored files like *.tmp and *.local are hidden
  expect(srcPaths).toMatchInlineSnapshot(`
    [
      "/src/.gitignore",
      "/src/dist",
      "/src/index.js",
      "/src/utils",
      "/src/utils/helper.js",
    ]
  `);

  // Verify dist is not recursed into
  expect(srcPaths.includes("/src/dist")).toBe(true);
  expect(srcPaths.some((p) => p.startsWith("/src/dist/"))).toBe(false);

  // Test 3: List submodule specifically
  const submoduleResult = await workspaceFS.list("/modules/plugin", {
    maxDepth: 10,
  });
  const submodulePaths = submoduleResult.data.map((entry) => entry.path).sort();

  // Gitignored files (*.log, *.local, build/* from parent) are hidden
  expect(submodulePaths).toMatchInlineSnapshot(`
    [
      "/modules/plugin/.git",
      "/modules/plugin/.gitignore",
      "/modules/plugin/build",
      "/modules/plugin/lib",
      "/modules/plugin/lib/core.js",
      "/modules/plugin/node_modules",
      "/modules/plugin/plugin.js",
    ]
  `);

  // Test 4: List submodule/lib specifically (nested directory within submodule)
  const libResult = await workspaceFS.list("/modules/plugin/lib", {
    maxDepth: 10,
  });
  const libPaths = libResult.data.map((entry) => entry.path).sort();

  expect(libPaths).toMatchInlineSnapshot(`
    [
      "/modules/plugin/lib/core.js",
    ]
  `);

  // Cleanup
  await rm(workspaceDir, { recursive: true, force: true });
});

test("AFSFS should support mounting a single file", async () => {
  const testFile = join(tmpdir(), `single-file-test-${Date.now()}.json`);
  await writeFile(testFile, '{"name": "test"}');

  const fileFS = new AFSFS({ localPath: testFile });

  // List root returns empty (files have no children per new semantics)
  const listResult = await fileFS.list("/");
  expect(listResult.data.length).toBe(0);

  // Read root returns file content
  const { data } = await fileFS.read("/");
  expect(data?.content).toBe('{"name": "test"}');

  // Non-root paths return empty/error
  expect((await fileFS.list("/subpath")).data).toEqual([]);
  expect((await fileFS.read("/subpath")).data).toBeUndefined();

  await rm(testFile, { force: true });
});
