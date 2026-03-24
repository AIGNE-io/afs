import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AFSJSON } from "@aigne/afs-json";
import type { PlaygroundSetup } from "@aigne/afs-testing";

const jsonTestData = {
  root: "root content",
  readme: "# Hello World",
  docs: {
    guide: "Guide content",
    api: "API documentation",
    examples: {
      sample: 'console.log("hello");',
    },
    ".afs": {
      meta: { category: "documentation", indexed: true },
      ".nodes": {
        guide: { meta: { difficulty: "beginner", readTime: 5 } },
      },
    },
  },
  src: {
    index: 'export * from "./components";',
    components: {
      Button: "export const Button = () => {};",
    },
  },
  empty: {},
  scratch: {
    existing: "existing content",
    toDelete: "delete me",
    subdir: {
      nested: "nested content",
    },
  },
  ".afs": {
    meta: { projectName: "test-project", version: "1.0.0" },
    ".nodes": {
      readme: { meta: { author: "Test Author" } },
      root: { meta: { description: "Root content file" } },
    },
  },
};

export async function setupPlayground(tempDir: string): Promise<PlaygroundSetup> {
  const dir = join(tempDir, "json-data");
  await mkdir(dir, { recursive: true });
  const jsonFilePath = join(dir, "data.json");
  await writeFile(jsonFilePath, JSON.stringify(jsonTestData, null, 2));

  const provider = new AFSJSON({ jsonPath: jsonFilePath, accessMode: "readwrite" });

  return {
    name: "AFSJSON",
    mountPath: "/json",
    provider,
    uri: `json://${jsonFilePath}`,
    cleanup: async () => {},
  };
}
