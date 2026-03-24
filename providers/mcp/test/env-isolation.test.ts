import { describe, expect, test } from "bun:test";
import { AFSMCP } from "../src/index.js";

describe("MCP environment isolation", () => {
  describe("buildChildEnv()", () => {
    test("default: only passes allowlisted env vars", () => {
      // Set a canary secret in process.env
      process.env.CANARY_SECRET = "super-secret-key";
      process.env.AWS_SECRET_ACCESS_KEY = "aws-secret";
      process.env.DATABASE_URL = "postgres://secret@localhost/db";

      const env = AFSMCP.buildChildEnv();

      // Should NOT contain secrets
      expect(env.CANARY_SECRET).toBeUndefined();
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
      expect(env.DATABASE_URL).toBeUndefined();

      // Should contain allowlisted vars (if present in process.env)
      if (process.env.PATH) {
        expect(env.PATH).toBe(process.env.PATH);
      }
      if (process.env.HOME) {
        expect(env.HOME).toBe(process.env.HOME);
      }

      // Cleanup
      delete process.env.CANARY_SECRET;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.DATABASE_URL;
    });

    test("user env vars are always included", () => {
      const env = AFSMCP.buildChildEnv({ MY_VAR: "my-value" });
      expect(env.MY_VAR).toBe("my-value");
    });

    test("user env vars override allowlisted vars", () => {
      const env = AFSMCP.buildChildEnv({ PATH: "/custom/path" });
      expect(env.PATH).toBe("/custom/path");
    });

    test("inheritEnv: true passes full parent environment", () => {
      process.env.CANARY_SECRET = "should-be-visible";

      const env = AFSMCP.buildChildEnv(undefined, true);
      expect(env.CANARY_SECRET).toBe("should-be-visible");

      delete process.env.CANARY_SECRET;
    });

    test("inheritEnv: true with user env overrides parent", () => {
      process.env.CANARY_SECRET = "parent-value";

      const env = AFSMCP.buildChildEnv({ CANARY_SECRET: "override" }, true);
      expect(env.CANARY_SECRET).toBe("override");

      delete process.env.CANARY_SECRET;
    });

    test("allowlist is exactly PATH, HOME, USER, LANG, TERM, NODE_ENV, SHELL", () => {
      expect(AFSMCP.ENV_ALLOWLIST).toEqual([
        "PATH",
        "HOME",
        "USER",
        "LANG",
        "TERM",
        "NODE_ENV",
        "SHELL",
      ]);
    });
  });
});
