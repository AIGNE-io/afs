import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";

let gitTestDir: string;
let gitAFS: AFS;

beforeAll(async () => {
  // Create a complex test directory structure with multiple .gitignore files
  gitTestDir = join(tmpdir(), `afs-gitignore-test-${Date.now()}`);
  await mkdir(gitTestDir, { recursive: true });
  await mkdir(join(gitTestDir, ".git"), { recursive: true });

  // Create root .gitignore
  await writeFile(
    join(gitTestDir, ".gitignore"),
    `*.log
node_modules/
.env
build/
`,
  );

  // Create root level files
  await writeFile(join(gitTestDir, "README.md"), "# Project");
  await writeFile(join(gitTestDir, "index.js"), "console.log('main')");
  await writeFile(join(gitTestDir, "debug.log"), "debug info"); // should be ignored
  await writeFile(join(gitTestDir, ".env"), "SECRET=123"); // should be ignored

  // Create build directory (should be ignored)
  await mkdir(join(gitTestDir, "build"), { recursive: true });
  await writeFile(join(gitTestDir, "build", "output.js"), "built file");

  // Create node_modules directory (should be ignored)
  await mkdir(join(gitTestDir, "node_modules"), { recursive: true });
  await writeFile(join(gitTestDir, "node_modules", "package.json"), "{}");

  // Create src directory with its own .gitignore
  await mkdir(join(gitTestDir, "src"), { recursive: true });
  await writeFile(
    join(gitTestDir, "src", ".gitignore"),
    `*.tmp
*.cache
`,
  );
  await writeFile(join(gitTestDir, "src", "main.js"), "main code");
  await writeFile(join(gitTestDir, "src", "test.tmp"), "temp file"); // should be ignored by src/.gitignore
  await writeFile(join(gitTestDir, "src", "data.cache"), "cache data"); // should be ignored by src/.gitignore
  await writeFile(join(gitTestDir, "src", "debug.log"), "src debug"); // should be ignored by root .gitignore

  // Create src/utils subdirectory
  await mkdir(join(gitTestDir, "src", "utils"), { recursive: true });
  await writeFile(join(gitTestDir, "src", "utils", "helper.js"), "helper code");
  await writeFile(join(gitTestDir, "src", "utils", "test.tmp"), "utils temp"); // should be ignored

  // Create tests directory
  await mkdir(join(gitTestDir, "tests"), { recursive: true });
  await writeFile(join(gitTestDir, "tests", "test.spec.js"), "test code");

  // Initialize AFS with AFSFS
  const localFS = new AFSFS({ name: "project", localPath: gitTestDir, useGitignore: true });
  gitAFS = new AFS();
  await gitAFS.mount(localFS);
});

afterAll(async () => {
  // Clean up test directory
  await rm(gitTestDir, { recursive: true, force: true });
});

/** Helper to extract paths from list result */
function getPaths(result: { data: { path: string }[] }): string[] {
  return result.data.map((e) => e.path).sort();
}

test("AFS list should hide gitignored files and not recurse into gitignored directories", async () => {
  // New behavior: gitignored FILES are hidden, gitignored DIRECTORIES are visible but not recursed
  const result = await gitAFS.list("/modules/project", { maxDepth: 3 });
  const paths = getPaths(result);

  // Should include visible files and directories (not the path itself per new semantics)
  expect(paths).not.toContain("/modules/project"); // list() never includes self
  expect(paths).toContain("/modules/project/.gitignore");
  expect(paths).toContain("/modules/project/README.md");
  expect(paths).toContain("/modules/project/index.js");
  expect(paths).toContain("/modules/project/src");
  expect(paths).toContain("/modules/project/src/main.js");
  expect(paths).toContain("/modules/project/src/utils");
  expect(paths).toContain("/modules/project/src/utils/helper.js");
  expect(paths).toContain("/modules/project/tests");
  expect(paths).toContain("/modules/project/tests/test.spec.js");

  // Should NOT include gitignored files
  expect(paths).not.toContain("/modules/project/debug.log");
  expect(paths).not.toContain("/modules/project/.env");
  expect(paths).not.toContain("/modules/project/src/test.tmp");
  expect(paths).not.toContain("/modules/project/src/data.cache");
  expect(paths).not.toContain("/modules/project/src/debug.log");

  // Test listing src subdirectory
  const srcResult = await gitAFS.list("/modules/project/src", { maxDepth: 3 });
  const srcPaths = getPaths(srcResult);

  // list() never includes self per new semantics
  expect(srcPaths).not.toContain("/modules/project/src");
  expect(srcPaths).toContain("/modules/project/src/main.js");
  expect(srcPaths).toContain("/modules/project/src/utils/helper.js");
  expect(srcPaths).not.toContain("/modules/project/src/test.tmp");
});

