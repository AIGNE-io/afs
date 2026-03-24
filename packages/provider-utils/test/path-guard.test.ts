import { describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSError } from "@aigne/afs";
import { assertPathWithinRoot } from "@aigne/afs-provider-utils";

async function createTempDir(): Promise<string> {
  const dir = join(tmpdir(), `afs-guard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("assertPathWithinRoot", () => {
  test("child path does not throw", async () => {
    const root = await createTempDir();
    try {
      const child = join(root, "subdir", "file.txt");
      await mkdir(join(root, "subdir"), { recursive: true });
      await writeFile(child, "hello");
      await assertPathWithinRoot(child, root);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  test("root path itself does not throw", async () => {
    const root = await createTempDir();
    try {
      await assertPathWithinRoot(root, root);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  test("../  traversal throws AFS_PERMISSION_DENIED", async () => {
    const root = await createTempDir();
    try {
      const escapePath = join(root, "..", "etc", "passwd");
      await expect(assertPathWithinRoot(escapePath, root)).rejects.toThrow(AFSError);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  test("symlink escape throws AFS_PERMISSION_DENIED", async () => {
    const root = await createTempDir();
    const outsideDir = await createTempDir();
    try {
      const outsideFile = join(outsideDir, "secret.txt");
      await writeFile(outsideFile, "secret data");

      const symlinkPath = join(root, "escape-link");
      await symlink(outsideFile, symlinkPath);

      await expect(assertPathWithinRoot(symlinkPath, root)).rejects.toThrow(AFSError);
    } finally {
      await rm(root, { recursive: true });
      await rm(outsideDir, { recursive: true });
    }
  });

  test("symlink to directory outside root throws", async () => {
    const root = await createTempDir();
    const outsideDir = await createTempDir();
    try {
      const symlinkPath = join(root, "escape-dir");
      await symlink(outsideDir, symlinkPath);

      await expect(assertPathWithinRoot(symlinkPath, root)).rejects.toThrow(AFSError);
    } finally {
      await rm(root, { recursive: true });
      await rm(outsideDir, { recursive: true });
    }
  });

  test("non-existent target falls back to parent check", async () => {
    const root = await createTempDir();
    try {
      const nonExistent = join(root, "subdir", "newfile.txt");
      await mkdir(join(root, "subdir"), { recursive: true });
      // Parent exists and is within root — should pass
      await assertPathWithinRoot(nonExistent, root);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  test("non-existent target with non-existent parent passes silently", async () => {
    const root = await createTempDir();
    try {
      const deepPath = join(root, "a", "b", "c", "file.txt");
      // Neither target nor parent exist — logical check is sufficient
      await assertPathWithinRoot(deepPath, root);
    } finally {
      await rm(root, { recursive: true });
    }
  });
});
