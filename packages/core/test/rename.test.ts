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
        child: { value: "Child Value" },
      },
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

describe("rename", () => {
  test("should rename file entry", async () => {
    const result = await afs.rename(
      "/modules/module-a/fileA/content",
      "/modules/module-a/renamedFile/content",
    );

    expect(result.message).toContain("Successfully renamed");

    // Verify old path doesn't exist (should throw AFSNotFoundError)
    await expect(afs.read("/modules/module-a/fileA/content")).rejects.toBeInstanceOf(
      AFSNotFoundError,
    );

    // Verify new path exists
    const newRead = await afs.read("/modules/module-a/renamedFile/content");
    expect(newRead.data?.content).toBe("Content A");
  });

  test("should rename directory", async () => {
    const result = await afs.rename("/modules/module-a/directory", "/modules/module-a/renamedDir");

    expect(result.message).toContain("Successfully renamed");

    // Verify old path doesn't exist (should throw AFSNotFoundError)
    await expect(afs.read("/modules/module-a/directory")).rejects.toBeInstanceOf(AFSNotFoundError);

    // Verify new path exists with children
    const newRead = await afs.read("/modules/module-a/renamedDir");
    expect(typeof newRead.data?.meta?.childrenCount).toBe("number");

    const childRead = await afs.read("/modules/module-a/renamedDir/child/value");
    expect(childRead.data?.content).toBe("Child Value");
  });

  test("should overwrite when overwrite option is true", async () => {
    // First create a file at the target location
    await afs.write("/modules/module-a/target/content", {
      content: "Target Content",
    });

    const result = await afs.rename(
      "/modules/module-a/fileA/content",
      "/modules/module-a/target/content",
      { overwrite: true },
    );

    expect(result.message).toContain("Successfully renamed");

    // Verify the content was replaced
    const newRead = await afs.read("/modules/module-a/target/content");
    expect(newRead.data?.content).toBe("Content A");
  });

  test("should throw error when overwriting without overwrite option", async () => {
    await expect(
      afs.rename("/modules/module-a/fileA/content", "/modules/module-a/fileB/content"),
    ).rejects.toThrow("already exists");
  });

  test("should throw error when renaming across different modules", async () => {
    await expect(
      afs.rename("/modules/module-a/fileA/content", "/modules/module-b/fileA/content"),
    ).rejects.toThrow("Cannot rename across different modules");
  });

  test("should throw error for non-existent source path", async () => {
    await expect(
      afs.rename("/modules/module-a/nonexistent", "/modules/module-a/target"),
    ).rejects.toThrow("Source path not found");
  });

  test("should throw error for non-existent module", async () => {
    await expect(afs.rename("/modules/nonexistent/foo", "/modules/module-a/bar")).rejects.toThrow(
      "Cannot rename across different modules",
    );
  });
});
