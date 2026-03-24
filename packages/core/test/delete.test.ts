import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSNotFoundError } from "../src/error.js";
import { JSONModule } from "./mocks/json-module.js";

let afs: AFS;

beforeEach(async () => {
  const moduleA = new JSONModule({
    name: "module-a",
    description: "Module A",
    data: {
      fileA: { content: "Content A" },
      fileB: { content: "Content B" },
      directory: {
        child1: { value: "Value 1" },
        child2: { value: "Value 2" },
      },
    },
  });

  afs = new AFS();
  await afs.mount(moduleA);
});

describe("delete", () => {
  test("should delete file entry", async () => {
    const result = await afs.delete("/modules/module-a/fileA/content");

    expect(result.message).toContain("Successfully deleted");

    // Verify the file was deleted (should now throw AFSNotFoundError)
    await expect(afs.read("/modules/module-a/fileA/content")).rejects.toBeInstanceOf(
      AFSNotFoundError,
    );
  });

  test("should delete empty directory", async () => {
    // First delete all children
    await afs.delete("/modules/module-a/directory/child1/value");
    await afs.delete("/modules/module-a/directory/child2/value");
    await afs.delete("/modules/module-a/directory/child1");
    await afs.delete("/modules/module-a/directory/child2");

    // Now delete the directory
    const result = await afs.delete("/modules/module-a/directory");

    expect(result.message).toContain("Successfully deleted");

    // Verify the directory was deleted (should now throw AFSNotFoundError)
    await expect(afs.read("/modules/module-a/directory")).rejects.toBeInstanceOf(AFSNotFoundError);
  });

  test("should delete directory recursively", async () => {
    const result = await afs.delete("/modules/module-a/directory", {
      recursive: true,
    });

    expect(result.message).toContain("Successfully deleted");

    // Verify the directory was deleted (should now throw AFSNotFoundError)
    await expect(afs.read("/modules/module-a/directory")).rejects.toBeInstanceOf(AFSNotFoundError);
  });

  test("should throw error when deleting non-empty directory without recursive", async () => {
    await expect(afs.delete("/modules/module-a/directory")).rejects.toThrow(
      "without recursive option",
    );
  });

  test("should throw error for non-existent path", async () => {
    await expect(afs.delete("/modules/module-a/nonexistent")).rejects.toThrow("Path not found");
  });

  test("should throw error for non-existent module", async () => {
    await expect(afs.delete("/modules/nonexistent/foo")).rejects.toThrow(
      "No module found for path",
    );
  });
});
