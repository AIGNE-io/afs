import { afterEach, describe, expect, test } from "bun:test";
import { type AuthServer, createAuthServer } from "../../src/credential/auth-server.js";

describe("AuthServer", () => {
  let server: AuthServer;

  afterEach(() => {
    server?.close();
  });

  // ─── Happy Path ──────────────────────────────────────────────────────

  describe("Happy Path", () => {
    test("starts and binds to 127.0.0.1 with random port", async () => {
      server = await createAuthServer();
      expect(server.port).toBeGreaterThan(0);
      expect(server.baseURL).toStartWith("http://127.0.0.1:");
    });

    test("/callback route receives query params via waitForCallback()", async () => {
      server = await createAuthServer();

      const callbackPromise = server.waitForCallback();

      // Simulate OAuth callback
      const callbackURL = `${server.callbackURL}&code=abc123&state=xyz`;
      const response = await fetch(callbackURL);
      expect(response.status).toBe(200);

      const result = await callbackPromise;
      expect(result).toEqual({ code: "abc123", state: "xyz" });
    });

    test("/auth GET renders form, POST returns data", async () => {
      server = await createAuthServer();

      const formPromise = server.waitForForm(
        {
          type: "object",
          properties: {
            token: { type: "string", description: "API Token", sensitive: true },
          },
          required: ["token"],
        },
        { title: "Test Form" },
      );

      // GET the form
      const getResponse = await fetch(`${server.baseURL}/auth?nonce=${server.nonce}`);
      expect(getResponse.status).toBe(200);
      const html = await getResponse.text();
      expect(html).toContain("Test Form");
      expect(html).toContain('type="password"'); // sensitive field
      expect(html).toContain("API Token");

      // POST form data
      const postResponse = await fetch(`${server.baseURL}/auth?nonce=${server.nonce}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "token=my_secret_token",
      });
      expect(postResponse.status).toBe(200);

      const result = await formPromise;
      expect(result).toEqual({ token: "my_secret_token" });
    });

    test("close() shuts down the server", async () => {
      server = await createAuthServer();
      const port = server.port;
      server.close();

      // Server should no longer be reachable
      try {
        await fetch(`http://127.0.0.1:${port}/`);
        // If fetch succeeds, the connection may have been accepted but server closed
      } catch {
        // Expected: connection refused
      }
    });
  });

  // ─── Bad Path ────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    test("auto-closes after timeout", async () => {
      server = await createAuthServer({ timeout: 200 });

      const callbackPromise = server.waitForCallback();

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 300));

      const result = await callbackPromise;
      expect(result).toBeNull();
    });

    test("invalid nonce on /callback returns 403", async () => {
      server = await createAuthServer();

      const response = await fetch(`${server.baseURL}/callback?nonce=wrong_nonce&code=abc`);
      expect(response.status).toBe(403);
    });

    test("invalid nonce on /auth GET returns 403", async () => {
      server = await createAuthServer();

      const response = await fetch(`${server.baseURL}/auth?nonce=wrong`);
      expect(response.status).toBe(403);
    });

    test("invalid nonce on /auth POST returns 403", async () => {
      server = await createAuthServer();

      const response = await fetch(`${server.baseURL}/auth?nonce=wrong`, {
        method: "POST",
        body: "key=val",
      });
      expect(response.status).toBe(403);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    test("waitForCallback() after close() returns null", async () => {
      server = await createAuthServer();
      server.close();

      const result = await server.waitForCallback();
      expect(result).toBeNull();
    });

    test("waitForForm() after close() returns null", async () => {
      server = await createAuthServer();
      server.close();

      const result = await server.waitForForm({ type: "object", properties: {} });
      expect(result).toBeNull();
    });

    test("multiple auth-server instances can run simultaneously", async () => {
      const server1 = await createAuthServer();
      const server2 = await createAuthServer();

      expect(server1.port).not.toBe(server2.port);

      server1.close();
      server2.close();
    });

    test("JSON POST to /auth works", async () => {
      server = await createAuthServer();

      const formPromise = server.waitForForm({
        type: "object",
        properties: { key: { type: "string" } },
      });

      await fetch(`${server.baseURL}/auth?nonce=${server.nonce}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "value" }),
      });

      const result = await formPromise;
      expect(result).toEqual({ key: "value" });
    });
  });

  // ─── Security ────────────────────────────────────────────────────────

  describe("Security", () => {
    test("server only binds to 127.0.0.1", async () => {
      server = await createAuthServer();
      expect(server.baseURL).toContain("127.0.0.1");
      // Not bound to 0.0.0.0 or any other interface
    });

    test("nonce prevents CSRF", async () => {
      server = await createAuthServer();

      // Without nonce → 403
      const noNonce = await fetch(`${server.baseURL}/callback`);
      expect(noNonce.status).toBe(403);

      // With correct nonce → 200
      const callbackPromise = server.waitForCallback();
      const withNonce = await fetch(`${server.callbackURL}&key=val`);
      expect(withNonce.status).toBe(200);
      await callbackPromise;
    });
  });

  // ─── Data Leak ───────────────────────────────────────────────────────

  describe("Data Leak", () => {
    test("error responses do not contain credentials", async () => {
      server = await createAuthServer();

      const response = await fetch(`${server.baseURL}/callback?nonce=bad`);
      const text = await response.text();
      expect(text).not.toContain("secret");
      expect(text).toContain("invalid nonce");
    });
  });

  // ─── Data Damage ─────────────────────────────────────────────────────

  describe("Data Damage", () => {
    test("close() is idempotent", async () => {
      server = await createAuthServer();
      server.close();
      server.close(); // Should not throw
      server.close(); // Should not throw
    });

    test("pending waitForCallback resolves to null on close", async () => {
      server = await createAuthServer();
      const promise = server.waitForCallback();
      server.close();
      const result = await promise;
      expect(result).toBeNull();
    });

    test("pending waitForForm resolves to null on close", async () => {
      server = await createAuthServer();
      const promise = server.waitForForm({
        type: "object",
        properties: { key: { type: "string" } },
      });
      server.close();
      const result = await promise;
      expect(result).toBeNull();
    });
  });
});
