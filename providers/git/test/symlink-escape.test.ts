/**
 * Git provider symlink escape prevention tests.
 *
 * Verifies that symlinks pointing outside the repo are blocked
 * by assertWithinWorktree → assertPathWithinRoot.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSGit } from "@aigne/afs-git";
import { simpleGit } from "simple-git";

let testDir: string;
let repoPath: string;
let outsideDir: string;
let afsGit: AFSGit;

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-git-symlink-escape-${Date.now()}`);
  repoPath = join(testDir, "repo");
  outsideDir = join(testDir, "outside");

  await mkdir(repoPath, { recursive: true });
  await mkdir(outsideDir, { recursive: true });
  await writeFile(join(outsideDir, "secret.txt"), "TOP SECRET DATA");

  // Initialize git repo
  const git = simpleGit(repoPath);
  await git.init(["--initial-branch=main"]);
  await git.addConfig("user.name", "Test User");
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("commit.gpgsign", "false");

  await writeFile(join(repoPath, "README.md"), "# Test\n");
  await git.add(".");
  await git.commit("Initial commit");

  // Create AFSGit instance in readwrite mode
  afsGit = new AFSGit({
    repoPath,
    accessMode: "readwrite",
    autoCommit: true,
    commitAuthor: { name: "Test", email: "test@test.com" },
  });
  await afsGit.ready();

  // Trigger worktree registration by writing a file first.
  // For the main branch, ensureWorktree() maps "main" → repoPath.
  await afsGit.write("/main/trigger.txt", { content: "trigger" });

  // Now place symlinks inside the repo (worktree) pointing outside
  await symlink(join(outsideDir, "secret.txt"), join(repoPath, "escape-link.txt"));
  await symlink(outsideDir, join(repoPath, "escape-dir"));
});

afterAll(async () => {
  await afsGit.cleanup();
  await rm(testDir, { recursive: true, force: true });
});

describe("symlink escape prevention", () => {
  test("normal read still works", async () => {
    const { data } = await afsGit.read("/main/README.md");
    expect(data?.content).toBe("# Test\n");
  });

  test("normal write still works", async () => {
    await afsGit.write("/main/normal.txt", { content: "safe content" });
    const { data } = await afsGit.read("/main/normal.txt");
    expect(data?.content).toBe("safe content");
  });

  test("read via file symlink escaping repo is blocked", async () => {
    const result = afsGit.read("/main/escape-link.txt");
    await expect(result).rejects.toThrow(/permission|traversal|not allowed/i);
  });

  test("read via directory symlink escaping repo is blocked", async () => {
    const result = afsGit.read("/main/escape-dir/secret.txt");
    await expect(result).rejects.toThrow(/permission|traversal|not allowed/i);
  });

  test("write via file symlink escaping repo is blocked", async () => {
    const result = afsGit.write("/main/escape-link.txt", {
      content: "overwrite secret",
    });
    await expect(result).rejects.toThrow(/permission|traversal|not allowed/i);
  });

  test("delete via file symlink escaping repo is blocked", async () => {
    const result = afsGit.delete("/main/escape-link.txt");
    await expect(result).rejects.toThrow(/permission|traversal|not allowed/i);
  });

  test("read via path traversal is blocked", async () => {
    const result = afsGit.read("/main/../../outside/secret.txt");
    await expect(result).rejects.toThrow();
  });

  test("write via path traversal is blocked", async () => {
    const result = afsGit.write("/main/../../../etc/evil.txt", {
      content: "malicious",
    });
    await expect(result).rejects.toThrow();
  });
});
