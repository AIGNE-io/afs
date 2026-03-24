import { describe, expect, test } from "bun:test";
import type { JSONSchema7 } from "@aigne/afs";
import { createMCPAuthContext } from "../../src/credential/mcp-auth-context.js";

// Mock MCP Server that supports elicitation
function createMockServer(options?: {
  elicitResult?: { action: string; content?: Record<string, unknown> };
  elicitError?: Error;
}) {
  const calls: { method: string; params: any }[] = [];
  const logMessages: { level: string; data: unknown }[] = [];

  return {
    calls,
    logMessages,
    elicitInput: async (params: any) => {
      calls.push({ method: "elicitInput", params });
      if (options?.elicitError) throw options.elicitError;
      return options?.elicitResult ?? { action: "accept", content: { token: "collected" } };
    },
    createElicitationCompletionNotifier: (id: string) => {
      calls.push({ method: "createElicitationCompletionNotifier", params: { id } });
      return async () => {};
    },
    sendLoggingMessage: async (params: { level: string; data: unknown }) => {
      logMessages.push(params);
    },
  };
}

/**
 * Helper: wait for a URL mode elicitation call, extract auth server URL, POST form data.
 * Used by tests that exercise the URL mode path (sensitive fields).
 */
async function submitFormToAuthServer(
  server: ReturnType<typeof createMockServer>,
  formData: Record<string, unknown>,
): Promise<void> {
  // Wait for the URL mode elicitation call to appear
  let urlCall: (typeof server.calls)[number] | undefined;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 50));
    urlCall = server.calls.find((c) => c.method === "elicitInput" && c.params?.mode === "url");
    if (urlCall) break;
  }
  if (!urlCall) throw new Error("URL mode elicitation call not found");

  await fetch(urlCall.params.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
}

const nonSensitiveSchema: JSONSchema7 = {
  type: "object",
  properties: {
    name: { type: "string", description: "Name" },
    region: { type: "string", description: "Region" },
  },
  required: ["name"],
} as any;

const sensitiveSchema: JSONSchema7 = {
  type: "object",
  properties: {
    token: { type: "string", description: "API Token", sensitive: true } as any,
    region: { type: "string", description: "Region" },
  },
} as any;

