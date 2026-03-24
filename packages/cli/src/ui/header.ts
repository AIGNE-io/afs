/**
 * CLI Header and Branding
 *
 * Displays the AFS logo, version, and status information
 * in interactive (human) mode.
 */

import { colors, isHeaderDisabled, isTTY } from "./terminal.js";

/**
 * ASCII art logo for AFS
 * Clean, compact design using Unicode block characters
 */
const LOGO = `
▄▀█ █▀▀ █▀
█▀█ █▀░ ▄█
`.trimStart();

/**
 * Tagline displayed below the logo
 */
const TAGLINE = "Agentic File System";

/**
 * Options for header display
 */
export interface HeaderOptions {
  version: string;
  mountCount: number;
}

/**
 * Check if header should be displayed
 * Header is shown when:
 * - stdout is a TTY
 * - AFS_NO_HEADER is not set
 */
export function shouldShowHeader(): boolean {
  return isTTY() && !isHeaderDisabled();
}

/**
 * Format the CLI header with logo, version, and status
 */
export function formatHeader(options: HeaderOptions): string {
  const { version, mountCount } = options;

  // Colorize the logo
  const coloredLogo = colors.brightCyan(LOGO);

  // Colorize the tagline
  const coloredTagline = colors.dim(TAGLINE);

  // Format status line
  const versionPart = colors.green(`v${version}`);
  const mountPart = colors.yellow(`${mountCount} ${mountCount === 1 ? "mount" : "mounts"}`);
  const statusLine = `${versionPart} ${colors.dim("•")} ${mountPart}`;

  return `${coloredLogo}${coloredTagline}\n\n${statusLine}\n`;
}

/**
 * Print the header to stdout if conditions are met
 */
export function printHeader(options: HeaderOptions): void {
  if (shouldShowHeader()) {
    console.log(formatHeader(options));
  }
}

/**
 * Print just the logo with tagline (for exit messages etc.)
 */
export function printLogo(): void {
  const coloredLogo = colors.brightCyan(LOGO);
  const coloredTagline = colors.dim(TAGLINE);
  console.log(`${coloredLogo}${coloredTagline}`);
}
