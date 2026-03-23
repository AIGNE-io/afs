import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PlaygroundSetup } from "@aigne/afs-testing";
import { AFSTOML } from "@aigne/afs-toml";

const tomlTestContent = `
root = "root content"
readme = "# Hello World"

[".afs".meta]
projectName = "test-project"
version = "1.0.0"

[".afs".".nodes".readme.meta]
author = "Test Author"

[docs]
guide = "Guide content"
api = "API documentation"

[docs.examples]
sample = 'console.log("hello");'

[docs.".afs".meta]
category = "documentation"
indexed = true

[docs.".afs".".nodes".guide.meta]
difficulty = "beginner"
readTime = 5

[empty]

[scratch]
existing = "existing content"
toDelete = "delete me"

[scratch.subdir]
nested = "nested content"
`;

export async function setupPlayground(tempDir: string): Promise<PlaygroundSetup> {
  const dir = join(tempDir, "toml-data");
  await mkdir(dir, { recursive: true });
  const tomlFilePath = join(dir, "data.toml");
  await writeFile(tomlFilePath, tomlTestContent);

  const provider = new AFSTOML({ tomlPath: tomlFilePath, accessMode: "readwrite" });

  return {
    name: "AFSTOML",
    mountPath: "/toml",
    provider,
    uri: `toml://${tomlFilePath}`,
    cleanup: async () => {},
  };
}
