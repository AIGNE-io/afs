/**
 * Tests for Provider Resource Declaration types (Phase 0)
 *
 * Validates ProviderResources, ProviderCap, ProviderPricing, ProviderLimits,
 * UsageMetadata types and their integration with CapabilitiesManifest and AFSExecResult.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../../src/afs.js";
import type {
  AggregatedCapabilities,
  CapabilitiesManifest,
  ProviderCap,
  ProviderLimits,
  ProviderPricing,
  ProviderResources,
} from "../../src/capabilities/types.js";
import type {
  AFSActionResult,
  AFSExecResult,
  AFSListResult,
  AFSModule,
  AFSReadResult,
  AFSStatResult,
  UsageMetadata,
} from "../../src/type.js";

function createMockProvider(name: string, manifest: CapabilitiesManifest | null): AFSModule {
  return {
    name,
    async stat(path: string): Promise<AFSStatResult> {
      if (path === "/") return { data: { id: name, path: "/", meta: { childrenCount: 1 } } };
      return { data: undefined };
    },
    async list(path: string): Promise<AFSListResult> {
      if (path === "/") return { data: [{ id: "test", path: "/test" }] };
      return { data: [] };
    },
    async read(path: string): Promise<AFSReadResult> {
      if (path === "/.meta/.capabilities") {
        if (!manifest) return { data: undefined };
        return { data: { id: ".capabilities", path: "/.meta/.capabilities", content: manifest } };
      }
      if (path === "/") return { data: { id: name, path: "/", meta: { childrenCount: 1 } } };
      return { data: undefined };
    },
  };
}

describe("ProviderResources Types", () => {
  // Happy Path: ProviderResources contains optional caps, pricing, limits fields
  test("ProviderResources with all fields", () => {
    const resources: ProviderResources = {
      caps: [
        { op: "read", path: "/models/*" },
        { op: "exec", path: "/models/*/chat", description: "Chat completion" },
      ],
      pricing: {
        currency: "USD",
        exec: { perInputToken: 0.003, perOutputToken: 0.015 },
      },
      limits: {
        rpm: 60,
        rpd: 10000,
        maxTokensPerRequest: 4096,
        maxConcurrency: 5,
      },
    };

    expect(resources.caps).toHaveLength(2);
    expect(resources.pricing?.currency).toBe("USD");
    expect(resources.limits?.rpm).toBe(60);
  });

  // Happy Path: ProviderCap has required op and path, optional description
  test("ProviderCap structure", () => {
    const readCap: ProviderCap = { op: "read", path: "/data/*" };
    const writeCap: ProviderCap = { op: "write", path: "/data/*", description: "Write data" };
    const execCap: ProviderCap = { op: "exec", path: "/tools/*" };

    expect(readCap.op).toBe("read");
    expect(readCap.path).toBe("/data/*");
    expect(readCap.description).toBeUndefined();
    expect(writeCap.description).toBe("Write data");
    expect(execCap.op).toBe("exec");
  });

  // Happy Path: ProviderPricing contains optional currency and per-operation pricing
  test("ProviderPricing structure", () => {
    const pricing: ProviderPricing = {
      currency: "credits",
      exec: {
        perCall: 1,
        perInputToken: 0.001,
        perOutputToken: 0.002,
      },
      read: { perCall: 0.01 },
      write: { perCall: 0.05 },
    };

    expect(pricing.currency).toBe("credits");
    expect(pricing.exec?.perCall).toBe(1);
    expect(pricing.read?.perCall).toBe(0.01);
  });

  // Happy Path: ProviderLimits contains optional rate and capacity limits
  test("ProviderLimits structure", () => {
    const limits: ProviderLimits = {
      rpm: 100,
      rpd: 50000,
      maxTokensPerRequest: 8192,
      maxConcurrency: 10,
    };

    expect(limits.rpm).toBe(100);
    expect(limits.maxTokensPerRequest).toBe(8192);
  });

  // Edge Case: resources exists but is empty object (all sub-fields optional)
  test("empty resources object is valid", () => {
    const resources: ProviderResources = {};
    expect(resources).toBeDefined();
    expect(resources.caps).toBeUndefined();
    expect(resources.pricing).toBeUndefined();
    expect(resources.limits).toBeUndefined();
  });

  // Edge Case: resources.caps is empty array (provider explicitly declares no special caps)
  test("empty caps array is valid", () => {
    const resources: ProviderResources = { caps: [] };
    expect(resources.caps).toEqual([]);
  });
});

