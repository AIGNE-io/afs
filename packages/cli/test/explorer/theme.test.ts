import { describe, expect, test } from "bun:test";
import {
  Colors,
  formatDate,
  formatSize,
  getEntryIcon,
  getEntryStyle,
  Icons,
  Styles,
} from "../../src/explorer/theme.js";

describe("Explorer Theme", () => {
  describe("Colors", () => {
    test("has main background color", () => {
      expect(Colors.bg.main).toBe("blue");
    });

    test("has selected background color", () => {
      expect(Colors.bg.selected).toBe("cyan");
    });

    test("has directory foreground color", () => {
      expect(Colors.fg.directory).toBe("yellow");
    });
  });

  describe("Styles", () => {
    test("border style has line type", () => {
      expect(Styles.border.type).toBe("line");
    });

    test("title style is bold", () => {
      expect(Styles.title.bold).toBe(true);
    });

    test("selected item has correct colors", () => {
      expect(Styles.listItemSelected.bg).toBe("cyan");
      expect(Styles.listItemSelected.fg).toBe("black");
    });
  });

  describe("Icons", () => {
    test("has directory icon", () => {
      expect(Icons.directory).toBe("[D]");
    });

    test("has file icon", () => {
      expect(Icons.file).toBe("   ");
    });

    test("has up icon", () => {
      expect(Icons.up).toBe("[D]");
    });

    test("has exec icon", () => {
      expect(Icons.exec).toBe("[X]");
    });
  });

  describe("getEntryStyle", () => {
    test("returns directory style for unselected directory", () => {
      const style = getEntryStyle("directory", false);
      expect(style.fg).toBe("yellow");
      expect(style.bold).toBe(true);
    });

    test("returns selected style for selected directory", () => {
      const style = getEntryStyle("directory", true);
      expect(style.bg).toBe("cyan");
      expect(style.fg).toBe("black");
    });

    test("returns file style for unselected file", () => {
      const style = getEntryStyle("file", false);
      expect(style.fg).toBe("white");
    });

    test("returns selected style for selected file", () => {
      const style = getEntryStyle("file", true);
      expect(style.bg).toBe("cyan");
    });

    test("returns exec style for exec entry", () => {
      const style = getEntryStyle("exec", false);
      expect(style.fg).toBe("green");
    });

    test("returns up style same as directory", () => {
      const upStyle = getEntryStyle("up", false);
      const dirStyle = getEntryStyle("directory", false);
      expect(upStyle.fg).toBe(dirStyle.fg);
    });
  });

  describe("getEntryIcon", () => {
    test("returns correct icon for directory", () => {
      expect(getEntryIcon("directory")).toBe("[D]");
    });

    test("returns correct icon for file", () => {
      expect(getEntryIcon("file")).toBe("   ");
    });

    test("returns correct icon for up", () => {
      expect(getEntryIcon("up")).toBe("[D]");
    });

    test("returns correct icon for exec", () => {
      expect(getEntryIcon("exec")).toBe("[X]");
    });

    test("returns correct icon for link", () => {
      expect(getEntryIcon("link")).toBe("[L]");
    });
  });

  describe("formatSize", () => {
    test("returns empty string for undefined", () => {
      expect(formatSize(undefined)).toBe("");
    });

    test("formats bytes correctly", () => {
      expect(formatSize(500)).toBe("500B");
    });

    test("formats kilobytes correctly", () => {
      expect(formatSize(1536)).toBe("1.5KB");
    });

    test("formats megabytes correctly", () => {
      expect(formatSize(1572864)).toBe("1.5MB");
    });

    test("formats gigabytes correctly", () => {
      expect(formatSize(1610612736)).toBe("1.5GB");
    });

    test("handles zero", () => {
      expect(formatSize(0)).toBe("0B");
    });

    test("handles exact KB boundary", () => {
      expect(formatSize(1024)).toBe("1.0KB");
    });
  });

  describe("formatDate", () => {
    test("returns empty string for undefined", () => {
      expect(formatDate(undefined)).toBe("");
    });

    test("formats today's date as time", () => {
      const now = new Date();
      const result = formatDate(now);
      // Should contain : for time format
      expect(result).toMatch(/:/);
    });

    test("formats recent date with days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = formatDate(threeDaysAgo);
      expect(result).toBe("3d ago");
    });

    test("formats older date with month and day", () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const result = formatDate(twoWeeksAgo);
      // Should contain month abbreviation
      expect(result).toMatch(/[A-Za-z]+/);
    });
  });
});
