/**
 * UI utilities for CLI output
 */

// Import and re-export header utilities
import {
  formatHeader as _formatHeader,
  printHeader as _printHeader,
  printLogo as _printLogo,
  shouldShowHeader as _shouldShowHeader,
  type HeaderOptions,
} from "./header.js";
// Import and re-export terminal utilities
import {
  colors as _colors,
  isColorDisabled as _isColorDisabled,
  isHeaderDisabled as _isHeaderDisabled,
  isTTY as _isTTY,
  shouldUseColors as _shouldUseColors,
} from "./terminal.js";

export const colors = _colors;
export const isColorDisabled = _isColorDisabled;
export const isHeaderDisabled = _isHeaderDisabled;
export const isTTY = _isTTY;
export const shouldUseColors = _shouldUseColors;
export const formatHeader = _formatHeader;
export const printHeader = _printHeader;
export const printLogo = _printLogo;
export const shouldShowHeader = _shouldShowHeader;
export type { HeaderOptions };
