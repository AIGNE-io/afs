/**
 * Widget Assets — self-contained www26 component JS files.
 *
 * These are loaded lazily on first access and served via HTTP at /widgets/{name}.js.
 * Bridge renderers create iframes that load them via <script src>.
 * Missing files are silently skipped — a missing widget asset should never crash the provider.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));

function tryLoad(name: string): string | undefined {
  try {
    return readFileSync(join(DIR, `${name}.js`), "utf-8");
  } catch {
    return undefined;
  }
}

function tryLoadBinary(name: string): Buffer | undefined {
  try {
    return readFileSync(join(DIR, name));
  } catch {
    return undefined;
  }
}

const ASSET_NAMES = ["webgl-hero", "type-block", "hero-widget", "block-revealer", "text-highlight"];
const IMAGE_NAMES = ["marble-noise.jpg", "marble-noise3d.jpg"];

// Lazy-load cache
const _assetCache = new Map<string, string>();
const _imageCache = new Map<string, Buffer>();

export const WIDGET_ASSETS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_, key: string) {
      if (!ASSET_NAMES.includes(key)) return undefined;
      if (!_assetCache.has(key)) {
        const content = tryLoad(key);
        if (content != null) _assetCache.set(key, content);
      }
      return _assetCache.get(key);
    },
    has(_, key: string) {
      if (!ASSET_NAMES.includes(key)) return false;
      if (!_assetCache.has(key)) {
        const content = tryLoad(key);
        if (content != null) _assetCache.set(key, content);
      }
      return _assetCache.has(key);
    },
    ownKeys() {
      // Trigger lazy load for all
      for (const name of ASSET_NAMES) {
        if (!_assetCache.has(name)) {
          const content = tryLoad(name);
          if (content != null) _assetCache.set(name, content);
        }
      }
      return [..._assetCache.keys()];
    },
    getOwnPropertyDescriptor(_, key: string) {
      if (ASSET_NAMES.includes(key)) {
        if (!_assetCache.has(key)) {
          const content = tryLoad(key);
          if (content != null) _assetCache.set(key, content);
        }
        if (_assetCache.has(key)) return { configurable: true, enumerable: true, value: _assetCache.get(key) };
      }
      return undefined;
    },
  },
);

export const WIDGET_IMAGES: Record<string, Buffer> = new Proxy(
  {} as Record<string, Buffer>,
  {
    get(_, key: string) {
      if (!IMAGE_NAMES.includes(key)) return undefined;
      if (!_imageCache.has(key)) {
        const content = tryLoadBinary(key);
        if (content != null) _imageCache.set(key, content);
      }
      return _imageCache.get(key);
    },
    has(_, key: string) {
      if (!IMAGE_NAMES.includes(key)) return false;
      if (!_imageCache.has(key)) {
        const content = tryLoadBinary(key);
        if (content != null) _imageCache.set(key, content);
      }
      return _imageCache.has(key);
    },
    ownKeys() {
      for (const name of IMAGE_NAMES) {
        if (!_imageCache.has(name)) {
          const content = tryLoadBinary(name);
          if (content != null) _imageCache.set(name, content);
        }
      }
      return [..._imageCache.keys()];
    },
    getOwnPropertyDescriptor(_, key: string) {
      if (IMAGE_NAMES.includes(key)) {
        if (!_imageCache.has(key)) {
          const content = tryLoadBinary(key);
          if (content != null) _imageCache.set(key, content);
        }
        if (_imageCache.has(key)) return { configurable: true, enumerable: true, value: _imageCache.get(key) };
      }
      return undefined;
    },
  },
);
