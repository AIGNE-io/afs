import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";

/**
 * Security tests: symlink escape prevention.
 *
 * Verifies that symlinks inside a mount pointing to targets outside
 * the mount boundary are correctly rejected for read, write, and delete.
 */

let mountDir: string;
let outsideDir: string;
let outsideFile: string;
let fs: AFSFS;

beforeAll(async () => {
  const base = join(tmpdir(), `symlink-escape-test-${Date.now()}`);
  mountDir = join(base, "mount");
  outsideDir = join(base, "outside");
  outsideFile = join(outsideDir, "secret.txt");

  await mkdir(mountDir, { recursive: true });
  await mkdir(outsideDir, { recursive: true });

  // Create a file outside the mount
  await writeFile(outsideFile, "SECRET_DATA");

  // Create a symlink inside mount pointing to the outside file
  await symlink(outsideFile, join(mountDir, "escape-link.txt"));

  // Create a symlink inside mount pointing to the outside directory
  await symlink(outsideDir, join(mountDir, "escape-dir"));

  // Create a normal file inside mount for comparison
  await writeFile(join(mountDir, "normal.txt"), "normal content");

  fs = new AFSFS({ localPath: mountDir, accessMode: "readwrite" });
});

afterAll(async () => {
  // Clean up both mount and outside dirs (they share a parent)
  await rm(join(mountDir, ".."), { recursive: true, force: true }).catch(() => {});
});

describe("symlink escape prevention", () => {
  test("read via symlink pointing outside mount is rejected", async () => {
    await expect(fs.read("/escape-link.txt")).rejects.toThrow(/permission|traversal/i);
  });

  test("write via symlink pointing outside mount is rejected", async () => {
    await expect(fs.write("/escape-link.txt", { content: "OVERWRITTEN" })).rejects.toThrow(
      /permission|traversal/i,
    );
  });

  test("delete via symlink pointing outside mount is rejected", async () => {
    await expect(fs.delete("/escape-link.txt")).rejects.toThrow(/permission|traversal/i);
  });

  test("read via directory symlink pointing outside mount is rejected", async () => {
    await expect(fs.read("/escape-dir/secret.txt")).rejects.toThrow(/permission|traversal/i);
  });

  test("normal file read still works", async () => {
    const result = await fs.read("/normal.txt");
    expect(result.data?.content).toBe("normal content");
  });

  test("normal file write still works", async () => {
    const result = await fs.write("/normal.txt", { content: "updated" });
    expect(result.data).toBeDefined();
  });
});
