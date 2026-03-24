import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AFSGit } from "@aigne/afs-git";
import type { PlaygroundSetup } from "@aigne/afs-testing";
import { simpleGit } from "simple-git";

export async function setupPlayground(tempDir: string): Promise<PlaygroundSetup> {
  const testDir = join(tempDir, "git-data");
  const repoPath = join(testDir, "test-repo");
  await mkdir(repoPath, { recursive: true });

  const git = simpleGit(repoPath);
  await git.init();
  await git.addConfig("user.name", "Test User");
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("commit.gpgsign", "false");
  await git.checkoutLocalBranch("main");

  // Create file structure
  await writeFile(join(repoPath, "root.txt"), "root content");
  await writeFile(join(repoPath, "readme.md"), "# Hello World");

  await mkdir(join(repoPath, "docs"), { recursive: true });
  await writeFile(join(repoPath, "docs", "guide.md"), "Guide content");
  await writeFile(join(repoPath, "docs", "api.md"), "API documentation");

  await mkdir(join(repoPath, "docs", "examples"), { recursive: true });
  await writeFile(join(repoPath, "docs", "examples", "sample.js"), 'console.log("hello");');

  await mkdir(join(repoPath, "src", "components"), { recursive: true });
  await writeFile(join(repoPath, "src", "index.ts"), 'export * from "./components";');
  await writeFile(
    join(repoPath, "src", "components", "Button.tsx"),
    "export const Button = () => {};",
  );

  await mkdir(join(repoPath, "scratch"), { recursive: true });
  await writeFile(join(repoPath, "scratch", "existing.txt"), "existing content");
  await writeFile(join(repoPath, "scratch", "to-delete.txt"), "delete me");
  await mkdir(join(repoPath, "scratch", "subdir"), { recursive: true });
  await writeFile(join(repoPath, "scratch", "subdir", "nested.txt"), "nested content");

  await git.add(".");
  await git.commit("Initial commit");

  const afsGit = new AFSGit({ repoPath, accessMode: "readwrite", autoCommit: true });

  return {
    name: "AFSGit",
    mountPath: "/git",
    provider: afsGit,
    uri: `git://${repoPath}`,
    cleanup: async () => {
      await afsGit.cleanup();
    },
  };
}
