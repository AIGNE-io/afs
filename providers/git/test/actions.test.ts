import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSGit } from "@aigne/afs-git";
import { simpleGit } from "simple-git";

/**
 * Phase 5: Git — actions (commit, create-branch, diff, merge)
 *
 * Tests for 4 Git actions, all requiring readwrite mode.
 */

let testDir: string;
let repoPath: string;
let rwGit: AFSGit;
let roGit: AFSGit;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-git-actions-test-${Date.now()}`);
  repoPath = join(testDir, "test-repo");
  await mkdir(repoPath, { recursive: true });

  const git = simpleGit(repoPath);
  await git.init(["--initial-branch=main"]);
  await git.addConfig("user.name", "Test User");
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(join(repoPath, "README.md"), "# Test Repository\n");
  await mkdir(join(repoPath, "src"), { recursive: true });
  await writeFile(join(repoPath, "src/index.ts"), 'console.log("Hello");\n');
  await git.add(".");
  await git.commit("Initial commit");

  // develop branch with different content
  await git.checkoutLocalBranch("develop");
  await writeFile(join(repoPath, "src/dev.ts"), 'console.log("Dev");\n');
  await git.add(".");
  await git.commit("Add dev file");

  // Switch back to main
  await git.checkout("main");

  // Create readwrite and readonly instances
  rwGit = new AFSGit({
    repoPath,
    accessMode: "readwrite",
    autoCommit: false,
    commitAuthor: { name: "Test User", email: "test@example.com" },
  });

  roGit = new AFSGit({ repoPath, accessMode: "readonly" });
});

afterAll(async () => {
  await rwGit.cleanup();
  await roGit.cleanup();
  await rm(testDir, { recursive: true, force: true });
});

// ========== diff action ==========

describe("diff action", () => {
  test("diff two branches → returns files list and stats", async () => {
    const result = await rwGit.exec("/main/.actions/diff", {
      from: "main",
      to: "develop",
    });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.files).toBeDefined();
    const files = result.data!.files as Array<{ path: string }>;
    expect(files.length).toBeGreaterThan(0);
    // develop has src/dev.ts that main doesn't
    const filePaths = files.map((f) => f.path);
    expect(filePaths).toContain("src/dev.ts");
  });

  test("diff with path filter", async () => {
    const result = await rwGit.exec("/main/.actions/diff", {
      from: "main",
      to: "develop",
      path: "src",
    });
    expect(result.success).toBe(true);
    const files = result.data!.files as Array<{ path: string }>;
    for (const f of files) {
      expect(f.path).toMatch(/^src\//);
    }
  });

  test("diff returns patch content", async () => {
    const result = await rwGit.exec("/main/.actions/diff", {
      from: "main",
      to: "develop",
    });
    expect(result.success).toBe(true);
    expect(result.data!.patch).toBeDefined();
    const patch = result.data!.patch as string;
    expect(patch).toContain("diff --git");
  });

  test("diff two identical refs → empty diff", async () => {
    const result = await rwGit.exec("/main/.actions/diff", {
      from: "main",
      to: "main",
    });
    expect(result.success).toBe(true);
    const files = result.data!.files as Array<{ path: string }>;
    expect(files.length).toBe(0);
  });

  test("diff from non-existent ref → error", async () => {
    const result = await rwGit.exec("/main/.actions/diff", {
      from: "nonexistent",
      to: "main",
    });
    expect(result.success).toBe(false);
  });
});

// ========== create-branch action ==========

describe("create-branch action", () => {
  test("create-branch → returns branch name, hash", async () => {
    const result = await rwGit.exec("/main/.actions/create-branch", {
      name: "test-branch-1",
    });
    expect(result.success).toBe(true);
    expect(result.data!.branch).toBe("test-branch-1");
    expect(result.data!.hash).toBeDefined();
    expect(typeof result.data!.hash).toBe("string");
  });

  test("create-branch from specific ref", async () => {
    const result = await rwGit.exec("/main/.actions/create-branch", {
      name: "test-branch-from-dev",
      from: "develop",
    });
    expect(result.success).toBe(true);
    expect(result.data!.branch).toBe("test-branch-from-dev");
  });

  test("create-branch with name containing /", async () => {
    const result = await rwGit.exec("/main/.actions/create-branch", {
      name: "feature/new-thing",
    });
    expect(result.success).toBe(true);
    expect(result.data!.branch).toBe("feature/new-thing");
  });

  test("create-branch duplicate name → error", async () => {
    const result = await rwGit.exec("/main/.actions/create-branch", {
      name: "test-branch-1",
    });
    expect(result.success).toBe(false);
  });

  test("create-branch from non-existent ref → error", async () => {
    const result = await rwGit.exec("/main/.actions/create-branch", {
      name: "test-from-bad-ref",
      from: "nonexistent-ref",
    });
    expect(result.success).toBe(false);
  });

  test("create-branch does not affect current checkout", async () => {
    const git = simpleGit(repoPath);
    const before = await git.revparse(["--abbrev-ref", "HEAD"]);

    await rwGit.exec("/main/.actions/create-branch", {
      name: "test-no-checkout-switch",
    });

    const after = await git.revparse(["--abbrev-ref", "HEAD"]);
    expect(after.trim()).toBe(before.trim());
  });

  test("branch name does not allow path traversal", async () => {
    const result = await rwGit.exec("/main/.actions/create-branch", {
      name: "../../../etc/passwd",
    });
    expect(result.success).toBe(false);
  });
});

// ========== commit action ==========

describe("commit action", () => {
  test("commit → returns hash, message, filesChanged", async () => {
    // Stage a change first
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, "commit-test.txt"), "test content\n");
    await git.add("commit-test.txt");

    const result = await rwGit.exec("/main/.actions/commit", {
      message: "Test commit",
    });
    expect(result.success).toBe(true);
    expect(result.data!.hash).toBeDefined();
    expect(result.data!.message).toBe("Test commit");
    expect(result.data!.filesChanged).toBeDefined();
  });

  test("commit with custom author", async () => {
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, "author-test.txt"), "author test\n");
    await git.add("author-test.txt");

    const result = await rwGit.exec("/main/.actions/commit", {
      message: "Custom author commit",
      author: { name: "Custom Author", email: "custom@test.com" },
    });
    expect(result.success).toBe(true);

    // Verify the author
    const log = await git.log({ maxCount: 1 });
    expect(log.latest!.author_name).toBe("Custom Author");
  });

  test("commit with special characters in message", async () => {
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, "special-msg.txt"), "special\n");
    await git.add("special-msg.txt");

    const result = await rwGit.exec("/main/.actions/commit", {
      message: 'Message with "quotes" and\nnewlines',
    });
    expect(result.success).toBe(true);
  });

  test("commit no staged changes → error", async () => {
    const result = await rwGit.exec("/main/.actions/commit", {
      message: "Should fail",
    });
    expect(result.success).toBe(false);
  });

  test("commit in readonly mode → error", async () => {
    await expect(roGit.exec("/main/.actions/commit", { message: "Fail" })).rejects.toThrow();
  });

  test("commit error message does not expose local path", async () => {
    const result = await rwGit.exec("/main/.actions/commit", {
      message: "No changes",
    });
    if (!result.success) {
      const errMsg = JSON.stringify(result.error);
      expect(errMsg).not.toContain(repoPath);
      expect(errMsg).not.toContain(testDir);
    }
  });

  test("commit author does not allow command injection", async () => {
    const git = simpleGit(repoPath);
    await writeFile(join(repoPath, "injection-test.txt"), "injection\n");
    await git.add("injection-test.txt");

    const result = await rwGit.exec("/main/.actions/commit", {
      message: "Injection test",
      author: { name: '"; rm -rf /', email: "bad@test.com" },
    });
    // Should either succeed (with sanitized author) or fail gracefully
    if (result.success) {
      // The dangerous command should not have been executed
      const log = await git.log({ maxCount: 1 });
      expect(log.latest).toBeDefined();
    }
  });
});

// ========== merge action ==========

describe("merge action", () => {
  let mergeTestBranch: string;

  test("merge → returns merge commit hash", async () => {
    // Create a branch with a unique commit for merge
    const git = simpleGit(repoPath);
    mergeTestBranch = `merge-source-${Date.now()}`;
    await git.checkoutLocalBranch(mergeTestBranch);
    await writeFile(join(repoPath, "merge-file.txt"), "merge content\n");
    await git.add(".");
    await git.commit("Add merge file");
    await git.checkout("main");

    const result = await rwGit.exec("/main/.actions/merge", {
      branch: mergeTestBranch,
    });
    expect(result.success).toBe(true);
    expect(result.data!.hash).toBeDefined();
  });

  test("merge with custom message", async () => {
    const git = simpleGit(repoPath);
    const branchName = `merge-msg-${Date.now()}`;
    await git.checkoutLocalBranch(branchName);
    await writeFile(join(repoPath, "merge-msg-file.txt"), "merge msg content\n");
    await git.add(".");
    await git.commit("Add merge msg file");
    await git.checkout("main");

    const result = await rwGit.exec("/main/.actions/merge", {
      branch: branchName,
      message: "Custom merge message",
    });
    expect(result.success).toBe(true);
  });

  test("merge non-existent branch → error", async () => {
    const result = await rwGit.exec("/main/.actions/merge", {
      branch: "nonexistent-branch-xyz",
    });
    expect(result.success).toBe(false);
  });

  test("merge in readonly mode → error", async () => {
    await expect(roGit.exec("/main/.actions/merge", { branch: "develop" })).rejects.toThrow();
  });
});

// ========== Actions list (TREE-1) ==========

describe("listBranchActions (TREE-1)", () => {
  test("readwrite mode lists 4 actions for a branch", async () => {
    const result = await rwGit.list("/main/.actions");
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(4);
    const ids = result.data.map((e) => e.id);
    expect(ids).toContain("diff");
    expect(ids).toContain("create-branch");
    expect(ids).toContain("commit");
    expect(ids).toContain("merge");
  });

  test("each action has correct metadata", async () => {
    const result = await rwGit.list("/main/.actions");
    for (const action of result.data) {
      expect(action.path).toContain("/main/.actions/");
      expect(action.summary).toBeDefined();
      expect(action.meta?.kind).toBe("afs:executable");
    }
  });

  test("readonly mode returns empty list", async () => {
    const result = await roGit.list("/main/.actions");
    expect(result.data).toEqual([]);
  });
});

// ========== Capabilities ==========

describe("capabilities for actions", () => {
  test("readonly mode does not list commit/merge in actions", async () => {
    const result = await roGit.read("/.meta/.capabilities");
    const manifest = result.data!.content as Record<string, unknown>;
    const actions = manifest.actions as Array<{ catalog: Array<{ name: string }> }>;
    const allActionNames = actions.flatMap((a) => a.catalog.map((c) => c.name));
    expect(allActionNames).not.toContain("commit");
    expect(allActionNames).not.toContain("merge");
  });

  test("readwrite mode lists all actions", async () => {
    const result = await rwGit.read("/.meta/.capabilities");
    const manifest = result.data!.content as Record<string, unknown>;
    const actions = manifest.actions as Array<{ catalog: Array<{ name: string }> }>;
    const allActionNames = actions.flatMap((a) => a.catalog.map((c) => c.name));
    expect(allActionNames).toContain("commit");
    expect(allActionNames).toContain("create-branch");
    expect(allActionNames).toContain("diff");
    expect(allActionNames).toContain("merge");
  });

  test("diff patch content is controlled by provider", async () => {
    // Just ensure diff works properly and returns controlled content
    const result = await rwGit.exec("/main/.actions/diff", {
      from: "main",
      to: "develop",
    });
    expect(result.success).toBe(true);
    // Patch should not contain local filesystem paths
    const patch = result.data!.patch as string;
    expect(patch).not.toContain(repoPath);
  });
});
