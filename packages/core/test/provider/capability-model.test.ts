import { describe, expect, test } from "bun:test";
import {
  AFSBaseProvider,
  Delete,
  Exec,
  Explain,
  List,
  Read,
  Search,
  Stat,
  Write,
} from "../../src/provider/index.js";
import type { RouteContext } from "../../src/provider/types.js";

// --- Test providers with various capability subsets ---

class ReadOnlyProvider extends AFSBaseProvider {
  readonly name = "read-only";

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Read("/:file")
  async readFile(ctx: RouteContext<{ file: string }>) {
    return { path: `/${ctx.params.file}`, content: "data" };
  }
}

class FullProvider extends AFSBaseProvider {
  readonly name = "full";
  readonly accessMode = "readwrite" as const;

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Read("/:file")
  async readFile(ctx: RouteContext<{ file: string }>) {
    return { path: `/${ctx.params.file}`, content: "data" };
  }

  @Write("/:file")
  async writeFile() {
    return { success: true };
  }

  @Delete("/:file")
  async deleteFile() {
    return { success: true };
  }

  @Exec("/.actions/:name")
  async execAction() {
    return { success: true, data: {} };
  }

  @Search("/")
  async searchRoot() {
    return { data: [] };
  }

  @Stat("/")
  async statRoot() {
    return { data: { path: "/", meta: {} } };
  }

  @Explain("/")
  async explainRoot() {
    return { data: { content: "explain" } };
  }
}

class WriteButReadonlyMode extends AFSBaseProvider {
  readonly name = "write-but-readonly";
  readonly accessMode = "readonly" as const;

  @List("/")
  async listRoot() {
    return { data: [] };
  }

  @Write("/:file")
  async writeFile() {
    return { success: true };
  }

  @Delete("/:file")
  async deleteFile() {
    return { success: true };
  }
}

class MinimalProvider extends AFSBaseProvider {
  readonly name = "minimal";

  @Read("/")
  async readRoot() {
    return { path: "/", content: "root" };
  }
}

describe("AFSBaseProvider capability model", () => {
  test("provider with only List+Read has only those capabilities", () => {
    const provider = new ReadOnlyProvider();
    const caps = provider.getCapabilities();
    expect(caps.list).toBe(true);
    expect(caps.read).toBe(true);
    expect(caps.write).toBe(false);
    expect(caps.delete).toBe(false);
    expect(caps.exec).toBe(false);
    expect(caps.search).toBe(false);
  });

  test("full provider has all capabilities", () => {
    const provider = new FullProvider();
    const caps = provider.getCapabilities();
    expect(caps.list).toBe(true);
    expect(caps.read).toBe(true);
    expect(caps.write).toBe(true);
    expect(caps.delete).toBe(true);
    expect(caps.exec).toBe(true);
    expect(caps.search).toBe(true);
    expect(caps.stat).toBe(true);
    expect(caps.explain).toBe(true);
  });

  test("write capability is false when accessMode is readonly even with @Write decorator", () => {
    const provider = new WriteButReadonlyMode();
    const caps = provider.getCapabilities();
    expect(caps.list).toBe(true);
    expect(caps.write).toBe(false);
    expect(caps.delete).toBe(false);
  });

  test("getCapabilities is consistent with getOperationsDeclaration", () => {
    const provider = new FullProvider();
    const caps = provider.getCapabilities();
    // read, list, write, delete, search, exec, stat, explain should all be true
    for (const key of ["read", "list", "write", "delete", "search", "exec", "stat", "explain"]) {
      expect(caps[key]).toBe(true);
    }
  });

  test("minimal provider only has read capability", () => {
    const provider = new MinimalProvider();
    const caps = provider.getCapabilities();
    expect(caps.read).toBe(true);
    expect(caps.list).toBe(false);
    expect(caps.write).toBe(false);
    expect(caps.search).toBe(false);
  });
});
