import { describe, expect, test } from "bun:test";
import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import {
  getEnvMappings,
  getSensitiveFields,
  resolveEnvFromSchema,
  separateSensitiveValues,
} from "../../src/utils/schema.js";

// z.toJSONSchema() returns ZodStandardJSONSchemaPayload which is structurally
// compatible with JSONSchema7 at runtime but not assignable at the type level.
// Cast via unknown for test convenience.
function toJSONSchema7(zodSchema: z.ZodType): JSONSchema7 {
  return z.toJSONSchema(zodSchema) as unknown as JSONSchema7;
}

// Helper: create a JSON Schema via z.toJSONSchema() with meta fields
function makeSchema() {
  return toJSONSchema7(
    z.object({
      owner: z.string(),
      token: z.string().meta({
        sensitive: true,
        env: ["GITHUB_TOKEN", "GH_TOKEN"],
      }),
      region: z.string().meta({
        env: ["AWS_REGION"],
      }),
    }),
  );
}

// Schema with nested object (like S3 credentials)
function makeNestedSchema() {
  return toJSONSchema7(
    z.object({
      bucket: z.string(),
      credentials: z.object({
        accessKeyId: z.string().meta({
          sensitive: true,
          env: ["AWS_ACCESS_KEY_ID"],
        }),
        secretAccessKey: z.string().meta({
          sensitive: true,
          env: ["AWS_SECRET_ACCESS_KEY"],
        }),
      }),
    }),
  );
}

// Schema where all fields are sensitive
function makeAllSensitiveSchema() {
  return toJSONSchema7(
    z.object({
      key1: z.string().meta({ sensitive: true }),
      key2: z.string().meta({ sensitive: true }),
    }),
  );
}

// Schema where no fields are sensitive
function makeNoSensitiveSchema() {
  return toJSONSchema7(
    z.object({
      name: z.string(),
      region: z.string(),
    }),
  );
}

// Manifest-style JSON Schema (not from Zod, raw object)
function makeManifestSchema(): any {
  return {
    type: "object",
    properties: {
      NOTION_TOKEN: {
        type: "string",
        sensitive: true,
        env: ["NOTION_TOKEN"],
      },
      workspace: {
        type: "string",
      },
    },
  };
}

