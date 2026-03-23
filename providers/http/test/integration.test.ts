import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFSHttpClient } from "../src/client.js";
import { AFSUnauthorizedError } from "../src/errors.js";
import { createAFSHttpHandler } from "../src/handler.js";

// Mock AFS module for testing
function createMockModule(): AFSModule {
  const files: Record<string, { content: string }> = {
    "/readme.txt": { content: "Hello World" },
    "/data/config.json": { content: '{"key": "value"}' },
  };

  return {
    name: "mock",
    accessMode: "readwrite",
    list: async (path) => {
      const entries = Object.keys(files)
        .filter((p) => p.startsWith(path === "/" ? "/" : `${path}/`) || p === path)
        .map((p) => ({ id: p, path: p }));
      return { data: entries };
    },
    read: async (path) => {
      const file = files[path];
      if (!file) {
        return { data: undefined, message: "File not found" };
      }
      return { data: { id: path, path, content: file.content } };
    },
    write: async (path, content) => {
      files[path] = { content: content.content as string };
      return { data: { id: path, path, content: content.content } };
    },
    delete: async (path) => {
      delete files[path];
      return { message: `Deleted ${path}` };
    },
    search: async (_path, query) => {
      const entries = Object.entries(files)
        .filter(([, file]) => file.content.includes(query))
        .map(([p]) => ({ id: p, path: p }));
      return { data: entries };
    },
  };
}

describe("Integration: Client + Handler", () => {
  // Create a handler that we'll test against
  const mockModule = createMockModule();
  const handler = createAFSHttpHandler({ module: mockModule });

  // Create a custom fetch that routes to our handler
  const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const request = new Request(url, init);
    return handler(request);
  };

  // Override global fetch for testing
  const originalFetch = globalThis.fetch;

  test("should list files via HTTP", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });

      const result = await client.list("/");
      expect(result.data.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should read file via HTTP", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });

      const result = await client.read("/readme.txt");
      expect(result.data?.content).toBe("Hello World");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should write file via HTTP", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });

      const result = await client.write("/new-file.txt", { content: "New content" });
      expect(result.data.path).toBe("/new-file.txt");

      // Verify the write
      const readResult = await client.read("/new-file.txt");
      expect(readResult.data?.content).toBe("New content");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should delete file via HTTP", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });

      // First write a file
      await client.write("/to-delete.txt", { content: "Delete me" });

      // Then delete it
      const result = await client.delete("/to-delete.txt");
      expect(result.message).toContain("Deleted");

      // Verify it's gone
      const readResult = await client.read("/to-delete.txt");
      expect(readResult.data).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should search files via HTTP", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });

      const result = await client.search("/", "Hello");
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]?.path).toBe("/readme.txt");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Integration: Token Authorization", () => {
  const SECRET_TOKEN = "test-secret-token";
  const mockModule = createMockModule();
  const handler = createAFSHttpHandler({
    module: mockModule,
    token: SECRET_TOKEN,
  });

  const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const request = new Request(url, init);
    return handler(request);
  };

  const originalFetch = globalThis.fetch;

  test("should allow requests with correct token", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
        token: SECRET_TOKEN,
      });

      const result = await client.list("/");
      expect(result.data.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should reject requests without token", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
        // No token configured
      });

      await expect(client.list("/")).rejects.toThrow(AFSUnauthorizedError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should reject requests with wrong token", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
        token: "wrong-token",
      });

      await expect(client.list("/")).rejects.toThrow(AFSUnauthorizedError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should throw AFSUnauthorizedError with correct message", async () => {
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
        token: "wrong-token",
      });

      let error: Error | undefined;
      try {
        await client.list("/");
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeInstanceOf(AFSUnauthorizedError);
      expect(error?.message).toBe("Unauthorized");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should work with custom token validator", async () => {
    const validTokens = new Set(["token-1", "token-2", "token-3"]);
    const handlerWithValidator = createAFSHttpHandler({
      module: mockModule,
      token: (token) => validTokens.has(token),
    });

    const mockFetchWithValidator = async (url: string, init?: RequestInit): Promise<Response> => {
      const request = new Request(url, init);
      return handlerWithValidator(request);
    };

    globalThis.fetch = mockFetchWithValidator as typeof fetch;

    try {
      // Valid token
      const client1 = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
        token: "token-2",
      });
      const result = await client1.list("/");
      expect(result.data.length).toBeGreaterThan(0);

      // Invalid token
      const client2 = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
        token: "token-invalid",
      });
      await expect(client2.list("/")).rejects.toThrow(AFSUnauthorizedError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
