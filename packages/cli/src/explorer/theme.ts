/**
 * AFS Explorer Theme
 *
 * PC Tools Deluxe classic blue color scheme
 */

/**
 * Color definitions for PC Tools theme
 */
export const Colors = {
  // Background colors
  bg: {
    main: "blue",
    selected: "cyan",
    functionKey: "cyan",
    dialog: "blue",
    dialogBorder: "white",
    input: "black",
    inputFocus: "cyan",
  },

  // Foreground colors (using standard blessed color names)
  fg: {
    normal: "cyan",
    selected: "black",
    title: "white",
    border: "cyan",
    directory: "yellow",
    file: "white",
    exec: "green",
    link: "magenta",
    up: "yellow",
    size: "cyan",
    date: "cyan",
    functionKeyLabel: "black",
    functionKeyText: "white",
    status: "yellow",
    error: "red",
    muted: "gray",
  },
} as const;

/**
 * Blessed style objects for components
 */
export const Styles = {
  /** Main screen background */
  screen: {
    bg: Colors.bg.main,
  },

  /** Box/panel borders */
  border: {
    type: "line" as const,
    fg: Colors.fg.border,
    bg: Colors.bg.main,
  },

  /** Title bar style */
  title: {
    fg: Colors.fg.title,
    bg: Colors.bg.main,
    bold: true,
  },

  /** Normal list item */
  listItem: {
    fg: Colors.fg.normal,
    bg: Colors.bg.main,
  },

  /** Selected list item */
  listItemSelected: {
    fg: Colors.fg.selected,
    bg: Colors.bg.selected,
    bold: true,
  },

  /** Directory entry */
  directory: {
    fg: Colors.fg.directory,
    bg: Colors.bg.main,
    bold: true,
  },

  /** Directory entry selected */
  directorySelected: {
    fg: "black",
    bg: Colors.bg.selected,
    bold: true,
  },

  /** File entry */
  file: {
    fg: Colors.fg.file,
    bg: Colors.bg.main,
  },

  /** Exec entry */
  exec: {
    fg: Colors.fg.exec,
    bg: Colors.bg.main,
  },

  /** Function key label (e.g., "F1") */
  functionKeyLabel: {
    fg: Colors.fg.functionKeyLabel,
    bg: Colors.bg.functionKey,
  },

  /** Function key text (e.g., "Help") */
  functionKeyText: {
    fg: Colors.fg.functionKeyText,
    bg: Colors.bg.main,
  },

  /** Status bar */
  status: {
    fg: Colors.fg.status,
    bg: Colors.bg.main,
  },

  /** Metadata panel */
  meta: {
    fg: Colors.fg.normal,
    bg: Colors.bg.main,
  },

  /** Metadata label */
  metadataLabel: {
    fg: Colors.fg.muted,
    bg: Colors.bg.main,
  },

  /** Metadata value */
  metadataValue: {
    fg: Colors.fg.normal,
    bg: Colors.bg.main,
  },

  /** Error message */
  error: {
    fg: Colors.fg.error,
    bg: Colors.bg.main,
    bold: true,
  },

  /** Dialog box */
  dialog: {
    fg: Colors.fg.normal,
    bg: Colors.bg.dialog,
    border: {
      type: "line" as const,
      fg: Colors.bg.dialogBorder,
      bg: Colors.bg.dialog,
    },
  },
} as const;

/**
 * Icons for different entry types
 * Using ASCII characters for better terminal compatibility
 */
export const Icons = {
  up: "[D]",
  directory: "[D]",
  file: "   ",
  exec: "[X]",
  link: "[L]",
  selected: ">",
  unselected: " ",
} as const;

/**
 * UI symbols
 * Using ASCII characters for better terminal compatibility
 */
export const Symbols = {
  folder: "[D]",
  error: "X",
  success: "OK",
  scrollbar: "#",
  loading: "...",
} as const;

/**
 * Box drawing characters
 */
export const BoxChars = {
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  horizontal: "─",
  vertical: "│",
  leftT: "├",
  rightT: "┤",
  topT: "┬",
  bottomT: "┴",
  cross: "┼",
} as const;

/**
 * Get style for entry based on type and selection state
 */
export function getEntryStyle(
  type: "file" | "directory" | "exec" | "link" | "up",
  selected: boolean,
): { fg: string; bg: string; bold?: boolean } {
  if (selected) {
    if (type === "directory" || type === "up") {
      return Styles.directorySelected;
    }
    return Styles.listItemSelected;
  }

  switch (type) {
    case "directory":
    case "up":
      return Styles.directory;
    case "exec":
      return Styles.exec;
    default:
      return Styles.file;
  }
}

/**
 * Get icon for entry type
 */
export function getEntryIcon(type: "file" | "directory" | "exec" | "link" | "up"): string {
  return Icons[type] || Icons.file;
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number | undefined): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | undefined): string {
  if (!date) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Format an entry line for display (not used in blessed components)
 */
export function formatEntryLine(
  name: string,
  type: "file" | "directory" | "exec" | "link" | "up",
  size?: number,
  date?: Date,
): string {
  const icon = getEntryIcon(type);
  const sizeStr = formatSize(size);
  const dateStr = formatDate(date);
  return `${icon} ${name} ${sizeStr} ${dateStr}`;
}
