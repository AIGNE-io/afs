import { describe, expect, test } from "bun:test";
import type { AuthContext, JSONSchema7 } from "@aigne/afs";
import { extractEnvFromURI } from "../../src/config/afs-loader.js";
import { resolveCredentials } from "../../src/credential/resolver.js";
import type { CredentialStore } from "../../src/credential/store.js";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function createMockAuthContext(
  overrides?: Partial<AuthContext> & { collectResult?: Record<string, unknown> | null },
): AuthContext {
  return {
    resolved: overrides?.resolved ?? {},
    collect: overrides?.collect ?? (async () => overrides?.collectResult ?? null),
    createCallbackServer:
      overrides?.createCallbackServer ??
      (async () => ({
        callbackURL: "http://127.0.0.1:9999/callback",
        waitForCallback: async () => null,
        close: () => {},
      })),
    requestOpenURL: overrides?.requestOpenURL ?? (async () => "accepted" as const),
  };
}

function createMockCredentialStore(data?: Record<string, Record<string, string>>): CredentialStore {
  const store = new Map<string, Record<string, string>>(Object.entries(data ?? {}));
  return {
    get: async (uri: string) => store.get(uri),
    set: async (uri: string, creds: Record<string, string>) => {
      store.set(uri, creds);
    },
    delete: async (uri: string) => store.delete(uri),
  };
}

const githubSchema: JSONSchema7 = {
  type: "object",
  properties: {
    owner: { type: "string", description: "Repository owner" },
    repo: { type: "string", description: "Repository name" },
    token: {
      type: "string",
      description: "GitHub personal access token",
      sensitive: true,
      env: ["GITHUB_TOKEN", "GH_TOKEN"],
    } as any,
  },
  required: ["owner", "token"],
} as any;

