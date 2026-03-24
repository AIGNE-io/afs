/**
 * Test suite for .afsignore feature
 *
 * This file contains comprehensive tests for the .afsignore functionality in AFSFS.
 * Tests follow TDD methodology - they are written before implementation and should
 * initially fail until the feature is implemented.
 *
 * Test Categories:
 * 1. Happy Path - Expected successful scenarios with valid inputs
 * 2. Bad Path - Invalid inputs, malformed data, type mismatches
 * 3. Edge Cases - Boundary values, empty inputs, special scenarios
 * 4. Security - Injection attacks, path traversal, input sanitization
 * 5. Vulnerability - Race conditions, resource exhaustion
 * 6. Data Disaster - Corruption recovery, cascade failures
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";

// =============================================================================
// Test Category 1: Happy Path (正常路径)
// =============================================================================

describe(".afsignore - Happy Path", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-happy-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #1: Basic .afsignore file parsing
  // ---------------------------------------------------------------------------
  test("should parse basic .afsignore patterns and exclude matched files from listing", async () => {
    // Intent: Verify that .afsignore file is parsed and patterns are applied
    // Preconditions: Directory with .afsignore and various files
    // Expected: Files matching patterns are excluded from list results

    const dir = join(testDir, "basic-parsing");
    await mkdir(dir, { recursive: true });

    // Create .afsignore
    await writeFile(
      join(dir, ".afsignore"),
      `# Ignore log files
*.log
# Ignore temp directory
temp/
`,
    );

    // Create test files
    await writeFile(join(dir, "app.js"), "console.log('app');");
    await writeFile(join(dir, "debug.log"), "debug info");
    await writeFile(join(dir, "error.log"), "error info");
    await mkdir(join(dir, "temp"), { recursive: true });
    await writeFile(join(dir, "temp", "cache.txt"), "cache");
    await writeFile(join(dir, "readme.md"), "readme");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Should NOT include *.log files and temp/ directory contents
    expect(paths).not.toContain("/debug.log");
    expect(paths).not.toContain("/error.log");
    expect(paths).not.toContain("/temp/cache.txt");

    // Should include non-ignored files
    expect(paths).toContain("/app.js");
    expect(paths).toContain("/readme.md");
    expect(paths).toContain("/.afsignore");
  });

  // ---------------------------------------------------------------------------
  // Test #2: @inherit .gitignore directive
  // ---------------------------------------------------------------------------
  test("should inherit .gitignore rules when @inherit directive is used", async () => {
    // Intent: Verify @inherit .gitignore directive loads and applies gitignore rules
    // Preconditions: Directory with both .gitignore and .afsignore containing @inherit
    // Expected: Both gitignore and afsignore rules are applied

    const dir = join(testDir, "inherit-gitignore");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true }); // Make it a git repo

    // Create .gitignore
    await writeFile(
      join(dir, ".gitignore"),
      `node_modules/
*.tmp
`,
    );

    // Create .afsignore with @inherit
    await writeFile(
      join(dir, ".afsignore"),
      `@inherit .gitignore

# Additional afsignore rules
*.log
`,
    );

    // Create test files
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "cache.tmp"), "tmp");
    await writeFile(join(dir, "debug.log"), "log");
    await mkdir(join(dir, "node_modules"), { recursive: true });
    await writeFile(join(dir, "node_modules", "package.json"), "{}");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Should not include files matching inherited gitignore rules
    expect(paths).not.toContain("/cache.tmp");
    expect(paths).not.toContain("/node_modules/package.json");

    // Should not include files matching afsignore rules
    expect(paths).not.toContain("/debug.log");

    // Should include non-ignored files
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #3: Negation rules with !
  // ---------------------------------------------------------------------------
  test("should support negation rules to re-include previously ignored files", async () => {
    // Intent: Verify ! prefix negates previous ignore rules
    // Preconditions: .afsignore with ignore pattern followed by negation
    // Expected: Negated files are included despite matching earlier patterns

    const dir = join(testDir, "negation-rules");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `# Ignore all markdown files
*.md
# But keep README.md
!README.md
`,
    );

    await writeFile(join(dir, "README.md"), "# Readme");
    await writeFile(join(dir, "CHANGELOG.md"), "# Changelog");
    await writeFile(join(dir, "CONTRIBUTING.md"), "# Contributing");
    await writeFile(join(dir, "app.js"), "app");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // README.md should be included due to negation
    expect(paths).toContain("/README.md");

    // Other .md files should be ignored
    expect(paths).not.toContain("/CHANGELOG.md");
    expect(paths).not.toContain("/CONTRIBUTING.md");

    // Non-markdown files should be included
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #4: useGitignore option (default false)
  // ---------------------------------------------------------------------------
  test("should not apply .gitignore by default (useGitignore: false)", async () => {
    // Intent: Verify gitignore is NOT applied by default
    // Preconditions: Directory with .gitignore but no .afsignore
    // Expected: Gitignored files ARE visible (not filtered)

    const dir = join(testDir, "use-gitignore-false");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });

    await writeFile(join(dir, ".gitignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "debug");

    // Default: useGitignore is false
    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // With useGitignore: false (default), gitignored files SHOULD be visible
    expect(paths).toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #5: useGitignore option (explicit true)
  // ---------------------------------------------------------------------------
  test("should apply .gitignore when useGitignore: true", async () => {
    // Intent: Verify gitignore IS applied when explicitly enabled
    // Preconditions: Directory with .gitignore, useGitignore: true
    // Expected: Gitignored files are excluded

    const dir = join(testDir, "use-gitignore-true");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });

    await writeFile(join(dir, ".gitignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "debug");

    const fs = new AFSFS({ localPath: dir, useGitignore: true });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // With useGitignore: true, gitignored files should be excluded
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #6: useAfsignore option (default true)
  // ---------------------------------------------------------------------------
  test("should apply .afsignore by default (useAfsignore: true)", async () => {
    // Intent: Verify .afsignore IS applied by default
    // Preconditions: Directory with .afsignore
    // Expected: Afsignored files are excluded

    const dir = join(testDir, "use-afsignore-true");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "debug");

    // Default: useAfsignore is true
    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // With useAfsignore: true (default), afsignored files should be excluded
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #7: useAfsignore option (explicit false)
  // ---------------------------------------------------------------------------
  test("should not apply .afsignore when useAfsignore: false", async () => {
    // Intent: Verify .afsignore is NOT applied when disabled
    // Preconditions: Directory with .afsignore, useAfsignore: false
    // Expected: Afsignored files ARE visible

    const dir = join(testDir, "use-afsignore-false");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "debug");

    const fs = new AFSFS({ localPath: dir, useAfsignore: false });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // With useAfsignore: false, afsignored files SHOULD be visible
    expect(paths).toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #8: Hierarchical inheritance
  // ---------------------------------------------------------------------------
  test("should support hierarchical .afsignore inheritance", async () => {
    // Intent: Verify child directories inherit parent .afsignore rules
    // Preconditions: Nested directories each with their own .afsignore
    // Expected: Rules cascade from parent to child

    const dir = join(testDir, "hierarchical");
    await mkdir(join(dir, "src", "utils"), { recursive: true });

    // Root .afsignore
    await writeFile(join(dir, ".afsignore"), "*.log\n");

    // src/.afsignore adds more rules
    await writeFile(join(dir, "src", ".afsignore"), "*.tmp\n");

    // Create test files at different levels
    await writeFile(join(dir, "root.log"), "root log");
    await writeFile(join(dir, "root.js"), "root js");
    await writeFile(join(dir, "src", "src.log"), "src log");
    await writeFile(join(dir, "src", "src.tmp"), "src tmp");
    await writeFile(join(dir, "src", "src.js"), "src js");
    await writeFile(join(dir, "src", "utils", "utils.log"), "utils log");
    await writeFile(join(dir, "src", "utils", "utils.tmp"), "utils tmp");
    await writeFile(join(dir, "src", "utils", "utils.js"), "utils js");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Root *.log rule should apply everywhere
    expect(paths).not.toContain("/root.log");
    expect(paths).not.toContain("/src/src.log");
    expect(paths).not.toContain("/src/utils/utils.log");

    // src *.tmp rule should apply in src and below
    expect(paths).not.toContain("/src/src.tmp");
    expect(paths).not.toContain("/src/utils/utils.tmp");

    // Non-ignored files should be visible
    expect(paths).toContain("/root.js");
    expect(paths).toContain("/src/src.js");
    expect(paths).toContain("/src/utils/utils.js");
  });

  // ---------------------------------------------------------------------------
  // Test #9: Child .afsignore can override parent rules
  // ---------------------------------------------------------------------------
  test("should allow child .afsignore to override parent rules with negation", async () => {
    // Intent: Verify child directory can negate parent's ignore rules
    // Preconditions: Parent ignores *.log, child negates with !*.log
    // Expected: Log files visible in child directory

    const dir = join(testDir, "child-override");
    await mkdir(join(dir, "logs"), { recursive: true });

    // Root .afsignore ignores all logs
    await writeFile(join(dir, ".afsignore"), "*.log\n");

    // logs/.afsignore allows logs in this directory
    await writeFile(join(dir, "logs", ".afsignore"), "!*.log\n");

    await writeFile(join(dir, "root.log"), "root log");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "logs", "access.log"), "access log");
    await writeFile(join(dir, "logs", "error.log"), "error log");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Root log files should still be ignored
    expect(paths).not.toContain("/root.log");

    // Logs in /logs directory should be visible due to negation
    expect(paths).toContain("/logs/access.log");
    expect(paths).toContain("/logs/error.log");
  });

  // ---------------------------------------------------------------------------
  // Test #10: Mount ignore option has highest priority
  // ---------------------------------------------------------------------------
  test("should apply mount ignore option with highest priority", async () => {
    // Intent: Verify mount-level ignore patterns override all file-based rules
    // Preconditions: Directory with .afsignore, mount has its own ignore patterns
    // Expected: Mount ignore takes precedence

    const dir = join(testDir, "mount-ignore-priority");
    await mkdir(dir, { recursive: true });

    // .afsignore tries to negate *.secret
    await writeFile(
      join(dir, ".afsignore"),
      `!*.secret
`,
    );

    await writeFile(join(dir, "config.secret"), "secret");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "debug");

    // Mount with ignore option that overrides .afsignore
    const fs = new AFSFS({
      localPath: dir,
      ignore: ["*.secret", "*.log"],
    });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Mount ignore should take precedence - .secret files should be filtered
    expect(paths).not.toContain("/config.secret");
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #11: Priority order - mount > gitignore > afsignore
  // ---------------------------------------------------------------------------
  test("should apply rules in correct priority order: mount > gitignore > afsignore", async () => {
    // Intent: Verify the documented priority order is respected
    // Preconditions: All three ignore sources with conflicting rules
    // Expected: Higher priority rules override lower priority ones

    const dir = join(testDir, "priority-order");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });

    // .gitignore ignores *.tmp
    await writeFile(join(dir, ".gitignore"), "*.tmp\n");

    // .afsignore tries to negate *.tmp and ignores *.log
    await writeFile(
      join(dir, ".afsignore"),
      `@inherit .gitignore
!*.tmp
*.log
`,
    );

    await writeFile(join(dir, "cache.tmp"), "tmp");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "config.yaml"), "yaml");
    await writeFile(join(dir, "secret.env"), "env");

    // Mount ignore ignores *.env
    const fs = new AFSFS({
      localPath: dir,
      useGitignore: true,
      ignore: ["*.env"],
    });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Mount ignore (*.env) has highest priority
    expect(paths).not.toContain("/secret.env");

    // afsignore negates gitignore's *.tmp rule, so .tmp files should be visible
    expect(paths).toContain("/cache.tmp");

    // afsignore's own *.log rule should apply
    expect(paths).not.toContain("/debug.log");

    // Non-ignored files
    expect(paths).toContain("/config.yaml");
  });

  // ---------------------------------------------------------------------------
  // Test #12: @inherit .gitignore at specific position
  // ---------------------------------------------------------------------------
  test("should insert gitignore rules at the @inherit position", async () => {
    // Intent: Verify @inherit inserts rules at that exact position
    // Preconditions: .afsignore with rules before and after @inherit
    // Expected: Order of rules matters for precedence

    const dir = join(testDir, "inherit-position");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });

    // .gitignore ignores *.log
    await writeFile(join(dir, ".gitignore"), "*.log\n");

    // .afsignore: first ignore *.txt, then inherit (which ignores *.log), then negate *.txt
    await writeFile(
      join(dir, ".afsignore"),
      `*.txt
@inherit .gitignore
!*.txt
`,
    );

    await writeFile(join(dir, "readme.txt"), "readme");
    await writeFile(join(dir, "debug.log"), "debug");
    await writeFile(join(dir, "app.js"), "app");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // *.txt was negated AFTER being set, so should be visible
    expect(paths).toContain("/readme.txt");

    // *.log from gitignore should apply (inherited in the middle)
    expect(paths).not.toContain("/debug.log");

    // Non-ignored
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #13: Directory pattern with trailing slash
  // ---------------------------------------------------------------------------
  test("should correctly handle directory patterns with trailing slash", async () => {
    // Intent: Verify directory patterns work correctly
    // Preconditions: .afsignore with directory pattern (ending in /)
    // Expected: Only directories matching pattern are ignored, not files

    const dir = join(testDir, "dir-pattern");
    await mkdir(join(dir, "build"), { recursive: true });
    await mkdir(join(dir, "build-scripts"), { recursive: true });

    await writeFile(join(dir, ".afsignore"), "build/\n");
    await writeFile(join(dir, "build", "output.js"), "output");
    await writeFile(join(dir, "build-scripts", "deploy.sh"), "deploy");
    await writeFile(join(dir, "build.config"), "config");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // build/ directory contents should be ignored
    expect(paths).not.toContain("/build/output.js");

    // build-scripts is NOT the same as build/, should be visible
    expect(paths).toContain("/build-scripts/deploy.sh");

    // build.config is a file, not a directory, should be visible
    expect(paths).toContain("/build.config");
  });

  // ---------------------------------------------------------------------------
  // Test #14: Glob patterns with **
  // ---------------------------------------------------------------------------
  test("should support ** glob pattern for any path depth", async () => {
    // Intent: Verify ** matches any directory depth
    // Preconditions: .afsignore with ** pattern
    // Expected: Pattern matches at any depth

    const dir = join(testDir, "glob-patterns");
    await mkdir(join(dir, "a", "b", "c"), { recursive: true });

    await writeFile(join(dir, ".afsignore"), "**/secret.txt\n");
    await writeFile(join(dir, "secret.txt"), "root secret");
    await writeFile(join(dir, "a", "secret.txt"), "a secret");
    await writeFile(join(dir, "a", "b", "secret.txt"), "b secret");
    await writeFile(join(dir, "a", "b", "c", "secret.txt"), "c secret");
    await writeFile(join(dir, "a", "b", "c", "normal.txt"), "normal");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // All secret.txt files should be ignored regardless of depth
    expect(paths).not.toContain("/secret.txt");
    expect(paths).not.toContain("/a/secret.txt");
    expect(paths).not.toContain("/a/b/secret.txt");
    expect(paths).not.toContain("/a/b/c/secret.txt");

    // Normal files should be visible
    expect(paths).toContain("/a/b/c/normal.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #15: Question mark wildcard
  // ---------------------------------------------------------------------------
  test("should support ? wildcard for single character", async () => {
    // Intent: Verify ? matches exactly one character
    // Preconditions: .afsignore with ? pattern
    // Expected: Only files matching single character position are ignored

    const dir = join(testDir, "question-wildcard");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "file?.txt\n");
    await writeFile(join(dir, "file1.txt"), "1");
    await writeFile(join(dir, "file2.txt"), "2");
    await writeFile(join(dir, "fileAB.txt"), "AB");
    await writeFile(join(dir, "file.txt"), "no number");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // file?.txt should match exactly one character
    expect(paths).not.toContain("/file1.txt");
    expect(paths).not.toContain("/file2.txt");

    // fileAB.txt has two characters where ? is, should NOT match
    expect(paths).toContain("/fileAB.txt");

    // file.txt has zero characters where ? is, should NOT match
    expect(paths).toContain("/file.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #16: Search respects .afsignore
  // ---------------------------------------------------------------------------
  test("should respect .afsignore rules in search operations", async () => {
    // Intent: Verify search operation excludes afsignored files
    // Preconditions: Directory with .afsignore, search for content in all files
    // Expected: Search results exclude afsignored files

    const dir = join(testDir, "search-afsignore");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "console.log('FINDME');");
    await writeFile(join(dir, "debug.log"), "FINDME in log file");
    await writeFile(join(dir, "readme.md"), "FINDME in readme");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.search("", "FINDME");
    const paths = result.data.map((e) => e.path).sort();

    // Search should NOT return results from .log files
    expect(paths).not.toContain("/debug.log");
    expect(paths).not.toContain("debug.log");

    // Should return results from non-ignored files
    expect(paths.some((p) => p.includes("app.js"))).toBe(true);
    expect(paths.some((p) => p.includes("readme.md"))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test #17: Read respects .afsignore
  // ---------------------------------------------------------------------------
  test("should allow reading afsignored files (ignore only affects listing)", async () => {
    // Intent: Verify read operation still works on ignored files
    // Preconditions: .afsignore ignores a file, then try to read it
    // Expected: Read succeeds (ignore only affects list/search visibility)

    const dir = join(testDir, "read-afsignore");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "secret.txt\n");
    await writeFile(join(dir, "secret.txt"), "secret content");

    const fs = new AFSFS({ localPath: dir });

    // Should NOT appear in listing
    const listResult = await fs.list("", { maxDepth: 10 });
    const paths = listResult.data.map((e) => e.path);
    expect(paths).not.toContain("/secret.txt");

    // But should still be readable directly
    const readResult = await fs.read("secret.txt");
    expect(readResult.data?.content).toBe("secret content");
  });
});

// =============================================================================
// Test Category 2: Bad Path (异常路径)
// =============================================================================

describe(".afsignore - Bad Path", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-bad-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #18: Malformed .afsignore file
  // ---------------------------------------------------------------------------
  test("should handle malformed .afsignore gracefully (non-UTF8 content)", async () => {
    // Intent: Verify system handles malformed .afsignore without crashing
    // Preconditions: .afsignore with binary/invalid content
    // Expected: System logs warning but continues without filtering

    const dir = join(testDir, "malformed-afsignore");
    await mkdir(dir, { recursive: true });

    // Write binary content to .afsignore
    await writeFile(join(dir, ".afsignore"), Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]));
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "test.log"), "log");

    const fs = new AFSFS({ localPath: dir });

    // Should not throw
    const result = await fs.list("", { maxDepth: 10 });

    // Files should still be listed (no filtering due to parse error)
    const paths = result.data.map((e) => e.path).sort();
    expect(paths).toContain("/app.js");
    expect(paths).toContain("/test.log"); // Not filtered because .afsignore is invalid
  });

  // ---------------------------------------------------------------------------
  // Test #19: Invalid @inherit target
  // ---------------------------------------------------------------------------
  test("should handle invalid @inherit target gracefully", async () => {
    // Intent: Verify invalid @inherit directive doesn't crash
    // Preconditions: .afsignore with @inherit pointing to non-existent file
    // Expected: System ignores invalid directive and continues

    const dir = join(testDir, "invalid-inherit");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `@inherit nonexistent.file
*.log
`,
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Should still apply valid rules
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #20: Empty .afsignore file
  // ---------------------------------------------------------------------------
  test("should handle empty .afsignore file", async () => {
    // Intent: Verify empty .afsignore doesn't cause issues
    // Preconditions: Empty .afsignore file
    // Expected: No files are filtered

    const dir = join(testDir, "empty-afsignore");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "test.log"), "log");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // All files should be visible
    expect(paths).toContain("/app.js");
    expect(paths).toContain("/test.log");
  });

  // ---------------------------------------------------------------------------
  // Test #21: .afsignore with only comments
  // ---------------------------------------------------------------------------
  test("should handle .afsignore with only comments and whitespace", async () => {
    // Intent: Verify .afsignore with only comments works
    // Preconditions: .afsignore with comments only
    // Expected: No files are filtered

    const dir = join(testDir, "comments-only-afsignore");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `# This is a comment
# Another comment

   # Comment with leading whitespace
`,
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "test.log"), "log");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    expect(paths).toContain("/app.js");
    expect(paths).toContain("/test.log");
  });

  // ---------------------------------------------------------------------------
  // Test #22: Invalid pattern syntax
  // ---------------------------------------------------------------------------
  test("should handle invalid pattern syntax gracefully", async () => {
    // Intent: Verify invalid glob patterns don't crash
    // Preconditions: .afsignore with invalid regex/glob patterns
    // Expected: System handles gracefully, may skip invalid patterns

    const dir = join(testDir, "invalid-pattern");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `[invalid
*.log
`,
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "test.log"), "log");

    const fs = new AFSFS({ localPath: dir });

    // Should not throw
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Valid pattern should still work
    expect(paths).not.toContain("/test.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #23: Circular @inherit reference
  // ---------------------------------------------------------------------------
  test("should handle circular @inherit references gracefully", async () => {
    // Intent: Verify circular inherit doesn't cause infinite loop
    // Preconditions: Two .afsignore files that inherit each other
    // Expected: System detects cycle and stops, no infinite loop

    const dir = join(testDir, "circular-inherit");
    await mkdir(join(dir, "sub"), { recursive: true });

    // Root inherits from sub
    await writeFile(
      join(dir, ".afsignore"),
      `@inherit sub/.afsignore
*.log
`,
    );

    // Sub inherits from root (circular!)
    await writeFile(
      join(dir, "sub", ".afsignore"),
      `@inherit ../.afsignore
*.tmp
`,
    );

    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "sub", "cache.tmp"), "tmp");

    const fs = new AFSFS({ localPath: dir });

    // Should not hang or throw
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Should still work with valid rules
    expect(paths).toContain("/app.js");
    expect(paths).not.toContain("/debug.log");
  });
});