describe("MCP AuthContext", () => {
  // ─── Happy Path ──────────────────────────────────────────────────────

  describe("Happy Path", () => {
    test("collect() non-sensitive uses form mode", async () => {
      const server = createMockServer({
        elicitResult: { action: "accept", content: { name: "Alice", region: "us-east-1" } },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.collect(nonSensitiveSchema);
      expect(result).toEqual({ name: "Alice", region: "us-east-1" });

      // Should have used form mode
      expect(server.calls[0]!.method).toBe("elicitInput");
      expect(server.calls[0]!.params.mode).toBe("form");
    });

    test("collect() with sensitive fields uses URL mode and returns submitted data", async () => {
      const server = createMockServer({
        elicitResult: { action: "accept" },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      // Start collect (will use URL mode for sensitive fields)
      const collectPromise = ctx.collect(sensitiveSchema);

      // Submit form data to the auth server via API
      await submitFormToAuthServer(server, { token: "my_token", region: "us-east-1" });

      const result = await collectPromise;
      expect(result).toEqual({ token: "my_token", region: "us-east-1" });

      // Should have called URL mode elicitation
      const urlCall = server.calls.find(
        (c) => c.method === "elicitInput" && c.params?.mode === "url",
      );
      expect(urlCall).toBeDefined();
      expect(urlCall!.params.url).toContain("127.0.0.1");
    });

    test("requestOpenURL() uses URL mode elicitation", async () => {
      const server = createMockServer({
        elicitResult: { action: "accept" },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.requestOpenURL("https://example.com/auth", "Please authorize");
      expect(result).toBe("accepted");

      expect(server.calls[0]!.params.mode).toBe("url");
      expect(server.calls[0]!.params.url).toBe("https://example.com/auth");
    });

    test("createCallbackServer() returns valid CallbackServer", async () => {
      const server = createMockServer();
      const ctx = createMCPAuthContext({ server: server as any });

      const callbackServer = await ctx.createCallbackServer();
      expect(callbackServer.callbackURL).toContain("127.0.0.1");
      expect(callbackServer.callbackURL).toContain("/callback");

      callbackServer.close();
    });

    test("resolved property contains pre-resolved fields", () => {
      const server = createMockServer();
      const ctx = createMCPAuthContext({
        server: server as any,
        resolved: { existingKey: "existingVal" },
      });
      expect(ctx.resolved).toEqual({ existingKey: "existingVal" });
    });
  });

  // ─── Bad Path ────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    test("collect() returns null when elicitation is declined", async () => {
      const server = createMockServer({
        elicitResult: { action: "decline" },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.collect(nonSensitiveSchema);
      expect(result).toBeNull();
    });

    test("collect() returns null when elicitation is cancelled", async () => {
      const server = createMockServer({
        elicitResult: { action: "cancel" },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.collect(nonSensitiveSchema);
      expect(result).toBeNull();
    });

    test("collect() falls back to browser when elicitation not supported", async () => {
      const server = createMockServer({
        elicitError: new Error("Client does not support form elicitation."),
      });
      const ctx = createMCPAuthContext({
        server: server as any,
        openURL: async () => {}, // Mock browser opener to prevent actual browser opening
      });

      const collectPromise = ctx.collect(nonSensitiveSchema);

      // Wait for auth server URL to appear in sendLoggingMessage
      let capturedURL = "";
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const logMsg = server.logMessages.find((m) => String(m.data).includes("127.0.0.1"));
        if (logMsg) {
          const match = String(logMsg.data).match(/(http:\/\/127\.0\.0\.1:\d+\/auth\?nonce=\w+)/);
          if (match) capturedURL = match[1]!;
          break;
        }
      }
      expect(capturedURL).toBeTruthy();

      // Should have sent logging notification to client
      expect(server.logMessages.length).toBeGreaterThanOrEqual(1);
      expect(server.logMessages[0]!.level).toBe("notice");

      // Should have attempted form elicitation first (and it threw)
      expect(server.calls.length).toBe(1);
      expect(server.calls[0]!.params.mode).toBe("form");

      // Submit form data via API (simulating browser form submission)
      await fetch(capturedURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice", region: "us-west-2" }),
      });

      const result = await collectPromise;
      expect(result).toEqual({ name: "Alice", region: "us-west-2" });
    });

    test("requestOpenURL() falls back to browser open when elicitation fails", async () => {
      const server = createMockServer({
        elicitError: new Error("Not supported"),
      });
      let openedURL: string | undefined;
      const ctx = createMCPAuthContext({
        server: server as any,
        openURL: async (url: string) => {
          openedURL = url;
        },
      });

      const result = await ctx.requestOpenURL("https://example.com", "msg");
      expect(result).toBe("accepted");
      expect(openedURL).toBe("https://example.com");

      // Should have sent logging notification to client with URL
      expect(server.logMessages.length).toBe(1);
      expect(server.logMessages[0]!.level).toBe("notice");
      expect(String(server.logMessages[0]!.data)).toContain("https://example.com");
    });

    test("requestOpenURL() returns cancelled when both elicitation and browser open fail", async () => {
      const server = createMockServer({
        elicitError: new Error("Not supported"),
      });
      const ctx = createMCPAuthContext({
        server: server as any,
        openURL: async () => {
          throw new Error("Browser open failed");
        },
      });

      const result = await ctx.requestOpenURL("https://example.com", "msg");
      expect(result).toBe("cancelled");
    });

    test("requestOpenURL() returns declined when user declines", async () => {
      const server = createMockServer({
        elicitResult: { action: "decline" },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.requestOpenURL("https://example.com", "msg");
      expect(result).toBe("declined");
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    test("collect() with empty schema returns empty object", async () => {
      const server = createMockServer({
        elicitResult: { action: "accept", content: {} },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.collect({
        type: "object",
        properties: {},
      } as any);
      expect(result).toEqual({});
    });

    test("collect() all sensitive → URL mode with form submission", async () => {
      const allSensitive: JSONSchema7 = {
        type: "object",
        properties: {
          key1: { type: "string", sensitive: true } as any,
          key2: { type: "string", sensitive: true } as any,
        },
      } as any;

      const server = createMockServer({ elicitResult: { action: "accept" } });
      const ctx = createMCPAuthContext({ server: server as any });

      // Start collect (will use URL mode since all sensitive)
      const collectPromise = ctx.collect(allSensitive);

      // Submit form data via API
      await submitFormToAuthServer(server, { key1: "val1", key2: "val2" });

      const result = await collectPromise;
      expect(result).toEqual({ key1: "val1", key2: "val2" });

      // Should have used URL mode
      const urlCall = server.calls.find(
        (c) => c.method === "elicitInput" && c.params?.mode === "url",
      );
      expect(urlCall).toBeDefined();
    });

    test("collect() all non-sensitive → form mode", async () => {
      const server = createMockServer({
        elicitResult: { action: "accept", content: { name: "test" } },
      });
      const ctx = createMCPAuthContext({ server: server as any });

      const result = await ctx.collect(nonSensitiveSchema);
      expect(result).toEqual({ name: "test" });

      // Should have used form mode
      expect(server.calls[0]!.params.mode).toBe("form");
    });
  });

  // ─── Security ────────────────────────────────────────────────────────

  describe("Security", () => {
    test("URL mode elicitation only passes URL, not sensitive field values", async () => {
      const server = createMockServer({ elicitResult: { action: "accept" } });
      const ctx = createMCPAuthContext({ server: server as any });

      const collectPromise = ctx.collect(sensitiveSchema);

      // Submit form data via API
      await submitFormToAuthServer(server, { token: "super_secret_token", region: "us-east-1" });

      const result = await collectPromise;
      expect(result).toEqual({ token: "super_secret_token", region: "us-east-1" });

      // The elicitation call should only contain a URL, not the sensitive data
      const urlCall = server.calls.find(
        (c) => c.method === "elicitInput" && c.params?.mode === "url",
      );
      expect(urlCall).toBeDefined();
      expect(urlCall!.params.url).toContain("127.0.0.1");
      // URL should not contain any field values
      expect(urlCall!.params.url).not.toContain("token");

      // Submitted data should not appear in any elicitation params
      for (const call of server.calls) {
        if (call.method === "elicitInput") {
          const serialized = JSON.stringify(call.params);
          expect(serialized).not.toContain("super_secret_token");
        }
      }
    });
  });

  // ─── Data Leak ───────────────────────────────────────────────────────

  describe("Data Leak", () => {
    test("elicitation request does not contain existing credential values", async () => {
      const server = createMockServer({
        elicitResult: { action: "accept", content: { name: "test" } },
      });
      const ctx = createMCPAuthContext({
        server: server as any,
        resolved: { secret: "super_secret_value" },
      });

      await ctx.collect(nonSensitiveSchema);

      // Check that elicitation params don't contain resolved values
      for (const call of server.calls) {
        const serialized = JSON.stringify(call.params);
        expect(serialized).not.toContain("super_secret_value");
      }
    });
  });

  // ─── Data Damage ─────────────────────────────────────────────────────

  describe("Data Damage", () => {
    test("createCallbackServer close() is idempotent", async () => {
      const server = createMockServer();
      const ctx = createMCPAuthContext({ server: server as any });
      const cs = await ctx.createCallbackServer();
      cs.close();
      cs.close(); // Should not throw
    });
  });
});
