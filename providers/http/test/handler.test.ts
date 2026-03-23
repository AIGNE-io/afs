import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { createAFSHttpHandler } from "../src/handler.js";
import { AFSErrorCode } from "../src/protocol.js";

// Mock AFS module for testing
function createMockModule(overrides: Partial<AFSModule> = {}): AFSModule {
  return {
    name: "mock",
    list: async (_path, _options) => ({
      data: [{ id: "1", path: "/test" }],
    }),
    read: async (path, _options) => ({
      data: { id: "1", path, content: "test content" },
    }),
    write: async (path, content, _options) => ({
      data: { id: "1", path, ...content },
    }),
    delete: async (path, _options) => ({
      message: `Deleted ${path}`,
    }),
    rename: async (oldPath, newPath, _options) => ({
      message: `Renamed ${oldPath} to ${newPath}`,
    }),
    search: async (_path, _query, _options) => ({
      data: [{ id: "1", path: "/found" }],
    }),
    exec: async (_path, _args, _options) => ({
      success: true,
      data: { result: "executed" },
    }),
    ...overrides,
  };
}

describe("createAFSHttpHandler", () => {
  test("should reject non-POST requests", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", { method: "GET" });

    const response = await handler(request);
    expect(response.status).toBe(405);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Method not allowed");
  });

  test("should reject non-JSON content type", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });

    const response = await handler(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Content-Type must be application/json");
  });

  test("should reject invalid JSON", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });

    const response = await handler(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Invalid JSON body");
  });

  test("should reject unknown method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "unknown", params: {} }),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Unknown method");
  });

  test("should handle list method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "list", params: { path: "/" } }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toHaveLength(1);
  });

  test("should handle read method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "read", params: { path: "/test.txt" } }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.data.content).toBe("test content");
  });

  test("should handle write method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "write",
        params: { path: "/new.txt", content: { content: "new content" } },
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should handle delete method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "delete", params: { path: "/old.txt" } }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Deleted");
  });

  test("should handle rename method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "rename",
        params: { oldPath: "/old.txt", newPath: "/new.txt" },
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Renamed");
  });

  test("should handle search method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "search",
        params: { path: "/", query: "test" },
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toHaveLength(1);
  });

  test("should handle exec method", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "exec",
        params: { path: "/action", args: { key: "value" }, options: {} },
      }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.data.result).toBe("executed");
  });

  test("should return error when module does not support operation", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule({ list: undefined }),
    });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "list", params: { path: "/" } }),
    });

    const response = await handler(request);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("does not support list operation");
  });

  test("should handle module errors", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule({
        read: async () => {
          throw new Error("File not found");
        },
      }),
    });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "read", params: { path: "/missing" } }),
    });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(AFSErrorCode.NOT_FOUND);
  });

  test("should reject payload exceeding max size", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      maxBodySize: 100,
    });
    const request = new Request("http://localhost/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "1000",
      },
      body: JSON.stringify({ method: "list", params: { path: "/" } }),
    });

    const response = await handler(request);
    expect(response.status).toBe(413);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Payload too large");
  });
});

describe("createAFSHttpHandler - token validation", () => {
  // Helper to create a valid RPC request
  function createRpcRequest(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ method: "list", params: { path: "/" } }),
    });
  }

  test("should allow requests when no token is configured (backward compatible)", async () => {
    const handler = createAFSHttpHandler({ module: createMockModule() });
    const request = createRpcRequest();

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should allow requests with correct static token", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "secret-token",
    });
    const request = createRpcRequest({ Authorization: "Bearer secret-token" });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should reject requests without Authorization header when token is configured", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "secret-token",
    });
    const request = createRpcRequest();

    const response = await handler(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(AFSErrorCode.UNAUTHORIZED);
    expect(body.error.message).toBe("Unauthorized");
  });

  test("should reject requests with wrong token", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "secret-token",
    });
    const request = createRpcRequest({ Authorization: "Bearer wrong-token" });

    const response = await handler(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(AFSErrorCode.UNAUTHORIZED);
  });

  test("should reject requests with non-Bearer format", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "secret-token",
    });
    const request = createRpcRequest({ Authorization: "Basic secret-token" });

    const response = await handler(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(AFSErrorCode.UNAUTHORIZED);
  });

  test("should allow requests when custom validator returns true", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: (token) => token === "valid-token",
    });
    const request = createRpcRequest({ Authorization: "Bearer valid-token" });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should reject requests when custom validator returns false", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: (token) => token === "valid-token",
    });
    const request = createRpcRequest({ Authorization: "Bearer invalid-token" });

    const response = await handler(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(AFSErrorCode.UNAUTHORIZED);
  });

  test("should reject requests when custom validator throws", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: () => {
        throw new Error("Validator error");
      },
    });
    const request = createRpcRequest({ Authorization: "Bearer any-token" });

    const response = await handler(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe(AFSErrorCode.UNAUTHORIZED);
  });

  test("should handle Authorization header case-insensitively for Bearer prefix", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "secret-token",
    });
    const request = createRpcRequest({ Authorization: "bearer secret-token" });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should trim token whitespace", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "secret-token",
    });
    const request = createRpcRequest({ Authorization: "Bearer   secret-token  " });

    const response = await handler(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
  });

  test("should not leak token value in error response", async () => {
    const handler = createAFSHttpHandler({
      module: createMockModule(),
      token: "super-secret-token",
    });
    const request = createRpcRequest({ Authorization: "Bearer wrong-token" });

    const response = await handler(request);
    const body = await response.json();

    // Error message should be generic, not containing token values
    expect(body.error.message).toBe("Unauthorized");
    expect(JSON.stringify(body)).not.toContain("super-secret-token");
    expect(JSON.stringify(body)).not.toContain("wrong-token");
  });
});
