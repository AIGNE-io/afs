export type {
  AUPClientMessage,
  AUPCreateOp,
  AUPEvent,
  AUPEventMessage,
  AUPEventResultMessage,
  AUPIntent,
  AUPNode,
  AUPPatchMessage,
  AUPPatchOp,
  AUPRemoveOp,
  AUPRenderMessage,
  AUPReorderOp,
  AUPServerMessage,
  AUPSize,
  AUPStageMessage,
  AUPTakeMessage,
  AUPUpdateOp,
  AUPVariant,
  DeviceCaps,
  DeviceDisplay,
  DeviceInput,
  PrimitiveCap,
} from "./aup-types.js";

export {
  AUP_PRIMITIVES,
  DEVICE_CAPS_TERM,
  DEVICE_CAPS_TTY,
  DEVICE_CAPS_WEB_CHAT,
  DEVICE_CAPS_WEB_FULL,
  fillPrimitives,
  validateDeviceCaps,
  validateNode,
  validatePatchOp,
} from "./aup-types.js";

export { DEGRADATION_CHAINS, degradeTree } from "./degradation.js";
export { resolveAUPVariables, resolveTranslationString, resolveTranslations } from "./i18n.js";
export { AUP_PRIMITIVES_CSS } from "./primitives-css.js";
export {
  GOOGLE_FONTS_HTML as STYLE_GOOGLE_FONTS_HTML,
  GOOGLE_FONTS_URL as STYLE_GOOGLE_FONTS_URL,
  generateAllStyleCSS,
} from "./style-css.js";
export { STYLE_INSPECTOR_HTML } from "./style-inspector.js";
// ── Composable Style System (supersedes named themes) ──
export type { PaletteDefinition, RecipeDefinition, ToneDefinition } from "./styles.js";
export { AUP_DEFAULT_STYLE, AUP_PALETTES, AUP_RECIPES, AUP_TONES } from "./styles.js";
export type { ThemeMetadata, ThemeTokens } from "./theme.js";
export { generateThemeCSS, loadThemeTokens, parseThemeMetadata } from "./theme.js";
export type { ThemeDefinition } from "./themes.js";
export {
  AUP_DEFAULT_THEME,
  AUP_THEMES,
  GOOGLE_FONTS_HTML,
  GOOGLE_FONTS_URL,
  generateAllThemesCSS,
} from "./themes.js";
