/**
 * AUP App — loads multi-page app config from `.aup/app.json`.
 *
 * Owns page loading, wrapper substitution, i18n resolution, and page resolution.
 * This is the AUP-layer concern that was previously tangled into the blocklet layer.
 *
 * The loaded app provides:
 * - `defaultTree` — initial page tree (with wrapper applied, default locale)
 * - `pageResolver` — resolves page name + locale → { tree, style }
 * - `defaultTone` / `defaultPalette` — default page tone/palette (if any)
 */

import { resolveAUPVariables, resolveTranslations } from "@aigne/afs-aup";
import type { AUPNode } from "./aup-types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Page definition within an AUP app config. */
export interface AUPPageDefinition {
  /** Page tree file path (relative to .aup/ directory) */
  tree: string;
  /** Optional tone for this page */
  tone?: string;
  /** Optional palette for this page */
  palette?: string;
}

/**
 * AUP app config — lives in `.aup/app.json`.
 *
 * All file paths are relative to the `.aup/` directory.
 */
export interface AUPAppConfig {
  /** Default page name (defaults to first page in pages) */
  defaultPage?: string;
  /** Default tone for all pages */
  tone?: string;
  /** Default palette for all pages */
  palette?: string;
  /** Wrapper template file path (relative to .aup/) */
  wrapper?: string;
  /** Available locale codes — loads from locales/{code}.json */
  locales?: string[];
  /** Page definitions */
  pages: Record<string, AUPPageDefinition>;
}

/** Result of resolving a page by name. */
export interface ResolvedPage {
  tree: AUPNode;
  tone?: string;
  palette?: string;
}

