import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { JSONSchema7 } from "@aigne/afs";
import { createCLIAuthContext } from "../../src/credential/cli-auth-context.js";

// Helper: create a writable stream that captures output
function createOutputCapture(): { stream: NodeJS.WritableStream; getOutput: () => string } {
  let output = "";
  const stream = new PassThrough();
  stream.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { stream, getOutput: () => output };
}

/**
 * Helper: call collect() and simulate a browser form submission.
 * Parses the auth server URL from stderr output, then POSTs form data.
 */
async function collectViaForm(
  ctx: ReturnType<typeof createCLIAuthContext>,
  schema: JSONSchema7,
  formData: Record<string, string>,
  output: { getOutput: () => string },
): Promise<Record<string, unknown> | null> {
  // Start collection (opens server + waits for form)
  const collectPromise = ctx.collect(schema);

  // Wait for server to start and URL to appear in output
  let formURL = "";
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const text = output.getOutput();
    const match = text.match(/(http:\/\/127\.0\.0\.1:\d+\/auth\?nonce=\w+)/);
    if (match) {
      formURL = match[1]!;
      break;
    }
  }

  if (!formURL) {
    throw new Error("Auth server URL not found in output");
  }

  // Submit form data via POST
  const body = new URLSearchParams(formData).toString();
  await fetch(formURL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  return collectPromise;
}

const testSchema: JSONSchema7 = {
  type: "object",
  properties: {
    region: { type: "string", description: "AWS Region" },
    token: { type: "string", description: "API Token", sensitive: true } as any,
  },
  required: ["region", "token"],
} as any;

const nonSensitiveSchema: JSONSchema7 = {
  type: "object",
  properties: {
    name: { type: "string", description: "Your name" },
    region: { type: "string", description: "Region" },
  },
} as any;

describe("CLI AuthContext", () => {
  // ─── Happy Path ──────────────────────────────────────────────────────

  describe("Happy Path", () => {
    test("collect() opens form and returns submitted values", async () => {
      const outputCapture = createOutputCapture();
      const ctx = createCLIAuthContext({ output: outputCapture.stream, openURL: async () => {} });

      const result = await collectViaForm(
        ctx,
        testSchema,
        {
          region: "us-east-1",
          token: "secret123",
        },
        outputCapture,
      );

      expect(result).toEqual({ region: "us-east-1", token: "secret123" });
    });

    test("createCallbackServer() returns valid CallbackServer", async () => {
      const ctx = createCLIAuthContext();
      const server = await ctx.createCallbackServer();

      expect(server.callbackURL).toStartWith("http://127.0.0.1:");
      expect(server.callbackURL).toContain("/callback");
      expect(typeof server.waitForCallback).toBe("function");
      expect(typeof server.close).toBe("function");

      server.close();
    });

    test("resolved property contains pre-resolved fields", () => {
      const ctx = createCLIAuthContext({
        resolved: { region: "us-west-2", token: "existing" },
      });
      expect(ctx.resolved).toEqual({ region: "us-west-2", token: "existing" });
    });

    test("resolved returns a copy (not mutable reference)", () => {
      const original = { key: "val" };
      const ctx = createCLIAuthContext({ resolved: original });
      const r = ctx.resolved;
      (r as any).key = "modified";
      expect(ctx.resolved.key).toBe("val");
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    test("collect() with all non-sensitive fields", async () => {
      const outputCapture = createOutputCapture();
      const ctx = createCLIAuthContext({ output: outputCapture.stream, openURL: async () => {} });

      const result = await collectViaForm(
        ctx,
        nonSensitiveSchema,
        {
          name: "Alice",
          region: "us-east-1",
        },
        outputCapture,
      );

      expect(result).toEqual({ name: "Alice", region: "us-east-1" });
    });

    test("collect() with empty schema returns empty object", async () => {
      const ctx = createCLIAuthContext();
      const result = await ctx.collect({
        type: "object",
        properties: {},
      } as any);
      expect(result).toEqual({});
    });

    test("collect() with no properties returns empty object", async () => {
      const ctx = createCLIAuthContext();
      const result = await ctx.collect({ type: "object" } as any);
      expect(result).toEqual({});
    });

    test("form renders sensitive fields as password inputs", async () => {
      const outputCapture = createOutputCapture();
      const ctx = createCLIAuthContext({ output: outputCapture.stream, openURL: async () => {} });

      const collectPromise = ctx.collect(testSchema);

      // Wait for URL
      let formURL = "";
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const text = outputCapture.getOutput();
        const match = text.match(/(http:\/\/127\.0\.0\.1:\d+\/auth\?nonce=\w+)/);
        if (match) {
          formURL = match[1]!;
          break;
        }
      }

      // GET the form HTML and verify password input type
      const formResponse = await fetch(formURL);
      const html = await formResponse.text();
      expect(html).toContain('type="password"');
      expect(html).toContain('type="text"');

      // Submit to complete
      await fetch(formURL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "region=x&token=y",
      });
      await collectPromise;
    });
  });

  // ─── Security ────────────────────────────────────────────────────────

  describe("Security", () => {
    test("form output does not contain submitted sensitive values", async () => {
      const outputCapture = createOutputCapture();
      const ctx = createCLIAuthContext({ output: outputCapture.stream, openURL: async () => {} });

      await collectViaForm(
        ctx,
        testSchema,
        {
          region: "us-east-1",
          token: "my_secret_password",
        },
        outputCapture,
      );

      const outputText = outputCapture.getOutput();
      expect(outputText).not.toContain("my_secret_password");
    });
  });

  // ─── Data Leak ───────────────────────────────────────────────────────

  describe("Data Leak", () => {
    test("output does not expose existing credentials", async () => {
      const outputCapture = createOutputCapture();
      const ctx = createCLIAuthContext({
        output: outputCapture.stream,
        openURL: async () => {},
        resolved: { existingSecret: "super_secret_value" },
      });

      await collectViaForm(
        ctx,
        nonSensitiveSchema,
        {
          name: "test",
          region: "eu",
        },
        outputCapture,
      );

      const outputText = outputCapture.getOutput();
      expect(outputText).not.toContain("super_secret_value");
    });
  });

  // ─── Data Damage ─────────────────────────────────────────────────────

  describe("Data Damage", () => {
    test("createCallbackServer close() is idempotent", async () => {
      const ctx = createCLIAuthContext();
      const server = await ctx.createCallbackServer();
      server.close();
      server.close(); // Should not throw
    });
  });
});
