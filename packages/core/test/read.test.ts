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
      nested: {
        deep: { value: "Deep Value" },
      },
    },
  });

  afs = new AFS();
  await afs.mount(moduleA);
});

describe("read", () => {
  test("should read file entry", async () => {
    const result = await afs.read("/modules/module-a/fileA/content");

    expect(result.data).toMatchInlineSnapshot(`
      {
        "actions": [],
        "content": "Content A",
        "createdAt": undefined,
        "id": "/fileA/content",
        "meta": {
          "childrenCount": undefined,
        },
        "path": "/modules/module-a/fileA/content",
        "updatedAt": undefined,
      }
    `);
  });

  test("should read directory entry", async () => {
    const result = await afs.read("/modules/module-a/fileA");

    expect(result.data).toMatchInlineSnapshot(`
      {
        "actions": [],
        "content": undefined,
        "createdAt": undefined,
        "id": "/fileA",
        "meta": {
          "childrenCount": 1,
        },
        "path": "/modules/module-a/fileA",
        "updatedAt": undefined,
      }
    `);
  });

  test("should read nested entry", async () => {
    const result = await afs.read("/modules/module-a/nested/deep/value");

    expect(result.data).toMatchInlineSnapshot(`
      {
        "actions": [],
        "content": "Deep Value",
        "createdAt": undefined,
        "id": "/nested/deep/value",
        "meta": {
          "childrenCount": undefined,
        },
        "path": "/modules/module-a/nested/deep/value",
        "updatedAt": undefined,
      }
    `);
  });

  test("should throw AFSNotFoundError for non-existent path", async () => {
    const { AFSNotFoundError } = await import("../src/error.js");
    await expect(afs.read("/modules/module-a/nonexistent")).rejects.toBeInstanceOf(
      AFSNotFoundError,
    );
  });

  test("should throw AFSNotFoundError for non-existent module", async () => {
    const { AFSNotFoundError } = await import("../src/error.js");
    await expect(afs.read("/modules/nonexistent/foo")).rejects.toBeInstanceOf(AFSNotFoundError);
  });
});
