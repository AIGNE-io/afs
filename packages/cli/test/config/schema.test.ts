import { describe, expect, test } from "bun:test";
import {
  type AFSConfig,
  ConfigSchema,
  type MountConfig,
  MountSchema,
  type ServeConfig,
  ServeSchema,
} from "../../src/config/schema.js";

describe("MountSchema", () => {
  test("validates valid mount config", () => {
    const mount: MountConfig = {
      path: "/src",
      uri: "fs:///Users/rob/code",
    };
    expect(() => MountSchema.parse(mount)).not.toThrow();
  });

  test("validates mount with all optional fields", () => {
    const mount = {
      path: "/db",
      uri: "sqlite:///path/to/app.db",
      description: "Application database",
      access_mode: "readonly",
      auth: "bearer:${AFS_TOKEN}",
      options: {
        tables: ["users", "posts"],
        fts_enabled: true,
      },
    };
    const result = MountSchema.parse(mount);
    expect(result.path).toBe("/db");
    expect(result.description).toBe("Application database");
    expect(result.access_mode).toBe("readonly");
    expect(result.options?.tables).toEqual(["users", "posts"]);
  });

  test("rejects mount path without leading slash", () => {
    const mount = {
      path: "src",
      uri: "fs:///Users/rob/code",
    };
    expect(() => MountSchema.parse(mount)).toThrow();
  });

  test("rejects missing required fields", () => {
    expect(() => MountSchema.parse({ path: "/src" })).toThrow();
    expect(() => MountSchema.parse({ uri: "fs:///path" })).toThrow();
    expect(() => MountSchema.parse({})).toThrow();
  });

  test("rejects invalid access_mode", () => {
    const mount = {
      path: "/src",
      uri: "fs:///path",
      access_mode: "invalid",
    };
    expect(() => MountSchema.parse(mount)).toThrow();
  });

  test("accepts readwrite access_mode", () => {
    const mount = {
      path: "/src",
      uri: "fs:///path",
      access_mode: "readwrite",
    };
    expect(() => MountSchema.parse(mount)).not.toThrow();
  });

  test("accepts token field for HTTP providers", () => {
    const mount = {
      path: "/remote",
      uri: "https://api.example.com/afs",
      token: "my-secret-token",
    };
    const result = MountSchema.parse(mount);
    expect(result.token).toBe("my-secret-token");
  });

  test("accepts token with env var template", () => {
    const mount = {
      path: "/remote",
      uri: "https://api.example.com/afs",
      token: "${AFS_REMOTE_TOKEN}",
    };
    const result = MountSchema.parse(mount);
    expect(result.token).toBe("${AFS_REMOTE_TOKEN}");
  });

  test("token field is optional", () => {
    const mount = {
      path: "/remote",
      uri: "https://api.example.com/afs",
    };
    const result = MountSchema.parse(mount);
    expect(result.token).toBeUndefined();
  });
});

describe("ConfigSchema", () => {
  test("validates empty config", () => {
    const config = {};
    const result = ConfigSchema.parse(config);
    expect(result.mounts).toEqual([]);
  });

  test("validates config with mounts", () => {
    const config = {
      mounts: [
        { path: "/src", uri: "fs:///Users/rob/code" },
        { path: "/db", uri: "sqlite:///app.db" },
      ],
    };
    const result: AFSConfig = ConfigSchema.parse(config);
    expect(result.mounts).toHaveLength(2);
    expect(result.mounts[0]!.path).toBe("/src");
    expect(result.mounts[1]!.path).toBe("/db");
  });

  test("rejects config with invalid mount", () => {
    const config = {
      mounts: [{ path: "invalid", uri: "fs:///path" }],
    };
    expect(() => ConfigSchema.parse(config)).toThrow();
  });

  test("validates real-world config", () => {
    const config = {
      mounts: [
        {
          path: "/src",
          uri: "fs:///Users/rob/projects/myapp/src",
          description: "Project source code",
        },
        {
          path: "/team-docs",
          uri: "https://afs.internal.company.com/docs",
          auth: "bearer:${AFS_TOKEN}",
        },
        {
          path: "/upstream",
          uri: "git:///path/to/repo?branch=main",
          access_mode: "readonly",
        },
        {
          path: "/db",
          uri: "sqlite:///path/to/app.db",
          options: {
            tables: ["users", "posts"],
            fts_enabled: true,
          },
        },
      ],
    };
    const result = ConfigSchema.parse(config);
    expect(result.mounts).toHaveLength(4);
  });
});

describe("ServeSchema", () => {
  test("validates empty config with defaults", () => {
    const serve = {};
    const result: ServeConfig = ServeSchema.parse(serve);
    expect(result.host).toBe("localhost");
    expect(result.port).toBe(3000);
    expect(result.path).toBe("/afs");
    expect(result.readonly).toBe(false);
    expect(result.cors).toBe(false);
    expect(result.max_body_size).toBe(10 * 1024 * 1024);
    expect(result.token).toBeUndefined();
  });

  test("accepts token field", () => {
    const serve = {
      token: "my-secret-token",
    };
    const result = ServeSchema.parse(serve);
    expect(result.token).toBe("my-secret-token");
  });

  test("accepts token with env var template", () => {
    const serve = {
      token: "${AFS_SERVE_TOKEN}",
    };
    const result = ServeSchema.parse(serve);
    expect(result.token).toBe("${AFS_SERVE_TOKEN}");
  });

  test("validates full serve config", () => {
    const serve = {
      host: "0.0.0.0",
      port: 8080,
      path: "/api",
      readonly: true,
      cors: true,
      max_body_size: 5 * 1024 * 1024,
      token: "${AFS_SERVE_TOKEN}",
    };
    const result = ServeSchema.parse(serve);
    expect(result.host).toBe("0.0.0.0");
    expect(result.port).toBe(8080);
    expect(result.path).toBe("/api");
    expect(result.readonly).toBe(true);
    expect(result.cors).toBe(true);
    expect(result.max_body_size).toBe(5 * 1024 * 1024);
    expect(result.token).toBe("${AFS_SERVE_TOKEN}");
  });

  test("rejects invalid port", () => {
    const serve = {
      port: -1,
    };
    expect(() => ServeSchema.parse(serve)).toThrow();
  });

  test("rejects non-integer port", () => {
    const serve = {
      port: 3000.5,
    };
    expect(() => ServeSchema.parse(serve)).toThrow();
  });

  test("sites defaults to true", () => {
    const result = ServeSchema.parse({});
    expect(result.sites).toBe(true);
  });

  test("sites can be disabled", () => {
    const result = ServeSchema.parse({ sites: false });
    expect(result.sites).toBe(false);
  });
});
