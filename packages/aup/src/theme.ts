/**
 * Unified AUP Theme System.
 *
 * One theme system for both ui provider (realtime WebSocket) and
 * web-device provider (SSR). File-based tokens, dual-axis (theme × mode).
 *
 * Theme directory structure:
 *   themes/{name}/
 *     THEME.md                ← metadata (name, fonts, google-fonts, palette, vibe)
 *     tokens/                 ← mode-independent (fonts, radius, spacing, transitions)
 *     tokens/dark/            ← dark mode color overrides
 *
 * Color tokens (--color-*) live in tokens/ (light) and tokens/dark/ (dark).
 * Non-color tokens (--font-*, --radius-*, --container-*, etc.) are base (mode-independent).
 */

// ── Types ──

/** Theme metadata from THEME.md frontmatter. */
export interface ThemeMetadata {
  name?: string;
  description?: string;
  fonts?: Record<string, string>;
  googleFonts?: string;
  palette?: Record<string, string>;
  vibe?: string;
}

/**
 * Loaded theme tokens — dual-axis (mode × token).
 * - `base`: mode-independent tokens (fonts, radius, spacing)
 * - `light`: light-mode color tokens
 * - `dark`: dark-mode color tokens
 */
export interface ThemeTokens {
  base: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
  metadata?: ThemeMetadata;
}

/** Minimal AFS reader interface — only read + list needed. */
interface AFSReader {
  read(path: string): Promise<{ data: { content?: string | null } }>;
  list(path: string): Promise<{ data: Array<{ path: string }> }>;
}

// ── Metadata Parser ──

/**
 * Parse THEME.md frontmatter (YAML between --- fences).
 * Minimal parser — only extracts known fields, no full YAML dependency.
 */
export function parseThemeMetadata(content: string): ThemeMetadata {
  const meta: ThemeMetadata = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return meta;

  const yaml = match[1]!;
  const lines = yaml.split("\n");
  let currentBlock: string | null = null;
  let currentMap: Record<string, string> = {};

  for (const line of lines) {
    // Nested key (indented under a block)
    const nestedMatch = line.match(/^\s{2,}(\S+):\s*"?([^"]*)"?\s*$/);
    if (nestedMatch && currentBlock) {
      currentMap[nestedMatch[1]!] = nestedMatch[2]!;
      continue;
    }

    // Flush previous block
    if (currentBlock) {
      if (currentBlock === "fonts") meta.fonts = currentMap;
      else if (currentBlock === "palette") meta.palette = currentMap;
      currentBlock = null;
      currentMap = {};
    }

    // Top-level key
    const topMatch = line.match(/^(\S+):\s*(.*)/);
    if (!topMatch) continue;
    const [, key, rawValue] = topMatch;
    const value = rawValue!.replace(/^"(.*)"$/, "$1").trim();

    switch (key) {
      case "name":
        meta.name = value;
        break;
      case "description":
        meta.description = value;
        break;
      case "google-fonts":
        meta.googleFonts = value;
        break;
      case "vibe":
        meta.vibe = value;
        break;
      case "fonts":
        currentBlock = "fonts";
        currentMap = {};
        break;
      case "palette":
        currentBlock = "palette";
        currentMap = {};
        break;
    }
  }

  // Flush final block
  if (currentBlock === "fonts") meta.fonts = currentMap;
  else if (currentBlock === "palette") meta.palette = currentMap;

  return meta;
}

// ── Token Loader ──