describe("UsageMetadata Types", () => {
  // Happy Path: UsageMetadata with full token info
  test("UsageMetadata with tokens, cost, durationMs", () => {
    const usage: UsageMetadata = {
      tokens: { input: 150, output: 50, total: 200 },
      cost: 0.003,
      durationMs: 1500,
    };

    expect(usage.tokens?.input).toBe(150);
    expect(usage.tokens?.output).toBe(50);
    expect(usage.tokens?.total).toBe(200);
    expect(usage.cost).toBe(0.003);
    expect(usage.durationMs).toBe(1500);
  });

  // Edge Case: usage with only durationMs (non-LLM provider)
  test("usage with only durationMs is valid", () => {
    const usage: UsageMetadata = {
      durationMs: 250,
    };

    expect(usage.durationMs).toBe(250);
    expect(usage.tokens).toBeUndefined();
    expect(usage.cost).toBeUndefined();
  });

  // Edge Case: tokens.total can differ from input + output
  test("tokens total can differ from input + output", () => {
    const usage: UsageMetadata = {
      tokens: { input: 100, output: 50, total: 180 }, // provider has internal token consumption
    };

    expect(usage.tokens?.total).toBe(180);
    expect(usage.tokens!.total).not.toBe(usage.tokens!.input + usage.tokens!.output);
  });

  // Happy Path: UsageMetadata supports index signature for custom fields
  test("usage supports custom fields", () => {
    const usage: UsageMetadata = {
      durationMs: 100,
      cacheHit: true,
      modelVersion: "gpt-4",
    };

    expect(usage.cacheHit).toBe(true);
    expect(usage.modelVersion).toBe("gpt-4");
  });
});

describe("CapabilitiesManifest with resources", () => {
  // Happy Path: CapabilitiesManifest new optional resources field
  test("manifest with resources", () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "aignehub",
      tools: [],
      actions: [],
      resources: {
        caps: [
          { op: "read", path: "/models/*" },
          { op: "exec", path: "/models/*/chat" },
        ],
        pricing: {
          currency: "credits",
          exec: { perInputToken: 0.001, perOutputToken: 0.002 },
        },
        limits: {
          rpm: 60,
          maxTokensPerRequest: 4096,
        },
      },
    };

    expect(manifest.resources?.caps).toHaveLength(2);
    expect(manifest.resources?.pricing?.currency).toBe("credits");
    expect(manifest.resources?.limits?.rpm).toBe(60);
  });

  // Happy Path: manifest without resources is still valid (backward compatible)
  test("manifest without resources is valid", () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "basic",
      tools: [],
      actions: [],
    };

    expect(manifest.resources).toBeUndefined();
  });
});

describe("AFSExecResult with usage", () => {
  // Happy Path: AFSExecResult with usage metadata
  test("exec result with usage", () => {
    const result: AFSExecResult = {
      success: true,
      data: { response: "Hello!" },
      usage: {
        tokens: { input: 10, output: 5, total: 15 },
        cost: 0.0001,
        durationMs: 500,
      },
    };

    expect(result.success).toBe(true);
    expect(result.usage?.tokens?.total).toBe(15);
    expect(result.usage?.durationMs).toBe(500);
  });

  // Happy Path: exec result without usage is still valid (backward compatible)
  test("exec result without usage is valid", () => {
    const result: AFSExecResult = {
      success: true,
      data: { count: 5 },
    };

    expect(result.usage).toBeUndefined();
  });

  // Happy Path: AFSActionResult also supports usage
  test("action result with usage", () => {
    const result: AFSActionResult = {
      success: true,
      usage: {
        durationMs: 100,
      },
    };

    expect(result.usage?.durationMs).toBe(100);
  });
});

