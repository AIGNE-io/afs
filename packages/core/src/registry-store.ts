/**
 * In-memory registry store for /registry/ virtual path.
 *
 * Stores provider manifests keyed by name.
 * Supports CRUD via standard AFS semantics: list, read, search, stat.
 */

import type { ManifestJSON } from "./manifest.js";
import type {
  AFSEntry,
  AFSExplainResult,
  AFSListResult,
  AFSReadResult,
  AFSSearchResult,
  AFSStatResult,
} from "./type.js";

export class RegistryStore {
  private providers = new Map<string, ManifestJSON>();

  /**
   * Register a provider manifest.
   */
  register(manifest: ManifestJSON): void {
    this.providers.set(manifest.name, manifest);
  }

  /**
   * Unregister a provider by name.
   */
  unregister(name: string): void {
    this.providers.delete(name);
  }

  /**
   * Check if a provider is registered.
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all registered provider names.
   */
  get names(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the total count of registered providers.
   */
  get size(): number {
    return this.providers.size;
  }

  // ---------------------------------------------------------------------------
  // AFS Operations
  // ---------------------------------------------------------------------------

  /**
   * List contents of /registry/ paths.
   *
   * - /registry/ → lists virtual directories: providers/, by-category/
   * - /registry/providers/ → lists all providers
   * - /registry/providers/{name}/ → lists files in a provider entry
   * - /registry/by-category/ → lists categories
   * - /registry/by-category/{cat}/ → lists providers in that category
   */
  list(subpath: string): AFSListResult {
    const entries: AFSEntry[] = [];

    if (subpath === "/" || subpath === "") {
      // Root: show virtual directories
      entries.push(
        { id: "providers", path: "/registry/providers", meta: { childrenCount: -1 } },
        { id: "by-category", path: "/registry/by-category", meta: { childrenCount: -1 } },
      );
    } else if (subpath === "/providers" || subpath === "/providers/") {
      // List all providers as directories
      for (const name of this.providers.keys()) {
        entries.push({
          id: name,
          path: `/registry/providers/${name}`,
          meta: { childrenCount: -1, kind: "registry:provider" },
        });
      }
    } else if (subpath.startsWith("/providers/")) {
      const name = subpath.replace("/providers/", "").replace(/\/$/, "");
      const manifest = this.providers.get(name);
      if (manifest) {
        entries.push({
          id: "manifest.json",
          path: `/registry/providers/${name}/manifest.json`,
          meta: { kind: "registry:manifest" },
        });
      }
    } else if (subpath === "/by-category" || subpath === "/by-category/") {
      // List all categories
      const categories = new Set<string>();
      for (const m of this.providers.values()) {
        categories.add(m.category);
      }
      for (const cat of categories) {
        entries.push({
          id: cat,
          path: `/registry/by-category/${cat}`,
          meta: { childrenCount: -1, kind: "registry:category" },
        });
      }
    } else if (subpath.startsWith("/by-category/")) {
      const category = subpath.replace("/by-category/", "").replace(/\/$/, "");
      for (const m of this.providers.values()) {
        if (m.category === category) {
          entries.push({
            id: m.name,
            path: `/registry/providers/${m.name}`,
            meta: { childrenCount: -1, kind: "registry:provider" },
          });
        }
      }
    }

    return { data: entries };
  }

  /**
   * Read a specific registry path.
   *
   * - /registry/providers/{name}/manifest.json → manifest content
   */
  read(subpath: string): AFSReadResult | null {
    // Match /providers/{name}/manifest.json
    const manifestMatch = subpath.match(/^\/providers\/([^/]+)\/manifest\.json$/);
    if (manifestMatch) {
      const name = manifestMatch[1]!;
      const manifest = this.providers.get(name);
      if (!manifest) return null;
      return {
        data: {
          id: "manifest.json",
          path: `/registry/providers/${name}/manifest.json`,
          content: JSON.stringify(manifest, null, 2),
          meta: { kind: "registry:manifest" },
        },
      };
    }

    return null;
  }

  /**
   * Stat a registry path.
   */
  stat(subpath: string): AFSStatResult | null {
    if (subpath === "/" || subpath === "") {
      return { data: { id: "registry", path: "/registry", meta: { childrenCount: -1 } } };
    }
    if (subpath === "/providers" || subpath === "/providers/") {
      return {
        data: { id: "providers", path: "/registry/providers", meta: { childrenCount: -1 } },
      };
    }
    if (subpath.startsWith("/providers/")) {
      const rest = subpath.replace("/providers/", "").replace(/\/$/, "");
      const parts = rest.split("/");
      const name = parts[0]!;
      if (!this.providers.has(name)) return null;
      if (parts.length === 1 || (parts.length === 2 && parts[1] === "")) {
        return {
          data: { id: name, path: `/registry/providers/${name}`, meta: { childrenCount: -1 } },
        };
      }
      if (parts[1] === "manifest.json") {
        return {
          data: {
            id: "manifest.json",
            path: `/registry/providers/${name}/manifest.json`,
            meta: { kind: "registry:manifest" },
          },
        };
      }
    }
    return null;
  }

  /**
   * Search within registry.
   */
  search(query: string): AFSSearchResult {
    const results: AFSEntry[] = [];
    const lower = query.toLowerCase();

    for (const m of this.providers.values()) {
      if (
        m.name.toLowerCase().includes(lower) ||
        m.description.toLowerCase().includes(lower) ||
        m.category.toLowerCase().includes(lower) ||
        m.tags?.some((t) => t.toLowerCase().includes(lower))
      ) {
        results.push({
          id: m.name,
          path: `/registry/providers/${m.name}`,
          meta: { childrenCount: -1, kind: "registry:provider", category: m.category },
        });
      }
    }

    return { data: results };
  }

  /**
   * Explain registry root.
   */
  explain(): AFSExplainResult {
    return {
      format: "text",
      content: `Provider registry with ${this.providers.size} registered providers`,
    };
  }
}
