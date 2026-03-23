/**
 * AFSHttpClient Conformance Tests
 *
 * Uses the unified provider testing framework to verify
 * that AFSHttpClient conforms to the AFS provider interface contract.
 *
 * Strategy: spin up a Bun HTTP server backed by AFSJSON,
 * create an AFSHttpClient pointing at it, and run conformance tests
 * end-to-end through the HTTP transport layer.
 */
import { describe } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFSHttpClient, createAFSHttpHandler } from "@aigne/afs-http";
import { AFSJSON } from "@aigne/afs-json";
import { runProviderTests } from "@aigne/afs-testing";
import { setupPlayground } from "./playground.js";

describe("AFSHttpClient Conformance", () => {
  let jsonFilePath: string;
  let server: ReturnType<typeof Bun.serve>;

  // Test data served by the JSON backend
  const testData = {
    root: "root content",
    readme: "# Hello World",
    docs: {
      guide: "Guide content",
      api: "API documentation",
      examples: {
        sample: 'console.log("hello");',
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
  };

  runProviderTests({
    name: "AFSHttpClient",
    providerClass: AFSHttpClient,
    playground: setupPlayground,

    async beforeAll() {
      // 1. Write JSON file for the backend
      jsonFilePath = join(tmpdir(), `afs-http-conformance-${Date.now()}.json`);
      await writeFile(jsonFilePath, JSON.stringify(testData, null, 2));

      // 2. Create AFSJSON backend module
      const backendModule = new AFSJSON({
        jsonPath: jsonFilePath,
        accessMode: "readwrite",
      });

      // 3. Create HTTP handler and start Bun server
      const handler = createAFSHttpHandler({ module: backendModule });
      server = Bun.serve({ port: 0, fetch: handler });
    },

    async afterAll() {
      server?.stop();
      await rm(jsonFilePath, { force: true });
    },

    createProvider() {
      return new AFSHttpClient({
        url: `http://localhost:${server.port}`,
        name: "http-conformance",
        description: "HTTP conformance test",
        accessMode: "readwrite",
        allowPrivateNetwork: true,
      });
    },

    // Tree structure mirrors the JSON test data
    structure: {
      root: {
        name: "",
        children: [
          { name: "root", content: "root content" },
          { name: "readme", content: "# Hello World" },
          {
            name: "docs",
            children: [
              { name: "guide", content: "Guide content" },
              { name: "api", content: "API documentation" },
              {
                name: "examples",
                children: [{ name: "sample", content: 'console.log("hello");' }],
              },
            ],
          },
          {
            name: "src",
            children: [
              { name: "index", content: 'export * from "./components";' },
              {
                name: "components",
                children: [{ name: "Button", content: "export const Button = () => {};" }],
              },
            ],
          },
          { name: "empty", children: [] },
          {
            name: "scratch",
            children: [
              { name: "existing", content: "existing content" },
              { name: "toDelete", content: "delete me" },
              {
                name: "subdir",
                children: [{ name: "nested", content: "nested content" }],
              },
            ],
          },
        ],
      },
    },

    // Write test cases — forwarded through HTTP to JSON backend
    writeCases: [
      {
        name: "should create a new key via HTTP",
        path: "/scratch/newKey",
        payload: { content: "newly created via http" },
        expected: { contentContains: "newly created via http" },
      },
      {
        name: "should overwrite existing key via HTTP",
        path: "/scratch/existing",
        payload: { content: "updated via http" },
        expected: { content: "updated via http" },
      },
    ],

    // Delete test cases
    deleteCases: [
      {
        name: "should delete a key via HTTP",
        path: "/scratch/toDelete",
        verifyDeleted: true,
      },
    ],
  });
});