/** Read a single file value via AFS, trimmed. */
async function readFileValue(afs: AFSReader, path: string): Promise<string | undefined> {
  try {
    const result = await afs.read(path);
    const content = result.data?.content;
    return content != null ? content.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Read all files in a directory as key→value pairs. Strips surrounding quotes. */
async function readDirTokens(afs: AFSReader, dirPath: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const listing = await afs.list(dirPath);
    await Promise.all(
      listing.data
        .filter((e) => {
          const name = e.path.split("/").pop() || "";
          return name.startsWith("--") && name !== ".DS_Store";
        })
        .map(async (entry) => {
          const name = entry.path.split("/").pop() || "";
          const fullPath = dirPath.endsWith("/") ? `${dirPath}${name}` : `${dirPath}/${name}`;
          let value = await readFileValue(afs, fullPath);
          if (value !== undefined) {
            // Strip surrounding double quotes — CSS values should be bare
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.slice(1, -1);
            }
            result[name] = value;
          }
        }),
    );
  } catch {
    // directory doesn't exist — return empty
  }
  return result;
}

/** Check if a token name is a color token (goes into light/dark). */
function isColorToken(name: string): boolean {
  return name.startsWith("--color-");
}

/**
 * Load theme tokens from AFS directory.
 *
 * Reads `tokens/` for light + base tokens, `tokens/dark/` for dark overrides.
 * Separates color tokens (mode-dependent) from non-color tokens (mode-independent base).
 */
export async function loadThemeTokens(afs: AFSReader, themePath: string): Promise<ThemeTokens> {
  const tokensDir = themePath.endsWith("/") ? `${themePath}tokens` : `${themePath}/tokens`;
  const darkDir = `${tokensDir}/dark`;

  // Read light tokens, dark tokens, and metadata in parallel
  const [allLightTokens, darkTokens, themeMd] = await Promise.all([
    readDirTokens(afs, tokensDir),
    readDirTokens(afs, darkDir),
    readFileValue(afs, themePath.endsWith("/") ? `${themePath}THEME.md` : `${themePath}/THEME.md`),
  ]);

  // Separate color tokens from base tokens
  const base: Record<string, string> = {};
  const light: Record<string, string> = {};

  for (const [key, value] of Object.entries(allLightTokens)) {
    if (isColorToken(key)) {
      light[key] = value;
    } else {
      base[key] = value;
    }
  }

  const metadata = themeMd ? parseThemeMetadata(themeMd) : undefined;

  return { base, light, dark: darkTokens, metadata };
}

// ── CSS Generator ──

/** Format token entries as CSS variable declarations. */
function formatDeclarations(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
}

/**
 * Generate CSS string from theme tokens.
 *
 * Produces:
 * - `@import url(...)` for Google Fonts (if metadata.googleFonts)
 * - `[data-theme="{name}"] { base tokens }` (mode-independent)
 * - `[data-theme="{name}"][data-mode="light"] { light colors }`
 * - `[data-theme="{name}"][data-mode="dark"] { dark colors }`
 *
 * For "default" theme, also includes `:root` selector.
 */
export function generateThemeCSS(
  themeName: string,
  tokens: ThemeTokens,
  metadata?: ThemeMetadata,
): string {
  const parts: string[] = [];

  // Google Fonts import
  if (metadata?.googleFonts) {
    parts.push(
      `@import url("https://fonts.googleapis.com/css2?family=${metadata.googleFonts}&display=swap");`,
    );
    parts.push("");
  }

  const themeSelector = `[data-theme="${themeName}"]`;
  const rootPrefix = themeName === "default" ? `:root, ${themeSelector}` : themeSelector;

  // Base tokens (mode-independent)
  const baseDecls = formatDeclarations(tokens.base);
  parts.push(`${rootPrefix} {`);
  if (baseDecls) parts.push(baseDecls);
  parts.push("}");

  // Light mode
  const lightDecls = formatDeclarations(tokens.light);
  parts.push(`${themeSelector}[data-mode="light"] {`);
  if (lightDecls) parts.push(lightDecls);
  parts.push("}");

  // Dark mode
  const darkDecls = formatDeclarations(tokens.dark);
  parts.push(`${themeSelector}[data-mode="dark"] {`);
  if (darkDecls) parts.push(darkDecls);
  parts.push("}");

  return parts.join("\n");
}
