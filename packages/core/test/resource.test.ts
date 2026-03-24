/**
 * ResourceContext + AliasResolver + ConfigStore + createResourceAFS tests.
 */

import { describe, expect, it } from "bun:test";
import type {
  AliasResolver,
  ConfigStore,
  ResourceConfig,
  ResourceContext,
  ResourceProviderFactory,
} from "../src/resource/index.js";
import { createResourceAFS, resolveResourceContext } from "../src/resource/index.js";

// ─── Mock implementations ────────────────────────────────────────────────────

class MemoryAliasResolver implements AliasResolver {
  private map = new Map<string, string>();
  set(host: string, resourceId: string) {
    this.map.set(host, resourceId);
  }
  async resolve(host: string): Promise<string | null> {
    return this.map.get(host) ?? null;
  }
}

class MemoryConfigStore implements ConfigStore {
  private configs = new Map<string, ResourceConfig>();
  set(id: string, config: ResourceConfig) {
    this.configs.set(id, config);
  }
  async get(resourceId: string): Promise<ResourceConfig | null> {
    return this.configs.get(resourceId) ?? null;
  }
}

/** Create a mock provider that passes AFS mount validation. */
function mockProvider(name: string) {
  return {
    name,
    accessMode: "readwrite" as const,
    async list() {
      return { data: [] };
    },
    async read() {
      return { data: { id: name, path: "/", content: "", meta: { kind: "mock:root" } } };
    },
    async stat() {
      return { data: { id: name, path: "/", meta: { kind: "mock:root" } } };
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ResourceContext", () => {
  describe("resolveResourceContext", () => {
    it("resolves domain to resource context", async () => {
      const aliases = new MemoryAliasResolver();
      aliases.set("blog.example.com", "res-blog");

      const configs = new MemoryConfigStore();
      configs.set("res-blog", {
        storagePrefix: "blog",
        mounts: [{ path: "/content", provider: "r2", options: {} }],
      });

      const ctx = await resolveResourceContext("blog.example.com", aliases, configs);
      expect(ctx).not.toBeNull();
      expect(ctx!.resourceId).toBe("res-blog");
      expect(ctx!.domain).toBe("blog.example.com");
      expect(ctx!.config.storagePrefix).toBe("blog");
      expect(ctx!.config.mounts).toHaveLength(1);
    });

    it("returns null for unknown domain", async () => {
      const aliases = new MemoryAliasResolver();
      const configs = new MemoryConfigStore();

      const ctx = await resolveResourceContext("unknown.com", aliases, configs);
      expect(ctx).toBeNull();
    });

    it("returns null when config not found for resourceId", async () => {
      const aliases = new MemoryAliasResolver();
      aliases.set("orphan.com", "res-orphan");
      const configs = new MemoryConfigStore();

      const ctx = await resolveResourceContext("orphan.com", aliases, configs);
      expect(ctx).toBeNull();
    });
  });

  describe("createResourceAFS", () => {
    it("creates AFS with mounts from config", async () => {
      const mounted: Array<{ provider: string; options: Record<string, unknown> }> = [];

      const factory: ResourceProviderFactory = (provider, options) => {
        mounted.push({ provider, options });
        return mockProvider(`mock-${provider}`);
      };

      const ctx: ResourceContext = {
        resourceId: "res-1",
        domain: "example.com",
        config: {
          storagePrefix: "tenant-1",
          mounts: [
            { path: "/content", provider: "r2", options: { bucket: "main" } },
            { path: "/cache", provider: "kv", options: { namespace: "cache" } },
          ],
        },
      };

      const afs = await createResourceAFS(ctx, factory);
      expect(afs).toBeDefined();
      expect(mounted).toHaveLength(2);
      expect(mounted[0]!.provider).toBe("r2");
      expect(mounted[0]!.options.prefix).toBe("tenant-1");
      expect(mounted[1]!.provider).toBe("kv");
      expect(mounted[1]!.options.prefix).toBe("tenant-1");
    });

    it("works with empty mounts", async () => {
      const factory: ResourceProviderFactory = () => mockProvider("mock");

      const ctx: ResourceContext = {
        resourceId: "res-empty",
        domain: "empty.com",
        config: { storagePrefix: "e", mounts: [] },
      };

      const afs = await createResourceAFS(ctx, factory);
      expect(afs).toBeDefined();
    });

    it("passes mount options merged with storagePrefix", async () => {
      let receivedOptions: Record<string, unknown> = {};

      const factory: ResourceProviderFactory = (_provider, options) => {
        receivedOptions = options;
        return mockProvider("mock");
      };

      const ctx: ResourceContext = {
        resourceId: "res-x",
        domain: "x.com",
        config: {
          storagePrefix: "pfx",
          mounts: [{ path: "/data", provider: "r2", options: { region: "us-east" } }],
        },
      };

      await createResourceAFS(ctx, factory);
      expect(receivedOptions.prefix).toBe("pfx");
      expect(receivedOptions.region).toBe("us-east");
    });
  });
});