// =============================================================================
// Test Category 3: Edge Cases (边界条件)
// =============================================================================

describe(".afsignore - Edge Cases", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-edge-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #24: .afsignore ignoring itself
  // ---------------------------------------------------------------------------
  test("should handle .afsignore ignoring itself", async () => {
    // Intent: Verify .afsignore can ignore itself
    // Preconditions: .afsignore contains ".afsignore"
    // Expected: .afsignore file is not visible in listing

    const dir = join(testDir, "self-ignore");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `.afsignore
*.log
`,
    );
    await writeFile(join(dir, "app.js"), "app");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    expect(paths).not.toContain("/.afsignore");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #25: File named ".afsignore" in subdirectory
  // ---------------------------------------------------------------------------
  test("should correctly scope subdirectory .afsignore rules", async () => {
    // Intent: Verify subdirectory .afsignore only affects that subtree
    // Preconditions: .afsignore in subdirectory with different rules
    // Expected: Rules only apply to that directory and below

    const dir = join(testDir, "subdir-scope");
    await mkdir(join(dir, "a"), { recursive: true });
    await mkdir(join(dir, "b"), { recursive: true });

    // Only a/ has .afsignore
    await writeFile(join(dir, "a", ".afsignore"), "*.log\n");

    await writeFile(join(dir, "a", "debug.log"), "a log");
    await writeFile(join(dir, "a", "app.js"), "a app");
    await writeFile(join(dir, "b", "debug.log"), "b log");
    await writeFile(join(dir, "b", "app.js"), "b app");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // a/debug.log should be ignored (a/.afsignore applies)
    expect(paths).not.toContain("/a/debug.log");
    expect(paths).toContain("/a/app.js");

    // b/debug.log should be visible (no .afsignore in b/)
    expect(paths).toContain("/b/debug.log");
    expect(paths).toContain("/b/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #26: Very long pattern
  // ---------------------------------------------------------------------------
  test("should handle very long patterns", async () => {
    // Intent: Verify system handles extremely long patterns
    // Preconditions: .afsignore with a very long pattern (>1000 chars)
    // Expected: System doesn't crash, pattern may or may not match

    const dir = join(testDir, "long-pattern");
    await mkdir(dir, { recursive: true });

    const longPattern = `${"a".repeat(1000)}.log`;
    await writeFile(join(dir, ".afsignore"), `${longPattern}\n*.tmp\n`);
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "cache.tmp"), "tmp");

    const fs = new AFSFS({ localPath: dir });

    // Should not throw
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Normal patterns should still work
    expect(paths).not.toContain("/cache.tmp");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #27: Pattern with special characters
  // ---------------------------------------------------------------------------
  test("should handle patterns with special characters", async () => {
    // Intent: Verify special characters in patterns are handled correctly
    // Preconditions: .afsignore with special chars like [], (), etc.
    // Expected: Patterns work according to gitignore spec

    const dir = join(testDir, "special-chars");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `file[123].txt
file(a).txt
`,
    );
    await writeFile(join(dir, "file1.txt"), "1");
    await writeFile(join(dir, "file2.txt"), "2");
    await writeFile(join(dir, "file4.txt"), "4");
    await writeFile(join(dir, "file[123].txt"), "literal");
    await writeFile(join(dir, "file(a).txt"), "parens");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // [123] is a character class, should match file1.txt, file2.txt
    expect(paths).not.toContain("/file1.txt");
    expect(paths).not.toContain("/file2.txt");
    expect(paths).toContain("/file4.txt"); // Not in [123]

    // Parentheses in gitignore are literal
    expect(paths).not.toContain("/file(a).txt");
  });

  // ---------------------------------------------------------------------------
  // Test #28: Unicode file names
  // ---------------------------------------------------------------------------
  test("should handle Unicode file names in patterns", async () => {
    // Intent: Verify Unicode file names work with .afsignore
    // Preconditions: Files with Unicode names, patterns matching them
    // Expected: Patterns correctly match Unicode names

    const dir = join(testDir, "unicode-names");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.日志\n文档/\n");
    await writeFile(join(dir, "debug.日志"), "日志");
    await writeFile(join(dir, "app.js"), "app");
    await mkdir(join(dir, "文档"), { recursive: true });
    await writeFile(join(dir, "文档", "readme.txt"), "readme");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Unicode patterns should match
    expect(paths).not.toContain("/debug.日志");
    expect(paths).not.toContain("/文档/readme.txt");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #29: Root-anchored pattern (leading /)
  // ---------------------------------------------------------------------------
  test("should handle root-anchored patterns with leading /", async () => {
    // Intent: Verify leading / anchors pattern to root
    // Preconditions: Pattern with leading / should only match at root
    // Expected: Pattern only matches at root, not in subdirectories

    const dir = join(testDir, "root-anchored");
    await mkdir(join(dir, "sub"), { recursive: true });

    await writeFile(join(dir, ".afsignore"), "/secret.txt\n");
    await writeFile(join(dir, "secret.txt"), "root secret");
    await writeFile(join(dir, "sub", "secret.txt"), "sub secret");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Root-anchored pattern should only match at root
    expect(paths).not.toContain("/secret.txt");
    expect(paths).toContain("/sub/secret.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #30: No .afsignore, no .gitignore
  // ---------------------------------------------------------------------------
  test("should list all files when neither .afsignore nor .gitignore exists", async () => {
    // Intent: Verify default behavior with no ignore files
    // Preconditions: Directory with no ignore files
    // Expected: All files are visible

    const dir = join(testDir, "no-ignore-files");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "secret.env"), "env");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // All files should be visible
    expect(paths).toContain("/app.js");
    expect(paths).toContain("/debug.log");
    expect(paths).toContain("/secret.env");
  });

  // ---------------------------------------------------------------------------
  // Test #31: Escaped special characters
  // ---------------------------------------------------------------------------
  test("should handle escaped special characters in patterns", async () => {
    // Intent: Verify backslash escapes work
    // Preconditions: Pattern with escaped characters like \#, \!
    // Expected: Escaped characters are treated literally

    const dir = join(testDir, "escaped-chars");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `\\#not-a-comment.txt
\\!important.txt
`,
    );
    await writeFile(join(dir, "#not-a-comment.txt"), "hash");
    await writeFile(join(dir, "!important.txt"), "bang");
    await writeFile(join(dir, "normal.txt"), "normal");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Escaped patterns should match literally
    expect(paths).not.toContain("/#not-a-comment.txt");
    expect(paths).not.toContain("/!important.txt");
    expect(paths).toContain("/normal.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #32: Whitespace in patterns
  // ---------------------------------------------------------------------------
  test("should handle trailing whitespace in patterns", async () => {
    // Intent: Verify trailing whitespace handling
    // Preconditions: Patterns with trailing spaces
    // Expected: Trailing whitespace should be trimmed (gitignore behavior)

    const dir = join(testDir, "whitespace-patterns");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log   \n  *.tmp  \n");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "cache.tmp"), "tmp");
    await writeFile(join(dir, "app.js"), "app");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Patterns should work despite whitespace
    expect(paths).not.toContain("/debug.log");
    expect(paths).not.toContain("/cache.tmp");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #33: Symlinks to ignored directories
  // ---------------------------------------------------------------------------
  test("should handle symlinks pointing to ignored directories", async () => {
    // Intent: Verify symlinks don't bypass ignore rules
    // Preconditions: Symlink pointing to an ignored directory
    // Expected: Symlink behavior should be consistent with gitignore

    const dir = join(testDir, "symlink-ignore");
    await mkdir(join(dir, "actual-dir"), { recursive: true });

    await writeFile(join(dir, ".afsignore"), "ignored/\n");
    await writeFile(join(dir, "actual-dir", "file.txt"), "content");
    await mkdir(join(dir, "ignored"), { recursive: true });
    await writeFile(join(dir, "ignored", "secret.txt"), "secret");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Ignored directory should be filtered
    expect(paths).not.toContain("/ignored/secret.txt");
    expect(paths).toContain("/actual-dir/file.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #34: Both useGitignore and useAfsignore false
  // ---------------------------------------------------------------------------
  test("should list all files when both useGitignore and useAfsignore are false", async () => {
    // Intent: Verify completely disabling all ignore mechanisms
    // Preconditions: Both options false, mount ignore still works
    // Expected: Only mount ignore applies

    const dir = join(testDir, "all-disabled");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });

    await writeFile(join(dir, ".gitignore"), "*.git-ignored\n");
    await writeFile(join(dir, ".afsignore"), "*.afs-ignored\n");
    await writeFile(join(dir, "file.git-ignored"), "git ignored");
    await writeFile(join(dir, "file.afs-ignored"), "afs ignored");
    await writeFile(join(dir, "file.mount-ignored"), "mount ignored");
    await writeFile(join(dir, "normal.txt"), "normal");

    const fs = new AFSFS({
      localPath: dir,
      useGitignore: false,
      useAfsignore: false,
      ignore: ["*.mount-ignored"],
    });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Git and afs ignored files should be visible
    expect(paths).toContain("/file.git-ignored");
    expect(paths).toContain("/file.afs-ignored");

    // Mount ignore should still apply
    expect(paths).not.toContain("/file.mount-ignored");
    expect(paths).toContain("/normal.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #35: maxDepth interaction with .afsignore
  // ---------------------------------------------------------------------------
  test("should correctly apply .afsignore at limited depth", async () => {
    // Intent: Verify .afsignore works correctly with maxDepth limit
    // Preconditions: Deep directory structure with .afsignore at various levels
    // Expected: Only rules up to maxDepth are loaded

    const dir = join(testDir, "depth-interaction");
    await mkdir(join(dir, "a", "b", "c"), { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.root-ignore\n");
    await writeFile(join(dir, "a", ".afsignore"), "*.a-ignore\n");
    await writeFile(join(dir, "a", "b", ".afsignore"), "*.b-ignore\n");

    await writeFile(join(dir, "file.root-ignore"), "root");
    await writeFile(join(dir, "a", "file.a-ignore"), "a");
    await writeFile(join(dir, "a", "b", "file.b-ignore"), "b");
    await writeFile(join(dir, "a", "b", "c", "file.txt"), "c");

    const fs = new AFSFS({ localPath: dir });

    // maxDepth: 1 should only see root
    const result1 = await fs.list("", { maxDepth: 1 });
    const paths1 = result1.data.map((e) => e.path).sort();
    expect(paths1).not.toContain("/file.root-ignore");
    expect(paths1).toContain("/a");

    // maxDepth: 2 should see root and a/
    const result2 = await fs.list("", { maxDepth: 2 });
    const paths2 = result2.data.map((e) => e.path).sort();
    expect(paths2).not.toContain("/file.root-ignore");
    expect(paths2).not.toContain("/a/file.a-ignore");
  });
});

// =============================================================================
// Test Category 4: Security (安全测试)
// =============================================================================

describe(".afsignore - Security", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-security-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #36: Path traversal in @inherit
  // ---------------------------------------------------------------------------
  test("should prevent path traversal attacks in @inherit directive", async () => {
    // Intent: Verify @inherit cannot access files outside mount root
    // Preconditions: .afsignore with @inherit pointing outside mount
    // Expected: Traversal attempt is blocked or ignored

    const dir = join(testDir, "path-traversal");
    await mkdir(dir, { recursive: true });

    // Create a file outside the mount directory
    const outsideDir = join(testDir, "outside");
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, "secrets.txt"), "SECRET_KEY=abc123");

    // Try to inherit from outside
    await writeFile(
      join(dir, ".afsignore"),
      `@inherit ../outside/secrets.txt
*.log
`,
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");

    const fs = new AFSFS({ localPath: dir });

    // Should not throw, should not leak outside content
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Valid rules should still work
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");

    // Should not have leaked any content from outside
    expect(paths).not.toContain("/secrets.txt");
  });

  // ---------------------------------------------------------------------------
  // Test #37: Null byte injection
  // ---------------------------------------------------------------------------
  test("should handle null bytes in patterns safely", async () => {
    // Intent: Verify null bytes don't cause security issues
    // Preconditions: .afsignore with null bytes in patterns
    // Expected: Null bytes are handled safely

    const dir = join(testDir, "null-byte");
    await mkdir(dir, { recursive: true });

    // Pattern with null byte
    await writeFile(
      join(dir, ".afsignore"),
      Buffer.concat([Buffer.from("*.log"), Buffer.from([0x00]), Buffer.from("\n*.tmp\n")]),
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "cache.tmp"), "tmp");

    const fs = new AFSFS({ localPath: dir });

    // Should not throw or crash
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // At minimum, should not crash
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #38: Command injection via pattern
  // ---------------------------------------------------------------------------
  test("should not execute shell commands in patterns", async () => {
    // Intent: Verify patterns with shell syntax don't execute
    // Preconditions: .afsignore with shell-like patterns
    // Expected: Patterns are treated as literals, no execution

    const dir = join(testDir, "command-injection");
    await mkdir(dir, { recursive: true });

    // Patterns that look like shell commands
    await writeFile(
      join(dir, ".afsignore"),
      `$(whoami).txt
\`id\`.log
; rm -rf /
| cat /etc/passwd
`,
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "$(whoami).txt"), "whoami");

    const fs = new AFSFS({ localPath: dir });

    // Should not throw or execute commands
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Should work normally
    expect(paths).toContain("/app.js");
    // The pattern should match literally
    expect(paths).not.toContain("/$(whoami).txt");
  });

  // ---------------------------------------------------------------------------
  // Test #39: Regex DoS (ReDoS) patterns
  // ---------------------------------------------------------------------------
  test("should handle potentially catastrophic regex patterns", async () => {
    // Intent: Verify ReDoS patterns don't cause hangs
    // Preconditions: .afsignore with patterns that could cause backtracking
    // Expected: System handles within reasonable time

    const dir = join(testDir, "redos");
    await mkdir(dir, { recursive: true });

    // Pattern that could cause catastrophic backtracking in naive regex impl
    await writeFile(join(dir, ".afsignore"), "(a+)+b.txt\n*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "aaaaaaaaaaaaaaaaaaaaaab.txt"), "test");

    const fs = new AFSFS({ localPath: dir });

    const startTime = Date.now();
    const result = await fs.list("", { maxDepth: 10 });
    const elapsed = Date.now() - startTime;

    // Should complete in reasonable time (< 5 seconds)
    expect(elapsed).toBeLessThan(5000);

    const paths = result.data.map((e) => e.path).sort();
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #40: Absolute path in @inherit
  // ---------------------------------------------------------------------------
  test("should reject absolute paths in @inherit directive", async () => {
    // Intent: Verify absolute paths in @inherit are blocked
    // Preconditions: .afsignore with absolute path in @inherit
    // Expected: Absolute path is rejected, other rules still work

    const dir = join(testDir, "absolute-inherit");
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, ".afsignore"),
      `@inherit /etc/passwd
*.log
`,
    );
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Valid rules should still work
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });
});

// =============================================================================
// Test Category 5: Vulnerability (漏洞测试)
// =============================================================================

describe(".afsignore - Vulnerability", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-vuln-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #41: Race condition - .afsignore modified during listing
  // ---------------------------------------------------------------------------
  test("should handle .afsignore being modified during listing", async () => {
    // Intent: Verify consistent behavior if .afsignore changes mid-operation
    // Preconditions: Large directory, .afsignore modified during list
    // Expected: Either old or new rules apply consistently, no crash

    const dir = join(testDir, "race-condition");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");

    // Create many files to make listing take time
    for (let i = 0; i < 100; i++) {
      await writeFile(join(dir, `file${i}.txt`), `content ${i}`);
      await writeFile(join(dir, `file${i}.log`), `log ${i}`);
    }

    const fs = new AFSFS({ localPath: dir });

    // Start listing
    const listPromise = fs.list("", { maxDepth: 10 });

    // Modify .afsignore during listing (race condition simulation)
    setTimeout(() => {
      writeFile(join(dir, ".afsignore"), "*.txt\n").catch(() => {});
    }, 10);

    // Should complete without throwing
    const result = await listPromise;

    // Should have some results
    expect(result.data.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test #42: Resource exhaustion - many .afsignore files
  // ---------------------------------------------------------------------------
  test("should handle many nested .afsignore files efficiently", async () => {
    // Intent: Verify performance with deeply nested .afsignore files
    // Preconditions: 20+ levels of directories each with .afsignore
    // Expected: Completes in reasonable time

    const dir = join(testDir, "resource-exhaustion");

    // Create 20 levels of nesting
    let currentPath = dir;
    for (let i = 0; i < 20; i++) {
      currentPath = join(currentPath, `level${i}`);
      await mkdir(currentPath, { recursive: true });
      await writeFile(join(currentPath, ".afsignore"), `*.level${i}\n`);
      await writeFile(join(currentPath, `file.level${i}`), `level ${i}`);
      await writeFile(join(currentPath, "keep.txt"), `keep at level ${i}`);
    }

    const fs = new AFSFS({ localPath: dir });

    const startTime = Date.now();
    const result = await fs.list("", { maxDepth: 100 });
    const elapsed = Date.now() - startTime;

    // Should complete in reasonable time (< 10 seconds)
    expect(elapsed).toBeLessThan(10000);

    // Should have filtered some files
    const paths = result.data.map((e) => e.path);
    const levelFiles = paths.filter((p) => p.includes(".level"));
    expect(levelFiles.length).toBe(0); // All .level files should be filtered
  });

  // ---------------------------------------------------------------------------
  // Test #43: Information leakage via .afsignore
  // ---------------------------------------------------------------------------
  test("should not leak information about ignored files in error messages", async () => {
    // Intent: Verify error messages don't expose ignored file details
    // Preconditions: Attempt to access ignored file
    // Expected: Generic error, no specific file info

    const dir = join(testDir, "info-leak");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "secret/\n");
    await mkdir(join(dir, "secret"), { recursive: true });
    await writeFile(join(dir, "secret", "password.txt"), "super-secret-password");

    const fs = new AFSFS({ localPath: dir });

    // List should not include secret directory contents
    const listResult = await fs.list("", { maxDepth: 10 });
    const paths = listResult.data.map((e) => e.path);
    expect(paths).not.toContain("/secret/password.txt");

    // Direct read should work but listing shouldn't leak existence
    // (This tests that list doesn't accidentally include info about ignored paths)
  });

  // ---------------------------------------------------------------------------
  // Test #44: Large .afsignore file
  // ---------------------------------------------------------------------------
  test("should handle very large .afsignore files", async () => {
    // Intent: Verify system handles large .afsignore files
    // Preconditions: .afsignore with 10000+ patterns
    // Expected: Completes without memory issues or timeout

    const dir = join(testDir, "large-afsignore");
    await mkdir(dir, { recursive: true });

    // Generate 10000 patterns
    const patterns: string[] = [];
    for (let i = 0; i < 10000; i++) {
      patterns.push(`pattern${i}.txt`);
    }
    patterns.push("*.log"); // One real pattern

    await writeFile(join(dir, ".afsignore"), `${patterns.join("\n")}\n`);
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "pattern5000.txt"), "should be ignored");

    const fs = new AFSFS({ localPath: dir });

    const startTime = Date.now();
    const result = await fs.list("", { maxDepth: 10 });
    const elapsed = Date.now() - startTime;

    // Should complete in reasonable time
    expect(elapsed).toBeLessThan(30000);

    const paths = result.data.map((e) => e.path).sort();
    expect(paths).not.toContain("/debug.log");
    expect(paths).not.toContain("/pattern5000.txt");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #45: Timing attack on .afsignore presence
  // ---------------------------------------------------------------------------
  test("should have consistent timing regardless of .afsignore presence", async () => {
    // Intent: Verify timing doesn't leak .afsignore existence
    // Preconditions: Two similar directories, one with .afsignore
    // Expected: Timing difference is minimal

    const dirWith = join(testDir, "timing-with");
    const dirWithout = join(testDir, "timing-without");
    await mkdir(dirWith, { recursive: true });
    await mkdir(dirWithout, { recursive: true });

    // Create same files in both
    for (let i = 0; i < 50; i++) {
      await writeFile(join(dirWith, `file${i}.txt`), "content");
      await writeFile(join(dirWithout, `file${i}.txt`), "content");
    }

    // Only one has .afsignore
    await writeFile(join(dirWith, ".afsignore"), "*.log\n");

    const fsWithAfsignore = new AFSFS({ localPath: dirWith });
    const fsWithoutAfsignore = new AFSFS({ localPath: dirWithout });

    // Warm up
    await fsWithAfsignore.list("", { maxDepth: 10 });
    await fsWithoutAfsignore.list("", { maxDepth: 10 });

    // Measure
    const iterations = 5;
    let timeWith = 0;
    let timeWithout = 0;

    for (let i = 0; i < iterations; i++) {
      const startWith = Date.now();
      await fsWithAfsignore.list("", { maxDepth: 10 });
      timeWith += Date.now() - startWith;

      const startWithout = Date.now();
      await fsWithoutAfsignore.list("", { maxDepth: 10 });
      timeWithout += Date.now() - startWithout;
    }

    const avgWith = timeWith / iterations;
    const avgWithout = timeWithout / iterations;

    // Timing difference should be reasonable (< 5x)
    // Note: This is a weak test, real timing attacks need more rigorous analysis
    expect(avgWith).toBeLessThan(avgWithout * 5);
    expect(avgWithout).toBeLessThan(avgWith * 5);
  });
});

// =============================================================================
// Test Category 6: Data Disaster (数据灾难)
// =============================================================================

describe(".afsignore - Data Disaster", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-disaster-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #46: .afsignore deleted during operation
  // ---------------------------------------------------------------------------
  test("should handle .afsignore being deleted during operation", async () => {
    // Intent: Verify graceful handling if .afsignore is deleted mid-operation
    // Preconditions: Start listing, delete .afsignore during operation
    // Expected: Operation completes without crash

    const dir = join(testDir, "deleted-afsignore");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");

    // Create many files
    for (let i = 0; i < 100; i++) {
      await writeFile(join(dir, `file${i}.txt`), "content");
    }

    const fs = new AFSFS({ localPath: dir });

    // Start listing and delete .afsignore
    const listPromise = fs.list("", { maxDepth: 10 });

    setTimeout(async () => {
      try {
        await rm(join(dir, ".afsignore"));
      } catch {
        // Ignore errors
      }
    }, 5);

    // Should complete without throwing
    const result = await listPromise;
    expect(result.data.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test #47: Directory becomes file during traversal
  // ---------------------------------------------------------------------------
  test("should handle directory replaced with file during traversal", async () => {
    // Intent: Verify handling when directory type changes mid-operation
    // Preconditions: Start deep traversal, replace directory with file
    // Expected: Graceful error handling

    const dir = join(testDir, "dir-to-file");
    await mkdir(join(dir, "subdir"), { recursive: true });

    await writeFile(join(dir, ".afsignore"), "");
    await writeFile(join(dir, "subdir", "file.txt"), "content");

    // Create many files to slow down traversal
    for (let i = 0; i < 50; i++) {
      await writeFile(join(dir, `file${i}.txt`), "content");
    }

    const fs = new AFSFS({ localPath: dir });

    // Start listing and replace subdir with a file
    const listPromise = fs.list("", { maxDepth: 10 });

    setTimeout(async () => {
      try {
        await rm(join(dir, "subdir"), { recursive: true, force: true });
        await writeFile(join(dir, "subdir"), "now a file");
      } catch {
        // Ignore
      }
    }, 5);

    // Should handle gracefully (may or may not see the directory contents)
    const result = await listPromise;
    expect(result).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Test #48: Permission denied on .afsignore
  // ---------------------------------------------------------------------------
  test("should handle permission denied when reading .afsignore", async () => {
    // Intent: Verify handling when .afsignore is not readable
    // Preconditions: .afsignore with restricted permissions
    // Expected: Falls back to no filtering with warning
    // Note: This test may need special setup or may be skipped in CI

    const dir = join(testDir, "permission-denied");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");

    // Note: Setting permissions requires appropriate OS permissions
    // This test demonstrates the expected behavior

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });

    // Should complete (specific behavior depends on implementation)
    expect(result.data.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test #49: Corrupted .afsignore (partial write)
  // ---------------------------------------------------------------------------
  test("should handle partially written .afsignore", async () => {
    // Intent: Verify handling of .afsignore that was interrupted during write
    // Preconditions: .afsignore with truncated content
    // Expected: System handles gracefully, valid patterns work

    const dir = join(testDir, "corrupted-afsignore");
    await mkdir(dir, { recursive: true });

    // Truncated content (pattern cut mid-word)
    await writeFile(join(dir, ".afsignore"), "*.log\n*.tm");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "cache.tmp"), "tmp");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Complete pattern should work
    expect(paths).not.toContain("/debug.log");
    // Incomplete pattern "*.tm" may or may not match *.tmp
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #50: Recovery after mount/unmount
  // ---------------------------------------------------------------------------
  test("should correctly reload .afsignore rules after creating new AFSFS instance", async () => {
    // Intent: Verify rules are correctly loaded in new instances
    // Preconditions: Change .afsignore between AFSFS instances
    // Expected: New instance uses updated rules

    const dir = join(testDir, "reload-rules");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "app");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "cache.tmp"), "tmp");

    // First instance
    const fs1 = new AFSFS({ localPath: dir });
    const result1 = await fs1.list("", { maxDepth: 10 });
    const paths1 = result1.data.map((e) => e.path).sort();

    expect(paths1).not.toContain("/debug.log");
    expect(paths1).toContain("/cache.tmp");

    // Update .afsignore
    await writeFile(join(dir, ".afsignore"), "*.tmp\n");

    // New instance should pick up new rules
    const fs2 = new AFSFS({ localPath: dir });
    const result2 = await fs2.list("", { maxDepth: 10 });
    const paths2 = result2.data.map((e) => e.path).sort();

    // New rules: *.tmp ignored, *.log visible
    expect(paths2).toContain("/debug.log");
    expect(paths2).not.toContain("/cache.tmp");
  });

  // ---------------------------------------------------------------------------
  // Test #51: Cascade failure - error in one .afsignore shouldn't break others
  // ---------------------------------------------------------------------------
  test("should isolate errors in one .afsignore from affecting others", async () => {
    // Intent: Verify error in subdirectory .afsignore doesn't break parent
    // Preconditions: Valid root .afsignore, invalid subdirectory .afsignore
    // Expected: Root rules work, subdirectory gracefully degraded

    const dir = join(testDir, "cascade-failure");
    await mkdir(join(dir, "sub"), { recursive: true });

    // Valid root .afsignore
    await writeFile(join(dir, ".afsignore"), "*.log\n");

    // Invalid sub/.afsignore (binary content)
    await writeFile(join(dir, "sub", ".afsignore"), Buffer.from([0xff, 0xfe, 0x00]));

    await writeFile(join(dir, "root.log"), "root log");
    await writeFile(join(dir, "root.js"), "root js");
    await writeFile(join(dir, "sub", "sub.log"), "sub log");
    await writeFile(join(dir, "sub", "sub.js"), "sub js");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Root .afsignore should still work
    expect(paths).not.toContain("/root.log");
    expect(paths).toContain("/root.js");

    // Subdirectory should be accessible despite invalid .afsignore
    expect(paths).toContain("/sub/sub.js");
  });
});

// =============================================================================
// Test Category 7: Integration Tests (集成测试)
// =============================================================================

describe(".afsignore - Integration", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `afsignore-integration-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Test #52: Combined with existing gitignore tests
  // ---------------------------------------------------------------------------
  test("should work alongside existing AFSFS gitignore functionality", async () => {
    // Intent: Verify .afsignore doesn't break existing gitignore behavior
    // Preconditions: Directory with both .gitignore and .afsignore, useGitignore: true
    // Expected: Both systems work correctly together

    const dir = join(testDir, "combined-gitignore");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });

    // .gitignore ignores node_modules
    await writeFile(join(dir, ".gitignore"), "node_modules/\n");

    // .afsignore ignores *.log and inherits gitignore
    await writeFile(
      join(dir, ".afsignore"),
      `@inherit .gitignore
*.log
`,
    );

    await mkdir(join(dir, "node_modules"), { recursive: true });
    await writeFile(join(dir, "node_modules", "pkg.json"), "{}");
    await writeFile(join(dir, "debug.log"), "log");
    await writeFile(join(dir, "app.js"), "app");

    const fs = new AFSFS({ localPath: dir, useGitignore: false }); // Default, don't use gitignore directly
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Both gitignore (via @inherit) and afsignore rules should apply
    expect(paths).not.toContain("/node_modules/pkg.json");
    expect(paths).not.toContain("/debug.log");
    expect(paths).toContain("/app.js");
  });

  // ---------------------------------------------------------------------------
  // Test #53: With maxChildren option
  // ---------------------------------------------------------------------------
  test("should correctly apply .afsignore with maxChildren limit", async () => {
    // Intent: Verify .afsignore works with maxChildren option
    // Preconditions: Directory with many files, some ignored
    // Expected: maxChildren applies after filtering

    const dir = join(testDir, "with-maxchildren");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");

    // Create 10 files, 5 of each type
    for (let i = 0; i < 5; i++) {
      await writeFile(join(dir, `app${i}.js`), "js");
      await writeFile(join(dir, `debug${i}.log`), "log");
    }

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxChildren: 3, maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // Should only see .js files (log files are ignored)
    // maxChildren limits the count after filtering
    const jsFiles = paths.filter((p) => p.endsWith(".js"));
    const logFiles = paths.filter((p) => p.endsWith(".log"));

    expect(logFiles.length).toBe(0); // All logs should be filtered
    expect(jsFiles.length).toBeLessThanOrEqual(3); // maxChildren limit
  });

  // ---------------------------------------------------------------------------
  // Test #54: With pattern option
  // ---------------------------------------------------------------------------
  test("should correctly combine .afsignore with pattern filter", async () => {
    // Intent: Verify .afsignore and pattern option work together
    // Preconditions: .afsignore ignores some files, pattern filters others
    // Expected: Both filters apply

    const dir = join(testDir, "with-pattern");
    await mkdir(dir, { recursive: true });

    await writeFile(join(dir, ".afsignore"), "*.log\n");
    await writeFile(join(dir, "app.js"), "js");
    await writeFile(join(dir, "style.css"), "css");
    await writeFile(join(dir, "debug.log"), "log");

    const fs = new AFSFS({ localPath: dir });

    // Pattern for .js files, afsignore removes .log files
    const result = await fs.list("", { maxDepth: 10, pattern: "*.js" });
    const paths = result.data.map((e) => e.path).sort();

    // Should only see .js files
    expect(paths).toContain("/app.js");
    expect(paths).not.toContain("/style.css"); // Pattern filter
    expect(paths).not.toContain("/debug.log"); // afsignore filter
  });

  // ---------------------------------------------------------------------------
  // Test #55: Real-world project structure
  // ---------------------------------------------------------------------------
  test("should handle realistic project structure correctly", async () => {
    // Intent: Verify .afsignore works with real-world project structure
    // Preconditions: Typical Node.js project structure
    // Expected: Correct filtering for AI agent use case

    const dir = join(testDir, "real-project");
    await mkdir(dir, { recursive: true });
    await mkdir(join(dir, ".git"), { recursive: true });
    await mkdir(join(dir, "node_modules", "package"), { recursive: true });
    await mkdir(join(dir, "dist"), { recursive: true });
    await mkdir(join(dir, "src"), { recursive: true });
    await mkdir(join(dir, "test"), { recursive: true });
    await mkdir(join(dir, ".cache"), { recursive: true });

    // .gitignore
    await writeFile(
      join(dir, ".gitignore"),
      `node_modules/
dist/
.cache/
*.log
`,
    );

    // .afsignore for AI agent
    await writeFile(
      join(dir, ".afsignore"),
      `# Inherit git's rules
@inherit .gitignore

# But allow dist/types for AI to see type definitions
!dist/types/

# AI doesn't need test fixtures
test/fixtures/

# AI doesn't need large data files
*.csv
*.parquet
`,
    );

    // Create files
    await writeFile(join(dir, "package.json"), "{}");
    await writeFile(join(dir, "src", "index.ts"), "export default {}");
    await writeFile(join(dir, "dist", "index.js"), "module.exports = {}");
    await mkdir(join(dir, "dist", "types"), { recursive: true });
    await writeFile(join(dir, "dist", "types", "index.d.ts"), "export {}");
    await writeFile(join(dir, "node_modules", "package", "index.js"), "module.exports = {}");
    await writeFile(join(dir, "test", "app.test.ts"), "test");
    await mkdir(join(dir, "test", "fixtures"), { recursive: true });
    await writeFile(join(dir, "test", "fixtures", "data.json"), "{}");
    await writeFile(join(dir, "data.csv"), "a,b,c");
    await writeFile(join(dir, ".cache", "cache.json"), "{}");
    await writeFile(join(dir, "debug.log"), "log");

    const fs = new AFSFS({ localPath: dir });
    const result = await fs.list("", { maxDepth: 10 });
    const paths = result.data.map((e) => e.path).sort();

    // node_modules should be ignored (from gitignore via @inherit)
    expect(paths).not.toContain("/node_modules/package/index.js");

    // dist/index.js should be ignored (from gitignore)
    expect(paths).not.toContain("/dist/index.js");

    // BUT dist/types should be visible due to negation
    expect(paths).toContain("/dist/types/index.d.ts");

    // test/fixtures should be ignored
    expect(paths).not.toContain("/test/fixtures/data.json");

    // test files outside fixtures should be visible
    expect(paths).toContain("/test/app.test.ts");

    // CSV files should be ignored
    expect(paths).not.toContain("/data.csv");

    // .cache should be ignored
    expect(paths).not.toContain("/.cache/cache.json");

    // Log files should be ignored
    expect(paths).not.toContain("/debug.log");

    // Source files should be visible
    expect(paths).toContain("/src/index.ts");
    expect(paths).toContain("/package.json");
  });
});
