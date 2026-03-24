import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AFSFS } from "@aigne/afs-fs";
import type { PlaygroundSetup } from "@aigne/afs-testing";
import { dump as yamlDump } from "js-yaml";

export async function setupPlayground(tempDir: string): Promise<PlaygroundSetup> {
  const testDir = join(tempDir, "fs-data");
  await mkdir(testDir, { recursive: true });

  // Root level files
  await writeFile(join(testDir, "root.txt"), "root content");
  await writeFile(join(testDir, "readme.md"), "# Hello World");

  // Subdirectory with files
  await mkdir(join(testDir, "docs"), { recursive: true });
  await writeFile(join(testDir, "docs", "guide.md"), "Guide content");
  await writeFile(join(testDir, "docs", "api.md"), "API documentation");

  // Nested subdirectory
  await mkdir(join(testDir, "docs", "examples"), { recursive: true });
  await writeFile(join(testDir, "docs", "examples", "sample.js"), 'console.log("hello");');

  // Another nested directory
  await mkdir(join(testDir, "src", "components"), { recursive: true });
  await writeFile(join(testDir, "src", "index.ts"), 'export * from "./components";');
  await writeFile(
    join(testDir, "src", "components", "Button.tsx"),
    "export const Button = () => {};",
  );

  // Empty directory
  await mkdir(join(testDir, "empty"), { recursive: true });

  // Scratch directory for write/delete
  await mkdir(join(testDir, "scratch", "subdir"), { recursive: true });
  await writeFile(join(testDir, "scratch", "existing.txt"), "existing content");
  await writeFile(join(testDir, "scratch", "to-delete.txt"), "delete me");
  await writeFile(join(testDir, "scratch", "subdir", "nested.txt"), "nested content");

  // Root meta
  await mkdir(join(testDir, ".afs"), { recursive: true });
  await writeFile(
    join(testDir, ".afs", "meta.yaml"),
    yamlDump({ projectName: "test-project", version: "1.0.0" }),
  );

  // File meta
  await mkdir(join(testDir, ".afs", ".nodes", "root.txt"), { recursive: true });
  await writeFile(
    join(testDir, ".afs", ".nodes", "root.txt", "meta.yaml"),
    yamlDump({ description: "Root text file", priority: 1 }),
  );

  // Dir meta
  await mkdir(join(testDir, "docs", ".afs"), { recursive: true });
  await writeFile(
    join(testDir, "docs", ".afs", "meta.yaml"),
    yamlDump({ category: "documentation", indexed: true }),
  );

  const provider = new AFSFS({
    localPath: testDir,
    accessMode: "readwrite",
  });

  return {
    name: "AFSFS",
    mountPath: "/fs",
    provider,
    uri: `fs://${testDir}`,
    cleanup: async () => {},
  };
}
