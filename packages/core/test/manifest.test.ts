import { describe, expect, it } from "bun:test";
import { type ManifestJSON, validateManifestJSON } from "../src/manifest.js";

describe("Manifest Schema Validation", () => {
  // ---- Happy Path ----

  it("accepts minimal valid manifest (name + description + uriTemplate + category)", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "A test provider",
      uriTemplate: "test://{path}",
      category: "storage",
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("accepts full manifest with all optional fields", () => {
    const manifest: ManifestJSON = {
      name: "s3",
      description: "AWS S3 provider",
      uriTemplate: "s3://{bucket}/{prefix+?}",
      category: "storage",
      type: "provider",
      schema: {
        type: "object",
        properties: {
          bucket: { type: "string" },
          region: { type: "string" },
        },
        required: ["bucket"],
      },
      tags: ["cloud", "storage"],
      capabilityTags: ["read-write", "crud", "auth:aws", "cloud"],
      useCases: ["Store files in S3"],
      security: {
        riskLevel: "external",
        resourceAccess: ["internet", "cloud-api"],
        dataSensitivity: ["credentials"],
        requires: ["cloud-credentials"],
        notes: ["Accesses AWS S3 service"],
      },
      capabilities: {
        network: { egress: true, allowedDomains: ["s3.amazonaws.com"] },
        filesystem: { read: false, write: false },
      },
      uriDefaults: { region: "us-east-1" },
      cache: {
        strategy: "ttl",
        ttlSeconds: 300,
        operations: ["read", "list"],
      },
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(true);
  });

  it("accepts schema field as valid JSON Schema", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
      schema: {
        type: "object",
        properties: { x: { type: "string" } },
      },
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(true);
  });

  it("accepts only valid capabilityTags values", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
      capabilityTags: ["read-write", "search", "local"],
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(true);
  });

  it("accepts all valid riskLevel values", () => {
    for (const riskLevel of ["sandboxed", "external", "local", "system"] as const) {
      const manifest: ManifestJSON = {
        name: "test",
        description: "Test",
        uriTemplate: "test://{x}",
        category: "storage",
        security: {
          riskLevel,
          resourceAccess: ["local-filesystem"],
        },
      };
      const result = validateManifestJSON(manifest);
      expect(result.valid).toBe(true);
    }
  });

  // ---- Bad Input ----

  it("rejects manifest missing name", () => {
    const manifest = {
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
    };
    const result = validateManifestJSON(manifest as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("rejects manifest missing uriTemplate", () => {
    const manifest = {
      name: "test",
      description: "Test",
      category: "storage",
    };
    const result = validateManifestJSON(manifest as any);
    expect(result.valid).toBe(false);
  });

  it("rejects uriTemplate without scheme://", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "Test",
      uriTemplate: "no-scheme",
      category: "storage",
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(false);
  });

  it("rejects empty object", () => {
    const result = validateManifestJSON({} as any);
    expect(result.valid).toBe(false);
  });

  it("rejects null", () => {
    const result = validateManifestJSON(null as any);
    expect(result.valid).toBe(false);
  });

  it("rejects undefined", () => {
    const result = validateManifestJSON(undefined as any);
    expect(result.valid).toBe(false);
  });

  it("rejects version that is not semver", () => {
    const manifest = {
      name: "test",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
      version: "not-semver",
    };
    const result = validateManifestJSON(manifest as any);
    expect(result.valid).toBe(false);
  });

  // ---- Security ----

  it("filters __proto__ field from manifest", () => {
    const raw = JSON.parse(
      '{"name":"test","description":"Test","uriTemplate":"test://{x}","category":"storage","__proto__":{"polluted":true}}',
    );
    const result = validateManifestJSON(raw);
    expect(result.valid).toBe(true);
    expect(result.manifest).toBeDefined();
    expect((result.manifest as any).__proto__?.polluted).toBeUndefined();
  });

  it("filters constructor field from manifest", () => {
    const manifest: any = {
      name: "test",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
      constructor: { prototype: {} },
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(Object.hasOwn(result.manifest!, "constructor")).toBe(false);
  });

  it("rejects name containing path traversal (../)", () => {
    const manifest: ManifestJSON = {
      name: "../etc/passwd",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(false);
  });

  it("rejects name containing null bytes", () => {
    const manifest: ManifestJSON = {
      name: "test\x00evil",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(false);
  });

  it("rejects uriTemplate with javascript: scheme", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "Test",
      uriTemplate: "javascript:alert(1)",
      category: "storage",
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(false);
  });

  it("rejects description exceeding 10KB", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "x".repeat(10241),
      uriTemplate: "test://{x}",
      category: "storage",
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(false);
  });

  it("warns on credential-like fields in schema defaults", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
      schema: {
        type: "object",
        properties: {
          accessKey: { type: "string", default: "AKIA1234567890" },
        },
      },
    };
    const result = validateManifestJSON(manifest);
    // Should still be valid but with warnings
    expect(result.valid).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
  });

  // ---- Data Integrity ----

  it("does not mutate the original input", () => {
    const original: ManifestJSON = {
      name: "test",
      description: "Test",
      uriTemplate: "test://{x}",
      category: "storage",
    };
    const copy = JSON.parse(JSON.stringify(original));
    validateManifestJSON(original);
    expect(original).toEqual(copy);
  });

  it("JSON roundtrip is stable", () => {
    const manifest: ManifestJSON = {
      name: "test",
      description: "A test provider",
      uriTemplate: "test://{x}",
      category: "storage",
      tags: ["a", "b"],
    };
    const result = validateManifestJSON(manifest);
    expect(result.valid).toBe(true);
    const json = JSON.stringify(result.manifest);
    const reparsed = JSON.parse(json);
    const result2 = validateManifestJSON(reparsed);
    expect(result2.valid).toBe(true);
    expect(JSON.stringify(result2.manifest)).toBe(json);
  });
});