describe("Capabilities Aggregator — resources pass-through", () => {
  let afs: AFS;

  beforeEach(() => {
    afs = new AFS();
  });

  // Happy Path: Provider with resources → aggregated result contains providerResources
  test("provider resources are passed through to aggregated result", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "aignehub",
      tools: [],
      actions: [],
      resources: {
        caps: [
          { op: "read", path: "/models/*" },
          { op: "exec", path: "/models/*/chat" },
        ],
        pricing: { currency: "credits" },
        limits: { rpm: 60 },
      },
    };

    await afs.mount(createMockProvider("aignehub", manifest), "/ai");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.providerResources).toBeDefined();
    expect(content.providerResources?.["/ai"]).toBeDefined();
    expect(content.providerResources?.["/ai"]?.caps).toHaveLength(2);
    expect(content.providerResources?.["/ai"]?.pricing?.currency).toBe("credits");
    expect(content.providerResources?.["/ai"]?.limits?.rpm).toBe(60);
  });

  // Happy Path: Provider without resources → no entry in providerResources
  test("provider without resources has no entry in providerResources", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "basic",
      tools: [],
      actions: [],
    };

    await afs.mount(createMockProvider("basic", manifest), "/basic");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // providerResources should not contain /basic
    expect(content.providerResources?.["/basic"]).toBeUndefined();
  });

  // Happy Path: multiple providers with independent resources
  test("multiple providers resources are independently preserved", async () => {
    const aiManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "ai",
      tools: [],
      actions: [],
      resources: {
        caps: [{ op: "exec", path: "/chat" }],
        pricing: { currency: "USD" },
      },
    };

    const dbManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "db",
      tools: [],
      actions: [],
      resources: {
        caps: [
          { op: "read", path: "/*" },
          { op: "write", path: "/*" },
        ],
      },
    };

    const noResManifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "plain",
      tools: [],
      actions: [],
    };

    await afs.mount(createMockProvider("ai", aiManifest), "/ai");
    await afs.mount(createMockProvider("db", dbManifest), "/db");
    await afs.mount(createMockProvider("plain", noResManifest), "/plain");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.providerResources?.["/ai"]?.pricing?.currency).toBe("USD");
    expect(content.providerResources?.["/db"]?.caps).toHaveLength(2);
    expect(content.providerResources?.["/plain"]).toBeUndefined();
  });

  // Happy Path: caps paths stay provider-relative (not prefixed with mount path)
  test("caps paths remain provider-relative", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "test",
      tools: [],
      actions: [],
      resources: {
        caps: [{ op: "exec", path: "/models/*/chat" }],
      },
    };

    await afs.mount(createMockProvider("test", manifest), "/services/ai");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    // caps paths should stay as provider declared them
    expect(content.providerResources?.["/services/ai"]?.caps?.[0]?.path).toBe("/models/*/chat");
  });

  // Edge Case: all providers without resources → no providerResources field
  test("no providerResources when no providers declare resources", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "basic",
      tools: [],
      actions: [],
    };

    await afs.mount(createMockProvider("basic", manifest), "/basic");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.providerResources).toBeUndefined();
  });

  // Edge Case: provider with empty caps array → preserved
  test("empty caps array is preserved", async () => {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: "test",
      tools: [],
      actions: [],
      resources: { caps: [] },
    };

    await afs.mount(createMockProvider("test", manifest), "/test");

    const result = await afs.read("/.meta/.capabilities");
    const content = result.data?.content as AggregatedCapabilities;

    expect(content.providerResources?.["/test"]?.caps).toEqual([]);
  });
});
