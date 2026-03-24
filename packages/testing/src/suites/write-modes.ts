import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFSAlreadyExistsError, AFSNotFoundError } from "@aigne/afs";
import type { TestConfig } from "../types.js";

/**
 * Unique path generator to avoid collisions between tests.
 */
let counter = 0;
function uniquePath(prefix: string): string {
  return `${prefix}/_conformance_write_mode_${Date.now()}_${++counter}`;
}

/**
 * Safely delete a path, ignoring errors.
 */
async function cleanup(provider: AFSModule, path: string): Promise<void> {
  try {
    await provider.delete?.(path);
  } catch {
    // ignore
  }
}

/**
 * Helper: run test body only if provider is writable, otherwise skip silently.
 */
function writableTest(
  name: string,
  getProvider: () => AFSModule,
  fn: (provider: AFSModule) => Promise<void>,
): void {
  test(name, async () => {
    const provider = getProvider();
    if (provider.accessMode === "readonly" || !provider.write) return;
    await fn(provider);
  });
}

/**
 * Run WriteModesValidation suite.
 * Automatically tests all write modes (replace, append, prepend, create, update, patch)
 * on any writable provider. No fixture data required.
 * Skips silently for readonly providers.
 */
export function runWriteModesTests(
  getProvider: () => AFSModule,
  _config: TestConfig,
  pathPrefix = "",
): void {
  describe("write-modes", () => {
    writableTest("replace (default): overwrites content", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "first" });
        await provider.write!(path, { content: "second" });
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("second");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest("replace (explicit): overwrites content", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "first" });
        await provider.write!(path, { content: "second" }, { mode: "replace" });
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("second");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest("append: adds content after existing", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "hello" });
        await provider.write!(path, { content: " world" }, { mode: "append" });
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("hello world");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest(
      "append to non-existent file: creates with content",
      getProvider,
      async (provider) => {
        const path = uniquePath(pathPrefix);
        try {
          await provider.write!(path, { content: "new content" }, { mode: "append" });
          const result = await provider.read!(path);
          expect(String(result.data?.content)).toBe("new content");
        } finally {
          await cleanup(provider, path);
        }
      },
    );

    writableTest("prepend: adds content before existing", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "world" });
        await provider.write!(path, { content: "hello " }, { mode: "prepend" });
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("hello world");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest(
      "prepend to non-existent file: creates with content",
      getProvider,
      async (provider) => {
        const path = uniquePath(pathPrefix);
        try {
          await provider.write!(path, { content: "new content" }, { mode: "prepend" });
          const result = await provider.read!(path);
          expect(String(result.data?.content)).toBe("new content");
        } finally {
          await cleanup(provider, path);
        }
      },
    );

    writableTest("create: succeeds on new path", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        const result = await provider.write!(path, { content: "created" }, { mode: "create" });
        expect(result).toBeDefined();
        const readResult = await provider.read!(path);
        expect(String(readResult.data?.content)).toBe("created");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest("create: rejects duplicate write", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "first" }, { mode: "create" });
        let threw = false;
        try {
          await provider.write!(path, { content: "second" }, { mode: "create" });
        } catch (e) {
          threw = true;
          expect(e).toBeInstanceOf(AFSAlreadyExistsError);
        }
        expect(threw).toBe(true);
        // original content preserved
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("first");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest("update: succeeds on existing path", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "original" });
        await provider.write!(path, { content: "updated" }, { mode: "update" });
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("updated");
      } finally {
        await cleanup(provider, path);
      }
    });

    writableTest("update: rejects write to non-existent path", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      let threw = false;
      try {
        await provider.write!(path, { content: "data" }, { mode: "update" });
      } catch (e) {
        threw = true;
        expect(e).toBeInstanceOf(AFSNotFoundError);
      }
      expect(threw).toBe(true);
    });

    writableTest("patch: applies str_replace patches", getProvider, async (provider) => {
      const path = uniquePath(pathPrefix);
      try {
        await provider.write!(path, { content: "hello world" });
        await provider.write!(
          path,
          { patches: [{ op: "str_replace", target: "world", content: "earth" }] },
          { mode: "patch" },
        );
        const result = await provider.read!(path);
        expect(String(result.data?.content)).toBe("hello earth");
      } finally {
        await cleanup(provider, path);
      }
    });
  });
}
