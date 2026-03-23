import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveLocalPath } from "@aigne/afs-provider-utils";

describe("resolveLocalPath", () => {
  test('"." resolves to process.cwd()', () => {
    expect(resolveLocalPath(".")).toBe(process.cwd());
  });

  test("${CWD} template is expanded", () => {
    const result = resolveLocalPath("${CWD}/src");
    expect(result).toBe(join(process.cwd(), "src"));
  });

  test("~/ expands to $HOME", () => {
    const result = resolveLocalPath("~/docs");
    expect(result).toBe(join(process.env.HOME || "", "docs"));
  });

  test("relative path resolved against cwd option", () => {
    const result = resolveLocalPath("./data", { cwd: "/opt/app" });
    expect(result).toBe(join("/opt/app", "data"));
  });

  test("relative path resolved against process.cwd() when no cwd option", () => {
    const result = resolveLocalPath("data");
    expect(result).toBe(join(process.cwd(), "data"));
  });

  test("absolute path passes through unchanged", () => {
    expect(resolveLocalPath("/usr/local/bin")).toBe("/usr/local/bin");
  });

  test("absolute path with ${CWD} replaces variable portion", () => {
    const result = resolveLocalPath("${CWD}/build");
    expect(result).toBe(join(process.cwd(), "build"));
  });

  test("multiple ${CWD} occurrences are all replaced", () => {
    const result = resolveLocalPath("${CWD}/a/${CWD}/b");
    const cwd = process.cwd();
    expect(result).toBe(`${cwd}/a/${cwd}/b`);
  });

  test("~/ throws when HOME is not set", () => {
    const origHome = process.env.HOME;
    try {
      delete process.env.HOME;
      expect(() => resolveLocalPath("~/docs")).toThrow();
    } finally {
      process.env.HOME = origHome;
    }
  });
});