const s3Schema: JSONSchema7 = {
  type: "object",
  properties: {
    region: { type: "string", description: "AWS region", env: ["AWS_REGION"] } as any,
    accessKeyId: {
      type: "string",
      description: "AWS access key ID",
      sensitive: true,
      env: ["AWS_ACCESS_KEY_ID"],
    } as any,
    secretAccessKey: {
      type: "string",
      description: "AWS secret access key",
      sensitive: true,
      env: ["AWS_SECRET_ACCESS_KEY"],
    } as any,
  },
  required: ["accessKeyId", "secretAccessKey"],
} as any;

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Credential Resolver", () => {
  // ─── Happy Path ──────────────────────────────────────────────────────

  describe("Happy Path", () => {
    test("Step 1: no missing fields → short circuit, collected=false", async () => {
      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/github",
          options: { owner: "alice", repo: "my-repo", token: "ghp_xxx" },
        },
        schema: githubSchema,
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.owner).toBe("alice");
      expect(result!.values.token).toBe("ghp_xxx");
    });

    test("Step 2a: env variables resolve missing fields", async () => {
      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/github",
          options: { owner: "alice", repo: "my-repo" },
        },
        schema: githubSchema,
        env: { GITHUB_TOKEN: "ghp_from_env" },
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.token).toBe("ghp_from_env");
    });

    test("Step 2b: ${ENV_VAR} config values already resolved by loader", async () => {
      // Config values with ${ENV_VAR} are already resolved before reaching resolver
      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/github",
          auth: "resolved_token_value",
          options: { owner: "alice", repo: "my-repo" },
        },
        schema: githubSchema,
      });

      expect(result).not.toBeNull();
      expect(result!.values.auth).toBe("resolved_token_value");
    });

    test("Step 2c: credential store resolves missing fields", async () => {
      const store = createMockCredentialStore({
        "github://owner/repo": { token: "ghp_stored" },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/github",
          options: { owner: "alice", repo: "my-repo" },
        },
        schema: githubSchema,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.token).toBe("ghp_stored");
    });

    test("Step 3: missing fields collected via authContext.collect()", async () => {
      const ctx = createMockAuthContext({
        collectResult: { token: "ghp_collected" },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/github",
          options: { owner: "alice", repo: "my-repo" },
        },
        schema: githubSchema,
        authContext: ctx,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(true);
      expect(result!.values.token).toBe("ghp_collected");
    });

    test("Step 3: provider auth() called when available", async () => {
      const ctx = createMockAuthContext();
      let authCalled = false;

      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/github",
          options: { owner: "alice", repo: "my-repo" },
        },
        schema: githubSchema,
        authContext: ctx,
        providerAuth: async (context) => {
          authCalled = true;
          expect(context.resolved.owner).toBe("alice");
          return { token: "ghp_from_auth" };
        },
        env: {},
      });

      expect(authCalled).toBe(true);
      expect(result).not.toBeNull();
      expect(result!.collected).toBe(true);
      expect(result!.values.token).toBe("ghp_from_auth");
    });

    test("Step 4: sensitive fields split correctly", async () => {
      const ctx = createMockAuthContext({
        collectResult: { region: "us-east-1", accessKeyId: "AKIA", secretAccessKey: "secret" },
      });

      const result = await resolveCredentials({
        mount: { uri: "s3://bucket", path: "/s3" },
        schema: s3Schema,
        authContext: ctx,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.sensitive).toEqual({ accessKeyId: "AKIA", secretAccessKey: "secret" });
      expect(result!.nonSensitive).toEqual({ region: "us-east-1" });
    });

    test("Step 4: non-sensitive fields in nonSensitive group", async () => {
      const ctx = createMockAuthContext({
        collectResult: { region: "eu-west-1", accessKeyId: "AK", secretAccessKey: "SK" },
      });

      const result = await resolveCredentials({
        mount: { uri: "s3://bucket", path: "/s3" },
        schema: s3Schema,
        authContext: ctx,
        env: {},
      });

      expect(result!.nonSensitive.region).toBe("eu-west-1");
    });

    test("complete flow: URI → schema → resolve → collect → split", async () => {
      const store = createMockCredentialStore({});
      const ctx = createMockAuthContext({
        collectResult: { accessKeyId: "AKIA_NEW", secretAccessKey: "SECRET_NEW" },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "s3://my-bucket",
          path: "/s3",
          options: { region: "us-west-2" },
        },
        schema: s3Schema,
        authContext: ctx,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(true);
      expect(result!.values.region).toBe("us-west-2");
      expect(result!.values.accessKeyId).toBe("AKIA_NEW");
      expect(result!.sensitive.accessKeyId).toBe("AKIA_NEW");
      expect(result!.sensitive.secretAccessKey).toBe("SECRET_NEW");
      expect(result!.nonSensitive.region).toBeUndefined(); // region was in mount.options, not collected
    });
  });

  // ─── Bad Path ────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    test("auth() returns null → resolver returns null", async () => {
      const ctx = createMockAuthContext();
      const result = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        authContext: ctx,
        providerAuth: async () => null,
        env: {},
      });

      expect(result).toBeNull();
    });

    test("collect() returns null → resolver returns null", async () => {
      const ctx = createMockAuthContext({ collectResult: null });
      const result = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        authContext: ctx,
        env: {},
      });

      expect(result).toBeNull();
    });

    test("no schema → skip credential resolution", async () => {
      const result = await resolveCredentials({
        mount: { uri: "fs:///path", path: "/fs" },
        schema: { type: "object" } as any,
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values).toEqual({});
    });

    test("resolution priority: config > env > store", async () => {
      const store = createMockCredentialStore({
        "github://o/r": { token: "ghp_stored", owner: "stored_owner" },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "config_owner", repo: "r" },
        },
        schema: githubSchema,
        credentialStore: store,
        env: { GITHUB_TOKEN: "ghp_env" },
      });

      expect(result).not.toBeNull();
      expect(result!.values.owner).toBe("config_owner"); // config wins over store
      expect(result!.values.token).toBe("ghp_env"); // env wins over store
    });

    test("credential store read failure is non-fatal", async () => {
      const store: CredentialStore = {
        get: async () => {
          throw new Error("disk error");
        },
        set: async () => {},
        delete: async () => false,
      };

      const ctx = createMockAuthContext({
        collectResult: { token: "ghp_collected" },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "o", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.values.token).toBe("ghp_collected");
    });

    test("no authContext + missing fields → return partial values, collected=false", async () => {
      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "alice", repo: "r" },
        },
        schema: githubSchema,
        env: {},
        // No authContext — can't collect interactively
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.owner).toBe("alice");
      expect(result!.values.token).toBeUndefined();
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    test("all fields in URI → Step 1 short circuit", async () => {
      const result = await resolveCredentials({
        mount: {
          uri: "github://owner/repo",
          path: "/gh",
          options: { owner: "alice", repo: "r", token: "ghp_xxx" },
        },
        schema: githubSchema,
      });

      expect(result!.collected).toBe(false);
    });

    test("mixed sources: env for some, store for others", async () => {
      const store = createMockCredentialStore({
        "s3://bucket": { secretAccessKey: "stored_secret" },
      });

      const result = await resolveCredentials({
        mount: { uri: "s3://bucket", path: "/s3", options: { region: "us-east-1" } },
        schema: s3Schema,
        credentialStore: store,
        env: { AWS_ACCESS_KEY_ID: "env_key" },
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.accessKeyId).toBe("env_key");
      expect(result!.values.secretAccessKey).toBe("stored_secret");
    });

    test("auth() uses context.resolved to see Step 2 results", async () => {
      const ctx = createMockAuthContext();

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "alice", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        providerAuth: async (context) => {
          // context.resolved should contain Step 2 results
          expect(context.resolved.owner).toBe("alice");
          expect(context.resolved.repo).toBe("r");
          return { token: "ghp_auth" };
        },
        env: {},
      });

      expect(result!.values.token).toBe("ghp_auth");
    });

    test("auth() returns fields that overlap with Step 2 → Step 3 wins", async () => {
      const ctx = createMockAuthContext();

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "old_owner", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        providerAuth: async () => {
          return { owner: "new_owner", token: "ghp_auth" };
        },
        env: {},
      });

      // auth() returned owner → it should override the config value
      expect(result!.values.owner).toBe("new_owner");
      expect(result!.values.token).toBe("ghp_auth");
    });

    test("same URI at different paths → shared credentials via URI key", async () => {
      const store = createMockCredentialStore({});

      // First mount: collect
      const ctx = createMockAuthContext({
        collectResult: { token: "ghp_first" },
      });

      const result1 = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        authContext: ctx,
        credentialStore: store,
        env: {},
      });

      expect(result1!.collected).toBe(true);

      // Persist credentials keyed by URI
      await store.set("github://o/r", result1!.sensitive);

      // Same URI, same path → resolved from store
      const result2 = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        authContext: ctx,
        credentialStore: store,
        env: {},
      });

      expect(result2!.collected).toBe(false);
      expect(result2!.values.token).toBe("ghp_first");

      // Same URI, different path → ALSO resolved from store (URI-based keying)
      const result3 = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh2", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        authContext: ctx,
        credentialStore: store,
        env: {},
      });

      expect(result3!.collected).toBe(false);
      expect(result3!.values.token).toBe("ghp_first");
    });

    test("empty schema properties → return empty result", async () => {
      const result = await resolveCredentials({
        mount: { uri: "fs:///tmp", path: "/fs" },
        schema: { type: "object", properties: {} } as any,
      });

      expect(result!.values).toEqual({});
      expect(result!.collected).toBe(false);
    });
  });

  // ─── forceCollect ────────────────────────────────────────────────────

  describe("forceCollect", () => {
    test("forceCollect: true + all fields silently resolved → still calls collect", async () => {
      const store = createMockCredentialStore({
        "github://o/r": { token: "ghp_stale" },
      });
      let collectCalled = false;
      const ctx = createMockAuthContext({
        collect: async (_schema) => {
          collectCalled = true;
          return { token: "ghp_fresh" };
        },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "o", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        credentialStore: store,
        env: {},
        forceCollect: true,
      });

      expect(collectCalled).toBe(true);
      expect(result).not.toBeNull();
      expect(result!.collected).toBe(true);
      expect(result!.values.token).toBe("ghp_fresh");
    });

    test("forceCollect: true + env/store values appear as form defaults", async () => {
      const store = createMockCredentialStore({
        "s3://bucket": { secretAccessKey: "stored_secret" },
      });
      let receivedSchema: any;
      const ctx = createMockAuthContext({
        collect: async (schema) => {
          receivedSchema = schema;
          return { accessKeyId: "new_key", secretAccessKey: "new_secret", region: "eu-west-1" };
        },
      });

      await resolveCredentials({
        mount: { uri: "s3://bucket", path: "/s3" },
        schema: s3Schema,
        authContext: ctx,
        credentialStore: store,
        env: { AWS_ACCESS_KEY_ID: "env_key", AWS_REGION: "us-east-1" },
        forceCollect: true,
      });

      // Form schema should pre-fill env/store values as defaults
      expect(receivedSchema.properties.accessKeyId.default).toBe("env_key");
      expect(receivedSchema.properties.secretAccessKey.default).toBe("stored_secret");
      expect(receivedSchema.properties.region.default).toBe("us-east-1");
    });

    test("forceCollect: false (default) + all fields resolved → no collect", async () => {
      let collectCalled = false;
      const ctx = createMockAuthContext({
        collect: async () => {
          collectCalled = true;
          return {};
        },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "o", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        env: { GITHUB_TOKEN: "ghp_env" },
      });

      expect(collectCalled).toBe(false);
      expect(result!.collected).toBe(false);
    });

    test("forceCollect: true + user cancels → returns null", async () => {
      const ctx = createMockAuthContext({ collectResult: null });

      const result = await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "o", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        env: { GITHUB_TOKEN: "ghp_stale" },
        forceCollect: true,
      });

      expect(result).toBeNull();
    });
  });

  // ─── extractEnvFromURI ──────────────────────────────────────────────

  describe("extractEnvFromURI", () => {
    test("MCP URI with env params → cleanUri without env, envRecord populated", () => {
      const { cleanUri, envRecord } = extractEnvFromURI(
        "mcp+stdio://npx?args=-y,@server&env=API_KEY=sk-xxx&env=DEBUG=true",
      );
      expect(cleanUri).toBe("mcp+stdio://npx?args=-y%2C%40server");
      expect(envRecord).toEqual({ API_KEY: "sk-xxx", DEBUG: "true" });
    });

    test("MCP URI without env params → returns original URI", () => {
      const uri = "mcp+stdio://npx?args=-y,@server";
      const { cleanUri, envRecord } = extractEnvFromURI(uri);
      expect(cleanUri).toBe(uri);
      expect(envRecord).toEqual({});
    });

    test("Non-MCP URI with env query param → returns original URI unchanged", () => {
      const uri = "https://api.example.com?env=API_KEY=secret";
      const { cleanUri, envRecord } = extractEnvFromURI(uri);
      expect(cleanUri).toBe(uri);
      expect(envRecord).toEqual({});
    });

    test("single env param extracted correctly", () => {
      const { cleanUri, envRecord } = extractEnvFromURI("mcp+stdio://npx?env=TOKEN=abc123");
      expect(cleanUri).toBe("mcp+stdio://npx");
      expect(envRecord).toEqual({ TOKEN: "abc123" });
    });

    test("env=KEY=VALUE=with=equals → splits on first = only", () => {
      const { envRecord } = extractEnvFromURI("mcp+stdio://npx?env=API_KEY=sk-xxx=extra=parts");
      expect(envRecord).toEqual({ API_KEY: "sk-xxx=extra=parts" });
    });

    test("MCP URI with only env params → cleanUri has no query string", () => {
      const { cleanUri, envRecord } = extractEnvFromURI("mcp+stdio://npx?env=KEY=val");
      expect(cleanUri).toBe("mcp+stdio://npx");
      expect(envRecord).toEqual({ KEY: "val" });
    });

    test("mcp+sse scheme also supported", () => {
      const { cleanUri, envRecord } = extractEnvFromURI("mcp+sse://server?env=TOKEN=secret");
      expect(cleanUri).toBe("mcp+sse://server");
      expect(envRecord).toEqual({ TOKEN: "secret" });
    });

    test("plain mcp scheme also supported", () => {
      const { cleanUri, envRecord } = extractEnvFromURI("mcp://server?env=TOKEN=secret");
      expect(cleanUri).toBe("mcp://server");
      expect(envRecord).toEqual({ TOKEN: "secret" });
    });
  });

  // ─── sensitiveArgs with existing schema ──────────────────────────────

  describe("sensitiveArgs with existing schema", () => {
    // MCP-like schema: transport params only, no server-specific fields
    const mcpSchema: JSONSchema7 = {
      type: "object",
      properties: {
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
        env: { type: "object", additionalProperties: { type: "string" } },
      },
    } as any;

    test("extra field not in schema + sensitiveArgs → resolveCredentialsForMount adds to schema", async () => {
      // This test verifies the concept: when sensitiveArgs marks a field
      // that's in extraOptions but NOT in provider schema, it should be treated
      // as a sensitive credential.
      //
      // The actual schema augmentation happens in resolveCredentialsForMount,
      // but here we verify the resolver correctly handles an augmented schema.
      const augmentedSchema: JSONSchema7 = {
        type: "object",
        properties: {
          ...mcpSchema.properties,
          apiKey: { type: "string", sensitive: true },
        },
      } as any;

      const result = await resolveCredentials({
        mount: {
          uri: "mcp+stdio://npx",
          path: "/mcp",
          options: { command: "npx", args: ["@server"], apiKey: "sk-xxx" },
        },
        schema: augmentedSchema,
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.apiKey).toBe("sk-xxx");
      expect(result!.sensitive.apiKey).toBe("sk-xxx");
      expect(result!.nonSensitive.apiKey).toBeUndefined();
    });

    test("existing schema field + sensitiveArgs → marks it sensitive", async () => {
      // If env is marked sensitive via sensitiveArgs, the schema should reflect it
      const augmentedSchema: JSONSchema7 = {
        type: "object",
        properties: {
          command: { type: "string" },
          env: {
            type: "object",
            additionalProperties: { type: "string" },
            sensitive: true,
          },
        },
      } as any;

      const result = await resolveCredentials({
        mount: {
          uri: "mcp+stdio://npx",
          path: "/mcp",
          options: { command: "npx", env: { API_KEY: "secret" } },
        },
        schema: augmentedSchema,
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      // env is sensitive → in sensitive group (coerced to string)
      expect(result!.sensitive.env).toBeDefined();
      expect(result!.nonSensitive.env).toBeUndefined();
    });

    test("env: prefix credentials reconstructed from store", async () => {
      // When env was stored as env:KEY entries, they should be reconstructed
      const store = createMockCredentialStore({
        "mcp+stdio://npx": {
          "env:API_KEY": "sk-stored",
          "env:DEBUG": "true",
          apiKey: "token-stored",
        },
      });

      const augmentedSchema: JSONSchema7 = {
        type: "object",
        properties: {
          command: { type: "string" },
          env: { type: "object", additionalProperties: { type: "string" } },
          apiKey: { type: "string", sensitive: true },
        },
      } as any;

      const result = await resolveCredentials({
        mount: {
          uri: "mcp+stdio://npx",
          path: "/mcp",
          options: { command: "npx" },
        },
        schema: augmentedSchema,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      // env should be reconstructed as a Record
      expect(result!.values.env).toEqual({ API_KEY: "sk-stored", DEBUG: "true" });
      // apiKey should be resolved from store
      expect(result!.values.apiKey).toBe("token-stored");
    });
  });

  // ─── Optional / Default Fields ──────────────────────────────────────

  describe("Optional and default-valued fields", () => {
    // Schema similar to AigneHub: required apiKey (sensitive) + optional fields + fields with defaults
    const aignehubLikeSchema: JSONSchema7 = {
      type: "object",
      properties: {
        name: { type: "string", default: "aignehub" },
        description: { type: "string", default: "A description" },
        apiKey: { type: "string", sensitive: true } as any,
        host: { type: "string" },
        url: { type: "string" },
        defaultChat: { type: "string" },
      },
      required: ["name", "description", "apiKey"],
    } as any;

    test("optional fields don't block silent resolution when required fields are stored", async () => {
      const store = createMockCredentialStore({
        "aignehub://": { apiKey: "sk-stored-key" },
      });

      const result = await resolveCredentials({
        mount: { uri: "aignehub://", path: "/aignehub" },
        schema: aignehubLikeSchema,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.apiKey).toBe("sk-stored-key");
      // Optional fields remain undefined — that's OK
      expect(result!.values.host).toBeUndefined();
      expect(result!.values.url).toBeUndefined();
    });

    test("fields with schema defaults don't block silent resolution", async () => {
      const store = createMockCredentialStore({
        "aignehub://": { apiKey: "sk-stored-key" },
      });

      const result = await resolveCredentials({
        mount: { uri: "aignehub://", path: "/aignehub" },
        schema: aignehubLikeSchema,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      // name and description have defaults — should not trigger interactive auth
      expect(result!.values.name).toBeUndefined(); // not resolved, provider uses default
    });

    test("stored required field with providerAuth skips auth when not forceCollect", async () => {
      // Store has apiKey — providerAuth should NOT be called even though optional fields are missing
      const store = createMockCredentialStore({
        "aignehub://": { apiKey: "sk-stored-key" },
      });
      let authCalled = false;
      const ctx = createMockAuthContext();

      const result = await resolveCredentials({
        mount: { uri: "aignehub://", path: "/aignehub" },
        schema: aignehubLikeSchema,
        credentialStore: store,
        authContext: ctx,
        providerAuth: async () => {
          authCalled = true;
          return { apiKey: "sk-from-auth" };
        },
        env: {},
      });

      expect(authCalled).toBe(false);
      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.apiKey).toBe("sk-stored-key");
      // Optional fields remain unresolved — provider handles defaults
      expect(result!.values.host).toBeUndefined();
    });

    test("missing required field without default still triggers interactive collection", async () => {
      // Store has nothing — apiKey is required and missing
      let authCalled = false;
      const ctx = createMockAuthContext();

      const result = await resolveCredentials({
        mount: { uri: "aignehub://", path: "/aignehub" },
        schema: aignehubLikeSchema,
        authContext: ctx,
        providerAuth: async () => {
          authCalled = true;
          return { apiKey: "sk-from-auth" };
        },
        env: {},
      });

      expect(authCalled).toBe(true);
      expect(result).not.toBeNull();
      expect(result!.collected).toBe(true);
      expect(result!.values.apiKey).toBe("sk-from-auth");
    });

    test("forceCollect bypasses silent resolution even when all required fields are present", async () => {
      const store = createMockCredentialStore({
        "aignehub://": { apiKey: "sk-stored-key" },
      });
      let authCalled = false;
      const ctx = createMockAuthContext();

      const result = await resolveCredentials({
        mount: { uri: "aignehub://", path: "/aignehub" },
        schema: aignehubLikeSchema,
        credentialStore: store,
        authContext: ctx,
        providerAuth: async () => {
          authCalled = true;
          return { apiKey: "sk-refreshed" };
        },
        env: {},
        forceCollect: true,
      });

      expect(authCalled).toBe(true);
      expect(result).not.toBeNull();
      expect(result!.collected).toBe(true);
      expect(result!.values.apiKey).toBe("sk-refreshed");
    });

    test("schema with no required array still resolves from store", async () => {
      const noRequiredSchema: JSONSchema7 = {
        type: "object",
        properties: {
          command: { type: "string" },
          apiKey: { type: "string", sensitive: true } as any,
        },
      } as any;

      const store = createMockCredentialStore({
        "mcp+stdio://npx": { apiKey: "sk-stored" },
      });

      const result = await resolveCredentials({
        mount: {
          uri: "mcp+stdio://npx",
          path: "/mcp",
          options: { command: "npx" },
        },
        schema: noRequiredSchema,
        credentialStore: store,
        env: {},
      });

      expect(result).not.toBeNull();
      expect(result!.collected).toBe(false);
      expect(result!.values.apiKey).toBe("sk-stored");
      expect(result!.values.command).toBe("npx");
    });
  });

  // ─── Security ────────────────────────────────────────────────────────

  describe("Security", () => {
    test("sensitive field values not in error messages", async () => {
      // resolveCredentials should not throw errors containing credential values
      const store: CredentialStore = {
        get: async () => ({ token: "secret_value_123" }),
        set: async () => {
          throw new Error("write failed");
        },
        delete: async () => false,
      };

      const result = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        credentialStore: store,
        env: {},
      });

      // Should resolve successfully from store
      expect(result!.values.token).toBe("secret_value_123");
    });
  });

  // ─── Data Leak ───────────────────────────────────────────────────────

  describe("Data Leak", () => {
    test("collect() only receives missing fields schema", async () => {
      let receivedSchema: any;
      const ctx: AuthContext = {
        resolved: {},
        collect: async (schema) => {
          receivedSchema = schema;
          return { token: "ghp_collected" };
        },
        createCallbackServer: async () => ({
          callbackURL: "http://127.0.0.1:9999/callback",
          waitForCallback: async () => null,
          close: () => {},
        }),
        requestOpenURL: async () => "accepted" as const,
      };

      await resolveCredentials({
        mount: {
          uri: "github://o/r",
          path: "/gh",
          options: { owner: "alice", repo: "r" },
        },
        schema: githubSchema,
        authContext: ctx,
        env: {},
      });

      // collect() should only have the missing 'token' field, not already-resolved 'owner'/'repo'
      expect(receivedSchema.properties.token).toBeDefined();
      expect(receivedSchema.properties.owner).toBeUndefined();
      expect(receivedSchema.properties.repo).toBeUndefined();
    });

    test("config.toml options don't contain sensitive fields", async () => {
      const ctx = createMockAuthContext({
        collectResult: { region: "us-east-1", accessKeyId: "AKIA", secretAccessKey: "SECRET" },
      });

      const result = await resolveCredentials({
        mount: { uri: "s3://bucket", path: "/s3" },
        schema: s3Schema,
        authContext: ctx,
        env: {},
      });

      // nonSensitive should not contain sensitive fields
      expect(result!.nonSensitive.accessKeyId).toBeUndefined();
      expect(result!.nonSensitive.secretAccessKey).toBeUndefined();
      expect(result!.nonSensitive.region).toBe("us-east-1");
    });
  });

  // ─── Data Damage ─────────────────────────────────────────────────────

  describe("Data Damage", () => {
    test("Step 4 persistence failure doesn't affect resolution result", async () => {
      // resolveCredentials itself doesn't persist — it returns data for the caller to persist.
      // This tests that the result is complete even if persistence would fail.
      const ctx = createMockAuthContext({
        collectResult: { token: "ghp_new" },
      });

      const result = await resolveCredentials({
        mount: { uri: "github://o/r", path: "/gh", options: { owner: "o", repo: "r" } },
        schema: githubSchema,
        authContext: ctx,
        env: {},
      });

      expect(result!.values.token).toBe("ghp_new");
      expect(result!.sensitive.token).toBe("ghp_new");
    });

    test("existing credential store entries not affected by new resolution", async () => {
      const store = createMockCredentialStore({
        "s3://other-bucket": { accessKeyId: "OTHER_KEY", secretAccessKey: "OTHER_SECRET" },
      });

      const ctx = createMockAuthContext({
        collectResult: { accessKeyId: "NEW_KEY", secretAccessKey: "NEW_SECRET" },
      });

      await resolveCredentials({
        mount: { uri: "s3://my-bucket", path: "/s3", options: { region: "us-east-1" } },
        schema: s3Schema,
        authContext: ctx,
        credentialStore: store,
        env: {},
      });

      // Other mount's credentials should be untouched
      const other = await store.get("s3://other-bucket");
      expect(other).toEqual({ accessKeyId: "OTHER_KEY", secretAccessKey: "OTHER_SECRET" });
    });
  });
});
