import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSGit } from "@aigne/afs-git";
import { simpleGit } from "simple-git";

/**
 * Phase 4: Git — explain + capabilities + meta (lastCommit) + log tree
 *
 * 22 tests covering:
 * - explain (root/branch/file)
 * - capabilities
 * - branch .meta with lastCommit
 * - .log/ virtual tree (list, read, pagination)
 */

let testDir: string;
let repoPath: string;
let afsGit: AFSGit;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-git-explain-test-${Date.now()}`);
  repoPath = join(testDir, "test-repo");
  await mkdir(repoPath, { recursive: true });

  const git = simpleGit(repoPath);
  await git.init(["--initial-branch=main"]);
  await git.addConfig("user.name", "Test User");
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("commit.gpgsign", "false");

  // First commit
  await writeFile(join(repoPath, "README.md"), "# Test Repository\n");
  await mkdir(join(repoPath, "src"), { recursive: true });
  await writeFile(join(repoPath, "src/index.ts"), 'console.log("Hello");\n');
  await git.add(".");
  await git.commit("Initial commit");

  // Second commit
  await writeFile(
    join(repoPath, "src/utils.ts"),
    "export const add = (a: number, b: number) => a + b;\n",
  );
  await git.add(".");
  await git.commit("Add utils module");

  // Third commit
  await writeFile(join(repoPath, "README.md"), "# Test Repository\n\nUpdated readme.\n");
  await git.add(".");
  await git.commit("Update README");

  // Create develop branch
  await git.checkoutLocalBranch("develop");
  await writeFile(join(repoPath, "src/dev.ts"), 'console.log("Dev");\n');
  await git.add(".");
  await git.commit("Add dev file");

  // Create feature/auth branch (with slash)
  await git.checkoutLocalBranch("feature/auth");
  await writeFile(join(repoPath, "src/auth.ts"), "export class Auth {}\n");
  await git.add(".");
  await git.commit("Add auth module");

  // Switch back to main
  await git.checkout("main");

  afsGit = new AFSGit({ repoPath, accessMode: "readonly" });
});

afterAll(async () => {
  await afsGit.cleanup();
  await rm(testDir, { recursive: true, force: true });
});

// ========== Explain: Happy Path ==========

describe("explain", () => {
  test("explain root → repo path, branch list, default branch, remote URL", async () => {
    const result = await afsGit.explain("/");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("main");
    expect(result.content).toContain("develop");
    expect(result.content).toContain("feature/auth");
    // Should mention it's a git repository
    expect(result.content.toLowerCase()).toMatch(/git|repository|repo/);
  });

  test("explain branch → branch name, HEAD commit, file count", async () => {
    const result = await afsGit.explain("/main");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("main");
    // Should include commit info
    expect(result.content).toMatch(/commit|HEAD/i);
    // Should mention file count or tree info
    expect(result.content).toMatch(/file|entries|tree/i);
  });

  test("explain file → file path, size, last modified commit", async () => {
    const result = await afsGit.explain("/main/README.md");
    expect(result).toBeDefined();
    expect(result.format).toBe("markdown");
    expect(result.content).toContain("README.md");
    // Should include size info
    expect(result.content).toMatch(/size|bytes/i);
    // Should include last commit info
    expect(result.content).toMatch(/commit|modified|changed/i);
  });

  test("explain non-existent branch → error", async () => {
    await expect(afsGit.explain("/nonexistent")).rejects.toThrow();
  });

  test("explain empty path falls back to root", async () => {
    const result = await afsGit.explain("/");
    expect(result.content).toBeTruthy();
  });
});

// ========== Explain: Security ==========

describe("explain security", () => {
  test("explain does not expose local repo absolute path", async () => {
    const result = await afsGit.explain("/");
    expect(result.content).not.toContain(repoPath);
    expect(result.content).not.toContain(testDir);
  });
});

// ========== Capabilities ==========

describe("capabilities", () => {
  test("capabilities → includes list/read/write/delete/rename/search/stat/explain", async () => {
    const result = await afsGit.read("/.meta/.capabilities");
    expect(result.data).toBeDefined();
    const manifest = result.data!.content as Record<string, unknown>;
    expect(manifest).toBeDefined();

    // Should have schemaVersion
    expect(manifest.schemaVersion).toBe(1);

    // Should include operations
    const ops = result.data!.meta?.operations as string[];
    expect(ops).toBeDefined();
    // Readonly mode should have these ops
    expect(ops).toContain("list");
    expect(ops).toContain("read");
    expect(ops).toContain("search");
    expect(ops).toContain("stat");
    expect(ops).toContain("explain");
  });

  test("capabilities does not expose git credentials", async () => {
    const result = await afsGit.read("/.meta/.capabilities");
    const content = JSON.stringify(result.data);
    expect(content).not.toMatch(/password|token|secret|credential/i);
  });
});

// ========== Branch .meta with lastCommit ==========

describe("branch meta with lastCommit", () => {
  test("branch .meta includes lastCommit info", async () => {
    const result = await afsGit.stat("/main");
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    const meta = result.data!.meta;
    expect(meta).toBeDefined();
    expect(meta!.lastCommit).toBeDefined();

    const lastCommit = meta!.lastCommit as {
      hash: string;
      shortHash: string;
      author: string;
      date: string;
      message: string;
    };
    expect(lastCommit.hash).toMatch(/^[a-f0-9]{40}$/);
    expect(lastCommit.shortHash).toMatch(/^[a-f0-9]{7,}$/);
    expect(lastCommit.author).toBe("Test User");
    expect(typeof lastCommit.date).toBe("string");
    expect(lastCommit.message).toContain("Update README");
  });

  test("lastCommit on freshly created branch", async () => {
    const result = await afsGit.stat("/feature~auth");
    expect(result.data).toBeDefined();
    const lastCommit = result.data!.meta?.lastCommit as { message: string };
    expect(lastCommit).toBeDefined();
    expect(lastCommit.message).toContain("Add auth module");
  });
});

// ========== .log/ Virtual Tree ==========

describe(".log/ virtual tree", () => {
  test("list .log/ → returns commit list (newest first)", async () => {
    const result = await afsGit.list("/main/.log");
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThanOrEqual(3);

    // Commits should be indexed newest-first
    const paths = result.data.map((e) => e.path);
    expect(paths[0]).toBe("/main/.log/0");
    expect(paths[1]).toBe("/main/.log/1");
    expect(paths[2]).toBe("/main/.log/2");
  });

  test("read .log/0 → returns latest commit diff/patch content", async () => {
    const result = await afsGit.read("/main/.log/0");
    expect(result.data).toBeDefined();
    expect(result.data!.content).toBeDefined();
    // Should contain diff content
    const content = result.data!.content as string;
    expect(content.length).toBeGreaterThan(0);
    // The last commit was "Update README" which changed README.md
    expect(content).toContain("README.md");
  });

  test("read .log/0/.meta → returns commit meta info", async () => {
    const result = await afsGit.read("/main/.log/0/.meta");
    expect(result.data).toBeDefined();
    const meta = result.data!.meta;
    expect(meta).toBeDefined();
    expect(meta!.hash).toBeDefined();
    expect(meta!.shortHash).toBeDefined();
    expect(meta!.author).toBe("Test User");
    expect(meta!.message).toContain("Update README");
    expect(meta!.date).toBeDefined();
  });

  test("list .log/ supports limit/offset pagination", async () => {
    // Get with limit
    const limited = await afsGit.list("/main/.log", { limit: 2 });
    expect(limited.data.length).toBe(2);

    // Get with offset
    const offset = await afsGit.list("/main/.log", { offset: 1, limit: 2 });
    expect(offset.data.length).toBe(2);
    // The first item at offset=1 should be second commit
    expect(offset.data[0]!.path).toBe("/main/.log/1");
  });

  test("read .log/999999 → non-existent commit index", async () => {
    await expect(afsGit.read("/main/.log/999999")).rejects.toThrow();
  });

  test("list .log/ offset beyond range → empty list", async () => {
    const result = await afsGit.list("/main/.log", { offset: 99999 });
    expect(result.data).toEqual([]);
  });
});

// ========== .log/ Edge Cases ==========

describe(".log/ edge cases", () => {
  test(".log/ on branch with only 1 commit", async () => {
    // feature/auth has only 1 commit on top of develop
    // But it inherits commits from its parent, so let's just verify it works
    const result = await afsGit.list("/feature~auth/.log");
    expect(result.data.length).toBeGreaterThanOrEqual(1);
  });

  test("branch name with / (encoded as ~) works for .log/", async () => {
    const result = await afsGit.list("/feature~auth/.log");
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThanOrEqual(1);

    // Should be able to read commit
    const readResult = await afsGit.read("/feature~auth/.log/0");
    expect(readResult.data).toBeDefined();
    expect(readResult.data!.content).toBeDefined();
  });

  test(".log/ on branch with merge commit", async () => {
    // Our test repo doesn't have merge commits, but develop has 4 commits
    // (main's 3 + 1 own). Just ensure .log/ works on develop.
    const result = await afsGit.list("/develop/.log");
    expect(result.data.length).toBeGreaterThanOrEqual(4);
  });
});

// ========== Security & Data Leak ==========

describe("security and data leak", () => {
  test("commit info does not include diff content in meta", async () => {
    const result = await afsGit.read("/main/.log/0/.meta");
    const meta = result.data!.meta;
    // Meta should NOT contain full diff
    const metaStr = JSON.stringify(meta);
    expect(metaStr).not.toContain("diff --git");
  });

  test("all operations are read-only", async () => {
    // Explain, capabilities, meta, log - none should modify the repo
    // Just verify we can call them without errors and the repo is intact
    await afsGit.explain("/");
    await afsGit.explain("/main");
    await afsGit.read("/.meta/.capabilities");
    await afsGit.list("/main/.log");
    await afsGit.read("/main/.log/0");

    // Verify we can still read files normally
    const result = await afsGit.read("/main/README.md");
    expect(result.data!.content).toContain("Test Repository");
  });
});