test("AFS list should show all files when gitignore is not enabled", async () => {
  // Create a new AFS with gitignore disabled to show all files
  const noGitignoreFS = new AFSFS({ name: "project-noignore", localPath: gitTestDir });
  const noGitignoreAFS = new AFS();
  await noGitignoreAFS.mount(noGitignoreFS);

  const result = await noGitignoreAFS.list("/modules/project-noignore", { maxDepth: 3 });
  const paths = getPaths(result);

  // Should include ALL files including gitignored ones
  expect(paths).toContain("/modules/project-noignore/.env");
  expect(paths).toContain("/modules/project-noignore/debug.log");
  expect(paths).toContain("/modules/project-noignore/build/output.js");
  expect(paths).toContain("/modules/project-noignore/node_modules/package.json");
  expect(paths).toContain("/modules/project-noignore/src/test.tmp");
  expect(paths).toContain("/modules/project-noignore/src/data.cache");
  expect(paths).toContain("/modules/project-noignore/src/debug.log");
});

test("AFS list should handle nested .gitignore files correctly", async () => {
  const result = await gitAFS.list("/modules/project/src", { maxDepth: 2 });
  const paths = getPaths(result);

  // Should include visible children (not the path itself per new semantics)
  expect(paths).not.toContain("/modules/project/src"); // list() never includes self
  expect(paths).toContain("/modules/project/src/.gitignore");
  expect(paths).toContain("/modules/project/src/main.js");
  expect(paths).toContain("/modules/project/src/utils");
  expect(paths).toContain("/modules/project/src/utils/helper.js");

  // Should NOT include files ignored by nested .gitignore
  expect(paths).not.toContain("/modules/project/src/test.tmp");
  expect(paths).not.toContain("/modules/project/src/data.cache");
});

test("AFS list should handle maxChildren with nested directories", async () => {
  // Create a test directory with nested structure
  const nestedDir = join(tmpdir(), `afs-nested-maxchildren-test-${Date.now()}`);
  await mkdir(nestedDir, { recursive: true });

  // Create multiple directories at root level
  for (let i = 0; i < 8; i++) {
    await mkdir(join(nestedDir, `dir${i}`), { recursive: true });
    // Create files in each directory
    for (let j = 0; j < 8; j++) {
      await writeFile(join(nestedDir, `dir${i}`, `file${j}.txt`), `content ${i}-${j}`);
    }
  }

  // Create some root-level files
  for (let i = 0; i < 3; i++) {
    await writeFile(join(nestedDir, `root${i}.txt`), `root content ${i}`);
  }

  const localFS = new AFSFS({ name: "nested-test", localPath: nestedDir });
  const testAFS = new AFS();
  await testAFS.mount(localFS);

  // Test with maxChildren: 5 to limit children at each level
  const result = await testAFS.list("/modules/nested-test", {
    maxDepth: 2,
    maxChildren: 5,
  });

  // Verify maxChildren limits are applied
  const rootChildren = result.data.filter(
    (e) => e.path.startsWith("/modules/nested-test/") && e.path.split("/").length === 4,
  );
  expect(rootChildren.length).toBeLessThanOrEqual(5);

  // Cleanup
  await rm(nestedDir, { recursive: true, force: true });
});
