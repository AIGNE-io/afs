import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { JSONModule } from "./mocks/json-module.js";

let afs: AFS;

beforeEach(async () => {
  const moduleA = new JSONModule({
    name: "module-a",
    description: "Module A",
    data: {
      fileA: { content: "Content A" },
      fileB: { content: "Content B" },
    },
  });

  const moduleB = new JSONModule({
    name: "module-b",
    description: "Module B",
    data: {
      fileC: { content: "Content C" },
    },
  });

  afs = new AFS();
  await afs.mount(moduleA);
  await afs.mount(moduleB);
});

describe("list root path '/'", () => {
  test("with default maxDepth=1", async () => {
    const result = await afs.list("/");

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "id": "modules",
            "meta": {
              "childrenCount": -1,
            },
            "path": "/modules",
          },
        ],
        "total": undefined,
      }
    `);
  });

  test("with maxDepth=2", async () => {
    const result = await afs.list("/", { maxDepth: 2 });

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "id": "module-a",
            "meta": {
              "childrenCount": -1,
              "description": "Module A",
            },
            "path": "/modules/module-a",
            "summary": "Module A",
          },
          {
            "id": "module-b",
            "meta": {
              "childrenCount": -1,
              "description": "Module B",
            },
            "path": "/modules/module-b",
            "summary": "Module B",
          },
        ],
        "total": undefined,
      }
    `);
  });

  test("with maxDepth=3", async () => {
    const result = await afs.list("/", { maxDepth: 3 });

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/",
            "meta": {
              "childrenCount": 2,
            },
            "path": "/modules/module-a",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileA",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-a/fileA",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileB",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-a/fileB",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-b",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileC",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-b/fileC",
            "updatedAt": undefined,
          },
        ],
        "total": undefined,
      }
    `);
  });

  test("with maxDepth=4", async () => {
    const result = await afs.list("/", { maxDepth: 4 });

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/",
            "meta": {
              "childrenCount": 2,
            },
            "path": "/modules/module-a",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileA",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-a/fileA",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileB",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-a/fileB",
            "updatedAt": undefined,
          },
          {
            "content": "Content A",
            "createdAt": undefined,
            "id": "/fileA/content",
            "meta": {
              "childrenCount": undefined,
            },
            "path": "/modules/module-a/fileA/content",
            "updatedAt": undefined,
          },
          {
            "content": "Content B",
            "createdAt": undefined,
            "id": "/fileB/content",
            "meta": {
              "childrenCount": undefined,
            },
            "path": "/modules/module-a/fileB/content",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-b",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileC",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-b/fileC",
            "updatedAt": undefined,
          },
          {
            "content": "Content C",
            "createdAt": undefined,
            "id": "/fileC/content",
            "meta": {
              "childrenCount": undefined,
            },
            "path": "/modules/module-b/fileC/content",
            "updatedAt": undefined,
          },
        ],
        "total": undefined,
      }
    `);
  });
});

describe("list '/modules'", () => {
  test("should return all mounted modules", async () => {
    const result = await afs.list("/modules");

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "id": "module-a",
            "meta": {
              "childrenCount": -1,
              "description": "Module A",
            },
            "path": "/modules/module-a",
            "summary": "Module A",
          },
          {
            "id": "module-b",
            "meta": {
              "childrenCount": -1,
              "description": "Module B",
            },
            "path": "/modules/module-b",
            "summary": "Module B",
          },
        ],
        "total": undefined,
      }
    `);
  });
});

describe("list specific module '/modules/xxx'", () => {
  test("with default format", async () => {
    const result = await afs.list("/modules/module-a");

    expect(result).toMatchInlineSnapshot(`
      {
        "data": [
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/",
            "meta": {
              "childrenCount": 2,
            },
            "path": "/modules/module-a",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileA",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-a/fileA",
            "updatedAt": undefined,
          },
          {
            "content": undefined,
            "createdAt": undefined,
            "id": "/fileB",
            "meta": {
              "childrenCount": 1,
            },
            "path": "/modules/module-a/fileB",
            "updatedAt": undefined,
          },
        ],
        "total": undefined,
      }
    `);
  });
});
