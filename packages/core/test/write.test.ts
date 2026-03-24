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

  afs = new AFS();
  await afs.mount(moduleA);
});

describe("write", () => {
  test("should write new file", async () => {
    const result = await afs.write("/modules/module-a/newFile/content", {
      content: "New Content",
    });

    expect(result.data).toMatchInlineSnapshot(`
      {
        "content": "New Content",
        "createdAt": undefined,
        "id": "/newFile/content",
        "linkTo": undefined,
        "meta": {
          "childrenCount": undefined,
        },
        "path": "/modules/module-a/newFile/content",
        "sessionId": undefined,
        "summary": undefined,
        "updatedAt": undefined,
        "userId": undefined,
      }
    `);

    // Verify the file was written
    const readResult = await afs.read("/modules/module-a/newFile/content");
    expect(readResult.data?.content).toBe("New Content");
  });

  test("should overwrite existing file", async () => {
    const result = await afs.write("/modules/module-a/fileA/content", {
      content: "Updated Content",
    });

    expect(result.data?.content).toBe("Updated Content");

    // Verify the file was updated
    const readResult = await afs.read("/modules/module-a/fileA/content");
    expect(readResult.data?.content).toBe("Updated Content");
  });

  test("should write nested path", async () => {
    const result = await afs.write("/modules/module-a/deep/nested/path/value", {
      content: "Deep Value",
    });

    expect(result.data?.content).toBe("Deep Value");
    expect(result.data?.path).toBe("/modules/module-a/deep/nested/path/value");

    // Verify the nested structure was created
    const readResult = await afs.read("/modules/module-a/deep/nested/path/value");
    expect(readResult.data?.content).toBe("Deep Value");
  });

  test("should write with metadata", async () => {
    const result = await afs.write("/modules/module-a/withMeta/content", {
      content: "Content with metadata",
      summary: "Test summary",
      meta: {
        description: "Test description",
      },
    });

    expect(result.data).toMatchInlineSnapshot(`
      {
        "content": "Content with metadata",
        "createdAt": undefined,
        "id": "/withMeta/content",
        "linkTo": undefined,
        "meta": {
          "childrenCount": undefined,
          "description": "Test description",
        },
        "path": "/modules/module-a/withMeta/content",
        "sessionId": undefined,
        "summary": "Test summary",
        "updatedAt": undefined,
        "userId": undefined,
      }
    `);
  });

  test("should throw error for non-existent module", async () => {
    await expect(afs.write("/modules/nonexistent/foo", { content: "test" })).rejects.toThrow(
      "No module found for path",
    );
  });
});
