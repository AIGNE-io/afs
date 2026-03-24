import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSNotFoundError, AFSValidationError } from "../src/error.js";
import type { AFSModule } from "../src/type.js";

/**
 * Test AFS Core exec input validation.
 * Before calling provider's exec(), AFS should validate args against inputSchema.
 */

// Helper to create provider with exec and inputSchema
function createExecProvider(
  actions: Record<
    string,
    {
      inputSchema?: {
        type: string;
        properties?: Record<string, { type: string }>;
        required?: string[];
      };
      handler: (args: Record<string, unknown>) => unknown;
    }
  >,
): AFSModule {
  return {
    name: "exec-provider",
    description: "Provider with exec actions",
    accessMode: "readwrite",

    async read(path) {
      // Check if path is an action path
      if (path.startsWith("/.actions/")) {
        const actionName = path.slice("/.actions/".length);
        const action = actions[actionName];
        if (!action) {
          throw new AFSNotFoundError(path);
        }
        return {
          data: {
            id: actionName,
            path,
            meta: {
              kind: "afs:executable",
              inputSchema: action.inputSchema,
            },
          },
        };
      }

      // Root path
      if (path === "/") {
        return {
          data: {
            id: "/",
            path: "/",
            meta: {
              childrenCount: Object.keys(actions).length,
            },
          },
        };
      }

      throw new AFSNotFoundError(path);
    },

    async list(path) {
      if (path === "/.actions") {
        return {
          data: Object.entries(actions).map(([name, action]) => ({
            id: name,
            path: `/.actions/${name}`,
            meta: {
              kind: "afs:executable",
              inputSchema: action.inputSchema,
            },
          })),
        };
      }
      if (path === "/") {
        return {
          data: [{ id: ".actions", path: "/.actions" }],
        };
      }
      return { data: [] };
    },

    async exec(path, args, _options) {
      const actionName = path.replace("/.actions/", "");
      const action = actions[actionName];
      if (!action) {
        throw new AFSNotFoundError(path);
      }
      return {
        success: true,
        data: action.handler(args) as Record<string, unknown>,
      };
    },
  };
}

describe("AFS Core exec input validation", () => {
  test("Valid input passes validation, exec is called", async () => {
    let execCalled = false;

    const provider = createExecProvider({
      greet: {
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
        handler: (args) => {
          execCalled = true;
          return { message: `Hello, ${args.name}!` };
        },
      },
    });

    const afs = new AFS();
    await afs.mount(provider, "/test");

    const result = await afs.exec("/test/.actions/greet", { name: "World" }, {});
    expect(execCalled).toBe(true);
    expect(result.data?.message).toBe("Hello, World!");
  });

  test("Missing required field throws AFSValidationError", async () => {
    let execCalled = false;

    const provider = createExecProvider({
      greet: {
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
        handler: () => {
          execCalled = true;
          return "should not be called";
        },
      },
    });

    const afs = new AFS();
    await afs.mount(provider, "/test");

    try {
      await afs.exec("/test/.actions/greet", {}, {}); // Missing required 'name'
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(AFSValidationError);
      expect(execCalled).toBe(false); // exec should NOT be called
    }
  });

  test("Wrong type throws AFSValidationError", async () => {
    let execCalled = false;

    const provider = createExecProvider({
      calculate: {
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "number" },
          },
          required: ["value"],
        },
        handler: () => {
          execCalled = true;
          return "should not be called";
        },
      },
    });

    const afs = new AFS();
    await afs.mount(provider, "/test");

    try {
      await afs.exec("/test/.actions/calculate", { value: "not a number" }, {});
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(AFSValidationError);
      expect(execCalled).toBe(false);
    }
  });

  test("Validation failure does not call Provider exec", async () => {
    let execCalled = false;

    const provider = createExecProvider({
      process: {
        inputSchema: {
          type: "object",
          properties: {
            data: { type: "string" },
          },
          required: ["data"],
        },
        handler: () => {
          execCalled = true;
          return "processed";
        },
      },
    });

    const afs = new AFS();
    await afs.mount(provider, "/test");

    try {
      await afs.exec("/test/.actions/process", {}, {}); // Missing 'data'
    } catch {
      // Expected
    }

    expect(execCalled).toBe(false);
  });

  test("No inputSchema defined: skip validation, call exec", async () => {
    let execCalled = false;

    const provider = createExecProvider({
      noSchema: {
        // No inputSchema defined
        handler: (args) => {
          execCalled = true;
          return { received: args };
        },
      },
    });

    const afs = new AFS();
    await afs.mount(provider, "/test");

    const result = await afs.exec("/test/.actions/noSchema", { any: "value" }, {});
    expect(execCalled).toBe(true);
    expect(result.data).toMatchObject({ received: { any: "value" } });
  });

  test("Empty args with no required fields passes validation", async () => {
    let execCalled = false;

    const provider = createExecProvider({
      optional: {
        inputSchema: {
          type: "object",
          properties: {
            optionalField: { type: "string" },
          },
          // No required fields
        },
        handler: () => {
          execCalled = true;
          return { status: "success" };
        },
      },
    });

    const afs = new AFS();
    await afs.mount(provider, "/test");

    const result = await afs.exec("/test/.actions/optional", {}, {});
    expect(execCalled).toBe(true);
    expect(result.data?.status).toBe("success");
  });
});
