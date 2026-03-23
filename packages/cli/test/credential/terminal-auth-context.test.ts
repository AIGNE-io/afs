/**
 * Terminal AuthContext tests.
 *
 * Tests the terminal readline-based credential collection for headless environments.
 * Uses PassThrough streams to simulate stdin/stdout.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { JSONSchema7 } from "@aigne/afs";
import {
  createTerminalAuthContext,
  isHeadlessEnvironment,
  parseSetParams,
  selectAuthContext,
} from "../../src/credential/terminal-auth-context.js";

// ─── Helpers ──────────────────────────────────────────────────────────────

function createMockIO(inputs: string[]) {
  const inputStream = new PassThrough();
  const outputStream = new PassThrough();
  let outputData = "";
  outputStream.on("data", (chunk: Buffer) => {
    outputData += chunk.toString();
  });

  // Write inputs with small delay so readline can consume them
  setTimeout(() => {
    for (const line of inputs) {
      inputStream.write(`${line}\n`);
    }
    inputStream.end();
  }, 10);

  return {
    input: inputStream as NodeJS.ReadableStream,
    output: outputStream as NodeJS.WritableStream,
    getOutput: () => outputData,
  };
}

// ─── createTerminalAuthContext ─────────────────────────────────────────────

describe("createTerminalAuthContext", () => {
  describe("collect", () => {
    test("returns empty object for empty schema", async () => {
      const io = createMockIO([]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const result = await ctx.collect({ type: "object", properties: {} } as JSONSchema7);
      expect(result).toEqual({});
    });

    test("returns empty object for schema without properties", async () => {
      const io = createMockIO([]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const result = await ctx.collect({ type: "object" } as JSONSchema7);
      expect(result).toEqual({});
    });

    test("collects non-sensitive string field", async () => {
      const io = createMockIO(["my-value"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          username: { type: "string", description: "Username" },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ username: "my-value" });
      expect(io.getOutput()).toContain("Username");
    });

    test("collects multiple fields", async () => {
      const io = createMockIO(["user", "us-east-1"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          username: { type: "string", description: "Username" },
          region: { type: "string", description: "Region" },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ username: "user", region: "us-east-1" });
    });

    test("uses default value when input is empty", async () => {
      const io = createMockIO([""]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          region: { type: "string", description: "Region", default: "us-east-1" },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ region: "us-east-1" });
      expect(io.getOutput()).toContain("(us-east-1)");
    });

    test("shows enum options in prompt", async () => {
      const io = createMockIO(["prod"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          env: { type: "string", description: "Environment", enum: ["dev", "staging", "prod"] },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ env: "prod" });
      expect(io.getOutput()).toContain("[dev/staging/prod]");
    });

    test("handles boolean field with y/n", async () => {
      const io = createMockIO(["y"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          autoStart: { type: "boolean", description: "Auto start" },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ autoStart: true });
    });

    test("boolean defaults to false when empty input and no default", async () => {
      const io = createMockIO([""]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "Enabled" },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ enabled: false });
    });

    test("boolean defaults to true when default is true and input empty", async () => {
      const io = createMockIO([""]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "Enabled", default: true },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ enabled: true });
    });

    test("coerces number types", async () => {
      const io = createMockIO(["8080"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          port: { type: "number", description: "Port" },
        },
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ port: 8080 });
    });

    test("skips optional empty fields without default", async () => {
      const io = createMockIO(["value", ""]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          required_field: { type: "string", description: "Required" },
          optional_field: { type: "string", description: "Optional" },
        },
        required: ["required_field"],
      };
      const result = await ctx.collect(schema);
      expect(result).toEqual({ required_field: "value" });
    });

    test("sensitive fields fall back to normal readline on non-TTY", async () => {
      // PassThrough doesn't have setRawMode, so it falls back to normal readline
      const io = createMockIO(["secret-value"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema = {
        type: "object",
        properties: {
          token: { type: "string", description: "API Token", sensitive: true },
        },
      } as unknown as JSONSchema7;
      const result = await ctx.collect(schema);
      expect(result).toEqual({ token: "secret-value" });
    });

    test("shows * for required fields in prompt", async () => {
      const io = createMockIO(["val"]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const schema: JSONSchema7 = {
        type: "object",
        properties: {
          name: { type: "string", description: "Name" },
        },
        required: ["name"],
      };
      await ctx.collect(schema);
      expect(io.getOutput()).toContain("*");
    });

    test("resolved field is exposed", () => {
      const ctx = createTerminalAuthContext({ resolved: { token: "existing" } });
      expect(ctx.resolved).toEqual({ token: "existing" });
    });
  });

  describe("requestOpenURL", () => {
    test("prints URL and returns accepted", async () => {
      const io = createMockIO([]);
      const ctx = createTerminalAuthContext({ input: io.input, output: io.output });
      const result = await ctx.requestOpenURL("https://example.com", "Please open:");
      expect(result).toBe("accepted");
      expect(io.getOutput()).toContain("https://example.com");
      expect(io.getOutput()).toContain("Please open:");
    });
  });

  describe("createCallbackServer", () => {
    test("creates callback server with valid URL", async () => {
      const ctx = createTerminalAuthContext();
      const server = await ctx.createCallbackServer();
      expect(server.callbackURL).toContain("http://127.0.0.1:");
      expect(typeof server.close).toBe("function");
      server.close();
    });
  });
});

// ─── isHeadlessEnvironment ────────────────────────────────────────────────

describe("isHeadlessEnvironment", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      AFS_HEADLESS: process.env.AFS_HEADLESS,
      SSH_TTY: process.env.SSH_TTY,
      SSH_CONNECTION: process.env.SSH_CONNECTION,
      DISPLAY: process.env.DISPLAY,
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY,
      CI: process.env.CI,
    };
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test("returns true when AFS_HEADLESS=1", () => {
    process.env.AFS_HEADLESS = "1";
    expect(isHeadlessEnvironment()).toBe(true);
  });

  test("returns false when AFS_HEADLESS=0", () => {
    process.env.AFS_HEADLESS = "0";
    delete process.env.SSH_TTY;
    delete process.env.SSH_CONNECTION;
    delete process.env.CI;
    expect(isHeadlessEnvironment()).toBe(false);
  });

  test("returns true when SSH_TTY is set", () => {
    delete process.env.AFS_HEADLESS;
    process.env.SSH_TTY = "/dev/pts/0";
    expect(isHeadlessEnvironment()).toBe(true);
  });

  test("returns true when SSH_CONNECTION is set", () => {
    delete process.env.AFS_HEADLESS;
    delete process.env.SSH_TTY;
    process.env.SSH_CONNECTION = "1.2.3.4 50000 5.6.7.8 22";
    expect(isHeadlessEnvironment()).toBe(true);
  });

  test("returns true when CI=true", () => {
    delete process.env.AFS_HEADLESS;
    delete process.env.SSH_TTY;
    delete process.env.SSH_CONNECTION;
    process.env.CI = "true";
    expect(isHeadlessEnvironment()).toBe(true);
  });
});

// ─── selectAuthContext ────────────────────────────────────────────────────

describe("selectAuthContext", () => {
  test("returns terminal context when terminalFlag is true", () => {
    const ctx = selectAuthContext(true);
    // Terminal context doesn't have nonBlocking property
    expect(ctx.nonBlocking).toBeUndefined();
    expect(typeof ctx.collect).toBe("function");
  });

  test("returns auth context when terminalFlag is false/undefined (non-headless)", () => {
    // In test environment (not SSH, not CI), should return CLI auth context
    const savedSSH = process.env.SSH_TTY;
    const savedCI = process.env.CI;
    const savedHeadless = process.env.AFS_HEADLESS;
    delete process.env.SSH_TTY;
    delete process.env.CI;
    delete process.env.AFS_HEADLESS;

    const ctx = selectAuthContext(false);
    expect(typeof ctx.collect).toBe("function");

    if (savedSSH !== undefined) process.env.SSH_TTY = savedSSH;
    if (savedCI !== undefined) process.env.CI = savedCI;
    if (savedHeadless !== undefined) process.env.AFS_HEADLESS = savedHeadless;
  });
});

// ─── parseSetParams ───────────────────────────────────────────────────────

describe("parseSetParams", () => {
  test("returns undefined for empty array", () => {
    expect(parseSetParams([])).toBeUndefined();
  });

  test("returns undefined for undefined", () => {
    expect(parseSetParams(undefined)).toBeUndefined();
  });

  test("parses single key=value", () => {
    expect(parseSetParams(["token=abc123"])).toEqual({ token: "abc123" });
  });

  test("parses multiple key=value pairs", () => {
    expect(parseSetParams(["token=abc", "region=us-east-1"])).toEqual({
      token: "abc",
      region: "us-east-1",
    });
  });

  test("handles value containing =", () => {
    expect(parseSetParams(["key=val=ue=with=equals"])).toEqual({
      key: "val=ue=with=equals",
    });
  });

  test("handles empty value", () => {
    expect(parseSetParams(["key="])).toEqual({ key: "" });
  });

  test("throws on missing =", () => {
    expect(() => parseSetParams(["invalid"])).toThrow('Invalid --set format: "invalid"');
  });

  test("throws on = at start", () => {
    expect(() => parseSetParams(["=value"])).toThrow('Invalid --set format: "=value"');
  });
});