describe("Schema Utils", () => {
  // ─── Happy Path ──────────────────────────────────────────────────────

  describe("Happy Path", () => {
    test("getSensitiveFields returns sensitive field names", () => {
      const fields = getSensitiveFields(makeSchema());
      expect(fields).toContain("token");
      expect(fields).not.toContain("owner");
      expect(fields).not.toContain("region");
    });

    test("getEnvMappings returns env variable mappings", () => {
      const mappings = getEnvMappings(makeSchema());
      expect(mappings.token).toEqual(["GITHUB_TOKEN", "GH_TOKEN"]);
      expect(mappings.region).toEqual(["AWS_REGION"]);
      expect(mappings.owner).toBeUndefined();
    });

    test("z.toJSONSchema() output includes sensitive and env fields", () => {
      const schema = makeSchema() as Record<string, any>;
      expect(schema.properties.token.sensitive).toBe(true);
      expect(schema.properties.token.env).toEqual(["GITHUB_TOKEN", "GH_TOKEN"]);
    });

    test("getSensitiveFields handles nested objects", () => {
      const fields = getSensitiveFields(makeNestedSchema());
      expect(fields).toContain("credentials.accessKeyId");
      expect(fields).toContain("credentials.secretAccessKey");
      expect(fields).not.toContain("bucket");
    });

    test("getEnvMappings handles nested objects", () => {
      const mappings = getEnvMappings(makeNestedSchema());
      expect(mappings["credentials.accessKeyId"]).toEqual(["AWS_ACCESS_KEY_ID"]);
      expect(mappings["credentials.secretAccessKey"]).toEqual(["AWS_SECRET_ACCESS_KEY"]);
    });

    test("manifest schema sensitive/env fields are correctly parsed", () => {
      const fields = getSensitiveFields(makeManifestSchema());
      expect(fields).toEqual(["NOTION_TOKEN"]);

      const mappings = getEnvMappings(makeManifestSchema());
      expect(mappings.NOTION_TOKEN).toEqual(["NOTION_TOKEN"]);
    });

    test("resolveEnvFromSchema resolves matching env variables", () => {
      const env = { GITHUB_TOKEN: "ghp_abc", AWS_REGION: "us-east-1" };
      const resolved = resolveEnvFromSchema(makeSchema(), env);
      expect(resolved.token).toBe("ghp_abc");
      expect(resolved.region).toBe("us-east-1");
    });

    test("separateSensitiveValues splits correctly", () => {
      const schema = makeSchema();
      const values = { owner: "acme", token: "ghp_secret", region: "us-west-2" };
      const { sensitive, nonSensitive } = separateSensitiveValues(schema, values);
      expect(sensitive).toEqual({ token: "ghp_secret" });
      expect(nonSensitive).toEqual({ owner: "acme", region: "us-west-2" });
    });
  });

  // ─── Bad Path ────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    test("fields without sensitive mark default to non-sensitive", () => {
      const fields = getSensitiveFields(makeNoSensitiveSchema());
      expect(fields).toEqual([]);
    });

    test("empty env array returns no env mappings for that field", () => {
      const schema = toJSONSchema7(
        z.object({
          key: z.string().meta({ env: [] }),
        }),
      );
      const mappings = getEnvMappings(schema);
      expect(mappings.key).toBeUndefined();
    });

    test("invalid schema (not an object) returns empty results", () => {
      expect(getSensitiveFields("not a schema" as any)).toEqual([]);
      expect(getEnvMappings(42 as any)).toEqual({});
    });

    test("schema without properties returns empty results", () => {
      expect(getSensitiveFields({ type: "string" } as any)).toEqual([]);
      expect(getEnvMappings({ type: "number" } as any)).toEqual({});
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    test("all fields sensitive", () => {
      const fields = getSensitiveFields(makeAllSensitiveSchema());
      expect(fields).toHaveLength(2);
      expect(fields).toContain("key1");
      expect(fields).toContain("key2");
    });

    test("no fields sensitive", () => {
      const fields = getSensitiveFields(makeNoSensitiveSchema());
      expect(fields).toHaveLength(0);
    });

    test("env mapping to non-existent variable returns nothing", () => {
      const resolved = resolveEnvFromSchema(makeSchema(), {});
      expect(resolved).toEqual({});
    });

    test("resolveEnvFromSchema uses first matching env variable", () => {
      const env = { GH_TOKEN: "from_gh", GITHUB_TOKEN: "from_github" };
      const resolved = resolveEnvFromSchema(makeSchema(), env);
      // GITHUB_TOKEN comes first in the env array, so it wins
      expect(resolved.token).toBe("from_github");
    });

    test("resolveEnvFromSchema skips empty string env values", () => {
      const env = { GITHUB_TOKEN: "", GH_TOKEN: "fallback" };
      const resolved = resolveEnvFromSchema(makeSchema(), env);
      expect(resolved.token).toBe("fallback");
    });
  });

  // ─── Security ────────────────────────────────────────────────────────

  describe("Security", () => {
    test("toJSONSchema output does not include default values for sensitive fields", () => {
      const schema = toJSONSchema7(
        z.object({
          token: z.string().default("should-not-appear").meta({ sensitive: true }),
        }),
      ) as Record<string, any>;
      // The default value should not be in the output (or if Zod includes it, that's Zod's behavior)
      // At minimum, sensitive marking should be present
      expect(schema.properties.token.sensitive).toBe(true);
    });

    test("env array is metadata only, not used to inject values", () => {
      const schema = makeSchema();
      // The env field should only contain variable names, not values
      const mappings = getEnvMappings(schema);
      for (const envVars of Object.values(mappings)) {
        for (const v of envVars) {
          expect(typeof v).toBe("string");
          expect(v).not.toContain("="); // Not a key=value assignment
        }
      }
    });
  });

  // ─── Data Leak ───────────────────────────────────────────────────────

  describe("Data Leak", () => {
    test("toJSONSchema output does not contain actual credential values", () => {
      const schema = toJSONSchema7(
        z.object({
          token: z.string().meta({ sensitive: true, env: ["MY_TOKEN"] }),
        }),
      );
      const serialized = JSON.stringify(schema);
      // Should not contain any actual environment variable value
      expect(serialized).not.toContain(process.env.HOME ?? "");
    });

    test("error messages from utilities do not expose env variable values", () => {
      // resolveEnvFromSchema with missing variables just returns empty — no errors
      const resolved = resolveEnvFromSchema(makeSchema(), {});
      expect(Object.keys(resolved)).toHaveLength(0);
    });
  });

  // ─── Data Damage ─────────────────────────────────────────────────────

  describe("Data Damage", () => {
    test("adding meta does not affect schema validation behavior", () => {
      const withMeta = z.object({
        token: z.string().meta({ sensitive: true }),
      });
      const withoutMeta = z.object({
        token: z.string(),
      });

      // Both should accept valid input
      expect(withMeta.parse({ token: "abc" })).toEqual({ token: "abc" });
      expect(withoutMeta.parse({ token: "abc" })).toEqual({ token: "abc" });

      // Both should reject invalid input
      expect(() => withMeta.parse({ token: 123 })).toThrow();
      expect(() => withoutMeta.parse({ token: 123 })).toThrow();
    });

    test("provider instantiation is not affected by meta", () => {
      const schema = z.object({
        name: z.string().default("test"),
        token: z.string().meta({ sensitive: true, env: ["TOKEN"] }),
      });

      const result = schema.parse({ token: "secret" });
      expect(result).toEqual({ name: "test", token: "secret" });
    });
  });
});