/** Loaded AUP app — ready for rendering. */
export interface AUPApp {
  /** Initial page tree (with wrapper applied, default locale). */
  defaultTree: AUPNode;
  /** Default page name. */
  defaultPage: string;
  /** Default tone (if any). */
  defaultTone?: string;
  /** Default palette (if any). */
  defaultPalette?: string;
  /** Resolve a page by name + optional locale → tree (with wrapper + i18n) + tone/palette. */
  pageResolver: (name: string, locale?: string) => Promise<ResolvedPage | undefined>;
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Load an AUP app from config.
 *
 * Eagerly loads the default page, wrapper, and default locale (fail-fast).
 * Other pages and locales are lazy-loaded on first resolve and cached.
 *
 * @param config - AUP app config (from `.aup/app.json`)
 * @param readFile - reads a file relative to `.aup/` directory, returns parsed JSON
 */
export async function loadAUPApp(
  config: AUPAppConfig,
  readFile: (relativePath: string) => Promise<unknown>,
): Promise<AUPApp> {
  const pageNames = Object.keys(config.pages);
  if (pageNames.length === 0) {
    throw new Error("AUP app config must have at least one page");
  }

  // ── Resolve default page key ───────────────────────────────────────────

  const defaultKey = config.defaultPage ?? pageNames[0]!;
  if (!config.pages[defaultKey]) {
    throw new Error(`Default page "${defaultKey}" not found in pages`);
  }

  // ── Eager load: default page + wrapper + default locale in parallel ───

  const defaultLocale = config.locales?.[0];

  const [defaultPageTree, wrapperTemplate, defaultLocaleMsgs] = await Promise.all([
    readFile(config.pages[defaultKey]!.tree) as Promise<AUPNode>,
    config.wrapper ? (readFile(config.wrapper) as Promise<AUPNode>) : Promise.resolve(undefined),
    defaultLocale
      ? (readFile(`locales/${defaultLocale}.json`) as Promise<Record<string, string>>)
      : Promise.resolve(undefined),
  ]);

  // ── Lazy-load caches (store Promises for request coalescing) ───────────

  const pageCache = new Map<string, Promise<AUPNode>>();
  pageCache.set(defaultKey, Promise.resolve(defaultPageTree));

  const localeCache = new Map<string, Promise<Record<string, string>>>();
  if (defaultLocale && defaultLocaleMsgs) {
    localeCache.set(defaultLocale, Promise.resolve(defaultLocaleMsgs));
  }

  // ── Wrapper substitution ─────────────────────────────────────────────────

  function applyWrapper(pageTree: AUPNode): AUPNode {
    if (!wrapperTemplate) return pageTree;
    return substituteContent(wrapperTemplate, pageTree);
  }

  function substituteContent(node: AUPNode | Record<string, unknown>, content: AUPNode): AUPNode {
    if ((node as any).$ref === "content") return content;

    const aupNode = node as AUPNode;
    if (!aupNode.children) return aupNode;

    return {
      ...aupNode,
      children: aupNode.children.map((child) => substituteContent(child, content)),
    };
  }

  // ── Lazy loaders (Promise-based dedup: concurrent calls share one read) ─

  function ensurePage(name: string): Promise<AUPNode> | undefined {
    const cached = pageCache.get(name);
    if (cached) return cached;
    const def = config.pages[name];
    if (!def) return undefined;
    const promise = readFile(def.tree) as Promise<AUPNode>;
    pageCache.set(name, promise);
    return promise;
  }

  function ensureLocale(locale: string): Promise<Record<string, string>> {
    const cached = localeCache.get(locale);
    if (cached) return cached;
    const promise = readFile(`locales/${locale}.json`) as Promise<Record<string, string>>;
    localeCache.set(locale, promise);
    return promise;
  }

  // ── i18n resolution ───────────────────────────────────────────────────────

  async function applyI18n(tree: AUPNode, locale?: string): Promise<AUPNode> {
    if (!config.locales || config.locales.length === 0) return tree;
    const targetLocale = locale ?? defaultLocale;
    if (!targetLocale) return tree;
    const msgs = await ensureLocale(targetLocale);
    const fallbackMsgs =
      targetLocale !== defaultLocale && defaultLocale
        ? await ensureLocale(defaultLocale)
        : undefined;
    let resolved = resolveTranslations(tree, msgs, fallbackMsgs);
    resolved = resolveAUPVariables(resolved, { locale: targetLocale });
    return resolved;
  }

  const defaultPageDef = config.pages[defaultKey];

  // ── Build app ────────────────────────────────────────────────────────────

  return {
    defaultTree: resolveRelativeSrc(await applyI18n(applyWrapper(defaultPageTree))),
    defaultPage: defaultKey,
    defaultTone: defaultPageDef?.tone ?? config.tone,
    defaultPalette: defaultPageDef?.palette ?? config.palette,
    pageResolver: async (name: string, locale?: string): Promise<ResolvedPage | undefined> => {
      const pagePromise = ensurePage(name);
      if (!pagePromise) return undefined;
      const tree = await pagePromise;
      const pageDef = config.pages[name];
      return {
        tree: resolveRelativeSrc(await applyI18n(applyWrapper(tree), locale)),
        tone: pageDef?.tone ?? config.tone,
        palette: pageDef?.palette ?? config.palette,
      };
    },
  };
}

// ─── Relative path resolution ────────────────────────────────────────────────

/**
 * Resolve relative `src` attributes in an AUP tree to absolute AFS paths.
 *
 * Relative paths are resolved to the Runtime AFS root — `data/inbox` becomes
 * `/data/inbox`. This works identically in local daemon (Runtime AFS) and
 * worker (DO AFS) environments.
 *
 * Rules:
 * - src starting with "/" → absolute, unchanged
 * - src starting with "http" or "https" → external URL, unchanged
 * - src starting with "$" or "${" → template variable, unchanged
 * - src starting with "./" → strip "./" and prepend "/"
 * - everything else → relative, prepend "/"
 *
 * Recursively walks children. Does not mutate the input tree.
 */
export function resolveRelativeSrc(node: AUPNode): AUPNode {
  let result = node;

  if (typeof node.src === "string" && node.src) {
    const src = node.src;
    if (
      !src.startsWith("/") &&
      !src.startsWith("http") &&
      !src.startsWith("$") &&
      !src.startsWith("${")
    ) {
      const clean = src.startsWith("./") ? src.slice(2) : src;
      result = { ...node, src: `/${clean}` };
    }
  }

  if (node.children) {
    const resolvedChildren = node.children.map((child) => resolveRelativeSrc(child));
    if (result === node) {
      result = { ...node, children: resolvedChildren };
    } else {
      result = { ...result, children: resolvedChildren };
    }
  }

  return result;
}

// ─── i18n ─────────────────────────────────────────────────────────────────────
// resolveTranslations() is now provided by @aigne/afs-aup (re-exported above).
