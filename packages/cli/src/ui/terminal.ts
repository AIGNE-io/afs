/**
 * Terminal utilities for CLI output
 *
 * Handles:
 * - ANSI color codes
 * - TTY detection
 * - Environment variable checks (NO_COLOR, AFS_NO_HEADER)
 */

/**
 * ANSI color codes
 */
const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright foreground colors
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
} as const;

/**
 * Check if stdout is a TTY (interactive terminal)
 */
export function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * Check if colors should be disabled
 * Respects NO_COLOR environment variable (https://no-color.org/)
 */
export function isColorDisabled(): boolean {
  return process.env.NO_COLOR !== undefined;
}

/**
 * Check if header should be displayed
 * Disabled by AFS_NO_HEADER environment variable
 */
export function isHeaderDisabled(): boolean {
  return process.env.AFS_NO_HEADER !== undefined;
}

/**
 * Check if we should use colorized output
 * Colors are enabled when:
 * - stdout is a TTY
 * - NO_COLOR is not set
 */
export function shouldUseColors(): boolean {
  return isTTY() && !isColorDisabled();
}

/**
 * Color helper functions
 * Returns plain text if colors are disabled
 */
export const colors = {
  // Create a colorizer function
  _wrap: (code: string, text: string): string => {
    if (!shouldUseColors()) return text;
    return `${code}${text}${ANSI.reset}`;
  },

  // Basic styles
  bold: (text: string) => colors._wrap(ANSI.bold, text),
  dim: (text: string) => colors._wrap(ANSI.dim, text),

  // Standard colors
  red: (text: string) => colors._wrap(ANSI.red, text),
  green: (text: string) => colors._wrap(ANSI.green, text),
  yellow: (text: string) => colors._wrap(ANSI.yellow, text),
  blue: (text: string) => colors._wrap(ANSI.blue, text),
  magenta: (text: string) => colors._wrap(ANSI.magenta, text),
  cyan: (text: string) => colors._wrap(ANSI.cyan, text),
  white: (text: string) => colors._wrap(ANSI.white, text),

  // Bright colors
  brightCyan: (text: string) => colors._wrap(ANSI.brightCyan, text),
  brightGreen: (text: string) => colors._wrap(ANSI.brightGreen, text),
  brightYellow: (text: string) => colors._wrap(ANSI.brightYellow, text),
  brightRed: (text: string) => colors._wrap(ANSI.brightRed, text),

  // Semantic colors (for consistency)
  error: (text: string) => colors._wrap(ANSI.red, text),
  warning: (text: string) => colors._wrap(ANSI.yellow, text),
  success: (text: string) => colors._wrap(ANSI.green, text),
  info: (text: string) => colors._wrap(ANSI.cyan, text),
  path: (text: string) => colors._wrap(ANSI.cyan, text),
  muted: (text: string) => colors._wrap(ANSI.dim, text),
};
