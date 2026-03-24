import { beforeEach, describe, expect, it } from "bun:test";
import type { ManifestJSON } from "../src/manifest.js";
import { RegistryStore } from "../src/registry-store.js";

function makeManifest(name: string, category = "storage"): ManifestJSON {
  return {
    name,
    description: `${name} provider`,
    uriTemplate: `${name}://{path}`,
    category,
  };
}

describe("Virtual /registry/ Path", () => {
  let store: RegistryStore;

  beforeEach(() => {
    store = new RegistryStore();
    store.register(makeManifest("memory", "storage"));
    store.register(makeManifest("s3", "storage"));
    store.register(makeManifest("slack", "messaging"));
  });

  describe("Happy Path", () => {
    it('list("/registry/") returns virtual directories', () => {
      const result = store.list("/");
      expect(result.data.length).toBe(2);
      expect(result.data.map((e) => e.id)).toEqual(["providers", "by-category"]);
    });

    it('list("/registry/providers/") returns all providers', () => {
      const result = store.list("/providers/");
      expect(result.data.length).toBe(3);
      expect(result.data.map((e) => e.id).sort()).toEqual(["memory", "s3", "slack"]);
    });

    it('read("/registry/providers/memory/manifest.json") returns manifest', () => {
      const result = store.read("/providers/memory/manifest.json");
      expect(result).not.toBeNull();
      const content = JSON.parse(result!.data!.content as string);
      expect(content.name).toBe("memory");
      expect(content.uriTemplate).toBe("memory://{path}");
    });

    it('list("/registry/by-category/storage/") returns storage providers', () => {
      const result = store.list("/by-category/storage/");
      expect(result.data.length).toBe(2);
      expect(result.data.map((e) => e.id).sort()).toEqual(["memory", "s3"]);
    });

    it('search("slack") returns matching providers', () => {
      const result = store.search("slack");
      expect(result.data.length).toBe(1);
      expect(result.data[0]!.id).toBe("slack");
    });

    it('stat("/registry/providers/memory/") returns directory info', () => {
      const result = store.stat("/providers/memory/");
      expect(result).not.toBeNull();
      expect(result!.data!.meta?.childrenCount).toBe(-1);
    });
  });

  describe("Dynamic Registration", () => {
    it("registerProvider → list shows it", () => {
      store.register(makeManifest("redis", "database"));
      const result = store.list("/providers/");
      expect(result.data.map((e) => e.id)).toContain("redis");
    });

    it("unregisterProvider → list no longer shows it", () => {
      store.unregister("memory");
      const result = store.list("/providers/");
      expect(result.data.map((e) => e.id)).not.toContain("memory");
    });

    it("registerProvider same name overwrites manifest", () => {
      const updated = makeManifest("memory", "database");
      updated.description = "Updated memory provider";
      store.register(updated);

      const result = store.read("/providers/memory/manifest.json");
      const content = JSON.parse(result!.data!.content as string);
      expect(content.description).toBe("Updated memory provider");
      expect(content.category).toBe("database");
    });

    it("registered provider is immediately readable", () => {
      store.register(makeManifest("new-provider", "ai"));
      const result = store.read("/providers/new-provider/manifest.json");
      expect(result).not.toBeNull();
    });

    it("unregistered provider read returns null", () => {
      store.unregister("memory");
      const result = store.read("/providers/memory/manifest.json");
      expect(result).toBeNull();
    });
  });

  describe("Bad Path", () => {
    it("read nonexistent provider returns null", () => {
      const result = store.read("/providers/nonexistent/manifest.json");
      expect(result).toBeNull();
    });

    it("stat nonexistent provider returns null", () => {
      const result = store.stat("/providers/nonexistent/");
      expect(result).toBeNull();
    });

    it("list empty category returns empty", () => {
      const result = store.list("/by-category/nonexistent/");
      expect(result.data.length).toBe(0);
    });
  });

  describe("Security", () => {
    it("name with ../ is rejected by validateManifestJSON (tested in manifest.test.ts)", () => {
      // Registry relies on manifest validation; names with path traversal
      // should never reach the store. This is tested in manifest.test.ts.
      // Here we verify the store itself doesn't produce paths with traversal.
      store.register(makeManifest("safe-name"));
      const result = store.list("/providers/");
      for (const entry of result.data) {
        expect(entry.path).not.toContain("..");
      }
    });
  });

  describe("Data Integrity", () => {
    it("multiple register/unregister cycles produce consistent state", () => {
      for (let i = 0; i < 10; i++) {
        store.register(makeManifest(`temp-${i}`));
      }
      for (let i = 0; i < 10; i++) {
        store.unregister(`temp-${i}`);
      }
      // Only the original 3 should remain
      expect(store.list("/providers/").data.length).toBe(3);
    });

    it("unregister does not affect other providers", () => {
      store.unregister("s3");
      expect(store.read("/providers/memory/manifest.json")).not.toBeNull();
      expect(store.read("/providers/slack/manifest.json")).not.toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("zero external providers → list returns empty", () => {
      const empty = new RegistryStore();
      const result = empty.list("/providers/");
      expect(result.data.length).toBe(0);
    });

    it("explain returns description with count", () => {
      const result = store.explain();
      expect(result.content).toContain("3 registered providers");
    });
  });
});
