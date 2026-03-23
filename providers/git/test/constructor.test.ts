import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSGit } from "../src/index.js";

describe("AFSGit constructor side effects", () => {
  test("constructor with non-existent repoPath does NOT mkdir or git init", () => {
    const dir = join(tmpdir(), `afs-git-no-create-${Date.now()}`);
    const _git = new AFSGit({ repoPath: dir });
    expect(existsSync(dir)).toBe(false);
  });

  test("after ready() the directory and .git exist", async () => {
    const dir = join(tmpdir(), `afs-git-ready-${Date.now()}`);
    try {
      const git = new AFSGit({ repoPath: dir });
      expect(existsSync(dir)).toBe(false);
      await git.ready();
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, ".git"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("ready() is idempotent", async () => {
    const dir = join(tmpdir(), `afs-git-idempotent-${Date.now()}`);
    try {
      const git = new AFSGit({ repoPath: dir });
      await git.ready();
      await git.ready();
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(join(dir, ".git"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
